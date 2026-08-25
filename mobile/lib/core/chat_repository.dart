import 'dart:math';

import 'api_client.dart';
import 'auth_repository.dart';
import 'realtime_client.dart';

class ChatRepository {
  ChatRepository({
    required ApiClient api,
    required AuthRepository auth,
    required RealtimeClient realtime,
  })  : _api = api,
        _auth = auth,
        _realtime = realtime;

  final ApiClient _api;
  final AuthRepository _auth;
  final RealtimeClient _realtime;
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
    final payload = response.payload;
    if (payload is! List) return const [];
    return payload
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
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

  Future<String> sendText({
    required Map<String, dynamic> inbox,
    required String text,
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

    if (inbox['e2eeEnabled'] == true) {
      throw const ApiException(
        statusCode: 409,
        message: 'This room uses device E2EE. Mobile key exchange must be enabled before sending.',
      );
    }

    final roomId = inbox['roomId']?.toString().trim() ?? '';
    if (roomId.isEmpty) {
      throw const ApiException(statusCode: 400, message: 'Room ID is missing.');
    }

    await openRoom(roomId);
    final user = await currentUser();
    final userId = user['_id']?.toString().trim() ?? '';
    if (userId.isEmpty) {
      throw const ApiException(statusCode: 401, message: 'Current user ID is missing.');
    }

    final ownersId = (inbox['ownersId'] is List)
        ? List<dynamic>.from(inbox['ownersId'] as List)
            .map((item) => item.toString())
            .where((item) => item.isNotEmpty)
            .toList(growable: false)
        : const <String>[];

    final clientMessageId = _clientMessageId();
    _realtime.emit('chat/insert', {
      'clientMessageId': clientMessageId,
      'roomId': roomId,
      'roomType': inbox['roomType']?.toString() ?? 'private',
      'ownersId': ownersId,
      'userId': userId,
      'text': message,
      'replyTo': replyTo,
      'topicId': topicId,
      'viewOnce': viewOnce,
    });
    return clientMessageId;
  }

  Future<void> markRoomRead(Map<String, dynamic> inbox) async {
    if (!_realtime.isConnected) return;
    final user = await currentUser();
    final userId = user['_id']?.toString() ?? '';
    final roomId = inbox['roomId']?.toString() ?? '';
    if (userId.isEmpty || roomId.isEmpty) return;

    _realtime.emit('chat/read', {
      'roomId': roomId,
      'userId': userId,
      'ownersId': inbox['ownersId'] is List ? inbox['ownersId'] : const [],
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
    return (result['messages'] as List)
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
  }

  void on(String event, void Function(dynamic data) handler) =>
      _realtime.on(event, handler);

  void off(String event, [void Function(dynamic data)? handler]) =>
      _realtime.off(event, handler);

  String _clientMessageId() {
    final micros = DateTime.now().microsecondsSinceEpoch.toRadixString(36);
    final random = _random.nextInt(0x7fffffff).toRadixString(36);
    return 'flutter-$micros-$random';
  }
}
