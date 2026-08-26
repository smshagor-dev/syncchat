import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class ScreenSecurityService {
  ScreenSecurityService._();

  static const MethodChannel _channel = MethodChannel('syncchat/screen_security');
  static int _secureDepth = 0;

  static Future<void> pushSecure() async {
    _secureDepth += 1;
    if (_secureDepth != 1) return;
    await _setSecure(true);
  }

  static Future<void> popSecure() async {
    if (_secureDepth > 0) _secureDepth -= 1;
    if (_secureDepth != 0) return;
    await _setSecure(false);
  }

  static Future<void> _setSecure(bool secure) async {
    try {
      await _channel.invokeMethod<bool>('setSecure', {'secure': secure});
    } on MissingPluginException {
      // iOS does not expose an official API to prevent screenshots. Its native
      // layer still obscures app-switcher snapshots; Android enforces
      // FLAG_SECURE for active chat routes.
    } on PlatformException catch (error) {
      debugPrint('Screen security update failed: $error');
    }
  }
}
