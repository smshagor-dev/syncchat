import 'dart:async';

import 'api_client.dart';
import 'auth_repository.dart';
import 'realtime_client.dart';

class GroupRepository {
  GroupRepository({
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

  Future<Map<String, dynamic>> find(String groupId) async =>
      _map((await _api.get('/groups/$groupId')).payload);

  Future<List<Map<String, dynamic>>> participants(
    String groupId, {
    int skip = 0,
    int limit = 200,
  }) async => _list(
    (await _api.get(
      '/groups/$groupId/participants',
      query: {'skip': skip, 'limit': limit},
    )).payload,
  );

  Future<List<Map<String, dynamic>>> pendingMembers(String groupId) async =>
      _list((await _api.get('/groups/$groupId/pending-members')).payload);

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
    await _ensureRealtime();
    final ack = await _realtime.emitWithAck('group/create', {
      'name': name.trim(),
      'desc': desc.trim(),
      'avatar': avatarDataUri,
      'accessType': accessType == 'private' ? 'private' : 'public',
      'password': password,
      'adminId': adminId,
      'participantsId': participantIds,
      if (permissions != null) 'permissions': permissions,
    });
    return _ackPayload(ack, fallback: 'Failed to create group.');
  }

  Future<void> edit({
    required String groupId,
    required String name,
    required String desc,
  }) async {
    final user = await currentUser();
    await _ensureRealtime();
    final ack = await _realtime.emitWithAck('group/edit', {
      'groupId': groupId,
      'userId': user['_id']?.toString(),
      'form': {'name': name.trim(), 'desc': desc.trim()},
    });
    _requireAck(ack, fallback: 'Failed to update group info.');
  }

  Future<Map<String, dynamic>> addParticipants(
    String groupId,
    List<String> userIds,
  ) async => _map(
    (await _api.post(
      '/groups/$groupId/participants',
      body: {'friendsId': userIds},
    )).payload,
  );

  Future<Map<String, dynamic>> updatePrivacy(
    String groupId, {
    required String accessType,
    String password = '',
  }) async {
    final normalized = accessType == 'private' ? 'private' : 'public';
    try {
      return _map(
        (await _api.patch(
          '/groups/$groupId/privacy',
          body: {'accessType': normalized, 'password': password},
        )).payload,
      );
    } on ApiException {
      // Older production backends may update privacy and then fail while
      // broadcasting the inbox update. Confirm persisted state before failing
      // the mobile action so users are not asked to repeat a successful change.
      final persisted = await find(groupId);
      if (persisted['accessType']?.toString() == normalized) return persisted;
      rethrow;
    }
  }

  Future<Map<String, dynamic>> updatePassword(
    String groupId, {
    required String oldPassword,
    required String newPassword,
  }) async => _map(
    (await _api.patch(
      '/groups/$groupId/password',
      body: {'oldPassword': oldPassword, 'newPassword': newPassword},
    )).payload,
  );

  Future<Map<String, dynamic>> updatePermissions(
    String groupId,
    Map<String, dynamic> permissions,
  ) async => _map(
    (await _api.patch(
      '/groups/$groupId/permissions',
      body: {'permissions': permissions},
    )).payload,
  );

  Future<Map<String, dynamic>> updateModeration(
    String groupId,
    Map<String, dynamic> moderation,
  ) async => _map(
    (await _api.patch(
      '/groups/$groupId/moderation',
      body: {'moderation': moderation},
    )).payload,
  );

  Future<Map<String, dynamic>> approvePending(
    String groupId,
    String memberId,
  ) async => _map(
    (await _api.post(
      '/groups/$groupId/pending-members/$memberId/approve',
    )).payload,
  );

  Future<Map<String, dynamic>> rejectPending(
    String groupId,
    String memberId,
  ) async => _map(
    (await _api.post(
      '/groups/$groupId/pending-members/$memberId/reject',
    )).payload,
  );

  Future<Map<String, dynamic>> verifyPassword(
    String groupId,
    String password,
  ) async => _map(
    (await _api.post(
      '/groups/$groupId/verify-password',
      body: {'password': password},
    )).payload,
  );

  Future<Map<String, dynamic>> joinByLink(
    String token, {
    String password = '',
  }) async => _map(
    (await _api.post(
      '/groups/join-link',
      body: {'token': token, 'password': password},
    )).payload,
  );

  Future<String> uploadAvatar(String groupId, String avatarDataUri) async {
    final response = await _api.post(
      '/avatars',
      body: {
        'avatar': avatarDataUri,
        'targetId': groupId,
        'isGroup': true,
        'isChannel': false,
      },
    );
    final value = response.payload?.toString() ?? '';
    if (value.isEmpty) {
      throw const ApiException(
        statusCode: 500,
        message: 'Group photo upload returned no image URL.',
      );
    }
    return value;
  }

  Future<Map<String, dynamic>> promoteAdmin(
    String groupId,
    String participantId,
  ) async {
    final userId = (await currentUser())['_id']?.toString() ?? '';
    await _ensureRealtime();
    _realtime.emit('group/add-admin', {
      'groupId': groupId,
      'userId': userId,
      'participantId': participantId,
    });
    return _waitForGroup(
      groupId,
      (group) => _ids(group['adminsId']).contains(participantId),
      error: 'Admin role was not confirmed by the server.',
    );
  }

  Future<Map<String, dynamic>> demoteAdmin(
    String groupId,
    String participantId,
  ) async {
    final userId = (await currentUser())['_id']?.toString() ?? '';
    await _ensureRealtime();
    _realtime.emit('group/remove-admin', {
      'groupId': groupId,
      'userId': userId,
      'participantId': participantId,
    });
    return _waitForGroup(
      groupId,
      (group) => !_ids(group['adminsId']).contains(participantId),
      error: 'Admin removal was not confirmed by the server.',
    );
  }

  Future<Map<String, dynamic>> removeParticipant(
    String groupId,
    String participantId,
  ) async {
    final userId = (await currentUser())['_id']?.toString() ?? '';
    await _ensureRealtime();
    _realtime.emit('group/remove-participant', {
      'groupId': groupId,
      'userId': userId,
      'participantId': participantId,
    });
    return _waitForGroup(
      groupId,
      (group) => !_ids(group['participantsId']).contains(participantId),
      error: 'Participant removal was not confirmed by the server.',
    );
  }

  Future<void> exit(String groupId) async {
    final userId = (await currentUser())['_id']?.toString() ?? '';
    await _ensureRealtime();
    final ack = await _realtime.emitWithAck('group/exit', {
      'groupId': groupId,
      'userId': userId,
    });
    _requireAck(ack, fallback: 'Failed to leave group.');
  }

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

  Future<Map<String, dynamic>> _waitForGroup(
    String groupId,
    bool Function(Map<String, dynamic> group) predicate, {
    required String error,
  }) async {
    Object? lastError;
    for (var attempt = 0; attempt < 8; attempt++) {
      await Future<void>.delayed(Duration(milliseconds: attempt == 0 ? 180 : 300));
      try {
        final group = await find(groupId);
        if (predicate(group)) return group;
      } on Object catch (failure) {
        lastError = failure;
      }
    }
    if (lastError is ApiException) throw lastError;
    throw ApiException(statusCode: 408, message: error);
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

  Set<String> _ids(dynamic value) => value is List
      ? value.map((item) => item.toString()).where((id) => id.isNotEmpty).toSet()
      : <String>{};
}
