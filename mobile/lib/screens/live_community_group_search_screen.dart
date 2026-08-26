import 'dart:async';

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';
import '../widgets.dart';

class LiveCommunityGroupSearchScreen extends StatefulWidget {
  const LiveCommunityGroupSearchScreen({super.key});

  @override
  State<LiveCommunityGroupSearchScreen> createState() => _LiveCommunityGroupSearchScreenState();
}

class _LiveCommunityGroupSearchScreenState extends State<LiveCommunityGroupSearchScreen> {
  final groupName = TextEditingController();
  final description = TextEditingController();
  final search = TextEditingController();
  Timer? debounce;

  List<Map<String, dynamic>> communities = const [];
  List<Map<String, dynamic>> results = const [];
  final Map<String, Map<String, dynamic>> selected = {};
  String? communityId;
  bool loading = true;
  bool searching = false;
  bool saving = false;
  String? error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    debounce?.cancel();
    groupName.dispose();
    description.dispose();
    search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final rows = await context.services.communities.list();
      if (!mounted) return;
      setState(() {
        communities = rows;
        communityId = rows.any((e) => e['_id']?.toString() == communityId)
            ? communityId
            : (rows.isEmpty ? null : rows.first['_id']?.toString());
        loading = false;
        error = null;
      });
      _suggestName();
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = _message(failure);
      });
    }
  }

  void _suggestName() {
    if (groupName.text.trim().isNotEmpty) return;
    final community = communities.cast<Map<String, dynamic>?>().firstWhere(
          (e) => e?['_id']?.toString() == communityId,
          orElse: () => null,
        );
    final base = '${community?['name'] ?? ''} Group'.trim();
    if (base.isNotEmpty) groupName.text = base.length > 32 ? base.substring(0, 32) : base;
  }

  void _queryChanged(String value) {
    debounce?.cancel();
    final q = value.trim();
    if (q.length < 2) {
      setState(() {
        results = const [];
        searching = false;
      });
      return;
    }
    debounce = Timer(const Duration(milliseconds: 320), () => _search(q));
  }

  Future<void> _search(String q) async {
    if (!mounted) return;
    setState(() => searching = true);
    try {
      final rows = await context.services.contacts.search(q);
      if (!mounted || search.text.trim() != q) return;
      setState(() {
        results = rows;
        searching = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        searching = false;
        error = _message(failure);
      });
    }
  }

  String _id(Map<String, dynamic> item) =>
      (item['userId'] ?? item['_id'] ?? item['friendId'] ?? '').toString();

  String _name(Map<String, dynamic> item) =>
      (item['fullname'] ?? item['username'] ?? item['email'] ?? item['phone'] ?? 'User').toString();

  void _toggle(Map<String, dynamic> item) {
    final id = _id(item);
    if (id.isEmpty) return;
    setState(() {
      if (selected.containsKey(id)) {
        selected.remove(id);
      } else {
        selected[id] = item;
      }
    });
  }

  Future<void> _create() async {
    final id = communityId;
    final name = groupName.text.trim();
    if (id == null || id.isEmpty) {
      setState(() => error = 'Select a community.');
      return;
    }
    if (name.length < 3 || name.length > 32) {
      setState(() => error = 'Group name must be between 3 and 32 characters.');
      return;
    }
    if (description.text.trim().length > 300) {
      setState(() => error = 'Description is too long (max 300).');
      return;
    }
    if (saving) return;
    setState(() {
      saving = true;
      error = null;
    });
    try {
      final people = selected.values.toList(growable: false);
      await context.services.communities.createGroup(id, {
        'name': name,
        'desc': description.text.trim(),
        'participantsId': people.map(_id).where((value) => value.isNotEmpty).toList(growable: false),
        'identities': people
            .expand((item) => [item['username'], item['email'], item['phone']])
            .where((value) => value != null && value.toString().trim().isNotEmpty)
            .map((value) => value.toString().trim())
            .toSet()
            .toList(growable: false),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Community group created.')));
      Navigator.pop(context, true);
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        saving = false;
        error = _message(failure);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'New community group',
      actions: [
        TextButton(
          onPressed: loading || saving ? null : _create,
          child: saving
              ? const SizedBox.square(dimension: 17, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Create'),
        ),
      ],
      child: loading
          ? const Center(child: CircularProgressIndicator())
          : communities.isEmpty
              ? const Center(child: Text('Create a community first.'))
              : ListView(
                  padding: const EdgeInsets.fromLTRB(14, 16, 14, 36),
                  children: [
                    const SyncFeatureCard(
                      icon: Icons.group_add_outlined,
                      title: 'Create a community group',
                      body: 'Search beyond saved contacts by username, email, or mobile number, then add any matching SyncChat account.',
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      initialValue: communityId,
                      decoration: const InputDecoration(labelText: 'Community', prefixIcon: Icon(Icons.groups_2_outlined)),
                      items: communities.map((item) => DropdownMenuItem(
                        value: item['_id']?.toString(),
                        child: Text(item['name']?.toString() ?? 'Community'),
                      )).toList(growable: false),
                      onChanged: saving ? null : (value) {
                        setState(() {
                          communityId = value;
                          groupName.clear();
                        });
                        _suggestName();
                      },
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: groupName,
                      maxLength: 32,
                      enabled: !saving,
                      decoration: const InputDecoration(labelText: 'Group name', prefixIcon: Icon(Icons.group_outlined)),
                    ),
                    const SizedBox(height: 4),
                    TextField(
                      controller: description,
                      maxLength: 300,
                      minLines: 2,
                      maxLines: 4,
                      enabled: !saving,
                      decoration: const InputDecoration(labelText: 'Description (optional)', prefixIcon: Icon(Icons.notes_rounded)),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: search,
                      enabled: !saving,
                      onChanged: _queryChanged,
                      decoration: InputDecoration(
                        labelText: 'Search people',
                        hintText: 'Username, email or mobile number',
                        prefixIcon: const Icon(Icons.person_search_outlined),
                        suffixIcon: searching
                            ? const Padding(
                                padding: EdgeInsets.all(13),
                                child: SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                              )
                            : null,
                      ),
                    ),
                    if (selected.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 7,
                        runSpacing: 7,
                        children: selected.values.map((item) => InputChip(
                          label: Text(_name(item)),
                          onDeleted: saving ? null : () => _toggle(item),
                        )).toList(growable: false),
                      ),
                    ],
                    if (results.isNotEmpty) ...[
                      const SizedBox(height: 14),
                      Text('Search results', style: TextStyle(color: context.muted, fontSize: 12, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 6),
                      SyncSoftCard(
                        padding: EdgeInsets.zero,
                        child: Column(
                          children: results.map((item) {
                            final id = _id(item);
                            final checked = selected.containsKey(id);
                            return CheckboxListTile(
                              value: checked,
                              secondary: SyncAvatar(name: _name(item), radius: 20),
                              title: Text(_name(item)),
                              subtitle: Text([
                                if ((item['username']?.toString() ?? '').isNotEmpty) '@${item['username']}',
                                if ((item['email']?.toString() ?? '').isNotEmpty) item['email'].toString(),
                                if ((item['phone']?.toString() ?? '').isNotEmpty) item['phone'].toString(),
                              ].join(' · ')),
                              onChanged: id.isEmpty || saving ? null : (_) => _toggle(item),
                            );
                          }).toList(growable: false),
                        ),
                      ),
                    ],
                    if (error != null) ...[
                      const SizedBox(height: 12),
                      Text(error!, style: const TextStyle(color: SyncColors.danger)),
                    ],
                    const SizedBox(height: 20),
                    FilledButton.icon(
                      onPressed: saving ? null : _create,
                      icon: const Icon(Icons.group_add_rounded),
                      label: Text(saving ? 'Creating…' : 'Create group (${selected.length} selected)'),
                    ),
                  ],
                ),
    );
  }
}

String _message(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
