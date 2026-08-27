import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../core/device_integration_service.dart';
import '../theme.dart';
import '../widgets.dart';
import 'live_chat_room_screen.dart';
import 'live_groups_screen.dart';

class LiveP0ContactsScreen extends StatefulWidget {
  const LiveP0ContactsScreen({super.key});

  @override
  State<LiveP0ContactsScreen> createState() => _LiveP0ContactsScreenState();
}

class _LiveP0ContactsScreenState extends State<LiveP0ContactsScreen> {
  final search = TextEditingController();
  Timer? debounce;

  List<Map<String, dynamic>> contacts = const [];
  List<Map<String, dynamic>> results = const [];
  List<Map<String, dynamic>> labels = const [];
  List<Map<String, dynamic>> phoneRegistered = const [];
  List<Map<String, dynamic>> phoneInvite = const [];
  bool loading = true;
  bool searching = false;
  bool syncingPhone = false;
  bool sortByName = false;
  String? error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    debounce?.cancel();
    search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final values = await Future.wait<dynamic>([
        context.services.contacts.list(),
        context.services.contacts.labels(),
        context.services.api.get('/settings'),
      ]);
      final settingResponse = values[2] as ApiEnvelope;
      final settingPayload = settingResponse.payload is Map
          ? Map<String, dynamic>.from(settingResponse.payload as Map)
          : <String, dynamic>{};
      if (!mounted) return;
      setState(() {
        contacts = (values[0] as List)
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList(growable: false);
        labels = (values[1] as List)
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList(growable: false);
        sortByName = settingPayload['sortContactByName'] == true;
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

  void _onSearchChanged(String raw) {
    debounce?.cancel();
    final query = raw.trim();
    if (query.length < 2) {
      setState(() {
        results = const [];
        searching = false;
      });
      return;
    }
    debounce = Timer(const Duration(milliseconds: 300), () => _search(query));
  }

  Future<void> _search(String query) async {
    if (!mounted) return;
    setState(() => searching = true);
    try {
      final rows = await context.services.contacts.search(query);
      if (!mounted || search.text.trim() != query) return;
      setState(() {
        results = rows;
        searching = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => searching = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _toggleSort() async {
    try {
      await context.services.api.put(
        '/settings',
        body: {'sortContactByName': !sortByName},
      );
      await _load();
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  @override
  Widget build(BuildContext context) {
    final query = search.text.trim();
    final showingSearch = query.length >= 2;
    return SyncStandardPage(
      title: 'Contacts',
      actions: [
        IconButton(
          tooltip: sortByName ? 'Sort by last seen' : 'Sort by name',
          onPressed: loading ? null : _toggleSort,
          icon: Icon(sortByName ? Icons.sort_rounded : Icons.sort_by_alpha_rounded),
        ),
      ],
      child: Column(
        children: [
          Container(
            color: context.panel,
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 9),
            child: Column(
              children: [
                TextField(
                  controller: search,
                  onChanged: _onSearchChanged,
                  decoration: InputDecoration(
                    hintText: 'Search user by username, email or phone',
                    prefixIcon: const Icon(Icons.search_rounded),
                    suffixIcon: searching
                        ? const Padding(
                            padding: EdgeInsets.all(13),
                            child: SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          )
                        : query.isNotEmpty
                            ? IconButton(
                                onPressed: () {
                                  search.clear();
                                  _onSearchChanged('');
                                },
                                icon: const Icon(Icons.close_rounded),
                              )
                            : null,
                  ),
                ),
                const SizedBox(height: 7),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        searching ? 'Searching...' : '${results.length} users found',
                        style: TextStyle(fontSize: 12, color: context.muted),
                      ),
                    ),
                    TextButton.icon(
                      onPressed: syncingPhone ? null : _syncPhoneContacts,
                      icon: syncingPhone
                          ? const SizedBox.square(
                              dimension: 15,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.contact_phone_outlined, size: 18),
                      label: Text(syncingPhone ? 'Reading contacts...' : 'Sync Mobile Contacts'),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: loading && contacts.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : error != null && contacts.isEmpty
                    ? _ErrorState(message: error!, onRetry: _load)
                    : showingSearch
                        ? _searchResults()
                        : _savedContent(),
          ),
        ],
      ),
    );
  }

  Widget _savedContent() {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.only(bottom: 116 + MediaQuery.paddingOf(context).bottom),
        children: [
          if (phoneRegistered.isNotEmpty || phoneInvite.isNotEmpty) _phoneSection(),
          _labelsSection(),
          _actionTile(
            icon: Icons.group_add_outlined,
            title: 'Create a new Group',
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const LiveGroupsScreen()),
            ),
          ),
          _actionTile(
            icon: Icons.person_add_alt_1_rounded,
            title: 'New Contact',
            onTap: _addByIdentity,
          ),
          Container(
            color: context.softPanel,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    sortByName ? 'Sorted by name' : 'Sorted by last seen time',
                    style: TextStyle(fontSize: 12, color: context.muted),
                  ),
                ),
                Text('${contacts.length}', style: const TextStyle(fontWeight: FontWeight.w900)),
              ],
            ),
          ),
          if (contacts.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 72),
              child: Column(
                children: [
                  Icon(Icons.people_outline_rounded, size: 52, color: SyncColors.sky),
                  SizedBox(height: 12),
                  Text('No saved contacts yet.'),
                ],
              ),
            )
          else
            for (var index = 0; index < contacts.length; index++) _contactTile(index),
        ],
      ),
    );
  }

  Widget _contactTile(int index) {
    final contact = contacts[index];
    final profile = _profile(contact);
    final name = _profileName(profile);
    final assigned = _stringSet(contact['labels']);
    final showLetter = sortByName &&
        (index == 0 || _firstLetter(_profileName(_profile(contacts[index - 1]))) != _firstLetter(name));
    return Column(
      children: [
        if (showLetter)
          Align(
            alignment: Alignment.centerLeft,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 2),
              child: Text(_firstLetter(name), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            ),
          ),
        ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          leading: SyncAvatar(
            name: name,
            imageUrl: profile['avatar']?.toString(),
            online: profile['canSeeOnline'] != false && profile['online'] == true,
            radius: 27,
          ),
          title: Text(name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(sortByName ? _bioOrIdentity(profile) : _presenceText(profile)),
              if (assigned.isNotEmpty) ...[
                const SizedBox(height: 5),
                Wrap(
                  spacing: 5,
                  runSpacing: 4,
                  children: labels
                      .where((label) => assigned.contains(label['_id']?.toString() ?? ''))
                      .map(_labelChip)
                      .toList(growable: false),
                ),
              ],
            ],
          ),
          trailing: IconButton(
            tooltip: 'Labels',
            onPressed: () => _assignLabels(contact),
            icon: const Icon(Icons.label_outline_rounded),
          ),
          onTap: () => _openChat(
            contact['roomId']?.toString() ?? '',
            name,
          ),
        ),
        Divider(height: 1, indent: 80, color: context.border),
      ],
    );
  }

  Widget _searchResults() {
    if (searching && results.isEmpty) return const Center(child: CircularProgressIndicator());
    if (results.isEmpty) return const Center(child: Text('No users found.'));
    return ListView.separated(
      padding: EdgeInsets.only(bottom: 116 + MediaQuery.paddingOf(context).bottom),
      itemCount: results.length,
      separatorBuilder: (_, __) => Divider(height: 1, indent: 76, color: context.border),
      itemBuilder: (context, index) {
        final profile = results[index];
        final name = _profileName(profile);
        final saved = profile['isSaved'] == true;
        return ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          leading: SyncAvatar(
            name: name,
            imageUrl: profile['avatar']?.toString(),
            radius: 25,
          ),
          title: Text(name, style: const TextStyle(fontWeight: FontWeight.w900)),
          subtitle: Text(_identityLine(profile)),
          trailing: saved
              ? FilledButton(
                  onPressed: () => _openChat(profile['roomId']?.toString() ?? '', name),
                  child: const Text('Chat now'),
                )
              : FilledButton.tonal(
                  onPressed: () => _addSearchResult(profile),
                  child: const Text('Add'),
                ),
        );
      },
    );
  }

  Widget _phoneSection() {
    return Column(
      children: [
        Container(
          color: context.softPanel,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
          alignment: Alignment.centerLeft,
          child: const Text('From Phone Contacts', style: TextStyle(fontWeight: FontWeight.w800)),
        ),
        for (final item in phoneRegistered)
          ListTile(
            leading: SyncAvatar(
              name: item['contactName']?.toString() ?? _profileName(_profile(item)),
              imageUrl: _profile(item)['avatar']?.toString(),
              radius: 24,
            ),
            title: Text(item['contactName']?.toString() ?? _profileName(_profile(item))),
            subtitle: Text('@${_profile(item)['username'] ?? ''} · ${item['contactPhone'] ?? ''}'),
            trailing: FilledButton(
              onPressed: () => _openPhoneMatch(item),
              child: const Text('Chat now'),
            ),
          ),
        for (final item in phoneInvite)
          ListTile(
            leading: const CircleAvatar(child: Icon(Icons.person_outline_rounded)),
            title: Text(
              item['name']?.toString().trim().isNotEmpty == true ? item['name'].toString() : '[Unknown]',
            ),
            subtitle: Text(item['phones'] is List ? (item['phones'] as List).join(', ') : ''),
            trailing: FilledButton.tonal(
              onPressed: () => _invite(item),
              child: const Text('Invite'),
            ),
          ),
        Divider(height: 1, color: context.border),
      ],
    );
  }

  Widget _labelsSection() {
    return Column(
      children: [
        ListTile(
          title: const Text('Labels', style: TextStyle(fontWeight: FontWeight.w900)),
          subtitle: const Text('Work, family, or custom folders'),
          trailing: FilledButton.tonal(onPressed: _openLabels, child: const Text('Manage')),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: Align(
            alignment: Alignment.centerLeft,
            child: labels.isEmpty
                ? Text('No labels yet.', style: TextStyle(fontSize: 12, color: context.muted))
                : Wrap(
                    spacing: 7,
                    runSpacing: 7,
                    children: labels.map(_labelChip).toList(growable: false),
                  ),
          ),
        ),
        Divider(height: 1, color: context.border),
      ],
    );
  }

  Widget _actionTile({required IconData icon, required String title, required VoidCallback onTap}) {
    return Column(
      children: [
        ListTile(
          leading: Icon(icon),
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
          onTap: onTap,
        ),
        Divider(height: 1, color: context.border),
      ],
    );
  }

  Widget _labelChip(Map<String, dynamic> label) {
    final tone = _hexColor(label['color']?.toString() ?? '#2563eb');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: tone),
      ),
      child: Text(
        label['name']?.toString() ?? 'Label',
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: tone),
      ),
    );
  }

  Future<void> _syncPhoneContacts() async {
    if (syncingPhone) return;
    setState(() => syncingPhone = true);
    try {
      final payload = await DeviceIntegrationService.syncAddressBook(context.services.contacts);
      if (!mounted) return;
      setState(() {
        phoneRegistered = _mapList(payload['registered']);
        phoneInvite = _mapList(payload['unregistered']);
      });
      _snack('${phoneRegistered.length} SyncChat contact${phoneRegistered.length == 1 ? '' : 's'} found.');
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    } finally {
      if (mounted) setState(() => syncingPhone = false);
    }
  }

  Future<void> _invite(Map<String, dynamic> item) async {
    final rawName = item['name']?.toString().trim() ?? '';
    final name = rawName.isEmpty ? 'friend' : rawName;
    await Clipboard.setData(
      ClipboardData(text: 'Hi $name, join me on SyncChat: https://syncchat.live'),
    );
    if (mounted) _snack('Invite link copied to clipboard.');
  }

  Future<void> _openPhoneMatch(Map<String, dynamic> item) async {
    final profile = _profile(item);
    final name = item['contactName']?.toString() ?? _profileName(profile);
    if (item['isSaved'] == true) {
      await _openChat(item['roomId']?.toString() ?? '', name);
      return;
    }
    final identity = _identity(profile);
    if (identity.isEmpty) return;
    try {
      final created = await context.services.contacts.add({'identity': identity});
      if (!mounted) return;
      await _openChat(created['roomId']?.toString() ?? '', name);
      await _load();
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _openChat(String roomId, String name) async {
    if (roomId.isEmpty) return;
    try {
      final inbox = await context.services.inbox.findByRoom(roomId);
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => LiveChatRoomScreen(inbox: inbox, name: name)),
      );
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _addByIdentity() async {
    final controller = TextEditingController();
    final key = GlobalKey<FormState>();
    final identity = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('New Contact'),
        content: Form(
          key: key,
          child: TextFormField(
            controller: controller,
            autofocus: true,
            decoration: const InputDecoration(labelText: 'Username, email or phone'),
            validator: (value) => (value ?? '').trim().isEmpty ? 'Contact identity is required.' : null,
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (key.currentState?.validate() != true) return;
              Navigator.pop(dialogContext, controller.text.trim());
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (identity == null || !mounted) return;
    await _addIdentity(identity);
  }

  Future<void> _addSearchResult(Map<String, dynamic> profile) async {
    final identity = _identity(profile);
    if (identity.isNotEmpty) await _addIdentity(identity);
  }

  Future<void> _addIdentity(String identity) async {
    try {
      await context.services.contacts.add({'identity': identity});
      if (!mounted) return;
      _snack('Contact added successfully.');
      await _load();
      final query = search.text.trim();
      if (query.length >= 2 && mounted) await _search(query);
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _assignLabels(Map<String, dynamic> contact) async {
    final friendId = contact['friendId']?.toString() ?? _profile(contact)['userId']?.toString() ?? '';
    if (friendId.isEmpty) return;
    final working = _stringSet(contact['labels']);
    final result = await showDialog<List<String>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Labels'),
          content: SizedBox(
            width: double.maxFinite,
            child: labels.isEmpty
                ? const Text('No labels yet. Create one from Labels.')
                : ListView(
                    shrinkWrap: true,
                    children: labels.map((label) {
                      final id = label['_id']?.toString() ?? '';
                      return CheckboxListTile(
                        value: working.contains(id),
                        secondary: CircleAvatar(
                          radius: 6,
                          backgroundColor: _hexColor(label['color']?.toString() ?? '#2563eb'),
                        ),
                        title: Text(label['name']?.toString() ?? 'Label'),
                        onChanged: id.isEmpty
                            ? null
                            : (value) => setDialogState(() {
                                  if (value == true) {
                                    working.add(id);
                                  } else {
                                    working.remove(id);
                                  }
                                }),
                      );
                    }).toList(growable: false),
                  ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, working.toList(growable: false)),
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    if (result == null || !mounted) return;
    try {
      await context.services.contacts.updateLabels(friendId, result);
      await _load();
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _openLabels() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const _LabelsManagerScreen()),
    );
    if (mounted) await _load();
  }

  void _snack(String text) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text), behavior: SnackBarBehavior.floating),
    );
  }
}

class _LabelsManagerScreen extends StatefulWidget {
  const _LabelsManagerScreen();

  @override
  State<_LabelsManagerScreen> createState() => _LabelsManagerScreenState();
}

class _LabelsManagerScreenState extends State<_LabelsManagerScreen> {
  static const palette = <String>[
    '#2563eb',
    '#16a34a',
    '#ef4444',
    '#f59e0b',
    '#8b5cf6',
    '#0ea5e9',
    '#14b8a6',
    '#64748b',
  ];

  List<Map<String, dynamic>> labels = const [];
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final rows = await context.services.contacts.labels();
      if (!mounted) return;
      setState(() {
        labels = rows;
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
    return SyncStandardPage(
      title: 'Labels',
      actions: [
        IconButton(tooltip: 'New label', onPressed: _createLabel, icon: const Icon(Icons.add_rounded)),
      ],
      child: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null && labels.isEmpty
              ? _ErrorState(message: error!, onRetry: _load)
              : labels.isEmpty
                  ? const Center(child: Text('No labels yet.'))
                  : ListView.separated(
                      padding: const EdgeInsets.all(8),
                      itemCount: labels.length,
                      separatorBuilder: (_, __) => Divider(height: 1, indent: 62, color: context.border),
                      itemBuilder: (context, index) {
                        final label = labels[index];
                        final system = label['isSystem'] == true;
                        final tone = _hexColor(label['color']?.toString() ?? '#2563eb');
                        return ListTile(
                          leading: CircleAvatar(
                            backgroundColor: tone.withValues(alpha: .14),
                            child: Icon(Icons.label_rounded, color: tone),
                          ),
                          title: Text(label['name']?.toString() ?? 'Label', style: const TextStyle(fontWeight: FontWeight.w900)),
                          subtitle: system ? const Text('Default label') : null,
                          trailing: system
                              ? null
                              : IconButton(
                                  tooltip: 'Delete label',
                                  onPressed: () => _deleteLabel(label),
                                  icon: const Icon(Icons.close_rounded),
                                ),
                        );
                      },
                    ),
    );
  }

  Future<void> _createLabel() async {
    final controller = TextEditingController();
    var color = palette.first;
    final result = await showDialog<(String, String)>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('New label'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(controller: controller, autofocus: true, decoration: const InputDecoration(labelText: 'Label name')),
              const SizedBox(height: 14),
              const Text('Color', style: TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: palette.map((value) {
                  final selected = color == value;
                  return InkWell(
                    customBorder: const CircleBorder(),
                    onTap: () => setDialogState(() => color = value),
                    child: Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: _hexColor(value),
                        border: Border.all(color: selected ? context.ink : Colors.transparent, width: 2),
                      ),
                    ),
                  );
                }).toList(growable: false),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                final name = controller.text.trim();
                if (name.isEmpty) return;
                Navigator.pop(dialogContext, (name, color));
              },
              child: const Text('Create'),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    if (result == null || !mounted) return;
    try {
      await context.services.api.post('/contacts/labels', body: {'name': result.$1, 'color': result.$2});
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_errorText(failure))));
    }
  }

  Future<void> _deleteLabel(Map<String, dynamic> label) async {
    final id = label['_id']?.toString() ?? '';
    if (id.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete label?'),
        content: Text('Delete “${label['name'] ?? 'Label'}”?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await context.services.contacts.deleteLabel(id);
      await _load();
    } on Object catch (failure) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_errorText(failure))));
    }
  }
}

List<Map<String, dynamic>> _mapList(dynamic value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map((item) => Map<String, dynamic>.from(item))
      .toList(growable: false);
}

Map<String, dynamic> _profile(Map<String, dynamic> item) {
  final value = item['profile'];
  return value is Map ? Map<String, dynamic>.from(value) : item;
}

String _profileName(Map<String, dynamic> profile) {
  final fullname = profile['fullname']?.toString().trim() ?? '';
  if (fullname.isNotEmpty) return fullname;
  final username = profile['username']?.toString().trim() ?? '';
  if (username.isNotEmpty) return username;
  return 'Contact';
}

String _identityLine(Map<String, dynamic> profile) {
  final username = profile['username']?.toString().trim() ?? '';
  final email = profile['email']?.toString().trim() ?? '';
  final phone = profile['phone']?.toString().trim() ?? '';
  return [
    if (username.isNotEmpty) '@$username',
    if (email.isNotEmpty) email,
    if (phone.isNotEmpty) phone,
  ].join(' · ');
}

String _bioOrIdentity(Map<String, dynamic> profile) =>
    profile['bio']?.toString() ?? '';

String _presenceText(Map<String, dynamic> profile) {
  final canSeeOnline = profile['canSeeOnline'] != false;
  if (canSeeOnline && profile['online'] == true) return 'Online';

  final canSeeLastSeen = profile['canSeeLastSeen'] != false;
  final raw = profile['lastSeenAt']?.toString().trim() ?? '';
  final value = canSeeLastSeen && raw.isNotEmpty ? DateTime.tryParse(raw)?.toLocal() : null;
  if (value != null) return 'Last seen ${_relativeTime(value)}';

  return 'Privacy protected';
}

String _relativeTime(DateTime time) {
  final diff = DateTime.now().difference(time.toLocal());
  if (diff.isNegative || diff.inSeconds < 45) return 'a few seconds ago';
  if (diff.inMinutes < 2) return 'a minute ago';
  if (diff.inMinutes < 60) return '${diff.inMinutes} minutes ago';
  if (diff.inHours < 2) return 'an hour ago';
  if (diff.inHours < 24) return '${diff.inHours} hours ago';
  if (diff.inDays < 2) return 'a day ago';
  if (diff.inDays < 30) return '${diff.inDays} days ago';
  if (diff.inDays < 60) return 'a month ago';
  if (diff.inDays < 365) return '${diff.inDays ~/ 30} months ago';
  if (diff.inDays < 730) return 'a year ago';
  return '${diff.inDays ~/ 365} years ago';
}

String _identity(Map<String, dynamic> profile) {
  for (final key in ['username', 'email', 'phone']) {
    final value = profile[key]?.toString().trim() ?? '';
    if (value.isNotEmpty) return value;
  }
  return '';
}

String _firstLetter(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) return '#';
  final letter = trimmed[0].toUpperCase();
  return RegExp(r'^[A-Z]$').hasMatch(letter) ? letter : '#';
}

Set<String> _stringSet(dynamic value) {
  if (value is! List) return <String>{};
  return value.map((item) => item.toString()).where((item) => item.isNotEmpty).toSet();
}

Color _hexColor(String value) {
  final clean = value.replaceAll('#', '').trim();
  final parsed = int.tryParse(clean.length == 6 ? 'FF$clean' : clean, radix: 16);
  return parsed == null ? SyncColors.sky : Color(parsed);
}

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
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
