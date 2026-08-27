import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';
import 'live_backup_recovery_screen.dart';
import 'live_collection_screens.dart';
import 'live_help_screens.dart';
import 'live_settings_parity_screen.dart';
import 'live_settings_screen.dart';

class LiveSettingsHubScreen extends StatefulWidget {
  const LiveSettingsHubScreen({
    super.key,
    required this.onThemeChanged,
    required this.onLogout,
  });

  final ValueChanged<bool> onThemeChanged;
  final Future<void> Function(BuildContext context) onLogout;

  @override
  State<LiveSettingsHubScreen> createState() => _LiveSettingsHubScreenState();
}

class _LiveSettingsHubScreenState extends State<LiveSettingsHubScreen> {
  Map<String, dynamic> settings = const {};
  bool loading = true;
  String? error;
  final Set<String> saving = <String>{};

  bool get dark => settings['dark'] == true;
  bool get twoFactorEnabled => settings['twoFactorEnabled'] == true;
  bool get appLockEnabled => settings['appLockEnabled'] == true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final value = await context.services.settings.get();
      if (!mounted) return;
      setState(() {
        settings = value;
        loading = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = _errorText(failure);
      });
    }
  }

  Future<void> _setDark(bool value) async {
    if (saving.contains('dark')) return;
    setState(() {
      saving.add('dark');
      settings = {...settings, 'dark': value};
    });
    widget.onThemeChanged(value);
    try {
      final next = await context.services.settings.update({'dark': value});
      if (!mounted) return;
      setState(() => settings = next.isEmpty ? settings : next);
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => settings = {...settings, 'dark': !value});
      widget.onThemeChanged(!value);
      _snack(_errorText(failure));
    } finally {
      if (mounted) setState(() => saving.remove('dark'));
    }
  }

  Future<void> _toggleTwoFactor(bool target) async {
    if (saving.contains('twoFactor')) return;
    if (target) {
      await _push(const LiveTwoFactorQrScreen());
      if (mounted) await _load();
      return;
    }
    final result = await _passwordAndCodeDialog(
      title: 'Disable Google 2FA',
      message: 'Enter your account password and current authenticator code.',
    );
    if (result == null || !mounted) return;
    setState(() => saving.add('twoFactor'));
    try {
      await context.services.settings.disableTwoFactor(
        password: result.$1,
        code: result.$2,
      );
      await _load();
      if (mounted) _snack('Google 2FA disabled.');
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    } finally {
      if (mounted) setState(() => saving.remove('twoFactor'));
    }
  }

  Future<void> _toggleAppLock(bool target) async {
    if (saving.contains('appLock')) return;
    if (target) {
      final password = await _passwordDialog(
        title: 'Enable app lock',
        message: 'Create the app password required before opening chats.',
        confirm: true,
      );
      if (password == null || !mounted) return;
      setState(() => saving.add('appLock'));
      try {
        await context.services.settings.setAppLock(password);
        await _load();
        if (mounted) _snack('App lock enabled.');
      } on Object catch (failure) {
        if (mounted) _snack(_errorText(failure));
      } finally {
        if (mounted) setState(() => saving.remove('appLock'));
      }
      return;
    }

    final password = await _passwordDialog(
      title: 'Disable app lock',
      message: 'Enter the current app lock password.',
    );
    if (password == null || !mounted) return;
    setState(() => saving.add('appLock'));
    try {
      await context.services.settings.removeAppLock(password);
      await _load();
      if (mounted) _snack('App lock disabled.');
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    } finally {
      if (mounted) setState(() => saving.remove('appLock'));
    }
  }

  Future<void> _changeAppLockPassword() async {
    if (saving.contains('appLockPassword')) return;
    final result = await _changePasswordDialog();
    if (result == null || !mounted) return;
    setState(() => saving.add('appLockPassword'));
    try {
      await context.services.api.put(
        '/settings/app-lock/password',
        body: {
          'oldPassword': result.$1,
          'newPassword': result.$2,
        },
      );
      if (mounted) _snack('App lock password changed.');
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    } finally {
      if (mounted) setState(() => saving.remove('appLockPassword'));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Settings'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: loading && settings.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : error != null && settings.isEmpty
              ? _SettingsHubError(message: error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(14, 10, 14, 34),
                    children: [
                      _switchTile(
                        icon: Icons.brightness_6_outlined,
                        title: 'Dark mode',
                        value: dark,
                        busy: saving.contains('dark'),
                        onChanged: _setDark,
                      ),
                      _section('Account', [
                        _item(
                          Icons.account_circle_outlined,
                          'Account settings',
                          'Security notifications, account info export, password and delete options.',
                          () => _details('security'),
                        ),
                        _item(
                          Icons.devices_outlined,
                          'Devices',
                          'Active devices, remote logout, device details, and suspicious login alerts.',
                          () => _push(const LiveDeviceSessionsScreen()),
                        ),
                      ]),
                      _section('Privacy', [
                        _item(
                          Icons.shield_outlined,
                          'Privacy',
                          'Last seen, profile photo, read receipts, blocked contacts, and more.',
                          () => _details('privacy'),
                        ),
                      ]),
                      _section('Chat', [
                        _item(
                          Icons.chat_bubble_outline_rounded,
                          'Chats',
                          'Wallpaper, media quality, downloads, spell check and more.',
                          () => _details('chats'),
                        ),
                      ]),
                      _section('Notification', [
                        _item(
                          Icons.notifications_none_rounded,
                          'Notifications',
                          'Banner, popup, push, previews, sound and mute controls.',
                          () => _details('notifications'),
                        ),
                      ]),
                      _section('Voice & Video', [
                        _item(
                          Icons.video_call_outlined,
                          'Voice & Video',
                          'Auto permission for camera, microphone and speaker.',
                          () => _details('voiceVideo'),
                        ),
                      ]),
                      _section('Apps setting', [
                        _switchTile(
                          icon: Icons.verified_user_outlined,
                          title: 'Google 2FA',
                          description: 'Use Google Authenticator after login.',
                          value: twoFactorEnabled,
                          busy: saving.contains('twoFactor'),
                          onChanged: _toggleTwoFactor,
                          embedded: true,
                        ),
                        _switchTile(
                          icon: Icons.lock_outline_rounded,
                          title: 'App lock',
                          description: 'Ask for app password after login before opening chats.',
                          value: appLockEnabled,
                          busy: saving.contains('appLock'),
                          onChanged: _toggleAppLock,
                          embedded: true,
                        ),
                        if (appLockEnabled)
                          _item(
                            Icons.key_rounded,
                            'Change app lock password',
                            null,
                            _changeAppLockPassword,
                          ),
                        if (twoFactorEnabled)
                          _item(
                            Icons.shield_outlined,
                            'Recovery codes',
                            'Generate or revoke backup codes for 2FA.',
                            () => _push(
                              const LiveBackupRecoveryScreen(initialSection: 'recovery'),
                            ),
                          ),
                      ]),
                      _section('Help', [
                        _item(
                          Icons.keyboard_alt_outlined,
                          'Keyboard shortcuts',
                          'See every supported shortcut and what it does in chat.',
                          () => _push(const _KeyboardShortcutsScreen()),
                        ),
                        _item(
                          Icons.perm_media_outlined,
                          'Media',
                          'View all your shared photos, videos, links, and files',
                          () => _push(const LiveMediaScreen()),
                        ),
                        _item(
                          Icons.feedback_outlined,
                          'Feedback',
                          null,
                          () => _push(const LiveFeedbackScreen()),
                        ),
                        _item(
                          Icons.policy_outlined,
                          'Terms & privacy policy',
                          null,
                          () => _push(const LivePolicyScreen()),
                        ),
                        _item(
                          Icons.info_outline_rounded,
                          'License',
                          null,
                          () => _push(const LiveLicenseScreen()),
                        ),
                      ]),
                      const SizedBox(height: 12),
                      Card(
                        color: context.panel,
                        elevation: 0,
                        margin: EdgeInsets.zero,
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
                          onTap: () => widget.onLogout(context),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }

  Widget _section(String label, List<Widget> children) {
    return Padding(
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
            child: Column(children: _withDividers(children)),
          ),
        ],
      ),
    );
  }

  List<Widget> _withDividers(List<Widget> children) {
    final result = <Widget>[];
    for (var index = 0; index < children.length; index++) {
      if (index > 0) {
        result.add(Divider(height: 1, indent: 56, color: context.border));
      }
      result.add(children[index]);
    }
    return result;
  }

  Widget _item(
    IconData icon,
    String title,
    String? description,
    VoidCallback onTap,
  ) {
    return ListTile(
      leading: Icon(icon, color: SyncColors.sky),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
      subtitle: description == null
          ? null
          : Text(description, style: TextStyle(color: context.muted, fontSize: 12)),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    );
  }

  Widget _switchTile({
    required IconData icon,
    required String title,
    required bool value,
    required ValueChanged<bool> onChanged,
    String? description,
    bool busy = false,
    bool embedded = false,
  }) {
    final tile = SwitchListTile(
      secondary: Icon(icon, color: SyncColors.sky),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
      subtitle: description == null
          ? null
          : Text(description, style: TextStyle(color: context.muted, fontSize: 12)),
      value: value,
      onChanged: busy ? null : onChanged,
    );
    if (embedded) return tile;
    return Card(
      color: context.panel,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(17),
        side: BorderSide(color: context.border),
      ),
      child: tile,
    );
  }

  Future<void> _details(String section) async {
    await _push(
      LiveSettingsScreen(
        onThemeChanged: widget.onThemeChanged,
        initialSection: section,
      ),
    );
    if (mounted) await _load();
  }

  Future<void> _push(Widget screen) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => screen),
    );
  }

  Future<String?> _passwordDialog({
    required String title,
    required String message,
    bool confirm = false,
  }) async {
    final first = TextEditingController();
    final second = TextEditingController();
    String? validation;
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(title),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(message),
              const SizedBox(height: 12),
              TextField(
                controller: first,
                autofocus: true,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Password'),
              ),
              if (confirm) ...[
                const SizedBox(height: 10),
                TextField(
                  controller: second,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Confirm password'),
                ),
              ],
              if (validation != null) ...[
                const SizedBox(height: 8),
                Text(validation!, style: const TextStyle(color: SyncColors.danger)),
              ],
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                if (first.text.length < 4) {
                  setDialogState(() => validation = 'Password must be at least 4 characters.');
                  return;
                }
                if (confirm && first.text != second.text) {
                  setDialogState(() => validation = 'Passwords do not match.');
                  return;
                }
                Navigator.pop(dialogContext, first.text);
              },
              child: const Text('Continue'),
            ),
          ],
        ),
      ),
    );
    first.dispose();
    second.dispose();
    return value;
  }

  Future<(String, String)?> _passwordAndCodeDialog({
    required String title,
    required String message,
  }) async {
    final password = TextEditingController();
    final code = TextEditingController();
    String? validation;
    final value = await showDialog<(String, String)>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(title),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(message),
              const SizedBox(height: 12),
              TextField(
                controller: password,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Password'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: code,
                keyboardType: TextInputType.number,
                maxLength: 6,
                decoration: const InputDecoration(labelText: 'Authenticator code'),
              ),
              if (validation != null)
                Text(validation!, style: const TextStyle(color: SyncColors.danger)),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                if (password.text.isEmpty || code.text.trim().length != 6) {
                  setDialogState(() => validation = 'Password and 6-digit code are required.');
                  return;
                }
                Navigator.pop(dialogContext, (password.text, code.text.trim()));
              },
              child: const Text('Disable'),
            ),
          ],
        ),
      ),
    );
    password.dispose();
    code.dispose();
    return value;
  }

  Future<(String, String)?> _changePasswordDialog() async {
    final oldPassword = TextEditingController();
    final newPassword = TextEditingController();
    final confirm = TextEditingController();
    String? validation;
    final result = await showDialog<(String, String)>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Change app lock password'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: oldPassword,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Current password'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: newPassword,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'New password'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: confirm,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Confirm new password'),
              ),
              if (validation != null) ...[
                const SizedBox(height: 8),
                Text(validation!, style: const TextStyle(color: SyncColors.danger)),
              ],
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                if (oldPassword.text.isEmpty || newPassword.text.length < 4) {
                  setDialogState(() => validation = 'Current password and a 4+ character new password are required.');
                  return;
                }
                if (newPassword.text != confirm.text) {
                  setDialogState(() => validation = 'New passwords do not match.');
                  return;
                }
                Navigator.pop(dialogContext, (oldPassword.text, newPassword.text));
              },
              child: const Text('Change'),
            ),
          ],
        ),
      ),
    );
    oldPassword.dispose();
    newPassword.dispose();
    confirm.dispose();
    return result;
  }

  void _snack(String text) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text), behavior: SnackBarBehavior.floating),
    );
  }
}

class _KeyboardShortcutsScreen extends StatelessWidget {
  const _KeyboardShortcutsScreen();

  static const sections = <(String, List<(String, String, String)>)>[
    (
      'General',
      [
        ('Open keyboard shortcuts', 'Ctrl/Cmd + /', 'Show the full shortcut reference inside Settings.'),
        ('Open settings', 'Ctrl/Cmd + ,', 'Jump straight to the Settings panel.'),
        ('Close current modal or panel', 'Esc', 'Dismiss the active modal, panel or selection state.'),
      ],
    ),
    (
      'Navigation',
      [
        ('Show chat list', 'Ctrl/Cmd + Shift + J', 'Return to the main chat list area.'),
        ('Open calls', 'Ctrl/Cmd + Shift + L', 'Switch to the calls panel.'),
        ('Open status', 'Ctrl/Cmd + Shift + S', 'Open the status updates panel.'),
        ('Open contacts', 'Ctrl/Cmd + Shift + C', 'Open your contact list and new chat panel.'),
        ('Open communities', 'Ctrl/Cmd + Shift + G', 'Switch to the communities page.'),
        ('Open archive', 'Ctrl/Cmd + Shift + A', 'View archived chats.'),
        ('Open lists', 'Ctrl/Cmd + Shift + I', 'Open your custom list view.'),
        ('Open starred messages', 'Ctrl/Cmd + Shift + T', 'Jump to starred messages.'),
        ('Open profile', 'Ctrl/Cmd + Shift + P', 'Open your profile page.'),
      ],
    ),
    (
      'Messaging',
      [
        ('Focus chat search', 'Ctrl/Cmd + K', 'Move focus to the chat search field.'),
        ('Focus message composer', 'Ctrl/Cmd + Shift + M', 'Move focus to the current room message box.'),
        ('Start a new group', 'Ctrl/Cmd + Shift + N', 'Open the new group flow.'),
        ('Select chats', 'Ctrl/Cmd + Shift + X', 'Enter bulk chat selection mode.'),
        ('Toggle mute notifications', 'Ctrl/Cmd + Shift + U', 'Enable or disable muted notifications system-wide.'),
      ],
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(title: const Text('Keyboard shortcuts')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 30),
        children: [
          Text(
            'These are the current SyncChat Web shortcuts. Mobile touch actions remain available independently.',
            style: TextStyle(color: context.muted),
          ),
          const SizedBox(height: 14),
          for (final section in sections) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(6, 10, 6, 6),
              child: Text(
                section.$1.toUpperCase(),
                style: TextStyle(
                  color: context.muted,
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                  letterSpacing: .8,
                ),
              ),
            ),
            Card(
              color: context.panel,
              elevation: 0,
              child: Column(
                children: [
                  for (var index = 0; index < section.$2.length; index++) ...[
                    ListTile(
                      title: Text(section.$2[index].$1, style: const TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: Text(section.$2[index].$3),
                      trailing: Text(
                        section.$2[index].$2,
                        textAlign: TextAlign.end,
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800),
                      ),
                    ),
                    if (index != section.$2.length - 1) Divider(height: 1, color: context.border),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SettingsHubError extends StatelessWidget {
  const _SettingsHubError({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_outlined, size: 46, color: SyncColors.sky),
            const SizedBox(height: 10),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
