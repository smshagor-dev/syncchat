import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:syncchat_mobile/core/public_app_config.dart';

void main() {
  test('public app config preserves server policy', () {
    final config = PublicAppConfig.fromPayload({
      'appName': 'Runtime Chat',
      'supportEmail': 'support@example.com',
      'featureFlags': {'status': false, 'uploads': false},
      'uploadLimits': {
        'chatMb': 42,
        'avatarMb': 7,
        'allowedTypes': <String>[],
      },
      'mediaProfile': {'defaultQuality': 'hd', 'hdEnabled': false},
      'maintenance': {'enabled': true, 'message': 'Updating systems'},
    });

    expect(config.appName, 'Runtime Chat');
    expect(config.supportEmail, 'support@example.com');
    expect(config.featureEnabled('status'), isFalse);
    expect(config.featureEnabled('uploads'), isFalse);
    expect(config.featureEnabled('calls'), isTrue);
    expect(config.chatUploadLimitMb, 42);
    expect(config.avatarUploadLimitMb, 7);
    expect(config.allowedUploadTypes, isEmpty);
    expect(config.defaultMediaQuality, 'hd');
    expect(config.hdEnabled, isFalse);
    expect(config.maintenanceEnabled, isTrue);
    expect(config.maintenanceMessage, 'Updating systems');
  });

  test('production startup enforces web global gates', () {
    final main = File('lib/main.dart').readAsStringSync();
    final lockGate =
        File('lib/widgets/authenticated_app_lock_gate.dart').readAsStringSync();
    final runtimeConfig =
        File('lib/core/public_app_config.dart').readAsStringSync();

    expect(runtimeConfig, contains("_api.get('/app-config', authenticated: false)"));
    expect(main, contains('PublicAppConfigScope'));
    expect(main, contains('runtimeConfig.maintenanceEnabled'));
    expect(main, contains('_MaintenanceScreen'));
    expect(main, contains('AuthenticatedAppLockGate'));
    expect(lockGate, contains("'/settings/app-lock/verify'"));
    expect(lockGate, contains("settings['appLockEnabled'] != true"));
    expect(lockGate, contains('Unlock app'));
    expect(lockGate, contains('Sign out'));
  });
}
