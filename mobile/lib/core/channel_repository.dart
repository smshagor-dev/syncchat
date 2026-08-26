import 'dart:async';

import 'api_client.dart';
import 'auth_repository.dart';
import 'realtime_client.dart';

class ChannelRepository {
  ChannelRepository({
    required ApiClient api,
    required AuthRepository auth,
    required RealtimeClient realtime,
  }) : _api = api,
       _auth = auth,
       _realtime = realtime;

  final ApiClient _api;
  final AuthRepository _auth;
  final RealtimeClient _realtime;

  Map<String, dynamic>? _currentUser;

  Future<Map<String, dynamic>> currentUser({bool refresh = false}) async {
    if (!refresh && _currentUser != null) return _currentUser!;
    _currentUser = await _auth.currentUser();
    return _currentUser!;
  }

  Future<List<Map<String, dynamic>>> list({String? mode}) async => _list(
    (await _api.get(
      '/channels',
      query: {if (mode != null && mode.isNotEmpty) 'mode': mode},
    )).payload,
  );

  Future<Map<String, dynamic>> find(String channelId) async =>
      _map((await _api.get('/channels/$channelId')).payload);

  Future<List<Map<String, dynamic>>> participants(
    String channelId, {
    int skip = 0,
    int limit = 200,
  }) async => _list(
    (await _api.get(
      '/channels/$channelId/participants',
      query: {'skip': skip, 'limit': limit},
    )).payload,
  );

  Future<List<Map<String, dynamic>>> pendingMembers(String channelId) async =>
      _list((await _api.get('/channels/$channelId/pending-members')).payload);

  Future<Map<String, dynamic>> addParticipants(
    String channelId,
    List<String> userIds,
  ) async => _map(
    (await _api.post(
      '/channels/$channelId/participants',
      body: {'friendsId': userIds},
    )).payload,
  );

  Future<Map<String, dynamic>> updatePermissions(
    String channelId,
    Map<String, dynamic> permissions,
  ) async => _map(
    (await _api.patch(
      '/channels/$channelId/permissions',
      body: {'permissions': permissions},
    )).payload,
  );

  Future<Map<String, dynamic>> updateModeration(
    String channelId,
    Map<String, dynamic> moderation,
  ) async => _map(
    (await _api.patch(
      '/channels/$channelId/moderation',
      body: {'moderation': moderation},
    )).payload,
  );

  Future<Map<String, dynamic>> approvePending(
    String channelId,
    String memberId,
  ) async => _map(
    (await _api.post(
      '/channels/$channelId/pending-members/$memberId/approve',
    )).payload,
  );

  Future<Map<String, dynamic>> rejectPending(
    String channelId,
    String memberId,
  ) async => _map(
    (await _api.post(
      '/channels/$channelId/pending-members/$memberId/reject',
    )).payload,
  );

  Future<Map<String, dynamic>> create({
    required String name,
    String desc = '',
    String accessType = 'public',
    String password = '',
    String? avatarDataUri,
    List<String> participantIds = const [],
    Map<String, dynamic>? permissions,
  }) async {
    final user = await currentUser();
    final adminId = user['_id']?.toString() ?? '';
    if (adminId.isEmpty) {
      throw const ApiException(
        statusCode: 401,
        message: 'Current user is unavailable.',
      );
    }

    final normalized = accessType == 'private' ? 'private' : 'public';
    if (name.trim().isEmpty) {
      throw const ApiException(statusCode: 400, message: 'Channel name is required.');
    }
    if (normalized == 'private' && password.length < 4) {
      throw const ApiException(
        statusCode: 400,
        message: 'Private channel password must be at least 4 characters.',
      );
    }

    await _ensureRealtime();
    final ack = await _realtime.emitWithAck('channel/create', {
      'name': name.trim(),
      'desc': desc.trim(),
      'avatar': avatarDataUri,
      'accessType': normalized,
      'password': normalized == 'private' ? password : '',
      'adminId': adminId,
      'participantsId': participantIds,
      if (permissions != null) 'permissions': permissions,
    });
    return _ackPayload(ack, fallback: 'Failed to create channel.');
  }

  Future<Map<String, dynamic>> subscribe(
    String channelId, {
    String password = '',
  }) async {
    final user = await currentUser();
    final userId = user['_id']?.toString() ?? '';
    if (userId.isEmpty) {
      throw const ApiException(
        statusCode: 401,
        message: 'Current user is unavailable.',
      );
    }
    await _ensureRealtime();
    final ack = await _realtime.emitWithAck('channel/subscribe', {
      'channelId': channelId,
      'userId': userId,
      'password': password,
    });
    return _ackPayload(ack, fallback: 'Failed to subscribe to channel.');
  }

  Future<void> exit(String channelId) async {
    final user = await currentUser();
    final userId = user['_id']?.toString() ?? '';
    if (userId.isEmpty) {
      throw const ApiException(
        statusCode: 401,
        message: 'Current user is unavailable.',
      );
    }
    await _ensureRealtime();
    final ack = await _realtime.emitWithAck('channel/exit', {
      'channelId': channelId,
      'userId': userId,
    });
    _requireAck(ack, fallback: 'Failed to leave channel.');
  }

  Future<Map<String, dynamic>> verifyPassword(
    String channelId,
    String password,
  ) async => _map(
    (await _api.post(
      '/channels/$channelId/verify-password',
      body: {'password': password},
    )).payload,
  );

  Future<Map<String, dynamic>> joinByLink(
    String token, {
    String password = '',
  }) async => _map(
    (await _api.post(
      '/channels/join-link',
      body: {'token': token.trim(), 'password': password},
    )).payload,
  );

  Future<Map<String, dynamic>> updatePrivacy(
    String channelId, {
    required String accessType,
    String password = '',
  }) async {
    final normalized = accessType == 'private' ? 'private' : 'public';
    return _map(
      (await _api.patch(
        '/channels/$channelId/privacy',
        body: {
          'accessType': normalized,
          'password': normalized == 'private' ? password : '',
        },
      )).payload,
    );
  }

  Future<Map<String, dynamic>> updatePassword(
    String channelId, {
    required String oldPassword,
    required String newPassword,
  }) async => _map(
    (await _api.patch(
      '/channels/$channelId/password',
      body: {'oldPassword': oldPassword, 'newPassword': newPassword},
    )).payload,
  );

  Future<void> _ensureRealtime() async {
    if (_realtime.isConnected) return;
    await _realtime.connect();
    if (_realtime.isConnected) return;

    try {
      final state = await _realtime.states
          .firstWhere(
            (value) =>
                value == RealtimeConnectionState.connected ||
                value == RealtimeConnectionState.authenticationFailed,
          )
          .timeout(const Duration(seconds: 8));
      if (state == RealtimeConnectionState.connected) return;
    } on TimeoutException {
      // Controlled error below.
    }

    throw const ApiException(
      statusCode: 0,
      message: 'Realtime connection is unavailable.',
    );
  }

  Map<String, dynamic> _ackPayload(dynamic ack, {required String fallback}) {
    final map = _ackMap(ack, fallback: fallback);
    final payload = map['payload'];
    if (payload is Map) return Map<String, dynamic>.from(payload);
    return const {};
  }

  void _requireAck(dynamic ack, {required String fallback}) {
    _ackMap(ack, fallback: fallback);
  }

  Map<String, dynamic> _ackMap(dynamic ack, {required String fallback}) {
    if (ack is! Map) {
      throw ApiException(statusCode: 500, message: fallback);
    }
    final map = Map<String, dynamic>.from(ack);
    if (map['success'] != true) {
      throw ApiException(
        statusCode: 400,
        message: map['message']?.toString() ?? fallback,
      );
    }
    return map;
  }

  List<Map<String, dynamic>> _list(dynamic payload) {
    if (payload is! List) return const [];
    return payload
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
  }

  Map<String, dynamic> _map(dynamic payload) {
    if (payload is Map) return Map<String, dynamic>.from(payload);
    return const {};
  }
}
