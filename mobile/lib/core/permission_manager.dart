import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:permission_handler/permission_handler.dart' as ph;

enum SyncPermission {
  notifications,
  camera,
  microphone,
  contacts,
  photos,
  videos,
  location,
  bluetooth,
}

class AppPermissionManager {
  AppPermissionManager._();

  static const FlutterSecureStorage _storage = FlutterSecureStorage();
  static const String _bootstrapKey = 'syncchat.permissions.bootstrap.v2';
  static bool _bootstrapRunning = false;
  static bool _bootstrappedThisProcess = false;

  static List<ph.Permission> get startupPermissions {
    final permissions = <ph.Permission>[
      ph.Permission.notification,
      ph.Permission.camera,
      ph.Permission.microphone,
      ph.Permission.contacts,
      ph.Permission.photos,
      ph.Permission.locationWhenInUse,
    ];
    if (Platform.isAndroid) {
      permissions.add(ph.Permission.videos);
      permissions.add(ph.Permission.bluetoothConnect);
    }
    return permissions;
  }

  static ph.Permission permissionFor(SyncPermission permission) {
    return switch (permission) {
      SyncPermission.notifications => ph.Permission.notification,
      SyncPermission.camera => ph.Permission.camera,
      SyncPermission.microphone => ph.Permission.microphone,
      SyncPermission.contacts => ph.Permission.contacts,
      SyncPermission.photos => ph.Permission.photos,
      SyncPermission.videos => ph.Permission.videos,
      SyncPermission.location => ph.Permission.locationWhenInUse,
      SyncPermission.bluetooth => ph.Permission.bluetoothConnect,
    };
  }

  static bool isUsableStatus(ph.PermissionStatus status) {
    return status.isGranted || status.isLimited || status.isProvisional;
  }

  static Future<Map<ph.Permission, ph.PermissionStatus>> requestInitialPermissions() async {
    if (_bootstrapRunning) return currentStatuses();
    if (_bootstrappedThisProcess) return currentStatuses();

    _bootstrapRunning = true;
    try {
      String? completed;
      try {
        completed = await _storage
            .read(key: _bootstrapKey)
            .timeout(const Duration(seconds: 2));
      } on Object {
        completed = null;
      }

      if (completed == '1') {
        _bootstrappedThisProcess = true;
        return await currentStatuses();
      }

      final result = await startupPermissions.request();
      _bootstrappedThisProcess = true;
      try {
        await _storage
            .write(key: _bootstrapKey, value: '1')
            .timeout(const Duration(seconds: 2));
      } on Object {
        // Permission prompting must not fail because secure storage is unavailable.
      }
      return result;
    } finally {
      _bootstrapRunning = false;
    }
  }

  static Future<Map<ph.Permission, ph.PermissionStatus>> requestAllFromSettings(
    BuildContext context,
  ) async {
    final permissions = startupPermissions;
    final result = await permissions.request();
    if (!context.mounted) return result;

    final blocked = result.entries
        .where((entry) => entry.value.isPermanentlyDenied || entry.value.isRestricted)
        .map((entry) => labelForPermission(entry.key))
        .toList(growable: false);
    if (blocked.isNotEmpty) {
      await _showSettingsDialog(
        context,
        title: 'Some permissions need Settings',
        message:
            '${blocked.join(', ')} ${blocked.length == 1 ? 'is' : 'are'} blocked by the operating system. Open App Settings to enable ${blocked.length == 1 ? 'it' : 'them'}.',
      );
    }
    return result;
  }

  static Future<Map<ph.Permission, ph.PermissionStatus>> currentStatuses() async {
    final result = <ph.Permission, ph.PermissionStatus>{};
    for (final permission in startupPermissions) {
      result[permission] = await permission.status;
    }
    return result;
  }

  static Future<bool> hasPermission(SyncPermission permission) async {
    final platformPermission = permissionFor(permission);
    if (!_supported(platformPermission)) return true;
    return isUsableStatus(await platformPermission.status);
  }

  static Future<bool> ensure(
    BuildContext context,
    SyncPermission permission, {
    required String reason,
  }) async {
    final platformPermission = permissionFor(permission);
    if (!_supported(platformPermission)) return true;

    var status = await platformPermission.status;
    if (isUsableStatus(status)) return true;

    if (status.isPermanentlyDenied || status.isRestricted) {
      if (context.mounted) {
        await _showSettingsDialog(
          context,
          title: '${labelForPermission(platformPermission)} permission required',
          message: '$reason Open App Settings to enable this permission.',
        );
      }
      return false;
    }

    status = await platformPermission.request();
    if (isUsableStatus(status)) return true;

    if (context.mounted && (status.isPermanentlyDenied || status.isRestricted)) {
      await _showSettingsDialog(
        context,
        title: '${labelForPermission(platformPermission)} permission required',
        message: '$reason Open App Settings to enable this permission.',
      );
      return false;
    }

    if (context.mounted) {
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(
        SnackBar(
          content: Text('$reason You can allow it now or try again when you use this feature.'),
        ),
      );
    }
    return false;
  }

  static Future<bool> ensureContacts(
    BuildContext context, {
    String reason = 'Contacts permission is needed to find people from your phone book who use SyncChat.',
  }) => ensure(
    context,
    SyncPermission.contacts,
    reason: reason,
  );

  static Future<bool> ensureCamera(
    BuildContext context, {
    String reason = 'Camera permission is needed for QR scanning, camera attachments, and video calls.',
  }) => ensure(
    context,
    SyncPermission.camera,
    reason: reason,
  );

  static Future<bool> ensureMicrophone(
    BuildContext context, {
    String reason = 'Microphone permission is needed for voice notes and voice/video calls.',
  }) => ensure(
    context,
    SyncPermission.microphone,
    reason: reason,
  );

  static Future<bool> ensurePhotos(
    BuildContext context, {
    String reason = 'Photo library permission is needed to choose media to share.',
  }) {
    // Android's system document/photo picker grants scoped access to the item
    // the user selects. Requiring broad media-library access before opening it
    // blocks avatar/group/channel photo selection when READ_MEDIA_IMAGES was
    // denied even though the picker itself is still allowed.
    if (Platform.isAndroid) return Future<bool>.value(true);
    return ensure(context, SyncPermission.photos, reason: reason);
  }

  static Future<bool> ensureVideos(
    BuildContext context, {
    String reason = 'Video library permission is needed to choose videos to share.',
  }) async {
    if (!Platform.isAndroid) return ensurePhotos(context, reason: reason);
    return ensure(context, SyncPermission.videos, reason: reason);
  }

  static Future<bool> ensureLocation(
    BuildContext context, {
    String reason = 'Location permission is needed when you choose to share your current location.',
  }) => ensure(
    context,
    SyncPermission.location,
    reason: reason,
  );

  static Future<bool> ensureCallPermissions(
    BuildContext context, {
    required bool video,
  }) async {
    final mic = await ensureMicrophone(
      context,
      reason: video
          ? 'Microphone permission is required to start a video call.'
          : 'Microphone permission is required to start a voice call.',
    );
    if (!mic || !context.mounted) return false;

    if (video) {
      final camera = await ensureCamera(
        context,
        reason: 'Camera permission is required to start a video call.',
      );
      if (!camera || !context.mounted) return false;
    }

    if (Platform.isAndroid) {
      // Bluetooth is useful for headsets but is not required for speaker/earpiece calls.
      final bluetooth = permissionFor(SyncPermission.bluetooth);
      final status = await bluetooth.status;
      if (!isUsableStatus(status) && !status.isPermanentlyDenied && !status.isRestricted) {
        await bluetooth.request();
      }
    }
    return true;
  }

  static String labelForPermission(ph.Permission permission) {
    if (permission == ph.Permission.notification) return 'Notifications';
    if (permission == ph.Permission.camera) return 'Camera';
    if (permission == ph.Permission.microphone) return 'Microphone';
    if (permission == ph.Permission.contacts) return 'Contacts';
    if (permission == ph.Permission.photos) return 'Photos';
    if (permission == ph.Permission.videos) return 'Videos';
    if (permission == ph.Permission.locationWhenInUse) return 'Location';
    if (permission == ph.Permission.bluetoothConnect) return 'Nearby devices';
    return 'App';
  }

  static bool _supported(ph.Permission permission) {
    if (permission == ph.Permission.videos || permission == ph.Permission.bluetoothConnect) {
      return Platform.isAndroid;
    }
    return Platform.isAndroid || Platform.isIOS;
  }

  static Future<void> _showSettingsDialog(
    BuildContext context, {
    required String title,
    required String message,
  }) async {
    final openSettings = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Not now'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Open Settings'),
          ),
        ],
      ),
    );
    if (openSettings == true) {
      await ph.openAppSettings();
    }
  }
}
