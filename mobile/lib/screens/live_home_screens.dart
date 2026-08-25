import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../sheets.dart';
import '../theme.dart';
import '../widgets.dart';
import 'live_chat_room_screen.dart';

class LiveChatsScreen extends StatefulWidget {
  const LiveChatsScreen({super.key, required this.onMenu});

  final VoidCallback onMenu;

  @override
  State<LiveChatsScreen> createState() => _LiveChatsScreenState();
}

class _LiveChatsScreenState extends State<LiveChatsScreen> {
  final search = TextEditingController();
  List<Map<String, dynamic>> inboxes = const [];
  List<Map<String, dynamic>> statuses = const [];
  Map<String, dynamic>? currentUser;
  String filter = 'All';
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  @override
  void dispose() {
    context.maybeServices?.realtime.off('inbox/find', _onInboxUpdate);
    context.maybeServices?.realtime.off('inbox/preferences', _onInboxUpdate);
    search.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    final realtime = context.services.realtime;
    realtime.on('inbox/find', _onInboxUpdate);
    realtime.on('inbox/preferences', _onInboxUpdate);
    await _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }
    try {
      final results = await Future.wait<dynamic>([
        context.services.chat.currentUser(),
        context.services.inbox.list(),
        context.services.statuses.list(),
      ]);
      if (!mounted) return;
      setState(() {
        currentUser = Map<String, dynamic>.from(results[0] as Map);
        inboxes = (results[1] as List)
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList(growable: false);
        statuses = (results[2] as List)
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList(growable: false);
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

  void _onInboxUpdate(dynamic data) {
    if (!mounted || data is! Map) return;
    final next = Map<String, dynamic>.from(data);
    final roomId = next['roomId']?.toString();
    if (roomId == null || roomId.isEmpty) return;
    setState(() {
      final copy = [...inboxes];
      final index = copy.indexWhere((item) => item['roomId']?.toString() == roomId);
      if (index >= 0) {
        copy[index] = next;
      } else {
        copy.insert(0, next);
      }
      copy.sort((a, b) => _contentTime(b).compareTo(_contentTime(a)));
      inboxes = copy;
    });
  }

  List<Map<String, dynamic>> get visibleInboxes {
    final q = search.text.trim().toLowerCase();
    final userId = currentUser?['_id']?.toString() ?? '';
    return inboxes.where((inbox) {
      final unread = (inbox['unreadMessage'] as num?)?.toInt() ?? 0;
      final favourite = _containsUser(inbox['favouriteBy'], userId);
      final isGroup = inbox['roomType']?.toString() == 'group';
      final matchesFilter = switch (filter) {
        'Unread' => unread > 0,
        'Favourite' => favourite,
        'Group' => isGroup,
        _ => true,
      };
      if (!matchesFilter) return false;
      if (q.isEmpty) return true;
      return _inboxName(inbox).toLowerCase().contains(q) ||
          _preview(inbox).toLowerCase().contains(q);
    }).toList(growable: false);
  }

  @override
  Widget build(BuildContext context) {
    final userId = currentUser?['_id']?.toString() ?? '';
    final unread = inboxes.fold<int>(
      0,
      (sum, item) => sum + ((item['unreadMessage'] as num?)?.toInt() ?? 0),
    );
    final favourite = inboxes.where((item) => _containsUser(item['favouriteBy'], userId)).length;
    final groups = inboxes.where((item) => item['roomType']?.toString() == 'group').length;

    return ColoredBox(
      color: context.isDark ? SyncColors.spill950 : Colors.white,
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Container(
              height: 64,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              color: context.isDark ? SyncColors.spill800 : SyncColors.slate100,
              child: Row(
                children: [
                  SyncRoundAction(icon: Icons.menu_rounded, onTap: widget.onMenu),
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: SyncColors.sky,
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: const Icon(Icons.sync_rounded, color: Colors.white, size: 20),
                  ),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text('SyncChat', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                  ),
                  SyncRoundAction(icon: Icons.refresh_rounded, onTap: _load),
                  SyncRoundAction(
                    icon: Icons.add_comment_outlined,
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(builder: (_) => const LiveContactsScreen()),
                    ),
                  ),
                ],
              ),
            ),
            Container(
              color: context.panel,
              padding: const EdgeInsets.fromLTRB(12, 9, 12, 8),
              child: Column(
                children: [
                  TextField(
                    controller: search,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(
                      hintText: 'Search chats...',
                      prefixIcon: Icon(Icons.search_rounded, size: 20),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 34,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      children: [
                        ('All', 'All'),
                        ('Unread', 'Unread ($unread)'),
                        ('Favourite', 'Favourite ($favourite)'),
                        ('Group', 'Group ($groups)'),
                      ].map((item) {
                        final active = filter == item.$1;
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text(item.$2),
                            selected: active,
                            showCheckmark: false,
                            selectedColor: SyncColors.sky600,
                            labelStyle: TextStyle(
                              color: active ? Colors.white : context.ink,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                            side: BorderSide(color: active ? SyncColors.sky600 : context.border),
                            onSelected: (_) => setState(() => filter = item.$1),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                ],
              ),
            ),
            _statusRail(),
            Divider(height: 1, color: context.border),
            Expanded(child: _chatList()),
          ],
        ),
      ),
    );
  }

  Widget _statusRail() {
    final statusItems = statuses.take(8).toList(growable: false);
    return Container(
      height: 86,
      color: context.panel,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        children: [
          const SyncStatusAvatar(name: 'You', add: true),
          ...statusItems.map(
            (status) => SyncStatusAvatar(name: _statusName(status)),
          ),
        ],
      ),
    );
  }

  Widget _chatList() {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (error != null && inboxes.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined, size: 46, color: SyncColors.sky),
              const SizedBox(height: 10),
              Text(error!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton.icon(onPressed: _load, icon: const Icon(Icons.refresh_rounded), label: const Text('Retry')),
            ],
          ),
        ),
      );
    }
    final items = visibleInboxes;
    if (items.isEmpty) {
      return const Center(child: Text('No chats found.'));
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.only(bottom: 116 + MediaQuery.paddingOf(context).bottom),
        itemCount: items.length,
        separatorBuilder: (_, __) => Divider(height: 1, indent: 76, color: context.border.withValues(alpha: .7)),
        itemBuilder: (context, index) {
          final inbox = items[index];
          final name = _inboxName(inbox);
          final count = (inbox['unreadMessage'] as num?)?.toInt() ?? 0;
          return InkWell(
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => LiveChatRoomScreen(inbox: inbox, name: name),
              ),
            ),
            onLongPress: () => _showInboxActions(inbox),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
              child: Row(
                children: [
                  SyncAvatar(name: name, online: _online(inbox)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontWeight: count > 0 ? FontWeight.w900 : FontWeight.w700),
                              ),
                            ),
                            Text(
                              _timeLabel(_contentTime(inbox)),
                              style: TextStyle(
                                fontSize: 11,
                                color: count > 0 ? SyncColors.sky : context.muted,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                _preview(inbox),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(color: context.muted, fontWeight: count > 0 ? FontWeight.w700 : FontWeight.w400),
                              ),
                            ),
                            if (count > 0)
                              Container(
                                constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
                                padding: const EdgeInsets.symmetric(horizontal: 6),
                                alignment: Alignment.center,
                                decoration: const BoxDecoration(color: SyncColors.sky, shape: BoxShape.circle),
                                child: Text('$count', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900)),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _showInboxActions(Map<String, dynamic> inbox) async {
    final roomId = inbox['roomId']?.toString() ?? '';
    if (roomId.isEmpty) return;
    final userId = currentUser?['_id']?.toString() ?? '';
    final favourite = _containsUser(inbox['favouriteBy'], userId);
    final muted = _containsUser(inbox['mutedBy'], userId);
    showSyncSheet(
      context,
      title: _inboxName(inbox),
      actions: [
        SyncSheetAction(
          label: favourite ? 'Remove favourite' : 'Favourite',
          icon: favourite ? Icons.star_rounded : Icons.star_border_rounded,
          onTap: () => _preference(roomId, 'favourite', !favourite),
        ),
        SyncSheetAction(
          label: muted ? 'Unmute notifications' : 'Mute notifications',
          icon: muted ? Icons.notifications_active_outlined : Icons.notifications_off_outlined,
          onTap: () => _preference(roomId, 'mute', !muted),
        ),
        SyncSheetAction(
          label: 'Archive',
          icon: Icons.archive_outlined,
          onTap: () => _preference(roomId, 'archive', true),
        ),
      ],
    );
  }

  Future<void> _preference(String roomId, String action, bool value) async {
    try {
      final updated = await context.services.inbox.updatePreferences(
        roomId,
        {'action': action, 'value': value},
      );
      _onInboxUpdate(updated);
    } on Object catch (failure) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_errorText(failure))));
    }
  }

  String _inboxName(Map<String, dynamic> inbox) {
    if (inbox['roomType']?.toString() == 'group') {
      final channel = inbox['channel'];
      final group = inbox['group'];
      if (channel is Map && channel['name'] != null) return channel['name'].toString();
      if (group is Map && group['name'] != null) return group['name'].toString();
      return 'Group';
    }
    final myId = currentUser?['_id']?.toString() ?? '';
    final owners = inbox['owners'];
    if (owners is List) {
      for (final owner in owners.whereType<Map>()) {
        if (owner['userId']?.toString() == myId) continue;
        return owner['fullname']?.toString() ?? owner['username']?.toString() ?? 'Contact';
      }
    }
    return 'Contact';
  }

  bool _online(Map<String, dynamic> inbox) {
    final myId = currentUser?['_id']?.toString() ?? '';
    final owners = inbox['owners'];
    if (owners is! List) return false;
    for (final owner in owners.whereType<Map>()) {
      if (owner['userId']?.toString() != myId) return owner['online'] == true;
    }
    return false;
  }
}

class LiveContactsScreen extends StatefulWidget {
  const LiveContactsScreen({super.key});

  @override
  State<LiveContactsScreen> createState() => _LiveContactsScreenState();
}

class _LiveContactsScreenState extends State<LiveContactsScreen> {
  final search = TextEditingController();
  List<Map<String, dynamic>> contacts = const [];
  List<Map<String, dynamic>> inboxes = const [];
  Map<String, dynamic>? currentUser;
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait<dynamic>([
        context.services.contacts.list(),
        context.services.inbox.list(),
        context.services.chat.currentUser(),
      ]);
      if (!mounted) return;
      setState(() {
        contacts = (results[0] as List).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList(growable: false);
        inboxes = (results[1] as List).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList(growable: false);
        currentUser = Map<String, dynamic>.from(results[2] as Map);
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
    final q = search.text.trim().toLowerCase();
    final visible = contacts.where((item) => _contactName(item).toLowerCase().contains(q)).toList(growable: false);
    return SyncStandardPage(
      title: 'Contacts',
      actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded))],
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
            child: TextField(
              controller: search,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(hintText: 'Search contacts…', prefixIcon: Icon(Icons.search_rounded)),
            ),
          ),
          Expanded(
            child: loading
                ? const Center(child: CircularProgressIndicator())
                : error != null && contacts.isEmpty
                    ? _ErrorState(message: error!, onRetry: _load)
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(8, 0, 8, 24),
                        itemCount: visible.length,
                        separatorBuilder: (_, __) => Divider(height: 1, indent: 70, color: context.border),
                        itemBuilder: (context, index) {
                          final contact = visible[index];
                          final name = _contactName(contact);
                          return ListTile(
                            leading: SyncAvatar(name: name, online: _contactOnline(contact), radius: 23),
                            title: Text(name, style: const TextStyle(fontWeight: FontWeight.w900)),
                            subtitle: Text(_contactSubtitle(contact)),
                            trailing: const Icon(Icons.chat_bubble_outline_rounded, color: SyncColors.sky),
                            onTap: () => _openContact(contact, name),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }

  void _openContact(Map<String, dynamic> contact, String name) {
    final friendId = _contactUserId(contact);
    final myId = currentUser?['_id']?.toString() ?? '';
    Map<String, dynamic>? room;
    for (final inbox in inboxes) {
      if (inbox['roomType']?.toString() != 'private') continue;
      final owners = inbox['ownersId'];
      if (owners is List && owners.map((e) => e.toString()).contains(friendId) && owners.map((e) => e.toString()).contains(myId)) {
        room = inbox;
        break;
      }
    }
    if (room == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No existing private room for this contact yet.')),
      );
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => LiveChatRoomScreen(inbox: room!, name: name)),
    );
  }
}

class LiveStatusScreen extends StatefulWidget {
  const LiveStatusScreen({super.key});

  @override
  State<LiveStatusScreen> createState() => _LiveStatusScreenState();
}

class _LiveStatusScreenState extends State<LiveStatusScreen> {
  List<Map<String, dynamic>> items = const [];
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final rows = await context.services.statuses.list();
      if (!mounted) return;
      setState(() {
        items = rows;
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
    return _LiveListPage(
      title: 'Status',
      icon: Icons.donut_large_rounded,
      loading: loading,
      error: error,
      onRefresh: _load,
      items: items,
      name: _statusName,
      subtitle: (item) => item['text']?.toString() ?? item['caption']?.toString() ?? 'Status update',
      onTap: (item) async {
        final id = item['_id']?.toString() ?? '';
        if (id.isNotEmpty) await context.services.statuses.markViewed(id);
      },
    );
  }
}

class LiveCommunitiesScreen extends StatefulWidget {
  const LiveCommunitiesScreen({super.key});

  @override
  State<LiveCommunitiesScreen> createState() => _LiveCommunitiesScreenState();
}

class _LiveCommunitiesScreenState extends State<LiveCommunitiesScreen> {
  List<Map<String, dynamic>> items = const [];
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final rows = await context.services.communities.list();
      if (!mounted) return;
      setState(() {
        items = rows;
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
  Widget build(BuildContext context) => _LiveListPage(
        title: 'Communities',
        icon: Icons.groups_2_outlined,
        loading: loading,
        error: error,
        onRefresh: _load,
        items: items,
        name: (item) => item['name']?.toString() ?? 'Community',
        subtitle: (item) => item['description']?.toString() ?? 'SyncChat community',
      );
}

class LiveChannelsScreen extends StatefulWidget {
  const LiveChannelsScreen({super.key});

  @override
  State<LiveChannelsScreen> createState() => _LiveChannelsScreenState();
}

class _LiveChannelsScreenState extends State<LiveChannelsScreen> {
  List<Map<String, dynamic>> items = const [];
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final rows = await context.services.channels.list();
      if (!mounted) return;
      setState(() {
        items = rows;
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
  Widget build(BuildContext context) => _LiveListPage(
        title: 'Channels',
        icon: Icons.podcasts_rounded,
        loading: loading,
        error: error,
        onRefresh: _load,
        items: items,
        name: (item) => item['name']?.toString() ?? 'Channel',
        subtitle: (item) => item['description']?.toString() ?? 'SyncChat channel',
      );
}

class LiveProfileScreen extends StatefulWidget {
  const LiveProfileScreen({super.key});

  @override
  State<LiveProfileScreen> createState() => _LiveProfileScreenState();
}

class _LiveProfileScreenState extends State<LiveProfileScreen> {
  Map<String, dynamic>? user;
  Map<String, dynamic>? profile;
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final current = await context.services.chat.currentUser(refresh: true);
      final id = current['_id']?.toString() ?? '';
      final details = id.isEmpty ? <String, dynamic>{} : await context.services.profile.getProfile(id);
      if (!mounted) return;
      setState(() {
        user = current;
        profile = details;
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
    final name = profile?['fullname']?.toString() ?? user?['fullname']?.toString() ?? user?['username']?.toString() ?? 'Profile';
    return SyncStandardPage(
      title: 'Profile',
      actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded))],
      child: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null && user == null
              ? _ErrorState(message: error!, onRetry: _load)
              : ListView(
                  padding: const EdgeInsets.fromLTRB(14, 24, 14, 30),
                  children: [
                    Center(child: SyncAvatar(name: name, radius: 56)),
                    const SizedBox(height: 12),
                    Center(child: Text(name, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w900))),
                    const SizedBox(height: 4),
                    Center(child: Text('@${profile?['username'] ?? user?['username'] ?? ''}', style: TextStyle(color: context.muted))),
                    const SizedBox(height: 20),
                    SyncSoftCard(
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: [
                          ListTile(leading: const Icon(Icons.info_outline_rounded), title: const Text('About'), subtitle: Text(profile?['bio']?.toString() ?? 'No bio yet.')),
                          Divider(height: 1, color: context.border),
                          ListTile(leading: const Icon(Icons.email_outlined), title: const Text('Email'), subtitle: Text(user?['email']?.toString() ?? '')),
                          Divider(height: 1, color: context.border),
                          ListTile(leading: const Icon(Icons.phone_outlined), title: const Text('Phone'), subtitle: Text(profile?['phone']?.toString() ?? '')),
                        ],
                      ),
                    ),
                  ],
                ),
    );
  }
}

class _LiveListPage extends StatelessWidget {
  const _LiveListPage({
    required this.title,
    required this.icon,
    required this.loading,
    required this.error,
    required this.onRefresh,
    required this.items,
    required this.name,
    required this.subtitle,
    this.onTap,
  });

  final String title;
  final IconData icon;
  final bool loading;
  final String? error;
  final Future<void> Function() onRefresh;
  final List<Map<String, dynamic>> items;
  final String Function(Map<String, dynamic>) name;
  final String Function(Map<String, dynamic>) subtitle;
  final Future<void> Function(Map<String, dynamic>)? onTap;

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: title,
      actions: [IconButton(onPressed: onRefresh, icon: const Icon(Icons.refresh_rounded))],
      child: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null && items.isEmpty
              ? _ErrorState(message: error!, onRetry: onRefresh)
              : RefreshIndicator(
                  onRefresh: onRefresh,
                  child: items.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: [
                            SizedBox(height: MediaQuery.sizeOf(context).height * .25),
                            Icon(icon, size: 52, color: SyncColors.sky),
                            const SizedBox(height: 10),
                            Center(child: Text('No ${title.toLowerCase()} yet.')),
                          ],
                        )
                      : ListView.separated(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(8, 6, 8, 100),
                          itemCount: items.length,
                          separatorBuilder: (_, __) => Divider(height: 1, indent: 70, color: context.border),
                          itemBuilder: (context, index) {
                            final item = items[index];
                            final label = name(item);
                            return ListTile(
                              leading: SyncAvatar(name: label, radius: 23),
                              title: Text(label, style: const TextStyle(fontWeight: FontWeight.w900)),
                              subtitle: Text(subtitle(item), maxLines: 2, overflow: TextOverflow.ellipsis),
                              trailing: const Icon(Icons.chevron_right_rounded),
                              onTap: onTap == null ? null : () => onTap!(item),
                            );
                          },
                        ),
                ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined, size: 44, color: SyncColors.sky),
              const SizedBox(height: 10),
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh_rounded), label: const Text('Retry')),
            ],
          ),
        ),
      );
}

bool _containsUser(dynamic value, String userId) {
  if (value is! List || userId.isEmpty) return false;
  return value.map((item) => item.toString()).contains(userId);
}

DateTime _contentTime(Map<String, dynamic> inbox) {
  final content = inbox['content'];
  final raw = content is Map ? content['time'] : null;
  return DateTime.tryParse(raw?.toString() ?? '') ?? DateTime.fromMillisecondsSinceEpoch(0);
}

String _preview(Map<String, dynamic> inbox) {
  final content = inbox['content'];
  if (content is Map) {
    final text = content['text']?.toString() ?? '';
    final sender = content['senderName']?.toString() ?? '';
    if (sender.isNotEmpty && inbox['roomType']?.toString() == 'group') return '$sender: $text';
    if (text.isNotEmpty) return text;
  }
  return 'No messages yet';
}

String _timeLabel(DateTime value) {
  if (value.millisecondsSinceEpoch == 0) return '';
  final local = value.toLocal();
  final now = DateTime.now();
  if (local.year == now.year && local.month == now.month && local.day == now.day) {
    final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
    return '$hour:${local.minute.toString().padLeft(2, '0')} ${local.hour >= 12 ? 'PM' : 'AM'}';
  }
  return '${local.month}/${local.day}/${local.year.toString().substring(2)}';
}

String _statusName(Map<String, dynamic> status) {
  final profile = status['profile'];
  if (profile is Map) {
    return profile['fullname']?.toString() ?? profile['username']?.toString() ?? 'Status';
  }
  return status['fullname']?.toString() ?? status['username']?.toString() ?? 'Status';
}

String _contactName(Map<String, dynamic> contact) {
  for (final key in ['friend', 'profile', 'contact']) {
    final nested = contact[key];
    if (nested is Map) {
      final value = nested['fullname'] ?? nested['username'];
      if (value != null && value.toString().isNotEmpty) return value.toString();
    }
  }
  return contact['fullname']?.toString() ?? contact['username']?.toString() ?? 'Contact';
}

String _contactUserId(Map<String, dynamic> contact) {
  for (final key in ['friendId', 'userId']) {
    final value = contact[key]?.toString() ?? '';
    if (value.isNotEmpty) return value;
  }
  for (final key in ['friend', 'profile', 'contact']) {
    final nested = contact[key];
    if (nested is Map) {
      final value = nested['userId']?.toString() ?? nested['_id']?.toString() ?? '';
      if (value.isNotEmpty) return value;
    }
  }
  return '';
}

String _contactSubtitle(Map<String, dynamic> contact) {
  for (final key in ['friend', 'profile', 'contact']) {
    final nested = contact[key];
    if (nested is Map) {
      final username = nested['username']?.toString() ?? '';
      if (username.isNotEmpty) return '@$username';
      final bio = nested['bio']?.toString() ?? '';
      if (bio.isNotEmpty) return bio;
    }
  }
  final username = contact['username']?.toString() ?? '';
  return username.isEmpty ? 'SyncChat contact' : '@$username';
}

bool _contactOnline(Map<String, dynamic> contact) {
  for (final key in ['friend', 'profile', 'contact']) {
    final nested = contact[key];
    if (nested is Map && nested['online'] == true) return true;
  }
  return contact['online'] == true;
}

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
