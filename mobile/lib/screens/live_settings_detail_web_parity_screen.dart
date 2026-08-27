import 'package:flutter/material.dart';

import '../theme.dart';
import 'live_backup_recovery_screen.dart';
import 'live_settings_parity_screen.dart';
import 'live_settings_screen.dart';

class LiveAccountSettingsDetailScreen extends StatelessWidget {
  const LiveAccountSettingsDetailScreen({
    super.key,
    required this.onThemeChanged,
  });

  final ValueChanged<bool> onThemeChanged;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Account settings'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 32),
        children: [
          _card(
            context,
            icon: Icons.admin_panel_settings_outlined,
            title: 'Security & account',
            subtitle:
                'Security notifications, password, account export and delete options.',
            onTap: () => _push(
              context,
              LiveSettingsScreen(
                onThemeChanged: onThemeChanged,
                initialSection: 'security',
              ),
            ),
          ),
          const SizedBox(height: 12),
          _card(
            context,
            icon: Icons.backup_outlined,
            title: 'Encrypted backup & restore',
            subtitle:
                'Create a password-protected account archive or restore selected sections.',
            onTap: () => _push(
              context,
              const LiveBackupRecoveryScreen(initialSection: 'backup'),
            ),
          ),
          const SizedBox(height: 12),
          _card(
            context,
            icon: Icons.add_to_drive_outlined,
            title: 'Google Drive backup',
            subtitle:
                'Create an encrypted backup and save it directly to your Google Drive.',
            onTap: () => _push(
              context,
              const LiveGoogleDriveBackupScreen(),
            ),
          ),
        ],
      ),
    );
  }
}

class LiveDevicesSettingsDetailScreen extends StatelessWidget {
  const LiveDevicesSettingsDetailScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Devices'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 32),
        children: [
          _card(
            context,
            icon: Icons.devices_outlined,
            title: 'Active devices',
            subtitle:
                'Review signed-in sessions, inspect device details and remotely log out devices.',
            onTap: () => _push(context, const LiveDeviceSessionsScreen()),
          ),
          const SizedBox(height: 12),
          _card(
            context,
            icon: Icons.phonelink_lock_outlined,
            title: 'Link a device',
            subtitle:
                'Generate the secure QR code, token and short code used by SyncChat Web.',
            onTap: () => _push(
              context,
              const LiveDeviceLinkSettingsScreen(),
            ),
          ),
        ],
      ),
    );
  }
}

Widget _card(
  BuildContext context, {
  required IconData icon,
  required String title,
  required String subtitle,
  required VoidCallback onTap,
}) {
  return Card(
    color: context.panel,
    elevation: 0,
    margin: EdgeInsets.zero,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(17),
      side: BorderSide(color: context.border),
    ),
    child: ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      leading: Icon(icon, color: SyncColors.sky),
      title: Text(
        title,
        style: const TextStyle(fontWeight: FontWeight.w900),
      ),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    ),
  );
}

void _push(BuildContext context, Widget screen) {
  Navigator.of(context).push(
    MaterialPageRoute<void>(builder: (_) => screen),
  );
}
