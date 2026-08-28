import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_client.dart';
import 'feature_repositories.dart';

/// Keeps the small subset of settings needed during app launch on-device.
///
/// The server remains authoritative. This cache only removes network latency
/// from the critical render path; every successful server read/update refreshes
/// it immediately.
class CachedSettingsRepository extends SettingsRepository {
  CachedSettingsRepository(
    ApiClient api, {
    FlutterSecureStorage? secureStorage,
  })  : _secureStorage = secureStorage ?? const FlutterSecureStorage(),
        super(api);

  static const _cacheKey = 'syncchat.startup_settings.v1';

  final FlutterSecureStorage _secureStorage;

  Future<Map<String, dynamic>> readCached() async {
    try {
      final raw = (await _secureStorage.read(key: _cacheKey))?.trim() ?? '';
      if (raw.isEmpty) return const {};
      final decoded = jsonDecode(raw);
      return decoded is Map ? Map<String, dynamic>.from(decoded) : const {};
    } on Object {
      return const {};
    }
  }

  Future<void> _writeCached(Map<String, dynamic> settings) async {
    try {
      await _secureStorage.write(key: _cacheKey, value: jsonEncode(settings));
    } on Object {
      // A cache failure must never make the Settings API unavailable.
    }
  }

  Future<void> _mergeCached(Map<String, dynamic> patch) async {
    final current = await readCached();
    await _writeCached({...current, ...patch});
  }

  @override
  Future<Map<String, dynamic>> get() async {
    final settings = await super.get();
    await _writeCached(settings);
    return settings;
  }

  @override
  Future<Map<String, dynamic>> update(Map<String, dynamic> changes) async {
    final settings = await super.update(changes);
    await _writeCached(settings);
    return settings;
  }

  @override
  Future<Map<String, dynamic>> setAppLock(String password) async {
    final result = await super.setAppLock(password);
    await _mergeCached({'appLockEnabled': true});
    return result;
  }

  @override
  Future<Map<String, dynamic>> removeAppLock(String password) async {
    final result = await super.removeAppLock(password);
    await _mergeCached({'appLockEnabled': false});
    return result;
  }
}
