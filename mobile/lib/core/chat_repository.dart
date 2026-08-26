import 'dart:math';

import 'api_client.dart';
import 'auth_repository.dart';
import 'e2ee_service.dart';
import 'realtime_client.dart';

class ChatRepository {
  ChatRepository({
    required ApiClient api,
    required AuthRepository auth,
    required RealtimeClient realtime,
    required E2eeService e2ee,
  })  : _api = api,
        _auth = auth,
        _realtime = realtime,
        _e2ee = e2ee;

  final ApiClient _api;
  final AuthRepository _auth;
  final RealtimeClient _realtime;
  final E2eeService _e2ee;
  final Random _random = Random.secure();

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
    return _e2ee.decryptMessages(_mapList(response.payload));
  }

  Future<void> openRoom(String roomId) async {
    if (!_realtime.isConnected) await _realtime.connect();
    if (!_realtime.isConnected) {
      throw const ApiException(
        statusCode: 0,
        message: 'Realtime connection is unavailable.',
      );
    }

    _realtime.emit('room/open', {
      'prevRoom': _openRoomId,
      'newRoom': roomId,
    });
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
      'topicId': topicId,
      'viewOnce': viewOnce,
      if (e2eeEnvelope != null) 'e2eeEnvelope': e2eeEnvelope,
    });
    return resolvedClientMessageId;
  }

  Future<Map<String, dynamic>> decryptMessage(
    Map<String, dynamic> message,
  ) =>
      _e2ee.decryptMessage(message);

  Future<Map<String, dynamic>> e2eeRoomState(String roomId) =>
      _e2ee.roomState(roomId);

  Future<Map<String, dynamic>> setE2eeRoomEnabled(
    String roomId, {
    required bool enabled,
  }) =>
      _e2ee.setRoomEnabled(roomId, enabled: enabled);

  Future<E2eeDeviceKeyRecord> registerE2eeDevice() =>
      _e2ee.ensureDeviceKey(forceRegister: true);

  Future<Map<String, dynamic>> uploadAttachment({
    required String filePath,
    String? filename,
  }) async {
    final response = await _api.multipart(
      '/chats/upload',
      fieldName: 'file',
      filePath: filePath,
      filename: filename,
    );
    return _mapPayload(response.payload, error: 'Invalid upload response.');
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
        'topicId': topicId,
        'viewOnce': viewOnce,
        'file': file,
      },
    );
    return _mapPayload(response.payload, error: 'Invalid file message response.');
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
      throw const ApiException(statusCode: 400, message: 'Message cannot be empty.');
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
    final ids = chatIds.where((id) => id.trim().isNotEmpty).toList(growable: false);
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
    return _mapPayload(response.payload, error: 'Invalid pinned message response.');
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
    String mode = 'once',
    DateTime? scheduledFor,
    String recurringType = 'none',
    String? targetUserId,
  }) async {
    _guardE2eeSchedule(inbox);
    final message = text.trim();
    if (message.isEmpty) {
      throw const ApiException(statusCode: 400, message: 'Message cannot be empty.');
    }
    final response = await _api.post(
      '/chats/scheduled',
      body: {
        'roomId': _roomId(inbox),
        'roomType': inbox['roomType']?.toString() ?? 'private',
        'ownersId': _ownersId(inbox),
        'text': message,
        'replyTo': replyTo,
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
    final result = await _realtime.emitWithAck(
      'chat/sync-request',
      {
        'roomId': roomId,
        'afterSequence': afterSequence,
        'limit': 200,
      },
    );
    if (result is! Map || result['success'] != true || result['messages'] is! List) {
      return const [];
    }
    final messages = (result['messages'] as List)
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
    return _e2ee.decryptMessages(messages);
  }

  Future<void> typing(Map<String, dynamic> inbox) async {
    if (!_realtime.isConnected) return;
    _realtime.emit('chat/typing', {
      'roomId': _roomId(inbox),
      'roomType': inbox['roomType']?.toString() ?? 'private',
      'userId': await _currentUserId(),
    });
  }

  void on(String event, void Function(dynamic data) handler) =>
      _realtime.on(event, handler);

  void off(String event, [void Function(dynamic data)? handler]) =>
      _realtime.off(event, handler);

  bool _deviceE2eeEnabled(Map<String, dynamic> inbox) =>
      inbox['roomType']?.toString() == 'private' && inbox['e2eeEnabled'] == true;

  void _guardE2eeMedia(Map<String, dynamic> inbox) {
    if (_deviceE2eeEnabled(inbox)) {
      throw const ApiException(
        statusCode: 409,
        message:
            'Media sending is disabled while device E2EE is enabled because encrypted media attachments are not implemented yet.',
        payload: {'code': 'E2EE_MEDIA_NOT_SUPPORTED'},
      );
    }
  }

  void _guardE2eeSchedule(Map<String, dynamic> inbox) {
    if (_deviceE2eeEnabled(inbox)) {
      throw const ApiException(
        statusCode: 409,
        message:
            'Scheduled send is disabled while device E2EE is enabled because the server cannot encrypt a message later without device private keys.',
        payload: {'code': 'E2EE_SCHEDULE_NOT_SUPPORTED'},
      );
    }
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
      throw const ApiException(statusCode: 401, message: 'Current user ID is missing.');
    }
    return userId;
  }

  String _resolveClientMessageId(String? requested) =>
      (requested?.trim().isNotEmpty ?? false) ? requested!.trim() : _clientMessageId();

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