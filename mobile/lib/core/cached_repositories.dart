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
        final text = [
          inbox['name'],
          inbox['lastMessage']?['text'],
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
  Future<List<Map<String, dynamic>>> syncRoom(
    String roomId, {
    int afterSequence = 0,
  }) async {
    final messages = await super.syncRoom(roomId, afterSequence: afterSequence);
    if (messages.isNotEmpty) await _cache.mergeRoomMessages(roomId, messages);
    return messages;
  }
}
