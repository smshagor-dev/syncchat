import 'package:flutter/material.dart';

import '../core/device_integration_service.dart';
import '../core/permission_manager.dart';
import '../theme.dart';
import 'biometric_settings_screen.dart';
import 'live_backup_recovery_screen.dart';
import 'live_channel_insights_screen.dart';
import 'live_collection_screens.dart';
import 'live_full_profile_screen.dart';
import 'live_help_screens.dart';
import 'live_resumable_upload_screen.dart';
import 'live_settings_parity_screen.dart';
import 'live_settings_screen.dart';
import 'live_social_profiles_screen.dart';

class LiveSettingsHubScreen extends StatelessWidget {
  const LiveSettingsHubScreen({
    super.key,
    required this.onThemeChanged,
    required this.onLogout,
  });

  final ValueChanged<bool> onThemeChanged;
  final Future<void> Function(BuildContext context) onLogout;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Settings'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 34),
        children: [
          _switchTile(
            context,
            icon: Icons.dark_mode_outlined,
            title: 'Dark mode',
            value: dark,
            onChanged: onThemeChanged,
          ),
          _section(context, 'Account', [
            _item(Icons.account_circle_outlined, 'Full profile', () => _push(context, const LiveFullProfileScreen())),
            _item(Icons.manage_accounts_outlined, 'Account settings', () => _details(context)),
            _item(Icons.devices_outlined, 'Devices', () => _details(context)),
            _item(Icons.phonelink_lock_outlined, 'Link a device', () => _push(context, const LiveDeviceLinkSettingsScreen())),
            _item(Icons.backup_outlined, 'Backup & restore', () => _backupRecovery(context)),
            _item(Icons.add_to_drive_outlined, 'Google Drive backup', () => _push(context, const LiveGoogleDriveBackupScreen())),
          ]),
          _section(context, 'Profile', [
            _item(Icons.qr_code_rounded, 'Profile QR & links', () => _push(context, const LiveFullProfileScreen())),
            _item(Icons.share_outlined, 'Social profiles', () => _push(context, const LiveSocialProfilesScreen())),
          ]),
          _section(context, 'Privacy', [
            _item(Icons.lock_outline_rounded, 'Privacy', () => _details(context)),
            _item(Icons.admin_panel_settings_outlined, 'App permissions', () => _permissions(context)),
          ]),
          _section(context, 'Chat', [
            _item(Icons.chat_bubble_outline_rounded, 'Chats', () => _details(context)),
            _item(Icons.perm_media_outlined, 'Media', () => _push(context, const LiveMediaScreen())),
            _item(Icons.cloud_upload_outlined, 'Large file upload', () => _push(context, const LiveResumableUploadScreen())),
          ]),
          _section(context, 'Notification', [
            _item(Icons.notifications_none_rounded, 'Notifications', () => _details(context)),
            _item(Icons.notification_important_outlined, 'System notification permission', () => _notifications(context)),
          ]),
          _section(context, 'Voice & Video', [
            _item(Icons.video_call_outlined, 'Voice & Video', () => _details(context)),
          ]),
          _section(context, 'Security', [
            _item(Icons.fingerprint_rounded, 'Biometric protection', () => _push(context, const BiometricSettingsScreen())),
            _item(Icons.qr_code_2_rounded, 'Google 2FA setup QR', () => _push(context, const LiveTwoFactorQrScreen())),
            _item(Icons.security_rounded, '2FA / account security', () => _details(context)),
            _item(Icons.lock_person_outlined, 'App lock', () => _details(context)),
            _item(Icons.password_rounded, 'Passwords', () => _details(context)),
            _item(Icons.key_rounded, 'Recovery codes', () => _backupRecovery(context, initialSection: 'recovery')),
          ]),
          _section(context, 'Channels', [
            _item(Icons.insights_outlined, 'Analytics & reviews', () => _push(context, const LiveChannelInsightsScreen())),
          ]),
          _section(context, 'Help', [
            _item(
              Icons.keyboard_alt_outlined,
              'Keyboard shortcuts',
              () => _help(
                context,
                'Keyboard shortcuts',
                'Web keyboard shortcuts are desktop-only. Mobile uses touch, long-press, swipe, and system accessibility actions.',
              ),
            ),
            _item(Icons.feedback_outlined, 'Feedback', () => _push(context, const LiveFeedbackScreen())),
            _item(Icons.policy_outlined, 'Terms & privacy policy', () => _push(context, const LivePolicyScreen())),
            _item(Icons.description_outlined, 'License', () => _push(context, const LiveLicenseScreen())),
          ]),
          const SizedBox(height: 12),
          Card(
            color: context.panel,
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(17),
              side: BorderSide(color: context.border),
            ),
            child: ListTile(
              leading: const Icon(Icons.logout_rounded, color: SyncColors.danger),
              title: const Text(
                'Log out',
                style: TextStyle(color: SyncColors.danger, fontWeight: FontWeight.w900),
              ),
              onTap: () => onLogout(context),
            ),
          ),
        ],
      ),
    );
  }

  Widget _section(BuildContext context, String label, List<Widget> children) => Padding(
        padding: const EdgeInsets.only(top: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 7),
              child: Text(
                label.toUpperCase(),
                style: TextStyle(
                  color: context.muted,
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                  letterSpacing: .7,
                ),
              ),
            ),
            Card(
              color: context.panel,
              elevation: 0,
              margin: EdgeInsets.zero,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(17),
                side: BorderSide(color: context.border),
              ),
              child: Column(children: _withDividers(context, children)),
            ),
          ],
        ),
      );

  List<Widget> _withDividers(BuildContext context, List<Widget> children) {
    final result = <Widget>[];
    for (var i = 0; i < children.length; i++) {
      if (i > 0) result.add(Divider(height: 1, indent: 56, color: context.border));
      result.add(children[i]);
    }
    return result;
  }

  Widget _item(IconData icon, String title, VoidCallback onTap) => ListTile(
        leading: Icon(icon, color: SyncColors.sky),
        title: Text(
          title,
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
        ),
        trailing: const Icon(Icons.chevron_right_rounded),
        onTap: onTap,
      );

  Widget _switchTile(
    BuildContext context, {
    required IconData icon,
    required String title,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) => Card(
        color: context.panel,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(17),
          side: BorderSide(color: context.border),
        ),
        child: SwitchListTile(
          secondary: Icon(icon, color: SyncColors.sky),
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
          value: value,
          onChanged: onChanged,
        ),
      );

  void _push(BuildContext context, Widget screen) {
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
  }

  void _details(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LiveSettingsScreen(onThemeChanged: onThemeChanged),
      ),
    );
  }

  void _backupRecovery(BuildContext context, {String initialSection = 'backup'}) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LiveBackupRecoveryScreen(initialSection: initialSection),
      ),
    );
  }

  Future<void> _permissions(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final result = await AppPermissionManager.requestAllFromSettings(context);
      if (!context.mounted) return;
      final granted = result.values.where(AppPermissionManager.isUsableStatus).length;
      messenger.showSnackBar(
        SnackBar(content: Text('$granted of ${result.length} app permissions are enabled.')),
      );
    } on Object catch (failure) {
      if (!context.mounted) return;
      messenger.showSnackBar(
        SnackBar(content: Text(failure.toString().replaceFirst('Exception: ', ''))),
      );
    }
  }

  Future<void> _notifications(BuildContext context) async {
    final allowed = await AppPermissionManager.ensure(
      context,
      SyncPermission.notifications,
      reason: 'Notification permission is needed for messages and incoming-call alerts.',
    );
    if (!allowed || !context.mounted) return;
    await DeviceIntegrationService.requestNotificationPermission();
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Notification permission updated.')),
    );
  }

  void _help(BuildContext context, String title, String body) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 26),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
              const SizedBox(height: 10),
              Text(body, style: TextStyle(color: context.muted, height: 1.45)),
            ],
          ),
        ),
      ),
    );
  }
}
