import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';

class LiveSocialProfilesScreen extends StatefulWidget {
  const LiveSocialProfilesScreen({super.key});

  @override
  State<LiveSocialProfilesScreen> createState() => _LiveSocialProfilesScreenState();
}

class _LiveSocialProfilesScreenState extends State<LiveSocialProfilesScreen> {
  static const platforms = <(String, String, IconData)>[
    ('facebook', 'Facebook', Icons.facebook_rounded),
    ('instagram', 'Instagram', Icons.camera_alt_outlined),
    ('whatsapp', 'WhatsApp', Icons.chat_outlined),
    ('linkedin', 'LinkedIn', Icons.work_outline_rounded),
    ('x', 'X', Icons.alternate_email_rounded),
    ('buddy', 'Buddy', Icons.people_outline_rounded),
    ('twitter', 'Twitter', Icons.tag_rounded),
    ('rss', 'RSS', Icons.rss_feed_rounded),
    ('skype', 'Skype', Icons.video_call_outlined),
    ('pinterest', 'Pinterest', Icons.push_pin_outlined),
    ('blogger', 'Blogger', Icons.article_outlined),
    ('vimeo', 'Vimeo', Icons.video_library_outlined),
    ('youtube', 'YouTube', Icons.play_circle_outline_rounded),
    ('google_plus', 'Google+', Icons.public_rounded),
    ('website', 'Website', Icons.language_rounded),
    ('others', 'Other', Icons.share_outlined),
  ];

  List<Map<String, dynamic>> accounts = const [];
  bool loading = true;
  bool saving = false;
  String? error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final user = await context.services.auth.currentUser();
      final userId = user['_id']?.toString() ?? '';
      final profile = userId.isEmpty
          ? <String, dynamic>{}
          : await context.services.profile.getProfile(userId);
      final raw = profile['socialAccounts'];
      if (!mounted) return;
      setState(() {
        accounts = raw is List
            ? raw
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item))
                .where((item) =>
                    item['platform']?.toString().trim().isNotEmpty == true &&
                    item['url']?.toString().trim().isNotEmpty == true)
                .toList(growable: false)
            : const [];
        loading = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = _message(failure);
      });
    }
  }

  Future<void> _save(List<Map<String, dynamic>> next) async {
    if (saving) return;
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await context.services.profile.update({'socialAccounts': next});
      if (!mounted) return;
      setState(() {
        accounts = next;
        saving = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Social profiles updated.')),
      );
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        saving = false;
        error = _message(failure);
      });
    }
  }

  Future<void> _edit({Map<String, dynamic>? existing}) async {
    if (saving) return;
    var platform = existing?['platform']?.toString() ?? platforms.first.$1;
    final controller = TextEditingController(text: existing?['url']?.toString() ?? '');
    String? dialogError;

    final result = await showDialog<(String, String)?>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(existing == null ? 'Add social profile' : 'Edit social profile'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: platform,
                  decoration: const InputDecoration(
                    labelText: 'Platform',
                    prefixIcon: Icon(Icons.apps_rounded),
                  ),
                  items: platforms.map((item) => DropdownMenuItem(
                    value: item.$1,
                    child: Row(
                      children: [
                        Icon(item.$3, size: 19),
                        const SizedBox(width: 9),
                        Text(item.$2),
                      ],
                    ),
                  )).toList(growable: false),
                  onChanged: (value) => setDialogState(() {
                    if (value != null) platform = value;
                    dialogError = null;
                  }),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: controller,
                  autofocus: existing == null,
                  keyboardType: TextInputType.url,
                  textInputAction: TextInputAction.done,
                  decoration: const InputDecoration(
                    labelText: 'Profile URL',
                    hintText: 'https://example.com/username',
                    prefixIcon: Icon(Icons.link_rounded),
                  ),
                  onChanged: (_) => setDialogState(() => dialogError = null),
                ),
                if (dialogError != null) ...[
                  const SizedBox(height: 9),
                  Text(dialogError!, style: const TextStyle(color: SyncColors.danger, fontSize: 12, fontWeight: FontWeight.w700)),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                final normalized = _normalizeUrl(controller.text);
                if (normalized == null) {
                  setDialogState(() => dialogError = 'Enter a valid http(s) URL.');
                  return;
                }
                final duplicate = accounts.any((item) =>
                    item['platform']?.toString() == platform &&
                    item != existing);
                if (duplicate) {
                  setDialogState(() => dialogError = 'This platform already has a profile.');
                  return;
                }
                Navigator.pop(dialogContext, (platform, normalized));
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    if (result == null || !mounted) return;

    final nextItem = <String, dynamic>{
      'platform': result.$1,
      'url': result.$2,
    };
    final next = [...accounts];
    if (existing == null) {
      next.add(nextItem);
    } else {
      final index = next.indexOf(existing);
      if (index >= 0) next[index] = nextItem;
    }
    await _save(next);
  }

  Future<void> _remove(Map<String, dynamic> item) async {
    final name = _platform(item['platform']?.toString() ?? '').$2;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Remove $name?'),
        content: const Text('This social link will no longer appear on your SyncChat profile.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Remove')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _save(accounts.where((account) => account != item).toList(growable: false));
  }

  Future<void> _copy(Map<String, dynamic> item) async {
    final url = item['url']?.toString() ?? '';
    if (url.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: url));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Profile link copied.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Social profiles'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(
            tooltip: 'Add social profile',
            onPressed: loading || saving ? null : () => _edit(),
            icon: const Icon(Icons.add_link_rounded),
          ),
        ],
      ),
      floatingActionButton: loading
          ? null
          : FloatingActionButton.extended(
              onPressed: saving ? null : () => _edit(),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add profile'),
            ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 100),
                children: [
                  _intro(),
                  if (error != null) ...[
                    const SizedBox(height: 12),
                    _errorCard(error!),
                  ],
                  const SizedBox(height: 14),
                  if (accounts.isEmpty)
                    _empty()
                  else
                    ...accounts.map(_accountCard),
                ],
              ),
            ),
    );
  }

  Widget _intro() => Container(
        padding: const EdgeInsets.all(15),
        decoration: BoxDecoration(
          color: SyncColors.sky.withValues(alpha: .08),
          borderRadius: BorderRadius.circular(17),
          border: Border.all(color: SyncColors.sky.withValues(alpha: .2)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.share_outlined, color: SyncColors.sky),
            const SizedBox(width: 11),
            Expanded(
              child: Text(
                'Add the public profiles you want people to discover from your SyncChat profile. Links are shared with the web client and stored in the existing profile socialAccounts field.',
                style: TextStyle(color: context.muted, height: 1.4, fontSize: 12),
              ),
            ),
          ],
        ),
      );

  Widget _accountCard(Map<String, dynamic> item) {
    final meta = _platform(item['platform']?.toString() ?? '');
    final url = item['url']?.toString() ?? '';
    return Card(
      color: context.panel,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 9),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(17),
        side: BorderSide(color: context.border),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.fromLTRB(12, 6, 4, 6),
        leading: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: SyncColors.sky.withValues(alpha: .1),
            borderRadius: BorderRadius.circular(13),
          ),
          child: Icon(meta.$3, color: SyncColors.sky),
        ),
        title: Text(meta.$2, style: const TextStyle(fontWeight: FontWeight.w900)),
        subtitle: Text(url, maxLines: 1, overflow: TextOverflow.ellipsis),
        onTap: () => _copy(item),
        trailing: PopupMenuButton<String>(
          enabled: !saving,
          onSelected: (value) {
            if (value == 'edit') _edit(existing: item);
            if (value == 'copy') _copy(item);
            if (value == 'remove') _remove(item);
          },
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'edit', child: Text('Edit')),
            PopupMenuItem(value: 'copy', child: Text('Copy link')),
            PopupMenuItem(value: 'remove', child: Text('Remove')),
          ],
        ),
      ),
    );
  }

  Widget _empty() => Padding(
        padding: const EdgeInsets.only(top: 80),
        child: Column(
          children: [
            const Icon(Icons.link_off_rounded, size: 52, color: SyncColors.sky),
            const SizedBox(height: 12),
            const Text('No social profiles yet', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            Text('Add Facebook, LinkedIn, Instagram, website, or another profile.', textAlign: TextAlign.center, style: TextStyle(color: context.muted)),
          ],
        ),
      );

  Widget _errorCard(String message) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: SyncColors.danger.withValues(alpha: .08),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Text(message, style: const TextStyle(color: SyncColors.danger, fontWeight: FontWeight.w700)),
      );

  (String, String, IconData) _platform(String key) => platforms.firstWhere(
        (item) => item.$1 == key,
        orElse: () => (key.isEmpty ? 'others' : key, key.isEmpty ? 'Other' : key, Icons.share_outlined),
      );

  static String? _normalizeUrl(String raw) {
    var value = raw.trim();
    if (value.isEmpty) return null;
    value = value.replaceFirst(RegExp(r'^(https?)//', caseSensitive: false), r'$1://');
    if (!RegExp(r'^https?://', caseSensitive: false).hasMatch(value)) {
      value = 'https://$value';
    }
    final uri = Uri.tryParse(value);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) return null;
    if (uri.scheme != 'http' && uri.scheme != 'https') return null;
    return uri.toString();
  }

  String _message(Object error) => error is ApiException
      ? error.message
      : error.toString().replaceFirst('Exception: ', '');
}
