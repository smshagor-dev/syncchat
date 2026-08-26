import 'package:connectivity_plus/connectivity_plus.dart';

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
    final roomId = inbox['roomId']?.toString().trim() ?? '';
    if (roomId.isEmpty) {
      throw const ApiException(
        statusCode: 400,
        message: 'This chat does not have a valid room ID.',
      );
    }
    final user = await currentUser();
    final queuedAt = DateTime.now().toUtc().toIso8601String();
    await _cache.enqueueOutbox({
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
        'profile': {
          'fullname': user['fullname']?.toString() ??
              user['username']?.toString() ??
              'You',
          'avatar': user['avatar'],
        },
      },
    ]);
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
      final text = item['text']?.toString() ?? '';
      if (id.isEmpty || text.trim().isEmpty) {
        await _cache.removeOutbox(id);
        continue;
      }
      try {
        await super.sendText(
          inbox: Map<String, dynamic>.from(inboxValue),
          text: text,
          clientMessageId: id,
          replyTo: item['replyTo']?.toString(),
          topicId: item['topicId']?.toString(),
          viewOnce: item['viewOnce'] == true,
        );
        await _cache.removeOutbox(id);
        sent += 1;
      } on ApiException catch (error) {
        if (error.isOffline) break;
        // Keep a rejected item queued instead of silently losing user text.
      } on Object {
        break;
      }
    }
    return sent;
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
