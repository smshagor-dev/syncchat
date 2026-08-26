import 'dart:async';

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';
import '../widgets.dart';

class LiveP0ContactsScreen extends StatefulWidget {
  const LiveP0ContactsScreen({super.key});

  @override
  State<LiveP0ContactsScreen> createState() => _LiveP0ContactsScreenState();
}

class _LiveP0ContactsScreenState extends State<LiveP0ContactsScreen> {
  final search = TextEditingController();
  List<Map<String, dynamic>> contacts = const [];
  List<Map<String, dynamic>> results = const [];
  List<Map<String, dynamic>> labels = const [];
  bool loading = true;
  bool searching = false;
  String? error;
  Timer? debounce;

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
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }
    try {
      final response = await Future.wait<dynamic>([
        context.services.contacts.list(),
        context.services.contacts.labels(),
      ]);
      if (!mounted) return;
      setState(() {
        contacts = (response[0] as List)
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList(growable: false);
        labels = (response[1] as List)
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

  void _onSearchChanged(String value) {
    debounce?.cancel();
    final query = value.trim();
    if (query.length < 2) {
      setState(() {
        results = const [];
        searching = false;
      });
      return;
    }
    debounce = Timer(const Duration(milliseconds: 350), () => _search(query));
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
      _message(_errorText(failure), error: true);
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
          tooltip: 'Add contact',
          onPressed: _addByIdentity,
          icon: const Icon(Icons.person_add_alt_1_rounded),
        ),
        IconButton(
          tooltip: 'Labels',
          onPressed: _openLabels,
          icon: const Icon(Icons.label_outline_rounded),
        ),
        IconButton(
          tooltip: 'Refresh',
          onPressed: _load,
          icon: const Icon(Icons.refresh_rounded),
        ),
      ],
      child: Column(
        children: [
          Container(
            color: context.panel,
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 9),
            child: TextField(
              controller: search,
              onChanged: _onSearchChanged,
              decoration: InputDecoration(
                hintText: 'Search name, username, email or phone…',
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: searching
                    ? const Padding(
                        padding: EdgeInsets.all(13),
                        child: SizedBox(
                          width: 18,
                          height: 18,
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
          ),
          Expanded(
            child: loading && contacts.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : error != null && contacts.isEmpty
                    ? _ErrorState(message: error!, onRetry: _load)
                    : showingSearch
                        ? _searchResults()
                        : _savedContacts(),
          ),
        ],
      ),
    );
  }

  Widget _savedContacts() {
    if (contacts.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(top: 120),
        children: [
          const Icon(Icons.people_outline_rounded, size: 52, color: SyncColors.sky),
          const SizedBox(height: 12),
          const Center(child: Text('No saved contacts yet.')),
          const SizedBox(height: 16),
          Center(
            child: FilledButton.icon(
              onPressed: _addByIdentity,
              icon: const Icon(Icons.person_add_alt_1_rounded),
              label: const Text('Add contact'),
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
          4,
          8,
          116 + MediaQuery.paddingOf(context).bottom,
        ),
        itemCount: contacts.length,
        separatorBuilder: (_, __) => Divider(height: 1, indent: 72, color: context.border),
        itemBuilder: (context, index) {
          final contact = contacts[index];
          final profile = _profile(contact);
          final name = _profileName(profile);
          final assigned = _stringSet(contact['labels']);
          return ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            leading: SyncAvatar(name: name, online: profile['online'] == true, radius: 24),
            title: Text(name, style: const TextStyle(fontWeight: FontWeight.w900)),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_profileSubtitle(profile)),
                if (assigned.isNotEmpty) ...[
                  const SizedBox(height: 5),
                  Wrap(
                    spacing: 5,
                    runSpacing: 4,
                    children: labels
                        .where((label) => assigned.contains(label['_id']?.toString() ?? ''))
                        .map((label) => Container(
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                              decoration: BoxDecoration(
                                color: SyncColors.sky.withValues(alpha: .10),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(
                                label['name']?.toString() ?? 'Label',
                                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800),
                              ),
                            ))
                        .toList(growable: false),
                  ),
                ],
              ],
            ),
            trailing: IconButton(
              onPressed: () => _contactActions(contact),
              icon: const Icon(Icons.more_vert_rounded),
            ),
            onTap: () => _contactActions(contact),
          );
        },
      ),
    );
  }

  Widget _searchResults() {
    if (searching && results.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (results.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(top: 120),
        children: const [
          Icon(Icons.person_search_outlined, size: 52, color: SyncColors.sky),
          SizedBox(height: 12),
          Center(child: Text('No users found.')),
        ],
      );
    }

    return ListView.separated(
      padding: EdgeInsets.fromLTRB(8, 4, 8, 116 + MediaQuery.paddingOf(context).bottom),
      itemCount: results.length,
      separatorBuilder: (_, __) => Divider(height: 1, indent: 72, color: context.border),
      itemBuilder: (context, index) {
        final profile = results[index];
        final name = _profileName(profile);
        final saved = profile['isSaved'] == true;
        return ListTile(
          leading: SyncAvatar(name: name, online: profile['online'] == true, radius: 24),
          title: Text(name, style: const TextStyle(fontWeight: FontWeight.w900)),
          subtitle: Text(_profileSubtitle(profile)),
          trailing: saved
              ? const Chip(label: Text('Saved'))
              : FilledButton.icon(
                  onPressed: () => _addSearchResult(profile),
                  icon: const Icon(Icons.person_add_alt_1_rounded, size: 17),
                  label: const Text('Add'),
                ),
        );
      },
    );
  }

  Future<void> _addByIdentity() async {
    final controller = TextEditingController();
    final formKey = GlobalKey<FormState>();
    final identity = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Add contact'),
        content: Form(
          key: formKey,
          child: TextFormField(
            controller: controller,
            autofocus: true,
            decoration: const InputDecoration(
              labelText: 'Username, email or phone',
              prefixIcon: Icon(Icons.person_search_outlined),
            ),
            validator: (value) => (value ?? '').trim().isEmpty ? 'Contact identity is required.' : null,
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (formKey.currentState?.validate() != true) return;
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
    if (identity.isEmpty) {
      _message('This user has no addable identity.', error: true);
      return;
    }
    await _addIdentity(identity);
  }

  Future<void> _addIdentity(String identity) async {
    try {
      await context.services.contacts.add({'identity': identity});
      if (!mounted) return;
      _message('Contact added.');
      await _load();
      final query = search.text.trim();
      if (query.length >= 2 && mounted) await _search(query);
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure), error: true);
    }
  }

  Future<void> _contactActions(Map<String, dynamic> contact) async {
    final friendId = contact['friendId']?.toString() ?? _profile(contact)['userId']?.toString() ?? '';
    if (friendId.isEmpty) return;
    var blocked = false;
    try {
      final state = await context.services.contacts.blockState(friendId);
      blocked = state['youBlocked'] == true;
    } on Object {
      blocked = false;
    }
    if (!mounted) return;

    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 0, 8, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.label_outline_rounded),
                title: const Text('Manage labels', style: TextStyle(fontWeight: FontWeight.w800)),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _assignLabels(contact);
                },
              ),
              ListTile(
                leading: Icon(blocked ? Icons.lock_open_rounded : Icons.block_rounded),
                title: Text(
                  blocked ? 'Unblock contact' : 'Block contact',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _toggleBlock(friendId, blocked);
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete_outline_rounded, color: SyncColors.danger),
                title: const Text(
                  'Delete contact',
                  style: TextStyle(color: SyncColors.danger, fontWeight: FontWeight.w800),
                ),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _deleteContact(friendId, _profileName(_profile(contact)));
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _assignLabels(Map<String, dynamic> contact) async {
    final friendId = contact['friendId']?.toString() ?? _profile(contact)['userId']?.toString() ?? '';
    if (friendId.isEmpty) return;
    final selected = _stringSet(contact['labels']);
    final result = await showDialog<List<String>>(
      context: context,
      builder: (dialogContext) {
        final working = <String>{...selected};
        return StatefulBuilder(
          builder: (context, setDialogState) => AlertDialog(
            title: const Text('Contact labels'),
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
        );
      },
    );
    if (result == null || !mounted) return;
    try {
      await context.services.contacts.updateLabels(friendId, result);
      await _load();
      if (!mounted) return;
      _message('Labels updated.');
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure), error: true);
    }
  }

  Future<void> _toggleBlock(String friendId, bool blocked) async {
    try {
      if (blocked) {
        await context.services.contacts.unblock(friendId);
        _message('Contact unblocked.');
      } else {
        await context.services.contacts.block(friendId);
        _message('Contact blocked.');
      }
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure), error: true);
    }
  }

  Future<void> _deleteContact(String friendId, String name) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete contact?'),
        content: Text('Remove $name from your saved contacts?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await context.services.contacts.delete(friendId);
      await _load();
      if (!mounted) return;
      _message('Contact deleted.');
    } on Object catch (failure) {
      if (!mounted) return;
      _message(_errorText(failure), error: true);
    }
  }

  Future<void> _openLabels() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const _LabelsManagerScreen()),
    );
    if (mounted) await _load();
  }

  void _message(String text, {bool error = false}) {
    if (!mounted) return;
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
      title: 'Contact labels',
      actions: [
        IconButton(onPressed: () => _editLabel(), icon: const Icon(Icons.add_rounded)),
      ],
      child: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null && labels.isEmpty
              ? _ErrorState(message: error!, onRetry: _load)
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(8, 8, 8, 30),
                  itemCount: labels.length,
                  separatorBuilder: (_, __) => Divider(height: 1, indent: 58, color: context.border),
                  itemBuilder: (context, index) {
                    final label = labels[index];
                    final system = label['isSystem'] == true;
                    return ListTile(
                      leading: const CircleAvatar(child: Icon(Icons.label_rounded)),
                      title: Text(label['name']?.toString() ?? 'Label', style: const TextStyle(fontWeight: FontWeight.w900)),
                      subtitle: system ? const Text('Default label') : null,
                      trailing: PopupMenuButton<String>(
                        onSelected: (value) {
                          if (value == 'edit') _editLabel(label);
                          if (value == 'delete') _deleteLabel(label);
                        },
                        itemBuilder: (_) => [
                          const PopupMenuItem(value: 'edit', child: Text('Rename')),
                          if (!system) const PopupMenuItem(value: 'delete', child: Text('Delete')),
                        ],
                      ),
                    );
                  },
                ),
    );
  }

  Future<void> _editLabel([Map<String, dynamic>? label]) async {
    final controller = TextEditingController(text: label?['name']?.toString() ?? '');
    final formKey = GlobalKey<FormState>();
    final name = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(label == null ? 'Create label' : 'Rename label'),
        content: Form(
          key: formKey,
          child: TextFormField(
            controller: controller,
            autofocus: true,
            decoration: const InputDecoration(labelText: 'Label name'),
            validator: (value) => (value ?? '').trim().isEmpty ? 'Label name is required.' : null,
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (formKey.currentState?.validate() != true) return;
              Navigator.pop(dialogContext, controller.text.trim());
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (name == null || !mounted) return;
    try {
      if (label == null) {
        await context.services.contacts.createLabel(name);
      } else {
        final id = label['_id']?.toString() ?? '';
        if (id.isEmpty) return;
        await context.services.contacts.updateLabel(id, {'name': name});
      }
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

Map<String, dynamic> _profile(Map<String, dynamic> contact) {
  final value = contact['profile'];
  return value is Map ? Map<String, dynamic>.from(value) : contact;
}

String _profileName(Map<String, dynamic> profile) {
  final fullname = profile['fullname']?.toString().trim() ?? '';
  if (fullname.isNotEmpty) return fullname;
  final username = profile['username']?.toString().trim() ?? '';
  if (username.isNotEmpty) return username;
  return 'Contact';
}

String _profileSubtitle(Map<String, dynamic> profile) {
  final username = profile['username']?.toString().trim() ?? '';
  if (username.isNotEmpty) return '@$username';
  final email = profile['email']?.toString().trim() ?? '';
  if (email.isNotEmpty) return email;
  final phone = profile['phone']?.toString().trim() ?? '';
  if (phone.isNotEmpty) return phone;
  return 'SyncChat user';
}

String _identity(Map<String, dynamic> profile) {
  for (final key in ['username', 'email', 'phone']) {
    final value = profile[key]?.toString().trim() ?? '';
    if (value.isNotEmpty) return value;
  }
  return '';
}

Set<String> _stringSet(dynamic value) {
  if (value is! List) return <String>{};
  return value.map((item) => item.toString()).where((item) => item.isNotEmpty).toSet();
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
            FilledButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh_rounded), label: const Text('Retry')),
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
