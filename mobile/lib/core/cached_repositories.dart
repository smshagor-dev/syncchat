import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:path_provider/path_provider.dart';

import 'api_client.dart';
import 'auth_repository.dart';
import 'chat_cache.dart';
import 'chat_repository.dart';
import 'e2ee_service.dart';
import 'feature_repositories.dart';
import 'realtime_client.dart';

Future<bool> _hasNetworkTransport() async {
  try {
    final results = await Connectivity().checkConnectivity();
    return results.any((result) => result != ConnectivityResult.none);
  } on Object {
    // If an OEM connectivity service is unavailable, let the HTTP stack be
    // authoritative instead of incorrectly forcing offline mode.
    return true;
  }
}

ApiException _offlineCacheMiss(String message) =>
    ApiException(statusCode: 0, message: message);

class CachedInboxRepository extends InboxRepository {
  CachedInboxRepository(ApiClient api, this._cache) : super(api);

  final ChatCache _cache;

  @override
  Future<List<Map<String, dynamic>>> list({String? search}) async {
    final query = search?.trim() ?? '';
    if (!await _hasNetworkTransport()) {
      return _filterCached(await _cache.readInboxes(), query);
    }

    try {
      final rows = await super.list(search: search);
      if (query.isEmpty) await _cache.writeInboxes(rows);
      return rows;
    } on ApiException catch (error) {
      if (!error.isOffline) rethrow;
      return _filterCached(await _cache.readInboxes(), query);
    }
  }

  List<Map<String, dynamic>> _filterCached(
    List<Map<String, dynamic>> cached,
    String query,
  ) {
    if (query.isEmpty) return cached;
    final lower = query.toLowerCase();
    return cached.where((inbox) {
      final lastMessage = inbox['lastMessage'];
      final lastText = lastMessage is Map ? lastMessage['text'] : null;
      final text = [
        inbox['name'],
        lastText,
        if (inbox['group'] is Map) (inbox['group'] as Map)['name'],
        if (inbox['channel'] is Map) (inbox['channel'] as Map)['name'],
      ].whereType<Object>().join(' ').toLowerCase();
      return text.contains(lower);
    }).toList(growable: false);
  }
}

class CachedChatRepository extends ChatRepository {
  CachedChatRepository({
    required ApiClient api,
    required AuthRepository auth,
    required RealtimeClient realtime,
    required E2eeService e2ee,
    required ChatCache cache,
  }) : _cache = cache,
       super(api: api, auth: auth, realtime: realtime, e2ee: e2ee);

  static const _pendingUploadKey = '_syncchatPendingUpload';
  static const _localPathKey = '_syncchatLocalPath';
  static const _filenameKey = '_syncchatFilename';

  final ChatCache _cache;

  @override
  Future<Map<String, dynamic>> currentUser({bool refresh = false}) async {
    if (!await _hasNetworkTransport()) {
      final cached = await _cache.readCurrentUser();
      if (cached.isNotEmpty) return cached;
      throw _offlineCacheMiss('No cached SyncChat account is available yet.');
    }

    try {
      final user = await super.currentUser(refresh: refresh);
      await _cache.writeCurrentUser(user);
      return user;
    } on ApiException catch (error) {
      if (!error.isOffline) rethrow;
      final cached = await _cache.readCurrentUser();
      if (cached.isEmpty) rethrow;
      return cached;
    }
  }

  @override
  Future<List<Map<String, dynamic>>> listRoom(
    String roomId, {
    int skip = 0,
    int limit = 80,
  }) async {
    if (!await _hasNetworkTransport()) {
      return _cachedRoomSlice(roomId, skip: skip, limit: limit);
    }

    try {
      final messages = await super.listRoom(roomId, skip: skip, limit: limit);
      if (skip == 0) {
        await _cache.writeRoomMessages(roomId, messages);
      } else {
        await _cache.mergeRoomMessages(roomId, messages);
      }
      return messages;
    } on ApiException catch (error) {
      if (!error.isOffline) rethrow;
      return _cachedRoomSlice(roomId, skip: skip, limit: limit);
    }
  }

  Future<List<Map<String, dynamic>>> _cachedRoomSlice(
    String roomId, {
    required int skip,
    required int limit,
  }) async {
    final cached = await _cache.readRoomMessages(roomId);
    if (cached.isEmpty) {
      throw _offlineCacheMiss('No cached messages are available for this chat yet.');
    }
    if (skip >= cached.length) return const [];
    final end = (skip + limit).clamp(0, cached.length).toInt();
    return cached.sublist(skip, end);
  }

  @override
  Future<void> openRoom(String roomId) async {
    if (!await _hasNetworkTransport()) return;
    try {
      await super.openRoom(roomId);
    } on ApiException catch (error) {
      if (!error.isOffline) rethrow;
    }
  }

  @override
  Future<String> sendText({
    required Map<String, dynamic> inbox,
    required String text,
    String? clientMessageId,
    String? replyTo,
    String? topicId,
    bool viewOnce = false,
  }) async {
    final resolvedId = clientMessageId?.trim().isNotEmpty == true
        ? clientMessageId!.trim()
        : createClientMessageId();

    if (!await _hasNetworkTransport()) {
      await _queueText(
        inbox: inbox,
        text: text,
        clientMessageId: resolvedId,
        replyTo: replyTo,
        topicId: topicId,
        viewOnce: viewOnce,
      );
      return resolvedId;
    }

    try {
      return await super.sendText(
        inbox: inbox,
        text: text,
        clientMessageId: resolvedId,
        replyTo: replyTo,
        topicId: topicId,
        viewOnce: viewOnce,
      );
    } on ApiException catch (error) {
      if (!error.isOffline) rethrow;
      await _queueText(
        inbox: inbox,
        text: text,
        clientMessageId: resolvedId,
        replyTo: replyTo,
        topicId: topicId,
        viewOnce: viewOnce,
      );
      return resolvedId;
    }
  }

  Future<void> _queueText({
    required Map<String, dynamic> inbox,
    required String text,
    required String clientMessageId,
    String? replyTo,
    String? topicId,
    bool viewOnce = false,
  }) async {
    final roomId = _roomId(inbox);
    final user = await currentUser();
    final queuedAt = DateTime.now().toUtc().toIso8601String();
    await _cache.enqueueOutbox({
      'kind': 'text',
      'clientMessageId': clientMessageId,
      'inbox': Map<String, dynamic>.from(inbox),
      'text': text.trim(),
      'replyTo': replyTo,
      'topicId': topicId,
      'viewOnce': viewOnce,
      'queuedAt': queuedAt,
    });
    await _cache.mergeRoomMessages(roomId, [
      {
        'clientMessageId': clientMessageId,
        'roomId': roomId,
        'roomType': inbox['roomType']?.toString() ?? 'private',
        'userId': user['_id']?.toString(),
        'text': text.trim(),
        'replyTo': replyTo,
        'topicId': topicId,
        'viewOnce': viewOnce,
        'createdAt': queuedAt,
        'pending': true,
        'queuedOffline': true,
        'profile': _cachedProfile(user),
      },
    ]);
  }

  @override
  Future<Map<String, dynamic>> uploadAttachment({
    required String filePath,
    String? filename,
  }) async {
    final resolvedFilename = _resolveFilename(filePath, filename);
    final localDescriptor = await _localDescriptor(
      filePath: filePath,
      filename: resolvedFilename,
    );

    if (!await _hasNetworkTransport()) return localDescriptor;

    try {
      final uploaded = await super.uploadAttachment(
        filePath: filePath,
        filename: resolvedFilename,
      );
      return {
        ...uploaded,
        _localPathKey: filePath,
        _filenameKey: resolvedFilename,
      };
    } on ApiException catch (error) {
      if (!error.isOffline) rethrow;
      return localDescriptor;
    }
  }

  @override
  Future<Map<String, dynamic>> sendAttachment({
    required Map<String, dynamic> inbox,
    required Map<String, dynamic> file,
    String text = '',
    String? clientMessageId,
    String? replyTo,
    String? topicId,
    bool viewOnce = false,
  }) async {
    _guardOfflineE2eeMedia(inbox);
    final resolvedId = clientMessageId?.trim().isNotEmpty == true
        ? clientMessageId!.trim()
        : createClientMessageId();
    final prepared = Map<String, dynamic>.from(file);

    if (!await _hasNetworkTransport()) {
      return _queueAttachment(
        inbox: inbox,
        file: prepared,
        text: text,
        clientMessageId: resolvedId,
        replyTo: replyTo,
        topicId: topicId,
        viewOnce: viewOnce,
      );
    }

    try {
      final remoteFile = await _ensureRemoteAttachment(prepared);
      return await super.sendAttachment(
        inbox: inbox,
        file: _publicFile(remoteFile),
        text: text,
        clientMessageId: resolvedId,
        replyTo: replyTo,
        topicId: topicId,
        viewOnce: viewOnce,
      );
    } on ApiException catch (error) {
      if (!error.isOffline) rethrow;
      return _queueAttachment(
        inbox: inbox,
        file: prepared,
        text: text,
        clientMessageId: resolvedId,
        replyTo: replyTo,
        topicId: topicId,
        viewOnce: viewOnce,
      );
    } on SocketAckException {
      if (await _hasNetworkTransport()) rethrow;
      return _queueAttachment(
        inbox: inbox,
        file: prepared,
        text: text,
        clientMessageId: resolvedId,
        replyTo: replyTo,
        topicId: topicId,
        viewOnce: viewOnce,
      );
    }
  }

  Future<Map<String, dynamic>> _queueAttachment({
    required Map<String, dynamic> inbox,
    required Map<String, dynamic> file,
    required String text,
    required String clientMessageId,
    String? replyTo,
    String? topicId,
    bool viewOnce = false,
  }) async {
    final roomId = _roomId(inbox);
    final user = await currentUser();
    final queuedAt = DateTime.now().toUtc().toIso8601String();
    final filename = file['originalname']?.toString().trim().isNotEmpty == true
        ? file['originalname'].toString().trim()
        : file[_filenameKey]?.toString().trim().isNotEmpty == true
            ? file[_filenameKey].toString().trim()
            : 'attachment';
    final originalLocalPath = file[_localPathKey]?.toString().trim() ?? '';
    final stagedLocalPath = originalLocalPath.isEmpty
        ? ''
        : await _persistOutboxFile(originalLocalPath, filename);
    final queuedFile = {
      ...file,
      if (stagedLocalPath.isNotEmpty) _localPathKey: stagedLocalPath,
      _filenameKey: filename,
    };

    await _cache.enqueueOutbox({
      'kind': 'attachment',
      'clientMessageId': clientMessageId,
      'inbox': Map<String, dynamic>.from(inbox),
      'text': text.trim(),
      'replyTo': replyTo,
      'topicId': topicId,
      'viewOnce': viewOnce,
      'file': queuedFile,
      'queuedAt': queuedAt,
    });

    final pending = <String, dynamic>{
      'clientMessageId': clientMessageId,
      'roomId': roomId,
      'roomType': inbox['roomType']?.toString() ?? 'private',
      'userId': user['_id']?.toString(),
      'text': text.trim(),
      'replyTo': replyTo,
      'topicId': topicId,
      'viewOnce': viewOnce,
      'createdAt': queuedAt,
      'pending': true,
      'queuedOffline': true,
      'file': _pendingFilePreview(queuedFile),
      'profile': _cachedProfile(user),
    };
    await _cache.mergeRoomMessages(roomId, [pending]);
    return pending;
  }

  Future<int> drainOutbox() async {
    if (!await _hasNetworkTransport()) return 0;
    final queued = await _cache.readOutbox();
    var sent = 0;
    for (final item in queued) {
      final inboxValue = item['inbox'];
      if (inboxValue is! Map) {
        await _cache.removeOutbox(item['clientMessageId']?.toString() ?? '');
        continue;
      }
      final id = item['clientMessageId']?.toString().trim() ?? '';
      if (id.isEmpty) {
        await _cache.removeOutbox(id);
        continue;
      }

      try {
        final kind = item['kind']?.toString() ?? 'text';
        if (kind == 'attachment') {
          await _drainAttachment(item, Map<String, dynamic>.from(inboxValue), id);
        } else {
          final text = item['text']?.toString() ?? '';
          if (text.trim().isEmpty) {
            await _cache.removeOutbox(id);
            continue;
          }
          await super.sendText(
            inbox: Map<String, dynamic>.from(inboxValue),
            text: text,
            clientMessageId: id,
            replyTo: item['replyTo']?.toString(),
            topicId: item['topicId']?.toString(),
            viewOnce: item['viewOnce'] == true,
          );
        }
        await _cache.removeOutbox(id);
        sent += 1;
      } on ApiException catch (error) {
        if (error.isOffline) break;
        // Keep a server-rejected item queued instead of silently losing user data.
      } on SocketAckException {
        break;
      } on Object {
        break;
      }
    }
    return sent;
  }

  Future<void> _drainAttachment(
    Map<String, dynamic> item,
    Map<String, dynamic> inbox,
    String clientMessageId,
  ) async {
    _guardOfflineE2eeMedia(inbox);
    final rawFile = item['file'];
    if (rawFile is! Map) {
      throw const ApiException(
        statusCode: 400,
        message: 'Queued attachment metadata is missing.',
      );
    }
    final queuedFile = Map<String, dynamic>.from(rawFile);
    final remoteFile = await _ensureRemoteAttachment(queuedFile);
    final sent = await super.sendAttachment(
      inbox: inbox,
      file: _publicFile(remoteFile),
      text: item['text']?.toString() ?? '',
      clientMessageId: clientMessageId,
      replyTo: item['replyTo']?.toString(),
      topicId: item['topicId']?.toString(),
      viewOnce: item['viewOnce'] == true,
    );
    final roomId = _roomId(inbox);
    await _cache.mergeRoomMessages(roomId, [sent]);
    await _deleteStagedFile(queuedFile[_localPathKey]?.toString());
  }

  Future<Map<String, dynamic>> _ensureRemoteAttachment(
    Map<String, dynamic> file,
  ) async {
    final pendingUpload = file[_pendingUploadKey] == true;
    if (!pendingUpload) return file;

    final localPath = file[_localPathKey]?.toString().trim() ?? '';
    if (localPath.isEmpty || !await File(localPath).exists()) {
      throw const ApiException(
        statusCode: 410,
        message: 'The queued attachment file is no longer available on this device.',
      );
    }
    final filename = file[_filenameKey]?.toString().trim().isNotEmpty == true
        ? file[_filenameKey].toString().trim()
        : _resolveFilename(localPath, file['originalname']?.toString());
    final uploaded = await super.uploadAttachment(
      filePath: localPath,
      filename: filename,
    );
    return {
      ...uploaded,
      if (file['type'] != null) 'type': file['type'],
      if (file['duration'] != null) 'duration': file['duration'],
      _localPathKey: localPath,
      _filenameKey: filename,
    };
  }

  Future<Map<String, dynamic>> _localDescriptor({
    required String filePath,
    required String filename,
  }) async {
    final source = File(filePath);
    if (!await source.exists()) {
      throw const ApiException(
        statusCode: 400,
        message: 'The selected attachment is no longer available.',
      );
    }
    final size = await source.length();
    return {
      _pendingUploadKey: true,
      _localPathKey: filePath,
      _filenameKey: filename,
      'originalname': filename,
      'type': _inferAttachmentType(filename),
      'size': size,
    };
  }

  Map<String, dynamic> _publicFile(Map<String, dynamic> file) =>
      Map<String, dynamic>.fromEntries(
        file.entries.where((entry) => !entry.key.startsWith('_syncchat')),
      );

  Map<String, dynamic> _pendingFilePreview(Map<String, dynamic> file) => {
        'originalname': file['originalname'] ?? file[_filenameKey] ?? 'attachment',
        'type': file['type'] ?? 'file',
        'size': file['size'],
        'duration': file['duration'],
        'localPath': file[_localPathKey],
        'pending': true,
      };

  Map<String, dynamic> _cachedProfile(Map<String, dynamic> user) => {
        'fullname': user['fullname']?.toString() ??
            user['username']?.toString() ??
            'You',
        'avatar': user['avatar'],
      };

  String _roomId(Map<String, dynamic> inbox) {
    final roomId = inbox['roomId']?.toString().trim() ?? '';
    if (roomId.isEmpty) {
      throw const ApiException(
        statusCode: 400,
        message: 'This chat does not have a valid room ID.',
      );
    }
    return roomId;
  }

  void _guardOfflineE2eeMedia(Map<String, dynamic> inbox) {
    if (inbox['roomType']?.toString() == 'private' &&
        inbox['e2eeEnabled'] == true) {
      throw const ApiException(
        statusCode: 409,
        message:
            'Media sending is disabled while device E2EE is enabled because encrypted media attachments are not implemented yet.',
        payload: {'code': 'E2EE_MEDIA_NOT_SUPPORTED'},
      );
    }
  }

  String _resolveFilename(String filePath, String? requested) {
    final value = requested?.trim() ?? '';
    if (value.isNotEmpty) return value;
    final parts = filePath.split(RegExp(r'[\\/]'));
    return parts.isEmpty || parts.last.trim().isEmpty ? 'attachment' : parts.last;
  }

  String _inferAttachmentType(String filename) {
    final lower = filename.toLowerCase();
    const images = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];
    const videos = ['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi'];
    const audio = ['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.opus', '.webm'];
    if (images.any(lower.endsWith)) return 'image';
    if (videos.any(lower.endsWith)) return 'video';
    if (audio.any(lower.endsWith)) return 'audio';
    return 'file';
  }

  Future<String> _persistOutboxFile(String sourcePath, String filename) async {
    final source = File(sourcePath);
    if (!await source.exists()) {
      throw const ApiException(
        statusCode: 410,
        message: 'The selected attachment is no longer available.',
      );
    }
    final root = Directory(
      '${(await getApplicationDocumentsDirectory()).path}${Platform.pathSeparator}syncchat_outbox',
    );
    await root.create(recursive: true);
    final normalizedSource = source.absolute.path;
    final normalizedRoot = root.absolute.path;
    if (normalizedSource.startsWith('$normalizedRoot${Platform.pathSeparator}')) {
      return normalizedSource;
    }
    final safeName = filename
        .replaceAll(RegExp(r'[^A-Za-z0-9._-]+'), '_')
        .replaceAll(RegExp(r'^\.+'), '');
    final target = File(
      '${root.path}${Platform.pathSeparator}${DateTime.now().microsecondsSinceEpoch}_${safeName.isEmpty ? 'attachment' : safeName}',
    );
    await source.copy(target.path);
    return target.path;
  }

  Future<void> _deleteStagedFile(String? path) async {
    final value = path?.trim() ?? '';
    if (value.isEmpty) return;
    try {
      final root = Directory(
        '${(await getApplicationDocumentsDirectory()).path}${Platform.pathSeparator}syncchat_outbox',
      ).absolute.path;
      final file = File(value).absolute;
      if (!file.path.startsWith('$root${Platform.pathSeparator}')) return;
      if (await file.exists()) await file.delete();
    } on Object {
      // A stale staged file is safe to clean on a later maintenance pass.
    }
  }

  Future<int> pendingOutboxCount() async => (await _cache.readOutbox()).length;

  @override
  Future<Map<String, dynamic>> pinnedMessages(String roomId) async {
    if (!await _hasNetworkTransport()) {
      return const {'pinned': <dynamic>[]};
    }
    try {
      return await super.pinnedMessages(roomId);
    } on ApiException catch (error) {
      if (!error.isOffline) rethrow;
      return const {'pinned': <dynamic>[]};
    }
  }

  @override
  Future<Map<String, dynamic>> e2eeRoomState(String roomId) async {
    if (!await _hasNetworkTransport()) {
      final cached = await _cache.readRoomState(roomId);
      if (cached.isNotEmpty) return cached;
      return const {'enabled': false, 'version': 0};
    }
    try {
      final state = await super.e2eeRoomState(roomId);
      await _cache.writeRoomState(roomId, state);
      return state;
    } on ApiException catch (error) {
      if (!error.isOffline) rethrow;
      final cached = await _cache.readRoomState(roomId);
      if (cached.isNotEmpty) return cached;
      return const {'enabled': false, 'version': 0};
    }
  }

  @override
  Future<Map<String, dynamic>> setE2eeRoomEnabled(
    String roomId, {
    required bool enabled,
  }) async {
    final state = await super.setE2eeRoomEnabled(roomId, enabled: enabled);
    await _cache.writeRoomState(roomId, state);
    return state;
  }

  @override
  Future<List<Map<String, dynamic>>> syncRoom(
    String roomId, {
    int afterSequence = 0,
  }) async {
    if (!await _hasNetworkTransport()) return const [];
    final messages = await super.syncRoom(roomId, afterSequence: afterSequence);
    if (messages.isNotEmpty) await _cache.mergeRoomMessages(roomId, messages);
    return messages;
  }
}
