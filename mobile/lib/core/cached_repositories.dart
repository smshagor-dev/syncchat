import 'api_client.dart';
import 'auth_repository.dart';
import 'chat_cache.dart';
import 'chat_repository.dart';
import 'e2ee_service.dart';
import 'feature_repositories.dart';
import 'realtime_client.dart';

class CachedInboxRepository extends InboxRepository {
  CachedInboxRepository(ApiClient api, this._cache) : super(api);

  final ChatCache _cache;

  @override
  Future<List<Map<String, dynamic>>> list({String? search}) async {
    final query = search?.trim() ?? '';
    try {
      final rows = await super.list(search: search);
      if (query.isEmpty) await _cache.writeInboxes(rows);
      return rows;
    } on ApiException catch (error) {
      if (!error.isOffline) rethrow;
      final cached = await _cache.readInboxes();
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
      final cached = await _cache.readRoomMessages(roomId);
      if (cached.isEmpty) rethrow;
      if (skip >= cached.length) return const [];
      final end = (skip + limit).clamp(0, cached.length);
      return cached.sublist(skip, end);
    }
  }

  @override
  Future<void> openRoom(String roomId) async {
    try {
      await super.openRoom(roomId);
    } on ApiException catch (error) {
      if (!error.isOffline) rethrow;
    }
  }

  @override
  Future<Map<String, dynamic>> pinnedMessages(String roomId) async {
    try {
      return await super.pinnedMessages(roomId);
    } on ApiException catch (error) {
      if (!error.isOffline) rethrow;
      return const {'pinned': <dynamic>[]};
    }
  }

  @override
  Future<Map<String, dynamic>> e2eeRoomState(String roomId) async {
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
    final messages = await super.syncRoom(roomId, afterSequence: afterSequence);
    if (messages.isNotEmpty) await _cache.mergeRoomMessages(roomId, messages);
    return messages;
  }
}
