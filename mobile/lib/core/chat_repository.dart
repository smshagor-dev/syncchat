import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'api_client.dart';
import 'auth_repository.dart';
import 'e2ee_service.dart';
import 'realtime_client.dart';
import 'topic_selection_store.dart';

class ChatRepository {
  ChatRepository({
    required ApiClient api,
    required AuthRepository auth,
    required RealtimeClient realtime,
    required E2eeService e2ee,
  }) : _api = api,
       _auth = auth,
       _realtime = realtime,
       _e2ee = e2ee;

  static const int _directUploadMaxBytes = 3 * 1024 * 1024;
  static const int _resumableChunkBytes = 3 * 1024 * 1024;

  final ApiClient _api;
  final AuthRepository _auth;
  final RealtimeClient _realtime;
  final E2eeService _e2ee;
  final Random _random = Random.secure();
  final Map<String, Map<void Function(dynamic), void Function(dynamic)>>
      _topicAwareHandlers = {};

  Map<String, dynamic>? _currentUser;
  String? _openRoomId;

  Future<Map<String, dynamic>> currentUser({bool refresh = false}) async {
    if (!refresh && _currentUser != null) return _currentUser!;
    _currentUser = await _auth.currentUser();
    return _currentUser!;
  }

  Future<List<Map<String, dynamic>>> listRoom(
    String roomId, {
    int skip = 0,
    int limit = 80,
  }) async {
    final response = await _api.get(
      '/chats/$roomId',
      query: {'skip': skip, 'limit': limit},
    );
    final decrypted = await _e2ee.decryptMessages(_mapList(response.payload));
    return _filterSelectedTopic(roomId, decrypted);
  }

  Future<List<Map<String, dynamic>>> listMedia({String? roomId}) async {
    final response = await _api.get(
      '/chats/media',
      query: {
        if (roomId != null && roomId.trim().isNotEmpty) 'roomId': roomId.trim(),
      },
    );
    return _mapList(response.payload);
  }

  Future<List<Map<String, dynamic>>> listStarred() async {
    final response = await _api.get('/chats/starred');
    return _mapList(response.payload);
  }

  Future<void> openRoom(String roomId) async {
    await TopicSelectionStore.read(roomId);
    if (!_realtime.isConnected) await _realtime.connect();
    if (!_realtime.isConnected) {
      throw const ApiException(
        statusCode: 0,
        message: 'Realtime connection is unavailable.',
      );
    }

    _realtime.emit('room/open', {'prevRoom': _openRoomId, 'newRoom': roomId});
    _openRoomId = roomId;
  }

  String createClientMessageId() => _clientMessageId();

  Future<String> sendText({
    required Map<String, dynamic> inbox,
    required String text,
    String? clientMessageId,
    String? replyTo,
    String? topicId,
    bool viewOnce = false,
  }) async {
    final message = text.trim();
    if (message.isEmpty) {
      throw const ApiException(
        statusCode: 400,
        message: 'Message cannot be empty.',
      );
    }

    final roomId = _roomId(inbox);
    final roomType = inbox['roomType']?.toString() ?? 'private';
    final owners = _ownersId(inbox);
    final effectiveTopicId = await _effectiveTopicId(roomId, topicId);
    Map<String, dynamic>? e2eeEnvelope;
    var transportText = message;
    if (_deviceE2eeEnabled(inbox)) {
      if (roomType != 'private') {
        throw const ApiException(
          statusCode: 400,
          message: 'Device E2EE is currently available for private chats only.',
        );
      }
      e2eeEnvelope = await _e2ee.encryptText(
        text: message,
        roomId: roomId,
        userIds: owners,
      );
      transportText = 'Encrypted message';
    }

    await openRoom(roomId);
    final userId = await _currentUserId();
    final resolvedClientMessageId = _resolveClientMessageId(clientMessageId);

    _realtime.emit('chat/insert', {
      'clientMessageId': resolvedClientMessageId,
      'roomId': roomId,
      'roomType': roomType,
      'ownersId': owners,
      'userId': userId,
      'text': transportText,
      'replyTo': replyTo,
      'topicId': effectiveTopicId,
      'viewOnce': viewOnce,
      if (e2eeEnvelope != null) 'e2eeEnvelope': e2eeEnvelope,
    });
    return resolvedClientMessageId;
  }

  Future<Map<String, dynamic>> decryptMessage(Map<String, dynamic> message) =>
      _e2ee.decryptMessage(message);

  Future<Map<String, dynamic>> e2eeRoomState(String roomId) =>
      _e2ee.roomState(roomId);

  Future<Map<String, dynamic>> setE2eeRoomEnabled(
    String roomId, {
    required bool enabled,
  }) => _e2ee.setRoomEnabled(roomId, enabled: enabled);

  Future<E2eeDeviceKeyRecord> registerE2eeDevice() =>
      _e2ee.ensureDeviceKey(forceRegister: true);

  Future<Map<String, dynamic>> uploadAttachment({
    required String filePath,
    String? filename,
  }) async {
    final file = File(filePath);
    if (!await file.exists()) {
      throw const ApiException(
        statusCode: 400,
        message: 'The selected file is no longer available on this device.',
      );
    }

    final size = await file.length();
    if (size <= 0) {
      throw const ApiException(statusCode: 400, message: 'The selected file is empty.');
    }

    final resolvedFilename = _attachmentFilename(filePath, filename);
    if (size <= _directUploadMaxBytes) {
      final response = await _api.multipart(
        '/chats/upload',
        fieldName: 'file',
        filePath: filePath,
        filename: resolvedFilename,
      );
      return _mapPayload(response.payload, error: 'Invalid upload response.');
    }

    return _uploadAttachmentResumable(
      file: file,
      filename: resolvedFilename,
      size: size,
    );
  }

  Future<Map<String, dynamic>> _uploadAttachmentResumable({
    required File file,
    required String filename,
    required int size,
  }) async {
    final created = await _api.post(
      '/chat-v2/uploads',
      body: {
        'filename': filename,
        'mime': _mimeHint(filename),
        'totalSize': size,
        'chunkSize': _resumableChunkBytes,
      },
    );
    final session = _mapPayload(
      created.payload,
      error: 'Invalid resumable upload response.',
    );
    final uploadId = session['uploadId']?.toString().trim() ?? '';
    if (uploadId.isEmpty) {
      throw const ApiException(
        statusCode: 500,
        message: 'Upload session ID is missing.',
      );
    }

    final serverChunkSize =
        (session['chunkSize'] as num?)?.toInt() ?? _resumableChunkBytes;
    final chunkSize = min(
      _resumableChunkBytes,
      max(256 * 1024, serverChunkSize),
    );
    final handle = await file.open(mode: FileMode.read);
    var partNumber = 0;
    var uploadedBytes = 0;

    try {
      while (uploadedBytes < size) {
        final remaining = size - uploadedBytes;
        final nextSize = min(chunkSize, remaining);
        final bytes = await handle.read(nextSize);
        if (bytes.isEmpty) {
          throw const ApiException(
            statusCode: 500,
            message: 'Unexpected end of the selected file during upload.',
          );
        }

        await _putResumablePart(uploadId, partNumber, bytes);
        uploadedBytes += bytes.length;
        partNumber += 1;
      }
    } on Object {
      await _cancelResumableUpload(uploadId);
      rethrow;
    } finally {
      await handle.close();
    }

    try {
      final completed = await _api.post('/chat-v2/uploads/$uploadId/complete');
      return _mapPayload(
        completed.payload,
        error: 'Invalid completed upload response.',
      );
    } on Object {
      await _cancelResumableUpload(uploadId);
      rethrow;
    }
  }

  Future<void> _putResumablePart(
    String uploadId,
    int partNumber,
    Uint8List bytes,
  ) async {
    Object? lastFailure;
    for (var attempt = 0; attempt < 3; attempt += 1) {
      try {
        await _api.sendBytes(
          'PUT',
          '/chat-v2/uploads/$uploadId/parts/$partNumber',
          body: bytes,
        );
        return;
      } on ApiException catch (failure) {
        lastFailure = failure;
        final retryable =
            failure.statusCode == 0 ||
            failure.statusCode == 408 ||
            failure.statusCode == 429 ||
            failure.statusCode >= 500;
        if (!retryable || attempt == 2) rethrow;
        await Future<void>.delayed(Duration(milliseconds: 350 * (attempt + 1)));
      }
    }
    if (lastFailure is ApiException) throw lastFailure;
  }

  Future<void> _cancelResumableUpload(String uploadId) async {
    try {
      await _api.delete('/chat-v2/uploads/$uploadId');
    } on Object {
      // Cleanup is best-effort; expired sessions are ignored by the backend.
    }
  }

  String _attachmentFilename(String filePath, String? filename) {
    final explicit = filename?.trim() ?? '';
    if (explicit.isNotEmpty) return explicit;
    final normalized = filePath.replaceAll('\\', '/');
    final parts = normalized.split('/');
    final fallback = parts.isEmpty ? '' : parts.last.trim();
    return fallback.isEmpty ? 'upload.bin' : fallback;
  }

  String _mimeHint(String filename) {
    final normalized = filename.toLowerCase();
    final dot = normalized.lastIndexOf('.');
    final ext = dot >= 0 ? normalized.substring(dot + 1) : '';
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'avif':
        return 'image/avif';
      case 'heic':
      case 'heif':
        return 'image/heic';
      case 'mp4':
      case 'm4v':
        return 'video/mp4';
      case 'mov':
        return 'video/quicktime';
      case 'webm':
        return 'video/webm';
      case 'mp3':
        return 'audio/mpeg';
      case 'wav':
        return 'audio/wav';
      case 'm4a':
        return 'audio/mp4';
      case 'aac':
        return 'audio/aac';
      case 'ogg':
        return 'audio/ogg';
      case 'flac':
        return 'audio/flac';
      case 'pdf':
        return 'application/pdf';
      case 'zip':
        return 'application/zip';
      case 'json':
        return 'application/json';
      case 'txt':
      case 'md':
      case 'csv':
      case 'log':
        return 'text/plain';
      default:
        return 'application/octet-stream';
    }
  }

  Future<Map<String, dynamic>> sendAttachment({
    required Map<String, dynamic> inbox,
    required Map<String, dynamic> file,
    String text = '',
    String? clientMessageId,
    String? replyTo,
    String? topicId,
    bool viewOnce = false,
  }) async {
    _guardE2eeMedia(inbox);
    final roomId = _roomId(inbox);
    final effectiveTopicId = await _effectiveTopicId(roomId, topicId);
    final resolvedClientMessageId = _resolveClientMessageId(clientMessageId);
    final response = await _api.post(
      '/chats/send-file',
      headers: {'X-Client-Message-Id': resolvedClientMessageId},
      body: {
        'clientMessageId': resolvedClientMessageId,
        'roomId': roomId,
        'roomType': inbox['roomType']?.toString() ?? 'private',
        'ownersId': _ownersId(inbox),
        'text': text.trim(),
        'replyTo': replyTo,
        'topicId': effectiveTopicId,
        'viewOnce': viewOnce,
        'file': file,
      },
    );
    return _mapPayload(
      response.payload,
      error: 'Invalid file message response.',
    );
  }

  Future<void> reactToMessage({
    required String roomId,
    required String chatId,
    String? emoji,
  }) async {
    await openRoom(roomId);
    _realtime.emit('chat/react', {
      'roomId': roomId,
      'chatId': chatId,
      'userId': await _currentUserId(),
      'emoji': emoji,
    });
  }

  Future<void> editMessage({
    required String roomId,
    required String chatId,
    required String text,
    String? replyTo,
  }) async {
    final nextText = text.trim();
    if (nextText.isEmpty) {
      throw const ApiException(
        statusCode: 400,
        message: 'Message cannot be empty.',
      );
    }
    await openRoom(roomId);
    _realtime.emit('chat/edit', {
      'roomId': roomId,
      'chatId': chatId,
      'userId': await _currentUserId(),
      'text': nextText,
      'replyTo': replyTo,
    });
  }

  Future<void> deleteMessages({
    required String roomId,
    required List<String> chatIds,
    bool deleteForEveryone = false,
  }) async {
    final ids = chatIds
        .where((id) => id.trim().isNotEmpty)
        .toList(growable: false);
    if (ids.isEmpty) return;
    await openRoom(roomId);
    _realtime.emit('chat/delete', {
      'userId': await _currentUserId(),
      'chatsId': ids,
      'roomId': roomId,
      'deleteForEveryone': deleteForEveryone,
    });
  }

  Future<Map<String, dynamic>> toggleStar(
    String chatId, {
    required bool starred,
  }) async {
    final response = await _api.patch(
      '/chats/$chatId/star',
      body: {'starred': starred},
    );
    return _mapPayload(response.payload, error: 'Invalid star response.');
  }

  Future<Map<String, dynamic>> pinnedMessages(String roomId) async {
    final response = await _api.get('/chats/$roomId/pins');
    return _mapPayload(
      response.payload,
      error: 'Invalid pinned message response.',
    );
  }

  Future<Map<String, dynamic>> pinMessage({
    required String roomId,
    required String chatId,
  }) async {
    final response = await _api.post(
      '/chats/$chatId/pin',
      body: {'roomId': roomId},
    );
    return _mapPayload(response.payload, error: 'Invalid pin response.');
  }

  Future<Map<String, dynamic>> unpinMessage({
    required String roomId,
    required String chatId,
  }) async {
    final response = await _api.delete(
      '/chats/$chatId/pin',
      body: {'roomId': roomId},
    );
    return _mapPayload(response.payload, error: 'Invalid unpin response.');
  }

  Future<Map<String, dynamic>> openViewOnce(String chatId) async {
    final response = await _api.post('/chats/$chatId/view-once-open');
    return _mapPayload(response.payload, error: 'Invalid view-once response.');
  }

  Future<List<Map<String, dynamic>>> listScheduled(String roomId) async {
    final response = await _api.get(
      '/chats/scheduled',
      query: {'roomId': roomId},
    );
    return _mapList(response.payload);
  }

  Future<Map<String, dynamic>> scheduleMessage({
    required Map<String, dynamic> inbox,
    required String text,
    String? replyTo,
    String? topicId,
    String mode = 'once',
    DateTime? scheduledFor,
    String recurringType = 'none',
    String? targetUserId,
  }) async {
    _guardE2eeSchedule(inbox);
    final message = text.trim();
    if (message.isEmpty) {
      throw const ApiException(
        statusCode: 400,
        message: 'Message cannot be empty.',
      );
    }
    final roomId = _roomId(inbox);
    final effectiveTopicId = await _effectiveTopicId(roomId, topicId);
    final response = await _api.post(
      '/chats/scheduled',
      body: {
        'roomId': roomId,
        'roomType': inbox['roomType']?.toString() ?? 'private',
        'ownersId': _ownersId(inbox),
        'text': message,
        'replyTo': replyTo,
        'topicId': effectiveTopicId,
        'mode': mode,
        'scheduledFor': scheduledFor?.toUtc().toIso8601String(),
        'recurringType': recurringType,
        'targetUserId': targetUserId,
      },
    );
    return _mapPayload(response.payload, error: 'Invalid schedule response.');
  }

  Future<void> cancelScheduled(String scheduleId) async {
    await _api.delete('/chats/scheduled/$scheduleId');
  }

  Future<void> markRoomRead(Map<String, dynamic> inbox) async {
    if (!_realtime.isConnected) return;
    final roomId = inbox['roomId']?.toString() ?? '';
    if (roomId.isEmpty) return;

    _realtime.emit('chat/read', {
      'roomId': roomId,
      'userId': await _currentUserId(),
      'ownersId': _ownersId(inbox),
    });
  }

  void sendReceipt(Map<String, dynamic> chat, {bool read = false}) {
    if (!_realtime.isConnected) return;
    final chatId = chat['_id']?.toString() ?? '';
    final roomId = chat['roomId']?.toString() ?? '';
    if (chatId.isEmpty || roomId.isEmpty) return;
    _realtime.emit('chat/receipt', {
      'chatId': chatId,
      'roomId': roomId,
      'type': read ? 'read' : 'delivered',
    });
  }

  Future<List<Map<String, dynamic>>> syncRoom(
    String roomId, {
    int afterSequence = 0,
  }) async {
    if (!_realtime.isConnected) return const [];
    final result = await _realtime.emitWithAck('chat/sync-request', {
      'roomId': roomId,
      'afterSequence': afterSequence,
      'limit': 200,
    });
    if (result is! Map ||
        result['success'] != true ||
        result['messages'] is! List) {
      return const [];
    }
    final messages = (result['messages'] as List)
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
    final decrypted = await _e2ee.decryptMessages(messages);
    return _filterSelectedTopic(roomId, decrypted);
  }

  Future<void> typing(Map<String, dynamic> inbox) async {
    if (!_realtime.isConnected) return;
    _realtime.emit('chat/typing', {
      'roomId': _roomId(inbox),
      'roomType': inbox['roomType']?.toString() ?? 'private',
      'userId': await _currentUserId(),
    });
  }

  void on(String event, void Function(dynamic data) handler) {
    if (event != 'chat/insert' && event != 'chat/sync-result') {
      _realtime.on(event, handler);
      return;
    }

    final handlers = _topicAwareHandlers.putIfAbsent(
      event,
      () => <void Function(dynamic), void Function(dynamic)>{},
    );
    if (handlers.containsKey(handler)) return;

    void wrapped(dynamic data) {
      final roomId = data is Map ? data['roomId']?.toString() ?? '' : '';
      final selected = TopicSelectionStore.peek(roomId);
      if (selected == null || selected.isEmpty || data is! Map) {
        handler(data);
        return;
      }

      if (event == 'chat/insert') {
        if (data['topicId']?.toString() == selected) handler(data);
        return;
      }

      final rawMessages = data['messages'];
      if (rawMessages is! List) {
        handler(data);
        return;
      }
      final filtered = rawMessages
          .whereType<Map>()
          .where((item) => item['topicId']?.toString() == selected)
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
      handler({...Map<String, dynamic>.from(data), 'messages': filtered});
    }

    handlers[handler] = wrapped;
    _realtime.on(event, wrapped);
  }

  void off(String event, [void Function(dynamic data)? handler]) {
    if (handler == null) {
      _topicAwareHandlers.remove(event);
      _realtime.off(event);
      return;
    }
    final wrapped = _topicAwareHandlers[event]?.remove(handler);
    if (_topicAwareHandlers[event]?.isEmpty == true) {
      _topicAwareHandlers.remove(event);
    }
    _realtime.off(event, wrapped ?? handler);
  }

  bool _deviceE2eeEnabled(Map<String, dynamic> inbox) =>
      inbox['roomType']?.toString() == 'private' &&
      inbox['e2eeEnabled'] == true;

  void _guardE2eeMedia(Map<String, dynamic> inbox) {
    if (_deviceE2eeEnabled(inbox)) {
      throw const ApiException(
        statusCode: 409,
        message: 'Media sending is disabled while device E2EE is enabled because encrypted media attachments are not implemented yet.',
        payload: {'code': 'E2EE_MEDIA_NOT_SUPPORTED'},
      );
    }
  }

  void _guardE2eeSchedule(Map<String, dynamic> inbox) {
    if (_deviceE2eeEnabled(inbox)) {
      throw const ApiException(
        statusCode: 409,
        message: 'Scheduled send is disabled while device E2EE is enabled because the server cannot encrypt a message later without device private keys.',
        payload: {'code': 'E2EE_SCHEDULE_NOT_SUPPORTED'},
      );
    }
  }

  Future<String?> _effectiveTopicId(String roomId, String? requested) async {
    final explicit = requested?.trim() ?? '';
    if (explicit.isNotEmpty) return explicit;
    return TopicSelectionStore.read(roomId);
  }

  Future<List<Map<String, dynamic>>> _filterSelectedTopic(
    String roomId,
    List<Map<String, dynamic>> messages,
  ) async {
    final topicId = await TopicSelectionStore.read(roomId);
    if (topicId == null || topicId.isEmpty) return messages;
    return messages
        .where((message) => message['topicId']?.toString() == topicId)
        .toList(growable: false);
  }

  String _roomId(Map<String, dynamic> inbox) {
    final roomId = inbox['roomId']?.toString().trim() ?? '';
    if (roomId.isEmpty) {
      throw const ApiException(statusCode: 400, message: 'Room ID is missing.');
    }
    return roomId;
  }

  List<String> _ownersId(Map<String, dynamic> inbox) =>
      inbox['ownersId'] is List
      ? List<dynamic>.from(inbox['ownersId'] as List)
            .map((item) => item.toString())
            .where((item) => item.isNotEmpty)
            .toList(growable: false)
      : const <String>[];

  Future<String> _currentUserId() async {
    final user = await currentUser();
    final userId = user['_id']?.toString().trim() ?? '';
    if (userId.isEmpty) {
      throw const ApiException(
        statusCode: 401,
        message: 'Current user ID is missing.',
      );
    }
    return userId;
  }

  String _resolveClientMessageId(String? requested) =>
      (requested?.trim().isNotEmpty ?? false)
      ? requested!.trim()
      : _clientMessageId();

  List<Map<String, dynamic>> _mapList(dynamic payload) {
    if (payload is! List) return const [];
    return payload
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
  }

  Map<String, dynamic> _mapPayload(dynamic payload, {required String error}) {
    if (payload is Map) return Map<String, dynamic>.from(payload);
    throw ApiException(statusCode: 500, message: error);
  }

  String _clientMessageId() {
    final micros = DateTime.now().microsecondsSinceEpoch.toRadixString(36);
    final random = _random.nextInt(0x7fffffff).toRadixString(36);
    return 'flutter-$micros-$random';
  }
}
