import 'package:flutter_test/flutter_test.dart';
import 'package:permission_handler/permission_handler.dart' as ph;
import 'package:syncchat_mobile/core/permission_manager.dart';

void main() {
  group('AppPermissionManager', () {
    test('treats usable permission states as granted', () {
      expect(
        AppPermissionManager.isUsableStatus(ph.PermissionStatus.granted),
        isTrue,
      );
      expect(
        AppPermissionManager.isUsableStatus(ph.PermissionStatus.limited),
        isTrue,
      );
      expect(
        AppPermissionManager.isUsableStatus(ph.PermissionStatus.provisional),
        isTrue,
      );
      expect(
        AppPermissionManager.isUsableStatus(ph.PermissionStatus.denied),
        isFalse,
      );
      expect(
        AppPermissionManager.isUsableStatus(
          ph.PermissionStatus.permanentlyDenied,
        ),
        isFalse,
      );
    });

    test('maps core SyncChat permissions to platform permissions', () {
      expect(
        AppPermissionManager.permissionFor(SyncPermission.contacts),
        ph.Permission.contacts,
      );
      expect(
        AppPermissionManager.permissionFor(SyncPermission.camera),
        ph.Permission.camera,
      );
      expect(
        AppPermissionManager.permissionFor(SyncPermission.microphone),
        ph.Permission.microphone,
      );
      expect(
        AppPermissionManager.permissionFor(SyncPermission.location),
        ph.Permission.locationWhenInUse,
      );
    });

    test('startup set contains every cross-platform communication permission', () {
      final permissions = AppPermissionManager.startupPermissions;
      expect(permissions, contains(ph.Permission.notification));
      expect(permissions, contains(ph.Permission.camera));
      expect(permissions, contains(ph.Permission.microphone));
      expect(permissions, contains(ph.Permission.contacts));
      expect(permissions, contains(ph.Permission.photos));
      expect(permissions, contains(ph.Permission.locationWhenInUse));
    });
  });
}
