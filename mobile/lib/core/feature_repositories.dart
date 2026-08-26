import 'api_client.dart';

List<Map<String, dynamic>> _mapList(dynamic payload) {
  if (payload is! List) return const [];
  return payload
      .whereType<Map>()
      .map((item) => Map<String, dynamic>.from(item))
      .toList(growable: false);
}

Map<String, dynamic> _mapPayload(dynamic payload) {
  if (payload is Map) return Map<String, dynamic>.from(payload);
  return const {};
}

class InboxRepository {
  const InboxRepository(this._api);

  final ApiClient _api;

  Future<List<Map<String, dynamic>>> list() async =>
      _mapList((await _api.get('/inboxes')).payload);

  Future<Map<String, dynamic>> findByRoom(String roomId) async =>
      _mapPayload((await _api.get('/inboxes/$roomId')).payload);

  Future<Map<String, dynamic>> updatePreferences(
    String roomId,
    Map<String, dynamic> preferences,
  ) async => _mapPayload(
    (await _api.patch(
      '/inboxes/$roomId/preferences',
      body: preferences,
    )).payload,
  );

  Future<void> clearRoom(String roomId) async {
    await _api.post('/inboxes/$roomId/clear');
  }

  Future<void> markAllRead() async {
    await _api.post('/inboxes/read-all');
  }

  Future<void> enableChatLock(String roomId, String password) async {
    await _api.post('/inboxes/$roomId/chat-lock', body: {'password': password});
  }

  Future<void> verifyChatLock(String roomId, String password) async {
    await _api.post(
      '/inboxes/$roomId/verify-lock',
      body: {'password': password},
    );
  }

  Future<void> changeChatLock(
    String roomId, {
    required String currentPassword,
    required String newPassword,
  }) async {
    await _api.patch(
      '/inboxes/$roomId/chat-lock',
      body: {'currentPassword': currentPassword, 'newPassword': newPassword},
    );
  }

  Future<void> removeChatLock(String roomId, String password) async {
    await _api.delete(
      '/inboxes/$roomId/chat-lock',
      body: {'password': password},
    );
  }
}

class ContactRepository {
  const ContactRepository(this._api);

  final ApiClient _api;

  Future<List<Map<String, dynamic>>> list() async =>
      _mapList((await _api.get('/contacts')).payload);

  Future<List<Map<String, dynamic>>> search(String query) async => _mapList(
    (await _api.get('/contacts/search', query: {'q': query})).payload,
  );

  Future<Map<String, dynamic>> add(Map<String, dynamic> contact) async =>
      _mapPayload((await _api.post('/contacts', body: contact)).payload);

  Future<void> delete(String friendId) async {
    await _api.delete('/contacts/$friendId');
  }

  Future<List<Map<String, dynamic>>> labels() async =>
      _mapList((await _api.get('/contacts/labels')).payload);

  Future<Map<String, dynamic>> createLabel(String name) async => _mapPayload(
    (await _api.post('/contacts/labels', body: {'name': name})).payload,
  );

  Future<Map<String, dynamic>> updateLabel(
    String labelId,
    Map<String, dynamic> changes,
  ) async => _mapPayload(
    (await _api.put('/contacts/labels/$labelId', body: changes)).payload,
  );

  Future<void> deleteLabel(String labelId) async {
    await _api.delete('/contacts/labels/$labelId');
  }

  Future<Map<String, dynamic>> syncMobile(
    List<Map<String, dynamic>> contacts,
  ) async => _mapPayload(
    (await _api.post(
      '/contacts/mobile-sync',
      body: {'contacts': contacts},
    )).payload,
  );

  Future<Map<String, dynamic>> blockState(String friendId) async =>
      _mapPayload((await _api.get('/contacts/$friendId/block-state')).payload);

  Future<void> block(String friendId) async {
    await _api.put('/contacts/$friendId/block');
  }

  Future<void> unblock(String friendId) async {
    await _api.put('/contacts/$friendId/unblock');
  }

  Future<Map<String, dynamic>> updateLabels(
    String friendId,
    List<String> labelIds,
  ) async => _mapPayload(
    (await _api.put(
      '/contacts/$friendId/labels',
      body: {'labels': labelIds},
    )).payload,
  );
}

class StatusRepository {
  const StatusRepository(this._api);

  final ApiClient _api;

  Future<List<Map<String, dynamic>>> list() async =>
      _mapList((await _api.get('/statuses')).payload);

  Future<Map<String, dynamic>> create(Map<String, dynamic> status) async =>
      _mapPayload((await _api.post('/statuses', body: status)).payload);

  Future<void> markViewed(String statusId) async {
    await _api.post('/statuses/$statusId/view');
  }

  Future<Map<String, dynamic>> react(String statusId, String emoji) async =>
      _mapPayload(
        (await _api.post(
          '/statuses/$statusId/react',
          body: {'emoji': emoji},
        )).payload,
      );

  Future<Map<String, dynamic>> reply(String statusId, String text) async =>
      _mapPayload(
        (await _api.post(
          '/statuses/$statusId/reply',
          body: {'text': text},
        )).payload,
      );

  Future<Map<String, dynamic>> activity(String statusId) async =>
      _mapPayload((await _api.get('/statuses/$statusId/activity')).payload);

  Future<void> delete(String statusId) async {
    await _api.delete('/statuses/$statusId');
  }
}

class CommunityRepository {
  const CommunityRepository(this._api);

  final ApiClient _api;

  Future<List<Map<String, dynamic>>> list() async =>
      _mapList((await _api.get('/communities')).payload);

  Future<List<Map<String, dynamic>>> chats(String communityId) async =>
      _mapList((await _api.get('/communities/$communityId/chats')).payload);

  Future<Map<String, dynamic>> create(Map<String, dynamic> community) async =>
      _mapPayload((await _api.post('/communities', body: community)).payload);

  Future<Map<String, dynamic>> createGroup(
    String communityId,
    Map<String, dynamic> group,
  ) async => _mapPayload(
    (await _api.post('/communities/$communityId/groups', body: group)).payload,
  );
}

class ChannelRepository {
  const ChannelRepository(this._api);

  final ApiClient _api;

  Future<List<Map<String, dynamic>>> list({String? mode}) async => _mapList(
    (await _api.get(
      '/channels',
      query: {if (mode != null && mode.isNotEmpty) 'mode': mode},
    )).payload,
  );

  Future<Map<String, dynamic>> find(String channelId) async =>
      _mapPayload((await _api.get('/channels/$channelId')).payload);

  Future<List<Map<String, dynamic>>> participants(String channelId) async =>
      _mapList((await _api.get('/channels/$channelId/participants')).payload);

  Future<List<Map<String, dynamic>>> pendingMembers(String channelId) async =>
      _mapList(
        (await _api.get('/channels/$channelId/pending-members')).payload,
      );

  Future<Map<String, dynamic>> verifyPassword(
    String channelId,
    String password,
  ) async => _mapPayload(
    (await _api.post(
      '/channels/$channelId/verify-password',
      body: {'password': password},
    )).payload,
  );

  Future<Map<String, dynamic>> joinByLink(String token) async => _mapPayload(
    (await _api.post('/channels/join-link', body: {'token': token})).payload,
  );

  Future<Map<String, dynamic>> updatePrivacy(
    String channelId,
    Map<String, dynamic> privacy,
  ) async => _mapPayload(
    (await _api.patch('/channels/$channelId/privacy', body: privacy)).payload,
  );

  Future<Map<String, dynamic>> updatePassword(
    String channelId,
    Map<String, dynamic> passwordUpdate,
  ) async => _mapPayload(
    (await _api.patch(
      '/channels/$channelId/password',
      body: passwordUpdate,
    )).payload,
  );
}

class ProfileRepository {
  const ProfileRepository(this._api);

  final ApiClient _api;

  Future<Map<String, dynamic>> getProfile(String userId) async =>
      _mapPayload((await _api.get('/profiles/$userId')).payload);

  Future<Map<String, dynamic>> update(Map<String, dynamic> changes) async =>
      _mapPayload((await _api.put('/profiles', body: changes)).payload);
}

class SettingsRepository {
  const SettingsRepository(this._api);

  final ApiClient _api;

  Future<Map<String, dynamic>> get() async =>
      _mapPayload((await _api.get('/settings')).payload);

  Future<Map<String, dynamic>> update(Map<String, dynamic> changes) async =>
      _mapPayload((await _api.put('/settings', body: changes)).payload);

  Future<List<Map<String, dynamic>>> deviceSessions() async =>
      _mapList((await _api.get('/settings/device-sessions')).payload);

  Future<void> revokeDeviceSession(String sessionId) async {
    await _api.delete('/settings/device-sessions/$sessionId');
  }

  Future<void> revokeOtherDeviceSessions() async {
    await _api.post('/settings/device-sessions/logout-others');
  }

  Future<List<Map<String, dynamic>>> blockedContacts() async =>
      _mapList((await _api.get('/settings/blocked-contacts')).payload);

  Future<List<Map<String, dynamic>>> hiddenChats() async =>
      _mapList((await _api.get('/settings/hidden-chats')).payload);

  Future<Map<String, dynamic>> setupTwoFactor() async =>
      _mapPayload((await _api.post('/settings/two-factor/setup')).payload);

  Future<Map<String, dynamic>> enableTwoFactor(String code) async =>
      _mapPayload(
        (await _api.post(
          '/settings/two-factor/enable',
          body: {'code': code},
        )).payload,
      );

  Future<Map<String, dynamic>> disableTwoFactor({
    required String password,
    required String code,
  }) async => _mapPayload(
    (await _api.post(
      '/settings/two-factor/disable',
      body: {'password': password, 'code': code},
    )).payload,
  );

  Future<Map<String, dynamic>> setAppLock(String password) async => _mapPayload(
    (await _api.post(
      '/settings/app-lock',
      body: {'password': password},
    )).payload,
  );

  Future<Map<String, dynamic>> removeAppLock(String password) async =>
      _mapPayload(
        (await _api.delete(
          '/settings/app-lock',
          body: {'password': password},
        )).payload,
      );

  Future<Map<String, dynamic>> requestAccountExport() async =>
      _mapPayload((await _api.post('/settings/account-export')).payload);

  Future<Map<String, dynamic>> createDeviceLinkRequest() async =>
      _mapPayload((await _api.post('/settings/device-link-request')).payload);
}
