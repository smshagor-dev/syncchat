import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

class BiometricService {
  BiometricService._();

  static const _storage = FlutterSecureStorage();
  static const _enabledKey = 'syncchat.biometric_unlock_enabled.v1';
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

  static Future<bool> isEnabled() async {
    final value = await _storage.read(key: _enabledKey);
    return value == '1' && await isAvailable();
  }

  static Future<void> enableAfterSuccessfulLogin() async {
    if (await isAvailable()) {
      await _storage.write(key: _enabledKey, value: '1');
    }
  }

  static Future<void> setEnabled(bool enabled) async {
    if (enabled && !await isAvailable()) {
      throw StateError('No biometric authentication is available on this device.');
    }
    await _storage.write(key: _enabledKey, value: enabled ? '1' : '0');
    if (!enabled) _lastUnlockAt = null;
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

    try {
      final success = await _auth.authenticate(
        localizedReason: reason,
        biometricOnly: true,
        persistAcrossBackgrounding: true,
      );
      if (success) _lastUnlockAt = DateTime.now();
      return success;
    } on Object catch (error) {
      debugPrint('Biometric authentication failed: $error');
      return false;
    }
  }

  static void expireUnlock() {
    _lastUnlockAt = null;
  }
}
