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
  final socialUrl = TextEditingController();

  Map<String, dynamic> user = const {};
  Map<String, dynamic> profile = const {};
  bool loading = true;
  bool busy = false;
  String? error;

  String? editingKey;
  String? editingField;
  TextEditingController? editingController;
  String? savingField;
  String? inlineError;

  bool socialEditorOpen = false;
  bool socialSaving = false;
  String socialPlatform = 'facebook';
  String? socialError;

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

  String get userId =>
      user['_id']?.toString() ?? profile['userId']?.toString() ?? '';
  String get name =>
      (profile['fullname'] ?? user['fullname'] ?? user['username'] ?? 'Profile')
          .toString();
  String get username =>
      (profile['username'] ?? user['username'] ?? '').toString();
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

  @override
  void dispose() {
    editingController?.dispose();
    socialUrl.dispose();
    super.dispose();
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
                    padding: const EdgeInsets.only(bottom: 36),
                    children: [
                      _profileHeader(),
                      _profileFields(),
                      _socialSection(),
                      if (busy || socialSaving) ...[
                        const Padding(
                          padding: EdgeInsets.fromLTRB(16, 14, 16, 0),
                          child: LinearProgressIndicator(),
                        ),
                      ],
                    ],
                  ),
                ),
    );
  }

  Widget _profileHeader() {
    final headerEditing = editingKey == 'header:fullname';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
      child: Column(
        children: [
          GestureDetector(
            onTap: busy ? null : _changeAvatar,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                SyncAvatar(
                  name: name,
                  imageUrl: profile['avatar']?.toString(),
                  radius: 56,
                ),
                Positioned(
                  right: -2,
                  bottom: -2,
                  child: Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: SyncColors.sky,
                      border: Border.all(color: context.page, width: 2),
                    ),
                    child: const Icon(
                      Icons.photo_camera_outlined,
                      color: Colors.white,
                      size: 19,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 15),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Flexible(
                  child: headerEditing
                      ? TextField(
                          controller: editingController,
                          autofocus: true,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                          ),
                          decoration: InputDecoration(
                            isDense: true,
                            errorText: inlineError,
                            border: const UnderlineInputBorder(),
                          ),
                          onSubmitted: (_) => _saveInlineEdit(),
                        )
                      : Text(
                          name,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                ),
                const SizedBox(width: 6),
                IconButton(
                  tooltip: headerEditing ? 'Save full name' : 'Edit full name',
                  onPressed: savingField != null
                      ? null
                      : headerEditing
                          ? _saveInlineEdit
                          : () => _beginEdit(
                                key: 'header:fullname',
                                field: 'fullname',
                                current: name,
                              ),
                  icon: Icon(
                    headerEditing ? Icons.check_rounded : Icons.edit_outlined,
                    size: 20,
                    color: headerEditing ? SyncColors.sky : null,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _profileFields() {
    final fields = <_ProfileField>[
      _ProfileField(
        field: 'username',
        label: 'username',
        value: username,
        icon: Icons.alternate_email_rounded,
        description:
            'People will be able to find you by this username and contact you.',
      ),
      _ProfileField(
        field: 'fullname',
        label: 'full name',
        value: name,
        icon: Icons.person_outline_rounded,
      ),
      _ProfileField(
        field: 'bio',
        label: 'bio',
        value: profile['bio']?.toString() ?? '',
        icon: Icons.info_outline_rounded,
      ),
      _ProfileField(
        field: 'phone',
        label: 'phone',
        value: profile['phone']?.toString() ?? '',
        icon: Icons.phone_outlined,
      ),
      _ProfileField(
        field: 'email',
        label: 'email',
        value: email,
        icon: Icons.email_outlined,
        editable: false,
      ),
    ];

    return Column(
      children: [
        for (final field in fields) _fieldRow(field),
      ],
    );
  }

  Widget _fieldRow(_ProfileField field) {
    final key = 'field:${field.field}';
    final editing = editingKey == key;
    final saving = savingField == field.field;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 10, 10),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: context.border)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 3),
            child: Icon(field.icon, size: 20, color: context.ink),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  field.label,
                  style: TextStyle(
                    color: context.muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 4),
                if (editing)
                  TextField(
                    controller: editingController,
                    autofocus: true,
                    minLines: field.field == 'bio' ? 2 : 1,
                    maxLines: field.field == 'bio' ? 4 : 1,
                    keyboardType: field.field == 'phone'
                        ? TextInputType.phone
                        : TextInputType.text,
                    inputFormatters: field.field == 'phone'
                        ? [FilteringTextInputFormatter.digitsOnly]
                        : null,
                    decoration: InputDecoration(
                      isDense: true,
                      errorText: inlineError,
                      border: const UnderlineInputBorder(),
                    ),
                    onSubmitted:
                        field.field == 'bio' ? null : (_) => _saveInlineEdit(),
                  )
                else
                  SelectableText(
                    field.value,
                    style: TextStyle(fontSize: 16, color: context.ink),
                  ),
                if (field.description != null) ...[
                  const SizedBox(height: 7),
                  Text(
                    field.description!,
                    style: TextStyle(
                      color: context.muted,
                      fontSize: 12,
                      height: 1.35,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (field.editable)
            IconButton(
              tooltip: editing ? 'Save ${field.label}' : 'Edit ${field.label}',
              onPressed: savingField != null
                  ? null
                  : editing
                      ? _saveInlineEdit
                      : () => _beginEdit(
                            key: key,
                            field: field.field,
                            current: field.value,
                          ),
              icon: saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(
                      editing ? Icons.check_rounded : Icons.edit_outlined,
                      size: 20,
                      color: editing ? SyncColors.sky : null,
                    ),
            )
          else
            const SizedBox(width: 48),
        ],
      ),
    );
  }

  Widget _socialSection() {
    final accounts = socialAccounts;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: context.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Social Account',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                ),
              ),
              SizedBox(
                width: 30,
                height: 30,
                child: IconButton.filled(
                  padding: EdgeInsets.zero,
                  tooltip: 'Add social account',
                  onPressed: busy || socialSaving
                      ? null
                      : () => setState(() {
                            socialEditorOpen = !socialEditorOpen;
                            socialError = null;
                          }),
                  icon: const Icon(Icons.add_rounded, size: 18),
                ),
              ),
            ],
          ),
          if (socialEditorOpen) ...[
            const SizedBox(height: 12),
            Text('Social Media', style: TextStyle(fontSize: 12, color: context.muted)),
            const SizedBox(height: 5),
            DropdownButtonFormField<String>(
              key: ValueKey(socialPlatform),
              initialValue: socialPlatform,
              isExpanded: true,
              decoration: const InputDecoration(isDense: true),
              items: socialOptions.entries
                  .map(
                    (entry) => DropdownMenuItem<String>(
                      value: entry.key,
                      child: Row(
                        children: [
                          Icon(_socialIcon(entry.key), size: 18),
                          const SizedBox(width: 8),
                          Text(entry.value),
                        ],
                      ),
                    ),
                  )
                  .toList(growable: false),
              onChanged: socialSaving
                  ? null
                  : (value) {
                      if (value != null) setState(() => socialPlatform = value);
                    },
            ),
            const SizedBox(height: 10),
            Text('URL', style: TextStyle(fontSize: 12, color: context.muted)),
            const SizedBox(height: 5),
            TextField(
              controller: socialUrl,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                isDense: true,
                hintText: 'https://...',
              ),
            ),
            if (socialError != null) ...[
              const SizedBox(height: 7),
              Text(socialError!, style: const TextStyle(color: SyncColors.danger, fontSize: 12)),
            ],
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                onPressed: socialSaving ? null : _saveSocialEditor,
                child: Text(socialSaving ? 'Saving...' : 'Save'),
              ),
            ),
          ],
          const SizedBox(height: 12),
          if (accounts.isEmpty)
            Text(
              'No social account added.',
              style: TextStyle(color: context.muted, fontSize: 14),
            )
          else
            Column(
              children: [
                for (final item in accounts) _socialRow(item),
              ],
            ),
        ],
      ),
    );
  }

  Widget _socialRow(Map<String, dynamic> item) {
    final platform = item['platform']?.toString() ?? 'others';
    final url = item['url']?.toString() ?? '';
    final label = socialOptions[platform] ?? platform;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(10, 8, 4, 8),
      decoration: BoxDecoration(
        color: context.isDark ? SyncColors.spill900 : SyncColors.slate50,
        borderRadius: BorderRadius.circular(7),
      ),
      child: Row(
        children: [
          Icon(_socialIcon(platform), size: 20, color: SyncColors.sky),
          const SizedBox(width: 9),
          Expanded(
            child: InkWell(
              onTap: url.isEmpty ? null : () => _openSocial(label, url),
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: SyncColors.sky,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Remove $label',
            onPressed: busy || socialSaving ? null : () => _removeSocial(platform),
            icon: const Icon(
              Icons.delete_outline_rounded,
              color: SyncColors.danger,
              size: 19,
            ),
          ),
        ],
      ),
    );
  }

  void _beginEdit({
    required String key,
    required String field,
    required String current,
  }) {
    if (field == 'email') return;
    editingController?.dispose();
    setState(() {
      editingKey = key;
      editingField = field;
      editingController = TextEditingController(text: current);
      inlineError = null;
    });
  }

  Future<void> _saveInlineEdit() async {
    final field = editingField;
    final controller = editingController;
    if (field == null || controller == null || savingField != null) return;

    final value = controller.text.trim();
    if (field == 'fullname' && value.isEmpty) {
      setState(() => inlineError = 'Full name is required.');
      return;
    }
    if (field == 'username' &&
        !RegExp(r'^[a-z0-9_-]{3,24}$').hasMatch(value)) {
      setState(() => inlineError = 'Username is invalid');
      return;
    }

    final current = profile[field]?.toString() ?? '';
    if (value == current) {
      _finishInlineEdit();
      return;
    }

    setState(() {
      savingField = field;
      inlineError = null;
    });
    try {
      await context.services.profile.update({field: value});
      if (!mounted) return;
      setState(() {
        profile = {...profile, field: value};
        if (field == 'fullname' || field == 'username') {
          user = {...user, field: value};
        }
      });
      _finishInlineEdit();
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        savingField = null;
        inlineError = _errorText(failure);
      });
    }
  }

  void _finishInlineEdit() {
    final controller = editingController;
    if (!mounted) {
      controller?.dispose();
      return;
    }
    setState(() {
      editingKey = null;
      editingField = null;
      editingController = null;
      savingField = null;
      inlineError = null;
    });
    controller?.dispose();
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
        _snack(
          'Profile photo is too large. Max ${context.services.config.avatarUploadLimitMb} MB.',
        );
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

  Future<void> _saveSocialEditor() async {
    var value = socialUrl.text.trim();
    value = value.replaceFirst(
      RegExp(r'^(https?)//', caseSensitive: false),
      r'$1://',
    );
    if (value.isEmpty) {
      setState(() => socialError = 'URL is required');
      return;
    }
    if (!RegExp(r'^https?://', caseSensitive: false).hasMatch(value)) {
      value = 'https://$value';
    }
    final parsed = Uri.tryParse(value);
    if (parsed == null || !parsed.hasScheme || parsed.host.isEmpty) {
      setState(() => socialError = 'Please enter a valid URL');
      return;
    }
    await _upsertSocial(socialPlatform, parsed.toString());
  }

  Future<void> _upsertSocial(String platform, String url) async {
    final current = socialAccounts
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: true);
    final index = current.indexWhere(
      (item) => item['platform']?.toString() == platform,
    );
    final value = <String, dynamic>{'platform': platform, 'url': url};
    if (index >= 0) {
      current[index] = value;
    } else {
      current.add(value);
    }
    setState(() {
      socialSaving = true;
      socialError = null;
    });
    try {
      await context.services.profile.update({'socialAccounts': current});
      if (!mounted) return;
      setState(() {
        profile = {...profile, 'socialAccounts': current};
        socialEditorOpen = false;
        socialSaving = false;
        socialUrl.clear();
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        socialSaving = false;
        socialError = _errorText(failure);
      });
    }
  }

  Future<void> _removeSocial(String platform) async {
    final next = socialAccounts
        .where((item) => item['platform']?.toString() != platform)
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
    setState(() => socialSaving = true);
    try {
      await context.services.profile.update({'socialAccounts': next});
      if (!mounted) return;
      setState(() {
        profile = {...profile, 'socialAccounts': next};
        socialSaving = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => socialSaving = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _showQr() async {
    final bio = profile['bio']?.toString() ?? '';
    final shareText = 'Chat with me on SyncChat: $shareUrl';
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
                  child: Row(
                    children: [
                      SyncAvatar(
                        name: name,
                        imageUrl: profile['avatar']?.toString(),
                        radius: 20,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.w800),
                            ),
                            if (bio.isNotEmpty)
                              Text(
                                bio,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 12, color: context.muted),
                              ),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.pop(dialogContext),
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ],
                  ),
                ),
                Container(
                  width: double.infinity,
                  color: context.isDark ? SyncColors.spill700 : SyncColors.slate100,
                  padding: const EdgeInsets.all(10),
                  alignment: Alignment.center,
                  child: Container(
                    color: Colors.white,
                    padding: const EdgeInsets.all(5),
                    child: QrImageView(data: shareUrl, size: 220),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'Scan this QR to open your SyncChat profile chat directly.',
                        style: TextStyle(fontSize: 14),
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _shareButton(
                            'WhatsApp',
                            Icons.chat_rounded,
                            'https://wa.me/?text=${Uri.encodeComponent(shareText)}',
                          ),
                          _shareButton(
                            'Telegram',
                            Icons.send_rounded,
                            'https://t.me/share/url?url=${Uri.encodeComponent(shareUrl)}&text=${Uri.encodeComponent('Chat with me on SyncChat')}',
                          ),
                          _shareButton(
                            'Facebook',
                            Icons.facebook,
                            'https://www.facebook.com/sharer/sharer.php?u=${Uri.encodeComponent(shareUrl)}',
                          ),
                          _shareButton(
                            'X',
                            Icons.alternate_email_rounded,
                            'https://twitter.com/intent/tweet?url=${Uri.encodeComponent(shareUrl)}&text=${Uri.encodeComponent('Chat with me on SyncChat')}',
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                              decoration: BoxDecoration(
                                color: context.isDark
                                    ? SyncColors.spill900
                                    : SyncColors.slate50,
                                border: Border.all(color: context.border),
                                borderRadius: BorderRadius.circular(7),
                              ),
                              child: SelectableText(
                                shareUrl,
                                maxLines: 1,
                                style: const TextStyle(fontSize: 12),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          FilledButton.icon(
                            onPressed: () async {
                              await Clipboard.setData(ClipboardData(text: shareUrl));
                              if (!dialogContext.mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Copied')),
                              );
                            },
                            icon: const Icon(Icons.copy_rounded, size: 18),
                            label: const Text('Copy'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _shareButton(String label, IconData icon, String url) {
    return OutlinedButton.icon(
      onPressed: () => _openWeb(label, url),
      icon: Icon(icon, size: 18),
      label: Text(label),
    );
  }

  Future<void> _openSocial(String title, String url) => _openWeb(title, url);

  Future<void> _openWeb(String title, String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      _snack('Invalid URL.');
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

IconData _socialIcon(String platform) => switch (platform) {
      'facebook' => Icons.facebook,
      'instagram' => Icons.camera_alt_outlined,
      'whatsapp' => Icons.chat_bubble_outline_rounded,
      'linkedin' => Icons.work_outline_rounded,
      'x' => Icons.alternate_email_rounded,
      'buddy' => Icons.people_outline_rounded,
      'twitter' => Icons.alternate_email_rounded,
      'rss' => Icons.rss_feed_rounded,
      'skype' => Icons.video_call_outlined,
      'pinterest' => Icons.push_pin_outlined,
      'blogger' => Icons.article_outlined,
      'vimeo' => Icons.video_library_outlined,
      'youtube' => Icons.smart_display_outlined,
      'google_plus' => Icons.g_mobiledata_rounded,
      'website' => Icons.public_rounded,
      _ => Icons.share_outlined,
    };

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
