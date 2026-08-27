import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:webview_flutter/webview_flutter.dart';

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
    'instagram': 'Instragram',
    'whatsapp': 'Whatsapp',
    'linkedin': 'Linkdln',
    'x': 'X',
    'buddy': 'Buddy',
    'twitter': 'Twitter',
    'rss': 'RSS',
    'skype': 'Skype',
    'pinterest': 'PINTRST',
    'blogger': 'Blogger',
    'vimeo': 'Vimo',
    'youtube': 'Youtube',
    'google_plus': 'Google +',
    'website': 'Website',
    'others': 'Others',
  };

  String get userId => user['_id']?.toString() ?? profile['userId']?.toString() ?? '';
  String get name => (profile['fullname'] ?? user['fullname'] ?? user['username'] ?? 'Profile').toString();
  String get username => (profile['username'] ?? user['username'] ?? '').toString();
  String get email => (profile['email'] ?? user['email'] ?? '').toString();
  String get shareUrl => username.trim().isEmpty
      ? 'https://syncchat.live/chat'
      : 'https://syncchat.live/chat?u=${Uri.encodeQueryComponent(username.trim())}';

  List<Map<String, dynamic>> get socialAccounts => profile['socialAccounts'] is List
      ? (profile['socialAccounts'] as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false)
      : <Map<String, dynamic>>[];

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
      final current = await context.services.chat.currentUser(refresh: true);
      final id = current['_id']?.toString() ?? '';
      final details = id.isEmpty
          ? <String, dynamic>{}
          : await context.services.profile.getProfile(id);
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
        error = _errorText(failure);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Profile'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(
            tooltip: 'QR profile',
            onPressed: loading ? null : _showQr,
            icon: const Icon(Icons.qr_code_rounded),
          ),
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
                    padding: const EdgeInsets.fromLTRB(14, 20, 14, 36),
                    children: [
                      _profileHeader(),
                      const SizedBox(height: 20),
                      _profileFields(),
                      const SizedBox(height: 20),
                      _socialSection(),
                      if (busy) ...[
                        const SizedBox(height: 16),
                        const LinearProgressIndicator(),
                      ],
                    ],
                  ),
                ),
    );
  }

  Widget _profileHeader() {
    return Column(
      children: [
        Stack(
          clipBehavior: Clip.none,
          children: [
            SyncAvatar(
              name: name,
              imageUrl: profile['avatar']?.toString(),
              radius: 58,
            ),
            Positioned(
              right: -4,
              bottom: -4,
              child: Material(
                color: SyncColors.sky,
                shape: const CircleBorder(),
                child: IconButton(
                  tooltip: 'Change profile photo',
                  onPressed: busy ? null : _changeAvatar,
                  icon: const Icon(
                    Icons.photo_camera_outlined,
                    color: Colors.white,
                    size: 20,
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Flexible(
              child: Text(
                name,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
              ),
            ),
            IconButton(
              tooltip: 'Edit full name',
              onPressed: busy
                  ? null
                  : () => _editField(
                        field: 'fullname',
                        label: 'Full name',
                        current: name,
                      ),
              icon: const Icon(Icons.edit_outlined, size: 20),
            ),
          ],
        ),
      ],
    );
  }

  Widget _profileFields() {
    final fields = <_ProfileField>[
      _ProfileField(
        field: 'username',
        label: 'Username',
        value: username,
        icon: Icons.alternate_email_rounded,
        description: 'People will be able to find you by this username and contact you.',
      ),
      _ProfileField(
        field: 'fullname',
        label: 'Full name',
        value: name,
        icon: Icons.person_outline_rounded,
      ),
      _ProfileField(
        field: 'bio',
        label: 'Bio',
        value: profile['bio']?.toString() ?? '',
        icon: Icons.info_outline_rounded,
      ),
      _ProfileField(
        field: 'phone',
        label: 'Phone',
        value: profile['phone']?.toString() ?? '',
        icon: Icons.phone_outlined,
      ),
      _ProfileField(
        field: 'email',
        label: 'Email',
        value: email,
        icon: Icons.email_outlined,
        editable: false,
      ),
    ];

    return SyncSoftCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var index = 0; index < fields.length; index++) ...[
            _fieldTile(fields[index]),
            if (index != fields.length - 1) Divider(height: 1, color: context.border),
          ],
        ],
      ),
    );
  }

  Widget _fieldTile(_ProfileField field) {
    return ListTile(
      leading: Icon(field.icon),
      title: Text(field.label, style: TextStyle(fontSize: 13, color: context.muted)),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 3),
          SelectableText(
            field.value.trim().isEmpty ? 'Not set' : field.value,
            style: TextStyle(fontSize: 16, color: context.ink),
          ),
          if (field.description != null) ...[
            const SizedBox(height: 6),
            Text(
              field.description!,
              style: TextStyle(fontSize: 12, color: context.muted, height: 1.35),
            ),
          ],
        ],
      ),
      trailing: field.editable
          ? IconButton(
              tooltip: 'Edit ${field.label.toLowerCase()}',
              onPressed: busy
                  ? null
                  : () => _editField(
                        field: field.field,
                        label: field.label,
                        current: field.value,
                      ),
              icon: const Icon(Icons.edit_outlined),
            )
          : const Icon(Icons.lock_outline_rounded, size: 18),
    );
  }

  Widget _socialSection() {
    final accounts = socialAccounts;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text('Social Account', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            ),
            IconButton.filled(
              tooltip: 'Add social account',
              onPressed: busy ? null : _addSocial,
              icon: const Icon(Icons.add_rounded),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (accounts.isEmpty)
          SyncFeatureCard(
            icon: Icons.link_rounded,
            title: 'No social account added.',
            body: 'Add a social profile or website link.',
            actionLabel: 'Add account',
            onAction: _addSocial,
          )
        else
          SyncSoftCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (var index = 0; index < accounts.length; index++) ...[
                  _socialTile(accounts[index]),
                  if (index != accounts.length - 1) Divider(height: 1, color: context.border),
                ],
              ],
            ),
          ),
      ],
    );
  }

  Widget _socialTile(Map<String, dynamic> item) {
    final platform = item['platform']?.toString() ?? 'others';
    final url = item['url']?.toString() ?? '';
    final label = socialOptions[platform] ?? platform;
    return ListTile(
      leading: const Icon(Icons.public_rounded, color: SyncColors.sky),
      title: Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
      subtitle: Text(url, maxLines: 1, overflow: TextOverflow.ellipsis),
      onTap: url.isEmpty ? null : () => _openSocial(label, url),
      trailing: IconButton(
        tooltip: 'Remove $label',
        onPressed: busy ? null : () => _removeSocial(platform),
        icon: const Icon(Icons.delete_outline_rounded, color: SyncColors.danger),
      ),
    );
  }

  Future<void> _editField({
    required String field,
    required String label,
    required String current,
  }) async {
    if (field == 'email') return;
    final controller = TextEditingController(text: current);
    final key = GlobalKey<FormState>();
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Edit $label'),
        content: Form(
          key: key,
          child: TextFormField(
            controller: controller,
            autofocus: true,
            minLines: field == 'bio' ? 3 : 1,
            maxLines: field == 'bio' ? 5 : 1,
            maxLength: field == 'bio' ? 300 : null,
            keyboardType: field == 'phone' ? TextInputType.phone : TextInputType.text,
            inputFormatters: field == 'phone' ? [FilteringTextInputFormatter.digitsOnly] : null,
            decoration: InputDecoration(labelText: label),
            validator: (raw) {
              final text = (raw ?? '').trim();
              if (field == 'fullname' && text.isEmpty) return 'Full name is required.';
              if (field == 'username' && !RegExp(r'^[a-z0-9_-]{3,24}$').hasMatch(text)) {
                return 'Username is invalid';
              }
              return null;
            },
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (key.currentState?.validate() != true) return;
              Navigator.pop(dialogContext, controller.text.trim());
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (value == null || !mounted || value == current) return;
    setState(() => busy = true);
    try {
      await context.services.profile.update({field: value});
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busy = false);
      _snack(_errorText(failure));
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
      await context.services.api.post(
        '/avatars',
        body: {
          'avatar': 'data:${_mime(image.name)};base64,${base64Encode(bytes)}',
          'targetId': userId,
          'isGroup': false,
          'isChannel': false,
        },
      );
      await _load();
      if (mounted) _snack('Profile photo updated.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busy = false);
      _snack(_errorText(failure));
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
            SelectableText(shareUrl, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11)),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: shareUrl));
              if (!dialogContext.mounted) return;
              Navigator.pop(dialogContext);
              if (mounted) _snack('Profile link copied.');
            },
            child: const Text('Copy link'),
          ),
          FilledButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Done')),
        ],
      ),
    );
  }

  Future<void> _addSocial() async {
    String platform = socialOptions.keys.first;
    final url = TextEditingController();
    String? validation;
    final result = await showDialog<(String, String)>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Add social account'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: platform,
                decoration: const InputDecoration(labelText: 'Social Media'),
                items: socialOptions.entries
                    .map((entry) => DropdownMenuItem(value: entry.key, child: Text(entry.value)))
                    .toList(growable: false),
                onChanged: (value) {
                  if (value != null) setDialogState(() => platform = value);
                },
              ),
              const SizedBox(height: 12),
              TextField(
                controller: url,
                keyboardType: TextInputType.url,
                decoration: const InputDecoration(labelText: 'URL', hintText: 'https://...'),
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
                var value = url.text.trim();
                value = value.replaceFirst(RegExp(r'^(https?)//', caseSensitive: false), r'$1://');
                if (value.isEmpty) {
                  setDialogState(() => validation = 'URL is required');
                  return;
                }
                if (!RegExp(r'^https?://', caseSensitive: false).hasMatch(value)) {
                  value = 'https://$value';
                }
                final parsed = Uri.tryParse(value);
                if (parsed == null || !parsed.hasScheme || parsed.host.isEmpty) {
                  setDialogState(() => validation = 'Please enter a valid URL');
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
    final current = socialAccounts
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: true);
    final index = current.indexWhere((item) => item['platform']?.toString() == platform);
    final value = <String, dynamic>{'platform': platform, 'url': url};
    if (index >= 0) {
      current[index] = value;
    } else {
      current.add(value);
    }
    setState(() => busy = true);
    try {
      await context.services.profile.update({'socialAccounts': current});
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busy = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _removeSocial(String platform) async {
    final next = socialAccounts
        .where((item) => item['platform']?.toString() != platform)
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
    setState(() => busy = true);
    try {
      await context.services.profile.update({'socialAccounts': next});
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busy = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _openSocial(String title, String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      _snack('Invalid social URL.');
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _ProfileWebPage(title: title, uri: uri),
      ),
    );
  }

  void _snack(String text) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text), behavior: SnackBarBehavior.floating),
    );
  }
}

class _ProfileWebPage extends StatefulWidget {
  const _ProfileWebPage({required this.title, required this.uri});

  final String title;
  final Uri uri;

  @override
  State<_ProfileWebPage> createState() => _ProfileWebPageState();
}

class _ProfileWebPageState extends State<_ProfileWebPage> {
  late final WebViewController controller;

  @override
  void initState() {
    super.initState();
    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..loadRequest(widget.uri);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: WebViewWidget(controller: controller),
    );
  }
}

class _ProfileField {
  const _ProfileField({
    required this.field,
    required this.label,
    required this.value,
    required this.icon,
    this.description,
    this.editable = true,
  });

  final String field;
  final String label;
  final String value;
  final IconData icon;
  final String? description;
  final bool editable;
}

class _ProfileError extends StatelessWidget {
  const _ProfileError({required this.message, required this.onRetry});

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

String _mime(String filename) {
  final lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
