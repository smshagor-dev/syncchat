import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';
import '../widgets.dart';
import 'live_chat_room_screen.dart';

class LiveSettingsScreen extends StatefulWidget {
  const LiveSettingsScreen({super.key, required this.onThemeChanged});

  final ValueChanged<bool> onThemeChanged;

  @override
  State<LiveSettingsScreen> createState() => _LiveSettingsScreenState();
}

class _LiveSettingsScreenState extends State<LiveSettingsScreen> {
  Map<String, dynamic> settings = const {};
  bool loading = true;
  String? error;
  final saving = <String>{};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }
    try {
      final value = await context.services.settings.get();
      if (!mounted) return;
      setState(() {
        settings = value;
        loading = false;
      });
      widget.onThemeChanged(value['dark'] == true);
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        error = _errorText(failure);
        loading = false;
      });
    }
  }

  Future<void> _save(String key, dynamic value) async {
    if (saving.contains(key)) return;
    setState(() => saving.add(key));
    try {
      final next = await context.services.settings.update({key: value});
      if (!mounted) return;
      setState(() => settings = next);
      if (key == 'dark') widget.onThemeChanged(value == true);
    } on Object catch (failure) {
      if (!mounted) return;
      _toast(_errorText(failure));
    } finally {
      if (mounted) setState(() => saving.remove(key));
    }
  }

  bool _bool(String key, {bool fallback = false}) =>
      settings[key] is bool ? settings[key] == true : fallback;

  String _string(String key, String fallback) {
    final value = settings[key]?.toString().trim() ?? '';
    return value.isEmpty ? fallback : value;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.isDark ? SyncColors.spill950 : Colors.white,
      appBar: AppBar(
        title: const Text('Settings'),
        actions: [
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? _SettingsError(message: error!, onRetry: _load)
              : ListView(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 28),
                  children: [
                    _section(
                      'Appearance & chats',
                      Icons.palette_outlined,
                      [
                        _toggle('Dark mode', 'Use the dark SyncChat theme.', 'dark'),
                        _toggle('Enter to send', 'Send text when pressing Enter.', 'enterToSend'),
                        _toggle('Keep archived', 'Keep chats archived when new messages arrive.', 'keepArchived'),
                        _toggle('Spell check', 'Use spelling assistance while composing.', 'spellCheckEnabled'),
                        _toggle('Replace text with emoji', 'Enable emoji text replacement.', 'replaceTextWithEmoji'),
                        _choice(
                          'Media quality',
                          'Default upload/playback quality.',
                          'mediaQuality',
                          const {'standard': 'Standard', 'hd': 'HD'},
                        ),
                        _choice(
                          'Wallpaper',
                          'Conversation background preset.',
                          'chatWallpaperPreset',
                          const {
                            'whatsapp': 'Sync pattern',
                            'plain': 'Plain',
                            'sunset': 'Sunset',
                            'ocean': 'Ocean',
                            'forest': 'Forest',
                          },
                        ),
                      ],
                    ),
                    _section(
                      'Notifications',
                      Icons.notifications_none_rounded,
                      [
                        _toggle('Messages', 'Notify for direct messages.', 'notifyMessages', fallback: true),
                        _toggle('Groups', 'Notify for group messages.', 'notifyGroups', fallback: true),
                        _toggle('Status', 'Notify for status activity.', 'notifyStatus', fallback: true),
                        _toggle('Calls', 'Notify for incoming calls.', 'notifyCalls', fallback: true),
                        _toggle('Previews', 'Show message previews in notifications.', 'showNotificationPreviews', fallback: true),
                        _toggle('Push notifications', 'Allow push delivery.', 'showPushNotification', fallback: true),
                        _toggle('In-app banner', 'Show foreground notification banners.', 'showNotificationBanner', fallback: true),
                        _toggle('Outgoing sound', 'Play sound after sending.', 'outgoingMessageSoundEnabled', fallback: true),
                      ],
                    ),
                    _section(
                      'Privacy',
                      Icons.shield_outlined,
                      [
                        _choice(
                          'Last seen',
                          'Who can see your last seen.',
                          'lastSeenVisibility',
                          const {'everyone': 'Everyone', 'contacts': 'Contacts', 'nobody': 'Nobody'},
                        ),
                        _choice(
                          'Online status',
                          'Who can see when you are online.',
                          'onlineVisibility',
                          const {'everyone': 'Everyone', 'contacts': 'Contacts', 'nobody': 'Nobody'},
                        ),
                        _choice(
                          'Profile photo',
                          'Who can see your profile photo.',
                          'profilePhotoVisibility',
                          const {'everyone': 'Everyone', 'contacts': 'Contacts', 'nobody': 'Nobody'},
                        ),
                        _choice(
                          'Status visibility',
                          'Who can see your status.',
                          'statusVisibility',
                          const {'everyone': 'Everyone', 'contacts': 'Contacts', 'nobody': 'Nobody'},
                        ),
                        _toggle('Read receipts', 'Send and receive read receipts.', 'readReceiptsEnabled', fallback: true),
                        _toggle('Message requests', 'Allow messages from people outside contacts.', 'messageRequestsEnabled', fallback: true),
                        _toggle('Disable link previews', 'Do not fetch link previews.', 'disableLinkPreviews'),
                        _toggle('Security notifications', 'Notify when security state changes.', 'securityNotificationsEnabled', fallback: true),
                        _action('Blocked contacts', 'Review people you have blocked.', Icons.block_rounded, _openBlocked),
                        _action('Hidden chats', 'Review and unhide private chats.', Icons.visibility_off_outlined, _openHidden),
                      ],
                    ),
                    _section(
                      'Voice & video',
                      Icons.video_call_outlined,
                      [
                        _toggle('Camera', 'Allow camera use for video calls.', 'cameraEnabled', fallback: true),
                        _toggle('Microphone', 'Allow microphone use for calls and voice notes.', 'microphoneEnabled', fallback: true),
                        _toggle('Speaker', 'Allow speakerphone output.', 'speakerEnabled', fallback: true),
                      ],
                    ),
                    _section(
                      'Security & account',
                      Icons.admin_panel_settings_outlined,
                      [
                        _action('Devices', 'Review sessions and remotely sign out devices.', Icons.devices_other_rounded, _openDevices),
                        _action(
                          _bool('twoFactorEnabled') ? 'Two-factor authentication: On' : 'Two-factor authentication',
                          'Authenticator codes and recovery protection.',
                          Icons.verified_user_outlined,
                          _manageTwoFactor,
                        ),
                        _action(
                          _bool('appLockEnabled') ? 'App lock: On' : 'App lock',
                          'Protect the app with an additional password.',
                          Icons.lock_outline_rounded,
                          _manageAppLock,
                        ),
                        _action('Change password', 'Change your password and revoke other sessions.', Icons.password_rounded, _changePassword),
                        _action('Export account info', 'Generate a portable account export and email the secure link.', Icons.download_outlined, _requestExport),
                        _action('Delete account', 'Permanently delete your SyncChat account.', Icons.delete_forever_outlined, _deleteAccount, danger: true),
                      ],
                    ),
                  ],
                ),
    );
  }

  Widget _section(String title, IconData icon, List<Widget> children) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: SyncSoftCard(
        padding: EdgeInsets.zero,
        child: Column(
          children: [
            ListTile(
              leading: Icon(icon, color: SyncColors.sky),
              title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
            ),
            Divider(height: 1, color: context.border),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _toggle(
    String title,
    String subtitle,
    String key, {
    bool fallback = false,
  }) {
    return SwitchListTile.adaptive(
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text(subtitle),
      value: _bool(key, fallback: fallback),
      onChanged: saving.contains(key) ? null : (value) => _save(key, value),
    );
  }

  Widget _choice(
    String title,
    String subtitle,
    String key,
    Map<String, String> options,
  ) {
    final current = _string(key, options.keys.first);
    return ListTile(
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text(subtitle),
      trailing: DropdownButton<String>(
        value: options.containsKey(current) ? current : options.keys.first,
        underline: const SizedBox.shrink(),
        items: options.entries
            .map((entry) => DropdownMenuItem(value: entry.key, child: Text(entry.value)))
            .toList(growable: false),
        onChanged: saving.contains(key)
            ? null
            : (value) {
                if (value != null) _save(key, value);
              },
      ),
    );
  }

  Widget _action(
    String title,
    String subtitle,
    IconData icon,
    Future<void> Function() action, {
    bool danger = false,
  }) {
    return ListTile(
      leading: Icon(icon, color: danger ? SyncColors.danger : context.muted),
      title: Text(
        title,
        style: TextStyle(
          fontWeight: FontWeight.w700,
          color: danger ? SyncColors.danger : null,
        ),
      ),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: action,
    );
  }

  Future<void> _openDevices() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const _DeviceSessionsScreen()),
    );
  }

  Future<void> _openBlocked() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const _BlockedContactsScreen()),
    );
  }

  Future<void> _openHidden() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const _HiddenChatsScreen()),
    );
  }

  Future<void> _manageTwoFactor() async {
    if (_bool('twoFactorEnabled')) {
      final values = await _twoFieldDialog(
        title: 'Disable two-factor authentication',
        firstLabel: 'Account password',
        secondLabel: 'Authenticator code',
        obscureFirst: true,
        numericSecond: true,
      );
      if (values == null) return;
      try {
        await context.services.settings.disableTwoFactor(
          password: values.$1,
          code: values.$2,
        );
        _toast('Two-factor authentication disabled.');
        await _load();
      } on Object catch (failure) {
        _toast(_errorText(failure));
      }
      return;
    }

    try {
      final setup = await context.services.settings.setupTwoFactor();
      if (!mounted) return;
      final secret = setup['secret']?.toString() ?? '';
      final code = await _singleFieldDialog(
        title: 'Enable two-factor authentication',
        label: '6-digit authenticator code',
        helper: secret.isEmpty
            ? 'Add the SyncChat account to your authenticator and enter the current code.'
            : 'Authenticator secret: $secret\nAdd it to your authenticator, then enter the current code.',
        numeric: true,
      );
      if (code == null || code.trim().isEmpty) return;
      await context.services.settings.enableTwoFactor(code.trim());
      _toast('Two-factor authentication enabled.');
      await _load();
    } on Object catch (failure) {
      _toast(_errorText(failure));
    }
  }

  Future<void> _manageAppLock() async {
    final enabled = _bool('appLockEnabled');
    final password = await _singleFieldDialog(
      title: enabled ? 'Remove app lock' : 'Enable app lock',
      label: enabled ? 'Current app-lock password' : 'New app-lock password',
      obscure: true,
    );
    if (password == null || password.length < 4) return;
    try {
      if (enabled) {
        await context.services.settings.removeAppLock(password);
        _toast('App lock removed.');
      } else {
        await context.services.settings.setAppLock(password);
        _toast('App lock enabled.');
      }
      await _load();
    } on Object catch (failure) {
      _toast(_errorText(failure));
    }
  }

  Future<void> _changePassword() async {
    final values = await _threeFieldDialog(
      title: 'Change password',
      labels: const ['Current password', 'New password', 'Confirm new password'],
    );
    if (values == null) return;
    try {
      await context.services.auth.changePassword(
        oldPassword: values.$1,
        newPassword: values.$2,
        confirmNewPassword: values.$3,
      );
      _toast('Password changed. Other sessions were revoked.');
    } on Object catch (failure) {
      _toast(_errorText(failure));
    }
  }

  Future<void> _requestExport() async {
    try {
      final result = await context.services.settings.requestAccountExport();
      _toast(
        result['email']?.toString().isNotEmpty == true
            ? 'Export link sent to ${result['email']}.'
            : 'Account export requested.',
      );
    } on Object catch (failure) {
      _toast(_errorText(failure));
    }
  }

  Future<void> _deleteAccount() async {
    final password = await _singleFieldDialog(
      title: 'Delete account permanently',
      label: 'Account password',
      helper: 'This permanently removes your SyncChat account and cannot be undone.',
      obscure: true,
      danger: true,
    );
    if (password == null || password.isEmpty) return;
    try {
      await context.services.auth.deleteAccount(password);
      await context.services.nativeCallPush.unregisterCurrentDevice().catchError((_) {});
      await context.services.auth.logoutLocal();
      if (!mounted) return;
      Navigator.of(context).popUntil((route) => route.isFirst);
      _toast('Account deleted. Restart SyncChat to sign in again.');
    } on Object catch (failure) {
      _toast(_errorText(failure));
    }
  }

  Future<String?> _singleFieldDialog({
    required String title,
    required String label,
    String? helper,
    bool obscure = false,
    bool numeric = false,
    bool danger = false,
  }) async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (helper != null) ...[
              Text(helper),
              const SizedBox(height: 12),
            ],
            TextField(
              controller: controller,
              obscureText: obscure,
              keyboardType: numeric ? TextInputType.number : TextInputType.text,
              decoration: InputDecoration(labelText: label),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
          FilledButton(
            style: danger
                ? FilledButton.styleFrom(backgroundColor: SyncColors.danger)
                : null,
            onPressed: () => Navigator.pop(dialogContext, controller.text),
            child: Text(danger ? 'Delete' : 'Continue'),
          ),
        ],
      ),
    );
    controller.dispose();
    return result;
  }

  Future<(String, String)?> _twoFieldDialog({
    required String title,
    required String firstLabel,
    required String secondLabel,
    bool obscureFirst = false,
    bool numericSecond = false,
  }) async {
    final first = TextEditingController();
    final second = TextEditingController();
    final result = await showDialog<(String, String)>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: first,
              obscureText: obscureFirst,
              decoration: InputDecoration(labelText: firstLabel),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: second,
              keyboardType: numericSecond ? TextInputType.number : TextInputType.text,
              decoration: InputDecoration(labelText: secondLabel),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, (first.text, second.text)),
            child: const Text('Continue'),
          ),
        ],
      ),
    );
    first.dispose();
    second.dispose();
    return result;
  }

  Future<(String, String, String)?> _threeFieldDialog({
    required String title,
    required List<String> labels,
  }) async {
    final first = TextEditingController();
    final second = TextEditingController();
    final third = TextEditingController();
    final result = await showDialog<(String, String, String)>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final item in [(first, labels[0]), (second, labels[1]), (third, labels[2])]) ...[
              TextField(
                controller: item.$1,
                obscureText: true,
                decoration: InputDecoration(labelText: item.$2),
              ),
              const SizedBox(height: 10),
            ],
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, (first.text, second.text, third.text)),
            child: const Text('Change password'),
          ),
        ],
      ),
    );
    first.dispose();
    second.dispose();
    third.dispose();
    return result;
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}

class _DeviceSessionsScreen extends StatefulWidget {
  const _DeviceSessionsScreen();

  @override
  State<_DeviceSessionsScreen> createState() => _DeviceSessionsScreenState();
}

class _DeviceSessionsScreenState extends State<_DeviceSessionsScreen> {
  List<Map<String, dynamic>> sessions = const [];
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final value = await context.services.settings.deviceSessions();
      if (!mounted) return;
      setState(() {
        sessions = value;
        loading = false;
        error = null;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = _errorText(failure);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Devices'),
        actions: [
          TextButton(onPressed: _logoutOthers, child: const Text('Logout others')),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? _SettingsError(message: error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(12),
                    itemCount: sessions.length,
                    separatorBuilder: (_, __) => Divider(color: context.border),
                    itemBuilder: (_, index) {
                      final session = sessions[index];
                      final current = session['current'] == true || session['isCurrent'] == true;
                      final id = session['_id']?.toString() ?? session['id']?.toString() ?? '';
                      final label = session['deviceLabel']?.toString().trim() ?? '';
                      final userAgent = session['userAgent']?.toString().trim() ?? '';
                      return ListTile(
                        leading: Icon(current ? Icons.smartphone_rounded : Icons.devices_other_rounded),
                        title: Text(label.isNotEmpty ? label : (current ? 'Current device' : 'Signed-in device')),
                        subtitle: Text(userAgent.isNotEmpty ? userAgent : 'SyncChat session'),
                        trailing: current || id.isEmpty
                            ? const Chip(label: Text('Current'))
                            : IconButton(
                                tooltip: 'Remote logout',
                                onPressed: () => _revoke(id),
                                icon: const Icon(Icons.logout_rounded),
                              ),
                      );
                    },
                  ),
                ),
    );
  }

  Future<void> _revoke(String id) async {
    try {
      await context.services.settings.revokeDeviceSession(id);
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_errorText(failure))));
    }
  }

  Future<void> _logoutOthers() async {
    try {
      await context.services.settings.revokeOtherDeviceSessions();
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_errorText(failure))));
    }
  }
}

class _BlockedContactsScreen extends StatefulWidget {
  const _BlockedContactsScreen();

  @override
  State<_BlockedContactsScreen> createState() => _BlockedContactsScreenState();
}

class _BlockedContactsScreenState extends State<_BlockedContactsScreen> {
  List<Map<String, dynamic>> contacts = const [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final value = await context.services.settings.blockedContacts();
    if (!mounted) return;
    setState(() {
      contacts = value;
      loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Blocked contacts')),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : contacts.isEmpty
              ? const Center(child: Text('No blocked contacts.'))
              : ListView.builder(
                  itemCount: contacts.length,
                  itemBuilder: (_, index) {
                    final item = contacts[index];
                    final name = item['fullname']?.toString() ?? item['username']?.toString() ?? 'Contact';
                    final userId = item['userId']?.toString() ?? '';
                    return ListTile(
                      leading: SyncAvatar(name: name),
                      title: Text(name),
                      subtitle: item['username'] == null ? null : Text('@${item['username']}'),
                      trailing: TextButton(
                        onPressed: userId.isEmpty ? null : () => _unblock(userId),
                        child: const Text('Unblock'),
                      ),
                    );
                  },
                ),
    );
  }

  Future<void> _unblock(String userId) async {
    try {
      await context.services.contacts.unblock(userId);
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_errorText(failure))));
    }
  }
}

class _HiddenChatsScreen extends StatefulWidget {
  const _HiddenChatsScreen();

  @override
  State<_HiddenChatsScreen> createState() => _HiddenChatsScreenState();
}

class _HiddenChatsScreenState extends State<_HiddenChatsScreen> {
  List<Map<String, dynamic>> chats = const [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final value = await context.services.settings.hiddenChats();
    if (!mounted) return;
    setState(() {
      chats = value;
      loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Hidden chats')),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : chats.isEmpty
              ? const Center(child: Text('No hidden chats.'))
              : ListView.builder(
                  itemCount: chats.length,
                  itemBuilder: (_, index) {
                    final inbox = chats[index];
                    final roomId = inbox['roomId']?.toString() ?? '';
                    final name = _hiddenChatName(inbox);
                    return ListTile(
                      leading: SyncAvatar(name: name),
                      title: Text(name),
                      trailing: TextButton(
                        onPressed: roomId.isEmpty ? null : () => _unhide(roomId),
                        child: const Text('Unhide'),
                      ),
                      onTap: roomId.isEmpty
                          ? null
                          : () => Navigator.of(context).push(
                                MaterialPageRoute<void>(
                                  builder: (_) => LiveChatRoomScreen(inbox: inbox, name: name),
                                ),
                              ),
                    );
                  },
                ),
    );
  }

  Future<void> _unhide(String roomId) async {
    try {
      await context.services.inbox.updatePreferences(
        roomId,
        {'action': 'hide', 'value': false},
      );
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_errorText(failure))));
    }
  }
}

String _hiddenChatName(Map<String, dynamic> inbox) {
  final channel = inbox['channel'];
  if (channel is Map && channel['name'] != null) return channel['name'].toString();
  final group = inbox['group'];
  if (group is Map && group['name'] != null) return group['name'].toString();
  final owners = inbox['owners'];
  if (owners is List && owners.isNotEmpty) {
    final raw = owners.whereType<Map>().firstOrNull;
    if (raw != null) {
      return raw['fullname']?.toString() ?? raw['username']?.toString() ?? 'Hidden chat';
    }
  }
  return 'Hidden chat';
}

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}

class _SettingsError extends StatelessWidget {
  const _SettingsError({required this.message, required this.onRetry});

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
            const Icon(Icons.cloud_off_outlined, size: 48, color: SyncColors.sky),
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
