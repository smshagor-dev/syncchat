import 'dart:io';
import 'dart:math';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_client.dart';
import 'app_config.dart';

class StandardPushRegistration {
  StandardPushRegistration._();

  static const _storage = FlutterSecureStorage();
  static const _deviceIdKey = 'syncchat.native_push_device_id';

  static Future<void> registerIOS({
    required ApiClient api,
    required SyncChatConfig config,
  }) async {
    if (!Platform.isIOS || !config.hasIosFirebaseConfig) return;

    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(
        options: FirebaseOptions(
          apiKey: config.firebaseIosApiKey,
          appId: config.firebaseIosAppId,
          messagingSenderId: config.firebaseMessagingSenderId,
          projectId: config.firebaseProjectId,
          iosBundleId: config.firebaseIosBundleId,
        ),
      );
    }

    // Registration runs during authenticated bootstrap as well as after the
    // explicit Settings permission action. Bootstrap must never show a system
    // permission prompt, so only continue when authorization already exists.
    final permission = await FirebaseMessaging.instance.getNotificationSettings();
    if (permission.authorizationStatus != AuthorizationStatus.authorized &&
        permission.authorizationStatus != AuthorizationStatus.provisional) {
      return;
    }

    String? apnsToken;
    for (var attempt = 0; attempt < 8; attempt += 1) {
      apnsToken = (await FirebaseMessaging.instance.getAPNSToken())?.trim();
      if (apnsToken != null && apnsToken.isNotEmpty) break;
      await Future<void>.delayed(const Duration(milliseconds: 350));
    }
    if (apnsToken == null || apnsToken.isEmpty) return;

    await api.post(
      '/settings/push/native/register',
      body: {
        'platform': 'ios',
        'provider': 'apns',
        'token': apnsToken,
        'tokenType': 'standard',
        'deviceId': await _deviceId(),
        'deviceLabel': 'iOS device',
        'appVersion': config.appVersion,
      },
    );
  }

  static Future<String> _deviceId() async {
    final existing = (await _storage.read(key: _deviceIdKey))?.trim();
    if (existing != null && existing.isNotEmpty) return existing;
    final random = Random.secure();
    final id = List<int>.generate(
      20,
      (_) => random.nextInt(256),
    ).map((value) => value.toRadixString(16).padLeft(2, '0')).join();
    await _storage.write(key: _deviceIdKey, value: id);
    return id;
  }
}
