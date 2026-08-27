import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../core/permission_manager.dart';
import '../theme.dart';
import '../widgets.dart';

class LiveFullProfileScreen extends StatefulWidget {
  const LiveFullProfileScreen({super.key});

  @override
  State<LiveFullProfileScreen> createState() => _LiveFullProfileScreenState();
}

class _LiveFullProfileScreenState extends State<LiveFullProfileScreen> {
  final picker = ImagePicker();
  Map<String, dynamic> user = const {};
  Map<String, dynamic> profile = const {};
  bool loading = true;
  bool busy = false;
  String? error;

  static const socialOptions = <String, String>{
    'facebook': 'Facebook',
    'instagram': 'Instagram',
    'whatsapp': 'WhatsApp',
    'linkedin': 'LinkedIn',
    'x': 'X',
    'buddy': 'Buddy',
    'twitter': 'Twitter',
    'rss': 'RSS',
    'skype': 'Skype',
    'pinterest': 'Pinterest',
    'blogger': 'Blogger',
    'vimeo': 'Vimeo',
    'youtube': 'YouTube',
    'google_plus': 'Google +',
    'website': 'Website',
    'others': 'Others',
  };

  String get userId => user['_id']?.toString() ?? profile['userId']?.toString() ?? '';
  String get name => (profile['fullname'] ?? user['fullname'] ?? user['username'] ?? 'Profile').toString();
  String get username => (profile['username'] ?? user['username'] ?? '').toString();
  String get shareUrl => username.trim().isEmpty
      ? 'https://syncchat.live/chat'
      : 'https://syncchat.live/chat?u=${Uri.encodeQueryComponent(username.trim())}';

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
      final current = await context.services.chat.currentUser(refresh: true);
      final id = current['_id']?.toString() ?? '';
      final details = id.isEmpty ? <String, dynamic>{} : await context.services.profile.getProfile(id);
      if (!mounted) return;
      setState(() {
        user = current;
        profile = details;
        loading = false;
        busy = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        busy = false;
        error = _message(failure);
      });
    }
  }

  Future<void> _changeAvatar() async {
    if (busy || userId.isEmpty) return;
    final allowed = await AppPermissionManager.ensurePhotos(
      context,
      reason: 'Photo permission is needed to choose your SyncChat profile photo.',
    );
    if (!allowed || !mounted) return;
    final image = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 92,
      maxWidth: 1600,
      maxHeight: 1600,
    );
    if (image == null || !mounted) return;
    try {
      final bytes = await image.readAsBytes();
      final maxBytes = context.services.config.avatarUploadLimitMb * 1024 * 1024;
      if (bytes.length > maxBytes) {
        _snack('Profile photo is too large. Max ${context.services.config.avatarUploadLimitMb} MB.');
        return;
      }
      setState(() => busy = true);
      final mime = _mime(image.name);
      await context.services.api.post('/avatars', body: {
        'avatar': 'data:$mime;base64,${base64Encode(bytes)}',
        'targetId': userId,
        'isGroup': false,
        'isChannel': false,
      });
      await _load();
      if (mounted) _snack('Profile photo updated.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busy = false);
      _snack(_message(failure));
    }
  }

  Future<void> _editProfile() async {
    final fullname = TextEditingController(text: profile['fullname']?.toString() ?? user['fullname']?.toString() ?? '');
    final usernameCtrl = TextEditingController(text: username);
    final bio = TextEditingController(text: profile['bio']?.toString() ?? '');
    final phone = TextEditingController(text: profile['phone']?.toString() ?? '');
    final email = TextEditingController(text: profile['email']?.toString() ?? user['email']?.toString() ?? '');
    final key = GlobalKey<FormState>();
    final submit = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Edit profile'),
        content: Form(
          key: key,
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextFormField(
                controller: fullname,
                decoration: const InputDecoration(labelText: 'Full name'),
                validator: (value) => (value ?? '').trim().isEmpty ? 'Full name is required.' : null,
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: usernameCtrl,
                decoration: const InputDecoration(labelText: 'Username'),
                validator: (value) => RegExp(r'^[a-z0-9_-]{3,24}$').hasMatch((value ?? '').trim()) ? null : 'Use 3–24 lowercase letters, numbers, _ or -.',
              ),
              const SizedBox(height: 10),
              TextFormField(controller: bio, maxLength: 300, minLines: 2, maxLines: 4, decoration: const InputDecoration(labelText: 'Bio')),
              const SizedBox(height: 10),
              TextFormField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone')),
              const SizedBox(height: 10),
              TextFormField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email')),
            ]),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (key.currentState?.validate() != true) return;
              Navigator.pop(dialogContext, true);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (submit != true || !mounted) {
      fullname.dispose();
      usernameCtrl.dispose();
      bio.dispose();
      phone.dispose();
      email.dispose();
      return;
    }
    final changes = {
      'fullname': fullname.text.trim(),
      'username': usernameCtrl.text.trim(),
      'bio': bio.text.trim(),
      'phone': phone.text.trim(),
      'email': email.text.trim(),
    };
    fullname.dispose();
    usernameCtrl.dispose();
    bio.dispose();
    phone.dispose();
    email.dispose();
    setState(() => busy = true);
    try {
      await context.services.profile.update(changes);
      await _load();
      if (mounted) _snack('Profile updated.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busy = false);
      _snack(_message(failure));
    }
  }

  Future<void> _showQr() async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Your SyncChat QR'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              color: Colors.white,
              padding: const EdgeInsets.all(10),
              child: QrImageView(data: shareUrl, size: 220),
            ),
            const SizedBox(height: 12),
            Text('Scan to open your SyncChat profile chat.', textAlign: TextAlign.center, style: TextStyle(color: context.muted)),
            const SizedBox(height: 8),
            SelectableText(shareUrl, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11)),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Clipboard.setData(ClipboardData(text: shareUrl));
              Navigator.pop(dialogContext);
              _snack('Profile link copied.');
            },
            child: const Text('Copy link'),
          ),
          FilledButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Done')),
        ],
      ),
    );
  }

  Future<void> _addSocial() async {
    String platform = 'facebook';
    final url = TextEditingController();
    String? validation;
    final result = await showDialog<(String, String)>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Add social account'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            DropdownButtonFormField<String>(
              initialValue: platform,
              decoration: const InputDecoration(labelText: 'Platform'),
              items: socialOptions.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))).toList(),
              onChanged: (value) {
                if (value != null) setDialogState(() => platform = value);
              },
            ),
            const SizedBox(height: 12),
            TextField(controller: url, keyboardType: TextInputType.url, decoration: const InputDecoration(labelText: 'Profile URL')),
            if (validation != null) ...[
              const SizedBox(height: 8),
              Text(validation!, style: const TextStyle(color: SyncColors.danger)),
            ],
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                var value = url.text.trim();
                if (value.isEmpty) {
                  setDialogState(() => validation = 'URL is required.');
                  return;
                }
                if (!RegExp(r'^https?://', caseSensitive: false).hasMatch(value)) value = 'https://$value';
                final parsed = Uri.tryParse(value);
                if (parsed == null || !parsed.hasScheme || parsed.host.isEmpty) {
                  setDialogState(() => validation = 'Enter a valid URL.');
                  return;
                }
                Navigator.pop(dialogContext, (platform, parsed.toString()));
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    url.dispose();
    if (result == null || !mounted) return;
    await _upsertSocial(result.$1, result.$2);
  }

  Future<void> _upsertSocial(String platform, String url) async {
    final current = _social;
    final index = current.indexWhere((item) => item['platform']?.toString() == platform);
    final next = current.map((item) => Map<String, dynamic>.from(item)).toList();
    final value = {'platform': platform, 'url': url};
    if (index >= 0) {
      next[index] = value;
    } else {
      next.add(value);
    }
    setState(() => busy = true);
    try {
      await context.services.profile.update({'socialAccounts': next});
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busy = false);
      _snack(_message(failure));
    }
  }

  Future<void> _removeSocial(String platform) async {
    final next = _social.where((item) => item['platform']?.toString() != platform).toList();
    setState(() => busy = true);
    try {
      await context.services.profile.update({'socialAccounts': next});
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busy = false);
      _snack(_message(failure));
    }
  }

  List<Map<String, dynamic>> get _social => profile['socialAccounts'] is List
      ? (profile['socialAccounts'] as List).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
      : <Map<String, dynamic>>[];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Profile'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(tooltip: 'QR profile', onPressed: loading ? null : _showQr, icon: const Icon(Icons.qr_code_rounded)),
          IconButton(tooltip: 'Edit profile', onPressed: loading || busy ? null : _editProfile, icon: const Icon(Icons.edit_outlined)),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null && profile.isEmpty
              ? _ProfileError(message: error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(14, 22, 14, 36),
                    children: [
                      Center(
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            SyncAvatar(name: name, radius: 58),
                            Positioned(
                              right: -4,
                              bottom: -4,
                              child: Material(
                                color: SyncColors.sky,
                                shape: const CircleBorder(),
                                child: IconButton(
                                  tooltip: 'Change profile photo',
                                  onPressed: busy ? null : _changeAvatar,
                                  icon: const Icon(Icons.photo_camera_outlined, color: Colors.white, size: 20),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),
                      Center(child: Text(name, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900))),
                      if (username.isNotEmpty) Center(child: Text('@$username', style: TextStyle(color: context.muted))),
                      if ((profile['bio']?.toString() ?? '').isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Center(child: Text(profile['bio'].toString(), textAlign: TextAlign.center)),
                      ],
                      const SizedBox(height: 18),
                      SyncSoftCard(
                        padding: EdgeInsets.zero,
                        child: Column(children: [
                          ListTile(leading: const Icon(Icons.alternate_email_rounded), title: const Text('Username'), subtitle: Text(username)),
                          Divider(height: 1, color: context.border),
                          ListTile(leading: const Icon(Icons.badge_outlined), title: const Text('Full name'), subtitle: Text(name)),
                          Divider(height: 1, color: context.border),
                          ListTile(leading: const Icon(Icons.phone_outlined), title: const Text('Phone'), subtitle: Text(profile['phone']?.toString() ?? 'Not set')),
                          Divider(height: 1, color: context.border),
                          ListTile(leading: const Icon(Icons.email_outlined), title: const Text('Email'), subtitle: Text(profile['email']?.toString() ?? user['email']?.toString() ?? 'Not set')),
                        ]),
                      ),
                      const SizedBox(height: 20),
                      Row(children: [
                        const Expanded(child: Text('Social accounts', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900))),
                        TextButton.icon(onPressed: busy ? null : _addSocial, icon: const Icon(Icons.add_rounded), label: const Text('Add')),
                      ]),
                      if (_social.isEmpty)
                        SyncFeatureCard(
                          icon: Icons.link_rounded,
                          title: 'Add your links',
                          body: 'Connect social accounts and websites to match your SyncChat web profile.',
                          actionLabel: 'Add account',
                          onAction: _addSocial,
                        )
                      else
                        ..._social.map((item) {
                          final platform = item['platform']?.toString() ?? 'others';
                          final label = socialOptions[platform] ?? platform;
                          return Card(
                            color: context.panel,
                            elevation: 0,
                            child: ListTile(
                              leading: const Icon(Icons.link_rounded, color: SyncColors.sky),
                              title: Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
                              subtitle: Text(item['url']?.toString() ?? '', maxLines: 1, overflow: TextOverflow.ellipsis),
                              trailing: IconButton(onPressed: busy ? null : () => _removeSocial(platform), icon: const Icon(Icons.delete_outline_rounded)),
                              onTap: () => Clipboard.setData(ClipboardData(text: item['url']?.toString() ?? '')),
                            ),
                          );
                        }),
                      if (busy) ...[
                        const SizedBox(height: 16),
                        const LinearProgressIndicator(),
                      ],
                    ],
                  ),
                ),
    );
  }

  void _snack(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
}

class _ProfileError extends StatelessWidget {
  const _ProfileError({required this.message, required this.onRetry});
  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.cloud_off_outlined, size: 46, color: SyncColors.sky),
            const SizedBox(height: 10),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh_rounded), label: const Text('Retry')),
          ]),
        ),
      );
}

String _mime(String filename) {
  final lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

String _message(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
