import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart' as ph;

import '../core/device_integration_service.dart';
import '../theme.dart';
import 'live_settings_screen.dart';

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
            _item(Icons.manage_accounts_outlined, 'Account settings', () => _details(context)),
            _item(Icons.devices_outlined, 'Devices', () => _details(context)),
          ]),
          _section(context, 'Privacy', [
            _item(Icons.lock_outline_rounded, 'Privacy', () => _details(context)),
            _item(Icons.admin_panel_settings_outlined, 'App permissions', () => _permissions(context)),
          ]),
          _section(context, 'Chat', [
            _item(Icons.chat_bubble_outline_rounded, 'Chats', () => _details(context)),
          ]),
          _section(context, 'Notification', [
            _item(Icons.notifications_none_rounded, 'Notifications', () => _notifications(context)),
          ]),
          _section(context, 'Voice & Video', [
            _item(Icons.video_call_outlined, 'Voice & Video', () => _details(context)),
          ]),
          _section(context, 'Apps setting', [
            _item(Icons.security_rounded, 'Google 2FA', () => _details(context)),
            _item(Icons.lock_person_outlined, 'App lock', () => _details(context)),
            _item(Icons.password_rounded, 'Change app lock password', () => _details(context)),
            _item(Icons.key_rounded, 'Recovery codes', () => _details(context)),
          ]),
          _section(context, 'Help', [
            _item(Icons.keyboard_alt_outlined, 'Keyboard shortcuts', () => _help(context, 'Keyboard shortcuts', 'Web keyboard shortcuts are desktop-only. Mobile uses touch, long-press, swipe, and system accessibility actions.')),
            _item(Icons.perm_media_outlined, 'Media', () => _details(context)),
            _item(Icons.feedback_outlined, 'Feedback', () => _help(context, 'Feedback', 'Use the same support/feedback channel configured for the SyncChat web client.')),
            _item(Icons.policy_outlined, 'Terms & privacy policy', () => _help(context, 'Terms & privacy policy', 'Terms and privacy content is shared with the web client.')),
            _item(Icons.description_outlined, 'License', () => _help(context, 'License', 'Open-source and third-party license notices are available from the app license page.')),
          ]),
          const SizedBox(height: 12),
          Card(
            color: context.panel,
            elevation: 0,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(17), side: BorderSide(color: context.border)),
            child: ListTile(
              leading: const Icon(Icons.logout_rounded, color: SyncColors.danger),
              title: const Text('Log out', style: TextStyle(color: SyncColors.danger, fontWeight: FontWeight.w900)),
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
          child: Text(label.toUpperCase(), style: TextStyle(color: context.muted, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: .7)),
        ),
        Card(
          color: context.panel,
          elevation: 0,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(17), side: BorderSide(color: context.border)),
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
    title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
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
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(17), side: BorderSide(color: context.border)),
    child: SwitchListTile(
      secondary: Icon(icon, color: SyncColors.sky),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
      value: value,
      onChanged: onChanged,
    ),
  );

  void _details(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LiveSettingsScreen(onThemeChanged: onThemeChanged),
      ),
    );
  }

  Future<void> _permissions(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final result = await DeviceIntegrationService.requestCommunicationPermissions();
      final granted = result.values.where((status) => status == ph.PermissionStatus.granted).length;
      messenger.showSnackBar(SnackBar(content: Text('$granted of ${result.length} requested permissions are enabled.')));
    } on Object catch (failure) {
      messenger.showSnackBar(SnackBar(content: Text(failure.toString().replaceFirst('Exception: ', ''))));
    }
  }

  Future<void> _notifications(BuildContext context) async {
    await DeviceIntegrationService.requestNotificationPermission();
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Notification permission updated.')));
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
