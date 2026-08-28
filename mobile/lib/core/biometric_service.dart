import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

class BiometricService {
  BiometricService._();

  static const _storage = FlutterSecureStorage();
  static const _enabledKey = 'syncchat.biometric_unlock_enabled.v1';
  static const _preferenceSetKey =
      'syncchat.biometric_unlock_preference_set.v1';
  static final LocalAuthentication _auth = LocalAuthentication();
  static DateTime? _lastUnlockAt;

  static Future<bool> isAvailable() async {
    try {
      if (!await _auth.isDeviceSupported()) return false;
      final available = await _auth.getAvailableBiometrics();
      return available.isNotEmpty;
    } on Object catch (error) {
      debugPrint('Biometric availability check failed: $error');
      return false;
    }
  }

  static Future<bool> hasPreference() async {
    if (await _storage.read(key: _preferenceSetKey) == '1') return true;

    // Before explicit preference tracking existed, login could auto-write `1`.
    // A stored `0`, however, could only come from the user turning biometrics
    // off in Settings, so preserve that choice during migration.
    return await _storage.read(key: _enabledKey) == '0';
  }

  static Future<bool> shouldOfferSetup() async {
    if (await hasPreference()) return false;
    return isAvailable();
  }

  static Future<bool> isEnabled() async {
    if (await _storage.read(key: _preferenceSetKey) != '1') return false;
    final value = await _storage.read(key: _enabledKey);
    return value == '1' && await isAvailable();
  }

  static Future<bool> setEnabled(
    bool enabled, {
    String reason = 'Confirm your identity to enable biometric protection',
  }) async {
    if (!enabled) {
      await _storage.write(key: _enabledKey, value: '0');
      await _storage.write(key: _preferenceSetKey, value: '1');
      _lastUnlockAt = null;
      return true;
    }

    if (!await isAvailable()) {
      throw StateError(
        'No biometric authentication is available on this device.',
      );
    }

    final verified = await _authenticateBiometric(reason: reason);
    if (!verified) return false;

    await _storage.write(key: _enabledKey, value: '1');
    await _storage.write(key: _preferenceSetKey, value: '1');
    _lastUnlockAt = DateTime.now();
    return true;
  }

  static Future<bool> authenticate({
    required String reason,
    Duration reuseWindow = Duration.zero,
  }) async {
    if (!await isEnabled()) return true;

    final last = _lastUnlockAt;
    if (last != null &&
        reuseWindow > Duration.zero &&
        DateTime.now().difference(last) <= reuseWindow) {
      return true;
    }

    final success = await _authenticateBiometric(reason: reason);
    if (success) _lastUnlockAt = DateTime.now();
    return success;
  }

  static Future<bool> _authenticateBiometric({required String reason}) async {
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        biometricOnly: true,
        persistAcrossBackgrounding: true,
      );
    } on Object catch (error) {
      debugPrint('Biometric authentication failed: $error');
      return false;
    }
  }

  static void expireUnlock() {
    _lastUnlockAt = null;
  }
}
