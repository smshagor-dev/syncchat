import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';
import '../widgets.dart';

class WebParityStatusScreen extends StatefulWidget {
  const WebParityStatusScreen({super.key});

  @override
  State<WebParityStatusScreen> createState() => _WebParityStatusScreenState();
}

class _WebParityStatusScreenState extends State<WebParityStatusScreen> {
  final _text = TextEditingController();
  final _picker = ImagePicker();

  List<Map<String, dynamic>> _statuses = const [];
  List<_MentionUser> _mentionableUsers = const [];
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String _type = 'text';
  String _bgColor = _statusColors.first;
  XFile? _media;
  Uint8List? _previewBytes;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    List<Map<String, dynamic>> rows = const [];
    List<Map<String, dynamic>> contacts = const [];
    Object? statusFailure;

    try {
      rows = await context.services.statuses.list();
    } on Object catch (failure) {
      statusFailure = failure;
    }

    try {
      contacts = await context.services.contacts.list();
    } on Object {
      // Quick mentions are optional; status browsing must remain available.
    }

    if (!mounted) return;
    setState(() {
      _statuses = rows;
      _mentionableUsers = contacts
          .map(_MentionUser.fromContact)
          .whereType<_MentionUser>()
          .take(12)
          .toList(growable: false);
      _loading = false;
      _error = statusFailure == null ? null : _errorText(statusFailure);
    });
  }

  List<_StatusGroup> get _groups {
    final byUser = <String, _StatusGroup>{};
    for (final status in _statuses) {
      final userId = status['userId']?.toString().trim() ?? '';
      if (userId.isEmpty) continue;
      final profile = _profile(status);
      final existing = byUser[userId];
      if (existing == null) {
        byUser[userId] = _StatusGroup(
          userId: userId,
          profile: profile,
          items: [status],
        );
      } else {
        existing.items.add(status);
      }
    }

    final result = byUser.values.toList(growable: false);
    for (final group in result) {
      group.items.sort((a, b) => _createdAt(b).compareTo(_createdAt(a)));
    }
    result.sort((a, b) => _createdAt(b.items.first).compareTo(_createdAt(a.items.first)));
    return result;
  }

  _StatusGroup? get _myGroup {
    for (final group in _groups) {
      if (group.items.any((item) => item['isMine'] == true)) return group;
    }
    return null;
  }

  List<_StatusGroup> get _otherGroups =>
      _groups.where((group) => !group.items.any((item) => item['isMine'] == true)).toList(growable: false);

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'Status',
      actions: [
        IconButton(
          tooltip: 'Refresh',
          onPressed: _loading ? null : _load,
          icon: const Icon(Icons.refresh_rounded),
        ),
      ],
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(
            14,
            14,
            14,
            118 + MediaQuery.paddingOf(context).bottom,
          ),
          children: [
            _composer(),
            const SizedBox(height: 18),
            if (_loading && _statuses.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 72),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null && _statuses.isEmpty)
              _errorState()
            else ...[
              _sectionLabel('My status'),
              const SizedBox(height: 8),
              if (_myGroup == null)
                _emptyLine('No story yet')
              else
                _groupTile(_myGroup!),
              const SizedBox(height: 20),
              _sectionLabel('Recent updates'),
              const SizedBox(height: 8),
              if (_otherGroups.isEmpty)
                _emptyLine('No status from your contacts yet')
              else
                ..._otherGroups.map(_groupTile),
            ],
          ],
        ),
      ),
    );
  }

  Widget _composer() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: context.isDark
              ? [SyncColors.spill800, context.panel]
              : [const Color(0xFFF0F9FF), context.panel],
        ),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: context.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Row(
            children: [
              CircleAvatar(
                backgroundColor: SyncColors.sky,
                foregroundColor: Colors.white,
                child: Icon(Icons.add_rounded),
              ),
              SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Share a status',
                      style: TextStyle(fontWeight: FontWeight.w900),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Photos, videos, and text disappear after 24 hours',
                      style: TextStyle(fontSize: 11.5),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'text', label: Text('Text')),
              ButtonSegment(value: 'photo', label: Text('Photo')),
              ButtonSegment(value: 'video', label: Text('Video')),
            ],
            selected: {_type},
            onSelectionChanged: _saving
                ? null
                : (selection) {
                    setState(() {
                      _type = selection.first;
                      _media = null;
                      _previewBytes = null;
                      _error = null;
                    });
                  },
          ),
          const SizedBox(height: 12),
          if (_type == 'text') ...[
            Container(
              decoration: BoxDecoration(
                color: _hexColor(_bgColor),
                borderRadius: BorderRadius.circular(16),
              ),
              padding: const EdgeInsets.all(8),
              child: TextField(
                controller: _text,
                minLines: 4,
                maxLines: 6,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
                decoration: const InputDecoration(
                  hintText: 'Write your status... use @username to mention',
                  hintStyle: TextStyle(color: Colors.white70),
                  filled: false,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                ),
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              'Text background',
              style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 7),
            SizedBox(
              height: 34,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _statusColors.length,
                separatorBuilder: (_, __) => const SizedBox(width: 7),
                itemBuilder: (_, index) {
                  final color = _statusColors[index];
                  return InkWell(
                    customBorder: const CircleBorder(),
                    onTap: _saving ? null : () => setState(() => _bgColor = color),
                    child: Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: _hexColor(color),
                        border: Border.all(
                          color: color == _bgColor ? context.ink : Colors.transparent,
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
              borderRadius: BorderRadius.circular(16),
              onTap: _saving ? null : _pickMedia,
              child: Container(
                height: 150,
                decoration: BoxDecoration(
                  color: context.softPanel,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: context.border),
                ),
                child: _mediaPreview(),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _text,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(
                hintText: 'Add caption... use @username to mention',
              ),
            ),
          ],
          const SizedBox(height: 12),
          const Text(
            'Quick mentions',
            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 7),
          if (_mentionableUsers.isEmpty)
            Text(
              'No contacts found for mention',
              style: TextStyle(color: context.muted, fontSize: 11.5),
            )
          else
            Wrap(
              spacing: 7,
              runSpacing: 7,
              children: [
                for (final user in _mentionableUsers)
                  ActionChip(
                    label: Text('@${user.username}'),
                    onPressed: _saving ? null : () => _appendMention(user.username),
                  ),
              ],
            ),
          if (_error != null && _statuses.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              _error!,
              style: const TextStyle(
                color: SyncColors.danger,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton.icon(
              onPressed: _saving ? null : _post,
              icon: _saving
                  ? const SizedBox.square(
                      dimension: 17,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.send_rounded),
              label: Text(_saving ? 'Posting...' : 'Post Status'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _mediaPreview() {
    if (_media == null) {
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            _type == 'video'
                ? Icons.video_library_outlined
                : Icons.add_photo_alternate_outlined,
            color: SyncColors.sky,
            size: 44,
          ),
          const SizedBox(height: 8),
          Text(_type == 'video' ? 'Select a video file' : 'Select a photo file'),
        ],
      );
    }

    if (_type == 'photo' && _previewBytes != null) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(15),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Image.memory(_previewBytes!, fit: BoxFit.cover),
            const Positioned(
              right: 8,
              bottom: 8,
              child: Chip(label: Text('Tap to change')),
            ),
          ],
        ),
      );
    }

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.play_circle_outline_rounded, color: SyncColors.sky, size: 48),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(
            _media!.name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
          ),
        ),
        const SizedBox(height: 4),
        const Text('Tap to change', style: TextStyle(fontSize: 11.5)),
      ],
    );
  }

  Widget _groupTile(_StatusGroup group) {
    final latest = group.items.first;
    final mine = latest['isMine'] == true;
    final name = mine ? _profileName(group.profile, fallback: 'My status') : _profileName(group.profile);
    final avatar = group.profile['avatar']?.toString();
    final hasUnseen = group.items.any((item) => item['hasViewed'] != true && item['isMine'] != true);

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: context.panel,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => _openGroup(group),
          child: Container(
            padding: const EdgeInsets.all(11),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: context.border),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(2),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: hasUnseen ? SyncColors.sky : context.border,
                      width: 2,
                    ),
                  ),
                  child: SyncAvatar(
                    name: name,
                    imageUrl: avatar,
                    radius: 23,
                  ),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        '${group.items.length} ${group.items.length == 1 ? 'story' : 'stories'} · ${_relativeTime(_createdAt(latest))}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: context.muted, fontSize: 11.5),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _sectionLabel(String label) => Text(
        label,
        style: TextStyle(
          color: context.muted,
          fontSize: 12,
          fontWeight: FontWeight.w800,
        ),
      );

  Widget _emptyLine(String text) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.softPanel,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text(text, style: TextStyle(color: context.muted)),
      );

  Widget _errorState() => Padding(
        padding: const EdgeInsets.symmetric(vertical: 50),
        child: Column(
          children: [
            const Icon(Icons.cloud_off_outlined, color: SyncColors.sky, size: 48),
            const SizedBox(height: 10),
            Text(_error!, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _load,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Retry'),
            ),
          ],
        ),
      );

  Future<void> _pickMedia() async {
    try {
      final picked = _type == 'video'
          ? await _picker.pickVideo(source: ImageSource.gallery)
          : await _picker.pickImage(source: ImageSource.gallery, imageQuality: 90);
      if (picked == null || !mounted) return;
      Uint8List? preview;
      if (_type == 'photo') preview = await picked.readAsBytes();
      if (!mounted) return;
      setState(() {
        _media = picked;
        _previewBytes = preview;
        _error = null;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => _error = _errorText(failure));
    }
  }

  void _appendMention(String username) {
    final current = _text.text;
    final separator = current.isEmpty || current.endsWith(' ') ? '' : ' ';
    final next = '$current$separator@$username ';
    _text.value = TextEditingValue(
      text: next,
      selection: TextSelection.collapsed(offset: next.length),
    );
  }

  Future<void> _post() async {
    if (_saving) return;
    final cleanText = _text.text.trim();
    if (_type == 'text' && cleanText.isEmpty) {
      setState(() => _error = 'Write something for text status');
      return;
    }
    if (_type != 'text' && _media == null) {
      setState(() => _error = 'Please select a media file');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      String? dataUrl;
      if (_media != null) {
        final bytes = await _media!.readAsBytes();
        final mime = _media!.mimeType ?? _mimeFor(_media!.name, _type);
        dataUrl = 'data:$mime;base64,${base64Encode(bytes)}';
      }

      final created = await context.services.statuses.create({
        'type': _type,
        'text': cleanText,
        'bgColor': _bgColor,
        'mediaDataUrl': dataUrl,
        'originalname': _media?.name ?? '',
        'mentions': _extractMentions(cleanText),
      });
      if (!mounted) return;
      setState(() {
        _statuses = [created, ..._statuses.where((row) => row['_id'] != created['_id'])];
        _text.clear();
        _media = null;
        _previewBytes = null;
        _saving = false;
        _error = null;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = _errorText(failure);
      });
    }
  }

  Future<void> _openGroup(_StatusGroup group) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => _StatusStoryViewer(group: group.copy()),
      ),
    );
    if (changed == true && mounted) await _load();
  }
}

class _StatusStoryViewer extends StatefulWidget {
  const _StatusStoryViewer({required this.group});

  final _StatusGroup group;

  @override
  State<_StatusStoryViewer> createState() => _StatusStoryViewerState();
}

class _StatusStoryViewerState extends State<_StatusStoryViewer> {
  final _reply = TextEditingController();
  late final List<Map<String, dynamic>> _items;
  int _index = 0;
  bool _busy = false;
  bool _changed = false;
  Timer? _advanceTimer;

  Map<String, dynamic> get _current => _items[_index];
  bool get _mine => _current['isMine'] == true;

  @override
  void initState() {
    super.initState();
    _items = widget.group.items.map((item) => Map<String, dynamic>.from(item)).toList();
    WidgetsBinding.instance.addPostFrameCallback((_) => _activateCurrent());
  }

  @override
  void dispose() {
    _advanceTimer?.cancel();
    _reply.dispose();
    super.dispose();
  }

  Future<void> _activateCurrent() async {
    _advanceTimer?.cancel();
    if (!mounted || _items.isEmpty) return;
    await _markViewed();
    if (!mounted) return;
    if (_current['type']?.toString() != 'video') {
      _advanceTimer = Timer(const Duration(seconds: 5), _nextOrClose);
    }
  }

  Future<void> _markViewed() async {
    if (_mine || _current['hasViewed'] == true) return;
    final id = _current['_id']?.toString() ?? '';
    if (id.isEmpty) return;
    try {
      await context.services.statuses.markViewed(id);
      if (!mounted) return;
      setState(() {
        _items[_index] = {..._current, 'hasViewed': true};
        _changed = true;
      });
    } on Object {
      // Viewing must remain available when a receipt cannot be saved.
    }
  }

  void _go(int delta) {
    if (_items.isEmpty) return;
    final next = (_index + delta).clamp(0, _items.length - 1);
    if (next == _index) return;
    setState(() => _index = next);
    _activateCurrent();
  }

  void _nextOrClose() {
    if (!mounted) return;
    if (_index >= _items.length - 1) {
      Navigator.pop(context, _changed);
    } else {
      _go(1);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = widget.group.profile;
    final name = _profileName(profile, fallback: _mine ? 'My status' : 'Status');
    final type = _current['type']?.toString() ?? 'text';
    final text = _current['text']?.toString() ?? '';
    final resolvedMedia = context.services.config.resolveMediaUrl(
      _current['mediaUrl']?.toString(),
    );

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            _viewerHeader(name),
            Expanded(
              child: Stack(
                children: [
                  Positioned.fill(
                    child: type == 'text'
                        ? _textStory(text)
                        : type == 'photo'
                            ? _photoStory(resolvedMedia, text)
                            : _StatusVideoView(
                                key: ValueKey(_current['_id']),
                                url: resolvedMedia,
                                caption: text,
                                onEnded: _nextOrClose,
                              ),
                  ),
                  Positioned.fill(
                    child: Row(
                      children: [
                        Expanded(
                          child: GestureDetector(
                            behavior: HitTestBehavior.translucent,
                            onTap: _index > 0 ? () => _go(-1) : null,
                          ),
                        ),
                        const Spacer(),
                        Expanded(
                          child: GestureDetector(
                            behavior: HitTestBehavior.translucent,
                            onTap: _index < _items.length - 1 ? () => _go(1) : null,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (_mine) _mineFooter() else _interactionFooter(),
            _navigationFooter(),
          ],
        ),
      ),
    );
  }

  Widget _viewerHeader(String name) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0x33FFFFFF))),
      ),
      child: Column(
        children: [
          Row(
            children: [
              for (var i = 0; i < _items.length; i++) ...[
                if (i > 0) const SizedBox(width: 4),
                Expanded(
                  child: Container(
                    height: 3,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(3),
                      color: i < _index
                          ? Colors.white
                          : i == _index
                              ? Colors.white.withValues(alpha: .9)
                              : Colors.white.withValues(alpha: .22),
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              SyncAvatar(
                name: name,
                imageUrl: widget.group.profile['avatar']?.toString(),
                radius: 18,
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    Text(
                      _relativeTime(_createdAt(_current)),
                      style: const TextStyle(color: Colors.white70, fontSize: 11),
                    ),
                  ],
                ),
              ),
              if (_mine) ...[
                IconButton(
                  tooltip: 'Activity',
                  onPressed: _busy ? null : _activity,
                  color: Colors.white,
                  icon: const Icon(Icons.visibility_outlined),
                ),
                IconButton(
                  tooltip: 'Delete status',
                  onPressed: _busy ? null : _deleteCurrent,
                  color: const Color(0xFFFFB4B4),
                  icon: const Icon(Icons.delete_outline_rounded),
                ),
              ],
              IconButton(
                tooltip: 'Close',
                onPressed: () => Navigator.pop(context, _changed),
                color: Colors.white,
                icon: const Icon(Icons.close_rounded),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _textStory(String text) => Container(
        alignment: Alignment.center,
        padding: const EdgeInsets.all(30),
        color: _hexColor(_current['bgColor']?.toString() ?? _statusColors.first),
        child: Text(
          text,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 24,
            fontWeight: FontWeight.w800,
          ),
        ),
      );

  Widget _photoStory(String url, String caption) => Column(
        children: [
          Expanded(
            child: Center(
              child: url.isEmpty
                  ? const Icon(Icons.broken_image_outlined, color: Colors.white, size: 64)
                  : InteractiveViewer(
                      child: Image.network(
                        url,
                        fit: BoxFit.contain,
                        errorBuilder: (_, __, ___) => const Icon(
                          Icons.broken_image_outlined,
                          color: Colors.white,
                          size: 64,
                        ),
                      ),
                    ),
            ),
          ),
          if (caption.isNotEmpty)
            Container(
              width: double.infinity,
              color: const Color(0x99000000),
              padding: const EdgeInsets.all(12),
              child: Text(caption, style: const TextStyle(color: Colors.white)),
            ),
        ],
      );

  Widget _mineFooter() => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: Color(0x33FFFFFF))),
        ),
        child: Text(
          '${_current['viewCount'] ?? 0} views · ${_current['reactionCount'] ?? 0} reactions · ${_current['replyCount'] ?? 0} replies',
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white70, fontSize: 12),
        ),
      );

  Widget _interactionFooter() {
    const emojis = ['❤️', '👍', '😂', '😮', '😢', '🔥'];
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 7, 10, 8),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: Color(0x33FFFFFF))),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: 36,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: emojis.length,
              separatorBuilder: (_, __) => const SizedBox(width: 6),
              itemBuilder: (_, index) {
                final emoji = emojis[index];
                final active = _current['myReaction']?.toString() == emoji;
                return InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap: _busy ? null : () => _react(emoji),
                  child: Container(
                    width: 38,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(18),
                      color: active
                          ? SyncColors.sky.withValues(alpha: .35)
                          : Colors.white.withValues(alpha: .10),
                      border: Border.all(
                        color: active ? SyncColors.sky : Colors.white24,
                      ),
                    ),
                    child: Text(emoji, style: const TextStyle(fontSize: 19)),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 7),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _reply,
                  enabled: !_busy,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    hintText: 'Reply to status...',
                    hintStyle: const TextStyle(color: Colors.white60),
                    filled: true,
                    fillColor: Colors.white.withValues(alpha: .10),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(18),
                      borderSide: BorderSide.none,
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(18),
                      borderSide: const BorderSide(color: Colors.white24),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(18),
                      borderSide: const BorderSide(color: SyncColors.sky),
                    ),
                  ),
                  onSubmitted: (_) => _sendReply(),
                ),
              ),
              const SizedBox(width: 7),
              IconButton.filled(
                onPressed: _busy ? null : _sendReply,
                icon: const Icon(Icons.send_rounded),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _navigationFooter() => Container(
        height: 46,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: Color(0x33FFFFFF))),
        ),
        child: Row(
          children: [
            TextButton(
              onPressed: _index > 0 ? () => _go(-1) : null,
              child: const Text('Prev'),
            ),
            Expanded(
              child: Text(
                '${_index + 1} / ${_items.length}',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70),
              ),
            ),
            TextButton(
              onPressed: _index < _items.length - 1 ? () => _go(1) : null,
              child: const Text('Next'),
            ),
          ],
        ),
      );

  Future<void> _react(String emoji) async {
    final id = _current['_id']?.toString() ?? '';
    if (id.isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      final patch = await context.services.statuses.react(id, emoji);
      if (!mounted) return;
      setState(() {
        _items[_index] = {..._current, ...patch};
        _changed = true;
      });
    } on Object catch (failure) {
      _toast(_errorText(failure));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendReply() async {
    final id = _current['_id']?.toString() ?? '';
    final text = _reply.text.trim();
    if (id.isEmpty || text.isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      final patch = await context.services.statuses.reply(id, text);
      if (!mounted) return;
      _reply.clear();
      setState(() {
        _items[_index] = {..._current, ...patch};
        _changed = true;
      });
      _toast('Reply sent.');
    } on Object catch (failure) {
      _toast(_errorText(failure));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _activity() async {
    final id = _current['_id']?.toString() ?? '';
    if (id.isEmpty || _busy) return;
    setState(() => _busy = true);
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
                const Text(
                  'Status activity',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 10),
                ListTile(
                  leading: const Icon(Icons.visibility_outlined),
                  title: const Text('Views'),
                  trailing: Text('${views.length}'),
                ),
                ListTile(
                  leading: const Icon(Icons.emoji_emotions_outlined),
                  title: const Text('Reactions'),
                  trailing: Text('${reactions.length}'),
                ),
                ListTile(
                  leading: const Icon(Icons.reply_rounded),
                  title: const Text('Replies'),
                  trailing: Text('${replies.length}'),
                ),
                if (reactions.isNotEmpty) ...[
                  const Divider(),
                  const Text('Reactions', style: TextStyle(fontWeight: FontWeight.w900)),
                  ...reactions.whereType<Map>().map(
                        (item) => ListTile(
                          leading: Text(item['emoji']?.toString() ?? '❤'),
                          title: Text(_activityName(item)),
                        ),
                      ),
                ],
                if (replies.isNotEmpty) ...[
                  const Divider(),
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
      _toast(_errorText(failure));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _deleteCurrent() async {
    final id = _current['_id']?.toString() ?? '';
    if (id.isEmpty || _busy) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete status?'),
        content: const Text('This status will be removed immediately.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _busy = true);
    try {
      await context.services.statuses.delete(id);
      if (!mounted) return;
      _advanceTimer?.cancel();
      setState(() {
        _items.removeAt(_index);
        _changed = true;
        if (_items.isNotEmpty && _index >= _items.length) _index = _items.length - 1;
      });
      if (_items.isEmpty) {
        Navigator.pop(context, true);
      } else {
        await _activateCurrent();
      }
    } on Object catch (failure) {
      _toast(_errorText(failure));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}

class _StatusVideoView extends StatefulWidget {
  const _StatusVideoView({
    super.key,
    required this.url,
    required this.caption,
    required this.onEnded,
  });

  final String url;
  final String caption;
  final VoidCallback onEnded;

  @override
  State<_StatusVideoView> createState() => _StatusVideoViewState();
}

class _StatusVideoViewState extends State<_StatusVideoView> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    final videoUrl = jsonEncode(widget.url);
    final html = '''
<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden}
video{width:100%;height:100%;object-fit:contain;background:#000}
</style>
</head>
<body>
<video id="status-video" controls autoplay playsinline></video>
<script>
const video=document.getElementById('status-video');
video.src=$videoUrl;
video.addEventListener('ended',()=>StatusVideo.postMessage('ended'));
video.play().catch(()=>{});
</script>
</body>
</html>
''';
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      ..addJavaScriptChannel(
        'StatusVideo',
        onMessageReceived: (message) {
          if (message.message == 'ended') widget.onEnded();
        },
      )
      ..loadHtmlString(html);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.url.isEmpty) {
      return const Center(
        child: Icon(Icons.video_file_outlined, color: Colors.white, size: 72),
      );
    }
    return Column(
      children: [
        Expanded(child: WebViewWidget(controller: _controller)),
        if (widget.caption.isNotEmpty)
          Container(
            width: double.infinity,
            color: const Color(0x99000000),
            padding: const EdgeInsets.all(12),
            child: Text(
              widget.caption,
              style: const TextStyle(color: Colors.white),
            ),
          ),
      ],
    );
  }
}

class _StatusGroup {
  _StatusGroup({
    required this.userId,
    required this.profile,
    required this.items,
  });

  final String userId;
  final Map<String, dynamic> profile;
  final List<Map<String, dynamic>> items;

  _StatusGroup copy() => _StatusGroup(
        userId: userId,
        profile: Map<String, dynamic>.from(profile),
        items: items.map((item) => Map<String, dynamic>.from(item)).toList(),
      );
}

class _MentionUser {
  const _MentionUser({required this.userId, required this.username});

  final String userId;
  final String username;

  static _MentionUser? fromContact(Map<String, dynamic> contact) {
    final profileRaw = contact['profile'];
    if (profileRaw is! Map) return null;
    final profile = Map<String, dynamic>.from(profileRaw);
    final userId = profile['userId']?.toString().trim() ?? '';
    final username = profile['username']?.toString().trim().toLowerCase() ?? '';
    if (userId.isEmpty || !RegExp(r'^[a-z0-9_]{3,24}$').hasMatch(username)) return null;
    return _MentionUser(userId: userId, username: username);
  }
}

const _statusColors = [
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

Map<String, dynamic> _profile(Map<String, dynamic> status) {
  final raw = status['profile'];
  return raw is Map ? Map<String, dynamic>.from(raw) : const {};
}

String _profileName(Map<String, dynamic> profile, {String fallback = 'Status'}) {
  final fullname = profile['fullname']?.toString().trim() ?? '';
  if (fullname.isNotEmpty) return fullname;
  final username = profile['username']?.toString().trim() ?? '';
  return username.isEmpty ? fallback : username;
}

DateTime _createdAt(Map<String, dynamic> status) =>
    DateTime.tryParse(status['createdAt']?.toString() ?? '') ?? DateTime.fromMillisecondsSinceEpoch(0);

String _relativeTime(DateTime time) {
  if (time.millisecondsSinceEpoch == 0) return 'recently';
  final diff = DateTime.now().difference(time.toLocal());
  if (diff.inSeconds < 60) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  return '${diff.inDays}d ago';
}

List<String> _extractMentions(String text) => RegExp(r'@[a-z0-9_]{3,24}', caseSensitive: false)
    .allMatches(text)
    .map((match) => match.group(0)!.substring(1).toLowerCase())
    .toSet()
    .toList(growable: false);

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

String _activityName(Map item) {
  final profile = item['profile'];
  if (profile is Map) {
    return profile['fullname']?.toString() ?? profile['username']?.toString() ?? 'User';
  }
  return item['fullname']?.toString() ?? item['username']?.toString() ?? 'User';
}

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
