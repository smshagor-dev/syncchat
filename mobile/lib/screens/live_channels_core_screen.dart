import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';
import '../widgets.dart';

class ChannelHubScreen extends StatefulWidget {
  const ChannelHubScreen({super.key});

  @override
  State<ChannelHubScreen> createState() => _ChannelHubScreenState();
}

class _ChannelHubScreenState extends State<ChannelHubScreen> {
  List<Map<String, dynamic>> channels = const [];
  bool loading = true;
  String? error;
  String filter = 'all';
  String? busyChannelId;

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
      final rows = await context.services.channels.list();
      if (!mounted) return;
      setState(() {
        channels = rows;
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

  List<Map<String, dynamic>> get visibleChannels {
    return channels.where((channel) {
      final accessType = _accessType(channel);
      final subscribed = _subscribed(channel);
      return switch (filter) {
        'public' => accessType == 'public',
        'private' => accessType == 'private',
        'subscribed' => subscribed,
        _ => true,
      };
    }).toList(growable: false);
  }

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'Channels',
      actions: [
        IconButton(
          tooltip: 'Join by invite',
          onPressed: _joinByInvite,
          icon: const Icon(Icons.link_rounded),
        ),
        IconButton(
          tooltip: 'Create channel',
          onPressed: _createChannel,
          icon: const Icon(Icons.add_rounded),
        ),
        IconButton(
          tooltip: 'Refresh',
          onPressed: _load,
          icon: const Icon(Icons.refresh_rounded),
        ),
      ],
      child: Column(
        children: [
          _filterBar(),
          Divider(height: 1, color: context.border),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _filterBar() {
    const entries = [
      ('all', 'All'),
      ('public', 'Public'),
      ('private', 'Private'),
      ('subscribed', 'Subscribed'),
    ];
    return Container(
      width: double.infinity,
      color: context.panel,
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 9),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: entries.map((entry) {
            final selected = filter == entry.$1;
            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(entry.$2),
                selected: selected,
                showCheckmark: false,
                onSelected: (_) => setState(() => filter = entry.$1),
              ),
            );
          }).toList(growable: false),
        ),
      ),
    );
  }

  Widget _body() {
    if (loading && channels.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (error != null && channels.isEmpty) {
      return _ChannelErrorState(message: error!, onRetry: _load);
    }

    final items = visibleChannels;
    if (items.isEmpty) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(top: 120),
          children: [
            const Icon(Icons.podcasts_rounded, size: 54, color: SyncColors.sky),
            const SizedBox(height: 12),
            Center(
              child: Text(
                filter == 'all'
                    ? 'No channels yet.'
                    : 'No ${filter == 'subscribed' ? 'subscribed' : filter} channels.',
              ),
            ),
            const SizedBox(height: 16),
            Center(
              child: FilledButton.icon(
                onPressed: _createChannel,
                icon: const Icon(Icons.add_rounded),
                label: const Text('Create channel'),
              ),
            ),
          ],
        ),
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
        separatorBuilder: (_, __) => Divider(
          height: 1,
          indent: 72,
          color: context.border.withValues(alpha: .7),
        ),
        itemBuilder: (context, index) => _channelTile(items[index]),
      ),
    );
  }

  Widget _channelTile(Map<String, dynamic> channel) {
    final id = channel['_id']?.toString() ?? '';
    final name = channel['name']?.toString().trim().isNotEmpty == true
        ? channel['name'].toString().trim()
        : 'Channel';
    final description = _description(channel);
    final isPrivate = _accessType(channel) == 'private';
    final subscribed = _subscribed(channel);
    final total = _subscriberCount(channel);
    final busy = busyChannelId == id;

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      leading: Stack(
        clipBehavior: Clip.none,
        children: [
          SyncAvatar(name: name, radius: 24),
          Positioned(
            right: -3,
            bottom: -3,
            child: Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isPrivate ? SyncColors.slate700 : SyncColors.sky,
                border: Border.all(color: context.panel, width: 2),
              ),
              child: Icon(
                isPrivate ? Icons.lock_rounded : Icons.public_rounded,
                color: Colors.white,
                size: 11,
              ),
            ),
          ),
        ],
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
          ),
          if (subscribed)
            Container(
              margin: const EdgeInsets.only(left: 6),
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
              decoration: BoxDecoration(
                color: SyncColors.success.withValues(alpha: .12),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text(
                'Subscribed',
                style: TextStyle(
                  color: SyncColors.success,
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
        ],
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (description.isNotEmpty)
              Text(
                description,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            const SizedBox(height: 2),
            Text(
              '${isPrivate ? 'Private' : 'Public'} · $total subscriber${total == 1 ? '' : 's'}',
              style: TextStyle(
                color: context.muted,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
      trailing: busy
          ? const SizedBox(
              width: 30,
              height: 30,
              child: Padding(
                padding: EdgeInsets.all(5),
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          : subscribed
              ? PopupMenuButton<String>(
                  onSelected: (value) {
                    if (value == 'leave') _leave(channel);
                  },
                  itemBuilder: (_) => const [
                    PopupMenuItem(
                      value: 'leave',
                      child: Row(
                        children: [
                          Icon(Icons.logout_rounded, size: 19),
                          SizedBox(width: 9),
                          Text('Leave channel'),
                        ],
                      ),
                    ),
                  ],
                )
              : SizedBox(
                  height: 36,
                  child: FilledButton(
                    onPressed: () => _subscribe(channel),
                    child: Text(isPrivate ? 'Join' : 'Subscribe'),
                  ),
                ),
      onTap: subscribed ? () => _showDetails(channel) : () => _subscribe(channel),
    );
  }

  Future<void> _createChannel() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(builder: (_) => const ChannelCreateScreen()),
    );
    if (created == true && mounted) {
      await _load();
    }
  }

  Future<void> _subscribe(Map<String, dynamic> channel) async {
    final id = channel['_id']?.toString() ?? '';
    if (id.isEmpty || busyChannelId != null) return;

    String password = '';
    if (_accessType(channel) == 'private') {
      final value = await _passwordDialog(
        title: 'Join private channel',
        body: 'Enter the channel password to join.',
      );
      if (value == null) return;
      password = value;
    }

    setState(() => busyChannelId = id);
    try {
      await context.services.channels.subscribe(id, password: password);
      if (!mounted) return;
      _message(_accessType(channel) == 'private'
          ? 'Joined channel successfully.'
          : 'Subscribed successfully.');
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure), error: true);
    } finally {
      if (mounted) setState(() => busyChannelId = null);
    }
  }

  Future<void> _leave(Map<String, dynamic> channel) async {
    final id = channel['_id']?.toString() ?? '';
    if (id.isEmpty || busyChannelId != null) return;
    final name = channel['name']?.toString() ?? 'this channel';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Leave channel?'),
        content: Text('You will stop receiving updates from $name.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Leave'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => busyChannelId = id);
    try {
      await context.services.channels.exit(id);
      if (!mounted) return;
      _message('Left channel successfully.');
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure), error: true);
    } finally {
      if (mounted) setState(() => busyChannelId = null);
    }
  }

  Future<void> _joinByInvite() async {
    final link = TextEditingController();
    final password = TextEditingController();
    final formKey = GlobalKey<FormState>();
    final result = await showDialog<(String, String)?>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Join channel'),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: link,
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'Invite link or token',
                  prefixIcon: Icon(Icons.link_rounded),
                ),
                validator: (value) =>
                    _inviteToken(value ?? '').isEmpty ? 'Invite link is required.' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: password,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Password (private channel)',
                  prefixIcon: Icon(Icons.lock_outline_rounded),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (formKey.currentState?.validate() != true) return;
              Navigator.pop(
                dialogContext,
                (_inviteToken(link.text), password.text),
              );
            },
            child: const Text('Join'),
          ),
        ],
      ),
    );
    link.dispose();
    password.dispose();
    if (result == null || !mounted) return;

    try {
      await context.services.channels.joinByLink(
        result.$1,
        password: result.$2,
      );
      if (!mounted) return;
      _message('Joined channel successfully.');
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure), error: true);
    }
  }

  Future<String?> _passwordDialog({
    required String title,
    required String body,
  }) async {
    final controller = TextEditingController();
    final formKey = GlobalKey<FormState>();
    final value = await showDialog<String?>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(body),
              const SizedBox(height: 14),
              TextFormField(
                controller: controller,
                autofocus: true,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Password',
                  prefixIcon: Icon(Icons.lock_outline_rounded),
                ),
                validator: (text) => (text ?? '').length < 4
                    ? 'Password must be at least 4 characters.'
                    : null,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (formKey.currentState?.validate() != true) return;
              Navigator.pop(dialogContext, controller.text);
            },
            child: const Text('Join'),
          ),
        ],
      ),
    );
    controller.dispose();
    return value;
  }

  Future<void> _showDetails(Map<String, dynamic> channel) async {
    final name = channel['name']?.toString() ?? 'Channel';
    final description = _description(channel);
    final isPrivate = _accessType(channel) == 'private';
    final total = _subscriberCount(channel);
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  SyncAvatar(name: name, radius: 28),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          style: const TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        Text(
                          '${isPrivate ? 'Private' : 'Public'} · $total subscriber${total == 1 ? '' : 's'}',
                          style: TextStyle(color: context.muted),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (description.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(description),
              ],
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () {
                    Navigator.pop(sheetContext);
                    _leave(channel);
                  },
                  icon: const Icon(Icons.logout_rounded),
                  label: const Text('Leave channel'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _message(String text, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(text),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}

class ChannelCreateScreen extends StatefulWidget {
  const ChannelCreateScreen({super.key});

  @override
  State<ChannelCreateScreen> createState() => _ChannelCreateScreenState();
}

class _ChannelCreateScreenState extends State<ChannelCreateScreen> {
  final formKey = GlobalKey<FormState>();
  final name = TextEditingController();
  final description = TextEditingController();
  final password = TextEditingController();
  String accessType = 'public';
  bool saving = false;
  bool obscurePassword = true;

  @override
  void dispose() {
    name.dispose();
    description.dispose();
    password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'Create channel',
      actions: [
        TextButton(
          onPressed: saving ? null : _submit,
          child: saving
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Create'),
        ),
      ],
      child: Form(
        key: formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(14, 16, 14, 32),
          children: [
            SyncFeatureCard(
              icon: Icons.podcasts_rounded,
              title: 'New channel',
              body:
                  'Create a public channel anyone can subscribe to, or a private channel protected by a password.',
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: name,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Channel name',
                prefixIcon: Icon(Icons.podcasts_rounded),
              ),
              validator: (value) => (value ?? '').trim().isEmpty
                  ? 'Channel name is required.'
                  : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: description,
              maxLength: 300,
              minLines: 3,
              maxLines: 5,
              decoration: const InputDecoration(
                labelText: 'Description',
                alignLabelWithHint: true,
                prefixIcon: Icon(Icons.notes_rounded),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Privacy',
              style: TextStyle(
                color: context.muted,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(
                  value: 'public',
                  icon: Icon(Icons.public_rounded),
                  label: Text('Public'),
                ),
                ButtonSegment(
                  value: 'private',
                  icon: Icon(Icons.lock_rounded),
                  label: Text('Private'),
                ),
              ],
              selected: {accessType},
              onSelectionChanged: saving
                  ? null
                  : (value) => setState(() {
                        accessType = value.first;
                        if (accessType == 'public') password.clear();
                      }),
            ),
            const SizedBox(height: 10),
            Text(
              accessType == 'public'
                  ? 'Public channels are discoverable and can be subscribed to directly.'
                  : 'Private channels require the password before a user can join.',
              style: TextStyle(color: context.muted, height: 1.4),
            ),
            if (accessType == 'private') ...[
              const SizedBox(height: 14),
              TextFormField(
                controller: password,
                obscureText: obscurePassword,
                decoration: InputDecoration(
                  labelText: 'Channel password',
                  prefixIcon: const Icon(Icons.lock_outline_rounded),
                  suffixIcon: IconButton(
                    onPressed: () => setState(
                      () => obscurePassword = !obscurePassword,
                    ),
                    icon: Icon(
                      obscurePassword
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                  ),
                ),
                validator: (value) => accessType == 'private' &&
                        (value ?? '').length < 4
                    ? 'Password must be at least 4 characters.'
                    : null,
              ),
            ],
            const SizedBox(height: 22),
            FilledButton.icon(
              onPressed: saving ? null : _submit,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Create channel'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (formKey.currentState?.validate() != true || saving) return;
    setState(() => saving = true);
    try {
      await context.services.channels.create(
        name: name.text,
        desc: description.text,
        accessType: accessType,
        password: password.text,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Channel created successfully.')),
      );
      Navigator.pop(context, true);
    } on Object catch (failure) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_errorText(failure))),
      );
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }
}

class _ChannelErrorState extends StatelessWidget {
  const _ChannelErrorState({required this.message, required this.onRetry});

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
            const Icon(
              Icons.cloud_off_outlined,
              size: 46,
              color: SyncColors.sky,
            ),
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

String _accessType(Map<String, dynamic> channel) =>
    channel['accessType']?.toString() == 'private' ? 'private' : 'public';

bool _subscribed(Map<String, dynamic> channel) {
  if (channel['subscribed'] == true) return true;
  return false;
}

int _subscriberCount(Map<String, dynamic> channel) {
  final total = channel['totalSubscribers'];
  if (total is num) return total.toInt();
  final participants = channel['participantsId'];
  return participants is List ? participants.length : 0;
}

String _description(Map<String, dynamic> channel) =>
    (channel['desc'] ?? channel['description'] ?? '').toString().trim();

String _inviteToken(String raw) {
  var value = raw.trim();
  if (value.isEmpty) return '';
  const marker = '/channel/+';
  final markerIndex = value.indexOf(marker);
  if (markerIndex >= 0) value = value.substring(markerIndex + marker.length);
  if (value.startsWith('+')) value = value.substring(1);
  final slashIndex = value.indexOf('/');
  if (slashIndex >= 0) value = value.substring(0, slashIndex);
  final queryIndex = value.indexOf('?');
  if (queryIndex >= 0) value = value.substring(0, queryIndex);
  return value.trim();
}

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
