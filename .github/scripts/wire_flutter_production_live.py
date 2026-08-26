from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    path.write_text(text.replace(old, new, 1))


root = Path('mobile')

# Chat media repository primitive.
chat = root / 'lib/core/chat_repository.dart'
replace_once(
    chat,
    """  Future<void> openRoom(String roomId) async {\n""",
    """  Future<List<Map<String, dynamic>>> listMedia({String? roomId}) async {\n    final response = await _api.get(\n      '/chats/media',\n      query: {if (roomId != null && roomId.trim().isNotEmpty) 'roomId': roomId.trim()},\n    );\n    return _mapList(response.payload);\n  }\n\n  Future<List<Map<String, dynamic>>> listStarred() async {\n    final response = await _api.get('/chats/starred');\n    return _mapList(response.payload);\n  }\n\n  Future<void> openRoom(String roomId) async {\n""",
    'chat media repository',
)

# Settings repository production actions.
features = root / 'lib/core/feature_repositories.dart'
replace_once(
    features,
    """  Future<Map<String, dynamic>> update(Map<String, dynamic> changes) async =>\n      _mapPayload((await _api.put('/settings', body: changes)).payload);\n}\n""",
    """  Future<Map<String, dynamic>> update(Map<String, dynamic> changes) async =>\n      _mapPayload((await _api.put('/settings', body: changes)).payload);\n\n  Future<List<Map<String, dynamic>>> deviceSessions() async =>\n      _mapList((await _api.get('/settings/device-sessions')).payload);\n\n  Future<void> revokeDeviceSession(String sessionId) async {\n    await _api.delete('/settings/device-sessions/$sessionId');\n  }\n\n  Future<void> revokeOtherDeviceSessions() async {\n    await _api.post('/settings/device-sessions/logout-others');\n  }\n\n  Future<List<Map<String, dynamic>>> blockedContacts() async =>\n      _mapList((await _api.get('/settings/blocked-contacts')).payload);\n\n  Future<List<Map<String, dynamic>>> hiddenChats() async =>\n      _mapList((await _api.get('/settings/hidden-chats')).payload);\n\n  Future<Map<String, dynamic>> setupTwoFactor() async =>\n      _mapPayload((await _api.post('/settings/two-factor/setup')).payload);\n\n  Future<Map<String, dynamic>> enableTwoFactor(String code) async =>\n      _mapPayload(\n        (await _api.post('/settings/two-factor/enable', body: {'code': code})).payload,\n      );\n\n  Future<Map<String, dynamic>> disableTwoFactor({\n    required String password,\n    required String code,\n  }) async =>\n      _mapPayload(\n        (await _api.post(\n          '/settings/two-factor/disable',\n          body: {'password': password, 'code': code},\n        )).payload,\n      );\n\n  Future<Map<String, dynamic>> setAppLock(String password) async =>\n      _mapPayload(\n        (await _api.post('/settings/app-lock', body: {'password': password})).payload,\n      );\n\n  Future<Map<String, dynamic>> removeAppLock(String password) async =>\n      _mapPayload(\n        (await _api.delete('/settings/app-lock', body: {'password': password})).payload,\n      );\n\n  Future<Map<String, dynamic>> requestAccountExport() async =>\n      _mapPayload((await _api.post('/settings/account-export')).payload);\n\n  Future<Map<String, dynamic>> createDeviceLinkRequest() async =>\n      _mapPayload((await _api.post('/settings/device-link-request')).payload);\n}\n""",
    'settings production repository',
)

# Auth repository: password/account/device-link/social server contracts.
auth = root / 'lib/core/auth_repository.dart'
replace_once(
    auth,
    """  Future<bool> hasSession() async =>\n      (await _sessionStore.readAccessToken())?.isNotEmpty == true;\n""",
    """  Future<void> changePassword({\n    required String oldPassword,\n    required String newPassword,\n    required String confirmNewPassword,\n  }) async {\n    await _api.patch(\n      '/users/change-pass',\n      body: {\n        'oldPass': oldPassword,\n        'newPass': newPassword,\n        'confirmNewPass': confirmNewPassword,\n      },\n    );\n  }\n\n  Future<void> deleteAccount(String password) async {\n    await _api.delete('/users', body: {'password': password});\n  }\n\n  Future<Map<String, dynamic>> deviceLinkInfo({\n    String? token,\n    String? shortCode,\n  }) async {\n    final response = await _api.post(\n      '/users/device-link/info',\n      authenticated: false,\n      body: {\n        if (token?.trim().isNotEmpty == true) 'token': token!.trim(),\n        if (shortCode?.trim().isNotEmpty == true) 'shortCode': shortCode!.trim(),\n      },\n    );\n    final payload = response.payload;\n    if (payload is Map) return Map<String, dynamic>.from(payload);\n    throw const ApiException(statusCode: 500, message: 'Invalid device-link response.');\n  }\n\n  Future<AuthResult> completeDeviceLink({\n    required String token,\n    required String emailCode,\n    required String supportCode,\n  }) async {\n    final response = await _api.post(\n      '/users/device-link/complete',\n      authenticated: false,\n      body: {\n        'token': token.trim(),\n        'emailCode': emailCode.trim(),\n        'supportCode': supportCode.trim(),\n      },\n    );\n    final payload = response.payload;\n    if (payload is Map && payload['requiresTwoFactor'] == true) {\n      final tempToken = payload['tempToken']?.toString().trim() ?? '';\n      if (tempToken.isEmpty) {\n        throw const ApiException(statusCode: 500, message: 'Device link did not return a secure challenge token.');\n      }\n      return AuthResult.twoFactor(\n        tempToken: tempToken,\n        message: response.message ?? 'Two-factor verification required.',\n      );\n    }\n    final tokenValue = _extractToken(payload);\n    await _completeLogin(token: tokenValue);\n    return AuthResult.authenticated(\n      token: tokenValue,\n      message: response.message ?? 'Device linked.',\n    );\n  }\n\n  Future<Map<String, dynamic>> socialConfig() async {\n    final response = await _api.get('/users/social-config', authenticated: false);\n    final payload = response.payload;\n    return payload is Map ? Map<String, dynamic>.from(payload) : const {};\n  }\n\n  Future<AuthResult> socialAuth({\n    required String provider,\n    required Map<String, dynamic> payload,\n  }) async {\n    final response = await _api.post(\n      '/users/social-auth',\n      authenticated: false,\n      body: {'provider': provider, 'payload': payload},\n    );\n    final value = response.payload;\n    if (value is Map && value['requiresTwoFactor'] == true) {\n      final tempToken = value['tempToken']?.toString().trim() ?? '';\n      if (tempToken.isEmpty) {\n        throw const ApiException(statusCode: 500, message: 'Social login did not return a secure challenge token.');\n      }\n      return AuthResult.twoFactor(\n        tempToken: tempToken,\n        message: response.message ?? 'Two-factor verification required.',\n      );\n    }\n    final tokenValue = _extractToken(value);\n    await _completeLogin(token: tokenValue);\n    return AuthResult.authenticated(\n      token: tokenValue,\n      message: response.message ?? 'Signed in.',\n    );\n  }\n\n  Future<bool> hasSession() async =>\n      (await _sessionStore.readAccessToken())?.isNotEmpty == true;\n""",
    'auth production contracts',
)

# Production shell: remove remaining static side-rail targets.
shell = root / 'lib/screens/live_mobile_shell.dart'
replace_once(
    shell,
    """import 'core_screens.dart';\nimport 'live_calls_screen.dart';\nimport 'live_home_screens.dart';\n""",
    """import 'live_calls_screen.dart';\nimport 'live_collection_screens.dart';\nimport 'live_home_screens.dart';\nimport 'live_settings_screen.dart';\n""",
    'live shell imports',
)
replace_once(
    shell,
    """      'archive' => const CollectionScreen(\n        title: 'Archive',\n        icon: Icons.archive_outlined,\n        description: 'Chats archived from the main inbox.',\n      ),\n      'lists' => const CollectionScreen(\n        title: 'Lists',\n        icon: Icons.format_list_bulleted_rounded,\n        description: 'Custom chat lists and grouped conversations.',\n      ),\n      'media' => const CollectionScreen(\n        title: 'Media',\n        icon: Icons.image_outlined,\n        description: 'Shared photos, videos, links and files.',\n      ),\n      'settings' => SettingsScreen(onThemeChanged: widget.onThemeChanged),\n""",
    """      'archive' => const LiveInboxCollectionScreen(\n        kind: LiveInboxCollectionKind.archive,\n      ),\n      'lists' => const LiveInboxCollectionScreen(\n        kind: LiveInboxCollectionKind.lists,\n      ),\n      'media' => const LiveMediaScreen(),\n      'settings' => LiveSettingsScreen(onThemeChanged: widget.onThemeChanged),\n""",
    'live shell collection routes',
)

# Dart 3.13 doesn't expose firstOrNull in core collections.
settings_screen = root / 'lib/screens/live_settings_screen.dart'
text = settings_screen.read_text()
text = text.replace(
    """  if (owners is List && owners.isNotEmpty) {\n    final raw = owners.whereType<Map>().firstOrNull;\n    if (raw != null) {\n      return raw['fullname']?.toString() ?? raw['username']?.toString() ?? 'Hidden chat';\n    }\n  }\n""",
    """  if (owners is List && owners.isNotEmpty) {\n    final mapped = owners.whereType<Map>().toList(growable: false);\n    if (mapped.isNotEmpty) {\n      final raw = mapped.first;\n      return raw['fullname']?.toString() ?? raw['username']?.toString() ?? 'Hidden chat';\n    }\n  }\n""",
)
settings_screen.write_text(text)
