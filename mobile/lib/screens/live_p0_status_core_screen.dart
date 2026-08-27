import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';
import '../widgets.dart';

class LiveP0StatusScreen extends StatefulWidget {
  const LiveP0StatusScreen({super.key});

  @override
  State<LiveP0StatusScreen> createState() => _LiveP0StatusScreenState();
}

class _LiveP0StatusScreenState extends State<LiveP0StatusScreen> {
  List<Map<String, dynamic>> items = const [];
  bool loading = true;
  String? error;

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
      final rows = await context.services.statuses.list();
      if (!mounted) return;
      setState(() {
        items = rows;
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

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'Status',
      actions: [
        IconButton(
          tooltip: 'Create status',
          onPressed: _createStatus,
          icon: const Icon(Icons.add_circle_outline_rounded),
        ),
        IconButton(
          tooltip: 'Refresh',
          onPressed: _load,
          icon: const Icon(Icons.refresh_rounded),
        ),
      ],
      child: loading && items.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : error != null && items.isEmpty
              ? _ErrorState(message: error!, onRetry: _load)
              : _statusList(),
    );
  }

  Widget _statusList() {
    if (items.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(top: 120),
        children: [
          const Icon(Icons.donut_large_rounded, size: 54, color: SyncColors.sky),
          const SizedBox(height: 12),
          const Center(child: Text('No active statuses.')),
          const SizedBox(height: 16),
          Center(
            child: FilledButton.icon(
              onPressed: _createStatus,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Create status'),
            ),
          ),
        ],
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(
          8,
          6,
          8,
          116 + MediaQuery.paddingOf(context).bottom,
        ),
        itemCount: items.length,
        separatorBuilder: (_, __) => Divider(height: 1, indent: 72, color: context.border),
        itemBuilder: (context, index) {
          final status = items[index];
          final profile = _profile(status);
          final mine = status['isMine'] == true;
          final name = _name(profile, mine: mine);
          final type = status['type']?.toString() ?? 'text';
          final viewCount = (status['viewCount'] as num?)?.toInt() ?? 0;
          final reactionCount = (status['reactionCount'] as num?)?.toInt() ?? 0;
          final replyCount = (status['replyCount'] as num?)?.toInt() ?? 0;

          return ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            leading: Container(
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: status['hasViewed'] == true ? context.border : SyncColors.sky,
                  width: 2,
                ),
              ),
              child: SyncAvatar(name: name, radius: 23),
            ),
            title: Row(
              children: [
                Expanded(child: Text(name, style: const TextStyle(fontWeight: FontWeight.w900))),
                if (mine)
                  const Padding(
                    padding: EdgeInsets.only(left: 6),
                    child: Text(
                      'You',
                      style: TextStyle(
                        color: SyncColors.sky,
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
              ],
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 3),
                Text(
                  type == 'text'
                      ? (status['text']?.toString() ?? 'Status update')
                      : '${type == 'video' ? 'Video' : 'Photo'} status${(status['text']?.toString() ?? '').isNotEmpty ? ' · ${status['text']}' : ''}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 3),
                Text(
                  '$viewCount views · $reactionCount reactions · $replyCount replies',
                  style: TextStyle(color: context.muted, fontSize: 11),
                ),
              ],
            ),
            trailing: mine
                ? PopupMenuButton<String>(
                    onSelected: (value) {
                      if (value == 'delete') _deleteStatus(status);
                      if (value == 'activity') _activity(status);
                    },
                    itemBuilder: (_) => const [
                      PopupMenuItem(value: 'activity', child: Text('Activity')),
                      PopupMenuItem(value: 'delete', child: Text('Delete')),
                    ],
                  )
                : const Icon(Icons.chevron_right_rounded),
            onTap: () => _viewStatus(status),
          );
        },
      ),
    );
  }

  Future<void> _createStatus() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(builder: (_) => const _StatusComposerScreen()),
    );
    if (created == true && mounted) await _load();
  }

  Future<void> _viewStatus(Map<String, dynamic> status) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(builder: (_) => _StatusViewerScreen(status: status)),
    );
    if (mounted) await _load();
  }

  Future<void> _deleteStatus(Map<String, dynamic> status) async {
    final id = status['_id']?.toString() ?? '';
    if (id.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete status?'),
        content: const Text('This status will be removed immediately.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await context.services.statuses.delete(id);
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure));
    }
  }

  Future<void> _activity(Map<String, dynamic> status) async {
    final id = status['_id']?.toString() ?? '';
    if (id.isEmpty) return;
    try {
      final activity = await context.services.statuses.activity(id);
      if (!mounted) return;
      final views = activity['views'] is List ? activity['views'] as List : const [];
      final reactions = activity['reactions'] is List ? activity['reactions'] as List : const [];
      final replies = activity['replies'] is List ? activity['replies'] as List : const [];

      await showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (sheetContext) => SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(context).height * .68,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
              children: [
                const Text('Status activity', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                const SizedBox(height: 14),
                _metricRow('Views', views.length, Icons.visibility_outlined),
                _metricRow('Reactions', reactions.length, Icons.emoji_emotions_outlined),
                _metricRow('Replies', replies.length, Icons.reply_rounded),
                if (reactions.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  const Text('Reactions', style: TextStyle(fontWeight: FontWeight.w900)),
                  ...reactions.whereType<Map>().map(
                    (item) => ListTile(
                      leading: Text(item['emoji']?.toString() ?? '❤', style: const TextStyle(fontSize: 24)),
                      title: Text(_activityName(item)),
                    ),
                  ),
                ],
                if (replies.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  const Text('Replies', style: TextStyle(fontWeight: FontWeight.w900)),
                  ...replies.whereType<Map>().map(
                    (item) => ListTile(
                      leading: const Icon(Icons.reply_rounded),
                      title: Text(_activityName(item)),
                      subtitle: Text(item['text']?.toString() ?? ''),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      );
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure));
    }
  }

  Widget _metricRow(String label, int value, IconData icon) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: SyncColors.sky),
      title: Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
      trailing: Text('$value', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
    );
  }

  void _message(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }
}

class _StatusComposerScreen extends StatefulWidget {
  const _StatusComposerScreen();

  @override
  State<_StatusComposerScreen> createState() => _StatusComposerScreenState();
}

class _StatusComposerScreenState extends State<_StatusComposerScreen> {
  final text = TextEditingController();
  final picker = ImagePicker();
  String type = 'text';
  String bgColor = '#0ea5e9';
  XFile? media;
  bool saving = false;

  static const colors = [
    '#0ea5e9',
    '#06b6d4',
    '#14b8a6',
    '#22c55e',
    '#f59e0b',
    '#ef4444',
    '#ec4899',
    '#8b5cf6',
    '#334155',
  ];

  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'Create status',
      actions: [
        TextButton(
          onPressed: saving ? null : _submit,
          child: saving
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Post'),
        ),
      ],
      child: ListView(
        padding: const EdgeInsets.fromLTRB(14, 16, 14, 30),
        children: [
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'text', label: Text('Text'), icon: Icon(Icons.text_fields_rounded)),
              ButtonSegment(value: 'photo', label: Text('Photo'), icon: Icon(Icons.photo_outlined)),
              ButtonSegment(value: 'video', label: Text('Video'), icon: Icon(Icons.videocam_outlined)),
            ],
            selected: {type},
            onSelectionChanged: saving
                ? null
                : (value) => setState(() {
                      type = value.first;
                      media = null;
                    }),
          ),
          const SizedBox(height: 16),
          if (type == 'text') ...[
            Container(
              height: 240,
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: _hexColor(bgColor),
                borderRadius: BorderRadius.circular(24),
              ),
              child: TextField(
                controller: text,
                expands: true,
                maxLines: null,
                textAlign: TextAlign.center,
                textAlignVertical: TextAlignVertical.center,
                style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800),
                decoration: const InputDecoration(
                  hintText: 'Write a status…',
                  hintStyle: TextStyle(color: Colors.white70),
                  fillColor: Colors.transparent,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                ),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 38,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: colors.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, index) {
                  final value = colors[index];
                  return InkWell(
                    customBorder: const CircleBorder(),
                    onTap: () => setState(() => bgColor = value),
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: _hexColor(value),
                        border: Border.all(
                          color: bgColor == value ? context.ink : Colors.transparent,
                          width: 2,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ] else ...[
            InkWell(
              borderRadius: BorderRadius.circular(24),
              onTap: saving ? null : _pickMedia,
              child: Container(
                height: 220,
                decoration: BoxDecoration(
                  color: context.softPanel,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: context.border),
                ),
                child: media == null
                    ? Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            type == 'video' ? Icons.video_library_outlined : Icons.add_photo_alternate_outlined,
                            size: 54,
                            color: SyncColors.sky,
                          ),
                          const SizedBox(height: 10),
                          Text(type == 'video' ? 'Choose a video' : 'Choose a photo'),
                        ],
                      )
                    : Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            type == 'video' ? Icons.play_circle_outline_rounded : Icons.image_rounded,
                            size: 54,
                            color: SyncColors.sky,
                          ),
                          const SizedBox(height: 10),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 18),
                            child: Text(
                              media!.name,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                            ),
                          ),
                          const SizedBox(height: 8),
                          const Text('Tap to change', style: TextStyle(fontSize: 12)),
                        ],
                      ),
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: text,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Caption',
                hintText: 'Add a caption or @mention…',
                prefixIcon: Icon(Icons.notes_rounded),
              ),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: saving ? null : _submit,
            icon: const Icon(Icons.send_rounded),
            label: const Text('Post status'),
          ),
        ],
      ),
    );
  }

  Future<void> _pickMedia() async {
    final picked = type == 'video'
        ? await picker.pickVideo(source: ImageSource.gallery)
        : await picker.pickImage(source: ImageSource.gallery, imageQuality: 88);
    if (picked != null && mounted) setState(() => media = picked);
  }

  Future<void> _submit() async {
    final cleanText = text.text.trim();
    if (type == 'text' && cleanText.isEmpty) {
      _message('Write something for the status.');
      return;
    }
    if (type != 'text' && media == null) {
      _message('Choose ${type == 'video' ? 'a video' : 'a photo'} first.');
      return;
    }

    setState(() => saving = true);
    try {
      String? mediaDataUrl;
      if (media != null) {
        final bytes = await media!.readAsBytes();
        final mime = media!.mimeType ?? _mimeFor(media!.name, type);
        mediaDataUrl = 'data:$mime;base64,${base64Encode(bytes)}';
      }
      await context.services.statuses.create({
        'type': type,
        'text': cleanText,
        'bgColor': bgColor,
        if (mediaDataUrl != null) 'mediaDataUrl': mediaDataUrl,
      });
      if (!mounted) return;
      Navigator.pop(context, true);
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  void _message(String value) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(value)));
  }
}

class _StatusViewerScreen extends StatefulWidget {
  const _StatusViewerScreen({required this.status});

  final Map<String, dynamic> status;

  @override
  State<_StatusViewerScreen> createState() => _StatusViewerScreenState();
}

class _StatusViewerScreenState extends State<_StatusViewerScreen> {
  final reply = TextEditingController();
  late Map<String, dynamic> status;
  bool sending = false;

  @override
  void initState() {
    super.initState();
    status = Map<String, dynamic>.from(widget.status);
    WidgetsBinding.instance.addPostFrameCallback((_) => _markViewed());
  }

  @override
  void dispose() {
    reply.dispose();
    super.dispose();
  }

  Future<void> _markViewed() async {
    final id = status['_id']?.toString() ?? '';
    if (id.isEmpty || status['isMine'] == true) return;
    try {
      await context.services.statuses.markViewed(id);
      if (mounted) setState(() => status = {...status, 'hasViewed': true});
    } on Object {
      // Viewing remains available even if the receipt fails.
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = _profile(status);
    final mine = status['isMine'] == true;
    final type = status['type']?.toString() ?? 'text';
    final text = status['text']?.toString() ?? '';
    final mediaUrl = status['mediaUrl']?.toString() ?? '';

    return SyncStandardPage(
      title: _name(profile, mine: mine),
      actions: [
        if (mine)
          IconButton(
            tooltip: 'Delete',
            onPressed: _delete,
            icon: const Icon(Icons.delete_outline_rounded),
          ),
      ],
      child: Column(
        children: [
          Expanded(
            child: Container(
              width: double.infinity,
              color: type == 'text'
                  ? _hexColor(status['bgColor']?.toString() ?? '#0ea5e9')
                  : Colors.black,
              child: Center(
                child: type == 'text'
                    ? Padding(
                        padding: const EdgeInsets.all(28),
                        child: Text(
                          text,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 25,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      )
                    : type == 'photo' && mediaUrl.isNotEmpty
                        ? InteractiveViewer(
                            child: Image.network(
                              mediaUrl,
                              fit: BoxFit.contain,
                              errorBuilder: (_, __, ___) => const Icon(
                                Icons.broken_image_outlined,
                                color: Colors.white,
                                size: 62,
                              ),
                            ),
                          )
                        : Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(
                                Icons.play_circle_outline_rounded,
                                color: Colors.white,
                                size: 76,
                              ),
                              const SizedBox(height: 12),
                              const Text(
                                'Video status',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 18,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              if (text.isNotEmpty) ...[
                                const SizedBox(height: 12),
                                Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 24),
                                  child: Text(
                                    text,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(color: Colors.white70),
                                  ),
                                ),
                              ],
                            ],
                          ),
              ),
            ),
          ),
          if (!mine) _interactionBar(),
          if (mine)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 18),
              color: context.panel,
              child: Text(
                '${status['viewCount'] ?? 0} views · ${status['reactionCount'] ?? 0} reactions · ${status['replyCount'] ?? 0} replies',
                textAlign: TextAlign.center,
                style: TextStyle(color: context.muted, fontWeight: FontWeight.w700),
              ),
            ),
        ],
      ),
    );
  }

  Widget _interactionBar() {
    const emojis = ['❤️', '👍', '😂', '😮', '😢', '🔥'];
    return Container(
      color: context.panel,
      padding: EdgeInsets.fromLTRB(
        12,
        10,
        12,
        12 + MediaQuery.paddingOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: 42,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: emojis.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, index) {
                final emoji = emojis[index];
                final active = status['myReaction']?.toString() == emoji;
                return InkWell(
                  borderRadius: BorderRadius.circular(20),
                  onTap: sending ? null : () => _react(emoji),
                  child: Container(
                    width: 42,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: active ? SyncColors.sky.withValues(alpha: .16) : context.softPanel,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: active ? SyncColors.sky : context.border),
                    ),
                    child: Text(emoji, style: const TextStyle(fontSize: 21)),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: reply,
                  enabled: !sending,
                  decoration: const InputDecoration(
                    hintText: 'Reply to status…',
                    prefixIcon: Icon(Icons.reply_rounded),
                  ),
                  onSubmitted: (_) => _sendReply(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                onPressed: sending ? null : _sendReply,
                icon: sending
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.send_rounded),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _react(String emoji) async {
    final id = status['_id']?.toString() ?? '';
    if (id.isEmpty) return;
    setState(() => sending = true);
    try {
      final patch = await context.services.statuses.react(id, emoji);
      if (!mounted) return;
      setState(() => status = {...status, ...patch});
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure));
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  Future<void> _sendReply() async {
    final value = reply.text.trim();
    final id = status['_id']?.toString() ?? '';
    if (value.isEmpty || id.isEmpty || sending) return;
    setState(() => sending = true);
    try {
      await context.services.statuses.reply(id, value);
      if (!mounted) return;
      final currentCount = (status['replyCount'] as num?)?.toInt() ?? 0;
      reply.clear();
      setState(() => status = {...status, 'replyCount': currentCount + 1});
      _message('Reply sent.');
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure));
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  Future<void> _delete() async {
    final id = status['_id']?.toString() ?? '';
    if (id.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete status?'),
        content: const Text('This status will be removed immediately.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await context.services.statuses.delete(id);
      if (!mounted) return;
      Navigator.pop(context);
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure));
    }
  }

  void _message(String value) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(value)));
  }
}

Map<String, dynamic> _profile(Map<String, dynamic> status) {
  final value = status['profile'];
  return value is Map ? Map<String, dynamic>.from(value) : const {};
}

String _name(Map<String, dynamic> profile, {required bool mine}) {
  if (mine) return 'My status';
  final fullname = profile['fullname']?.toString().trim() ?? '';
  if (fullname.isNotEmpty) return fullname;
  final username = profile['username']?.toString().trim() ?? '';
  if (username.isNotEmpty) return username;
  return 'Status';
}

String _activityName(Map item) {
  final profile = item['profile'];
  if (profile is Map) {
    return profile['fullname']?.toString() ?? profile['username']?.toString() ?? 'User';
  }
  return item['fullname']?.toString() ?? item['username']?.toString() ?? 'User';
}

Color _hexColor(String value) {
  final clean = value.replaceAll('#', '').trim();
  final parsed = int.tryParse(clean.length == 6 ? 'FF$clean' : clean, radix: 16);
  return parsed == null ? SyncColors.sky : Color(parsed);
}

String _mimeFor(String filename, String type) {
  final lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  return type == 'video' ? 'video/mp4' : 'image/jpeg';
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

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
