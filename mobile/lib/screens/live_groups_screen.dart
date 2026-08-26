import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../core/permission_manager.dart';
import '../theme.dart';
import '../widgets.dart';
import 'live_chat_room_screen.dart';

class LiveGroupsScreen extends StatefulWidget {
  const LiveGroupsScreen({super.key});

  @override
  State<LiveGroupsScreen> createState() => _LiveGroupsScreenState();
}

class _LiveGroupsScreenState extends State<LiveGroupsScreen> {
  bool loading = true;
  String? error;
  List<Map<String, dynamic>> groups = const [];
  Map<String, dynamic>? currentUser;

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
      final results = await Future.wait<dynamic>([
        context.services.inbox.list(),
        context.services.groups.currentUser(refresh: true),
      ]);
      final inboxes = (results[0] as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .where(_isStandaloneGroup)
          .toList(growable: false);
      if (!mounted) return;
      setState(() {
        groups = inboxes;
        currentUser = Map<String, dynamic>.from(results[1] as Map);
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

  bool _isStandaloneGroup(Map<String, dynamic> inbox) {
    if (inbox['roomType']?.toString() != 'group') return false;
    if (inbox['group'] is! Map) return false;
    return inbox['channel'] is! Map;
  }

  Future<void> _createGroup() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(builder: (_) => const LiveCreateGroupScreen()),
    );
    if (created == true && mounted) await _load();
  }

  Future<void> _openInfo(Map<String, dynamic> inbox) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(builder: (_) => LiveGroupInfoScreen(inbox: inbox)),
    );
    if (changed == true && mounted) await _load();
  }

  Future<void> _openChat(Map<String, dynamic> inbox) async {
    final group = inbox['group'] is Map
        ? Map<String, dynamic>.from(inbox['group'] as Map)
        : const <String, dynamic>{};
    final name = group['name']?.toString().trim();
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LiveChatRoomScreen(
          inbox: inbox,
          name: name?.isNotEmpty == true ? name! : 'Group',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Groups'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(
            tooltip: 'Create group',
            onPressed: _createGroup,
            icon: const Icon(Icons.group_add_outlined),
          ),
          IconButton(
            tooltip: 'Refresh',
            onPressed: loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _createGroup,
        icon: const Icon(Icons.group_add_rounded),
        label: const Text('New group'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 96),
          children: [
            if (loading)
              const Padding(
                padding: EdgeInsets.only(top: 100),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (error != null)
              _StateCard(
                icon: Icons.cloud_off_outlined,
                title: 'Could not load groups',
                body: error!,
                action: FilledButton.icon(
                  onPressed: _load,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Retry'),
                ),
              )
            else if (groups.isEmpty)
              _StateCard(
                icon: Icons.groups_2_outlined,
                title: 'No groups yet',
                body: 'Create a public or private group and invite people from your SyncChat contacts.',
                action: FilledButton.icon(
                  onPressed: _createGroup,
                  icon: const Icon(Icons.group_add_rounded),
                  label: const Text('Create group'),
                ),
              )
            else ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 2, 4, 10),
                child: Text(
                  '${groups.length} group${groups.length == 1 ? '' : 's'}',
                  style: TextStyle(
                    color: context.muted,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              ...groups.map(_groupTile),
            ],
          ],
        ),
      ),
    );
  }

  Widget _groupTile(Map<String, dynamic> inbox) {
    final group = Map<String, dynamic>.from(inbox['group'] as Map);
    final name = group['name']?.toString().trim().isNotEmpty == true
        ? group['name'].toString().trim()
        : 'Group';
    final members = group['participantsId'] is List
        ? (group['participantsId'] as List).length
        : (inbox['ownersId'] is List ? (inbox['ownersId'] as List).length : 0);
    final userId = currentUser?['_id']?.toString() ?? '';
    final admin = _isAdmin(group, userId);
    final private = group['accessType']?.toString() == 'private';

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
        leading: SyncAvatar(name: name, radius: 23),
        title: Text(
          name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
        subtitle: Text(
          '$members member${members == 1 ? '' : 's'} · ${private ? 'Private' : 'Public'}${admin ? ' · Admin' : ''}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        onTap: () => _openInfo(inbox),
        trailing: IconButton(
          tooltip: 'Open chat',
          onPressed: () => _openChat(inbox),
          icon: const Icon(Icons.chat_bubble_outline_rounded),
        ),
      ),
    );
  }
}

class LiveCreateGroupScreen extends StatefulWidget {
  const LiveCreateGroupScreen({super.key});

  @override
  State<LiveCreateGroupScreen> createState() => _LiveCreateGroupScreenState();
}

class _LiveCreateGroupScreenState extends State<LiveCreateGroupScreen> {
  final name = TextEditingController();
  final desc = TextEditingController();
  final password = TextEditingController();
  final search = TextEditingController();
  final picker = ImagePicker();

  bool loadingPeople = true;
  bool searching = false;
  bool creating = false;
  String accessType = 'public';
  String? error;
  String? avatarDataUri;
  List<Map<String, dynamic>> contacts = const [];
  List<Map<String, dynamic>> searchResults = const [];
  final Map<String, Map<String, dynamic>> selected = {};
  Timer? searchTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadPeople());
  }

  @override
  void dispose() {
    searchTimer?.cancel();
    name.dispose();
    desc.dispose();
    password.dispose();
    search.dispose();
    super.dispose();
  }

  Future<void> _loadPeople() async {
    try {
      final rows = await context.services.contacts.list();
      if (!mounted) return;
      setState(() {
        contacts = _candidatesFromContacts(rows);
        loadingPeople = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loadingPeople = false;
        error = _message(failure);
      });
    }
  }

  void _onSearchChanged(String value) {
    searchTimer?.cancel();
    final query = value.trim();
    if (query.length < 2) {
      setState(() {
        searchResults = const [];
        searching = false;
      });
      return;
    }
    searchTimer = Timer(const Duration(milliseconds: 320), () => _searchRemote(query));
  }

  Future<void> _searchRemote(String query) async {
    if (!mounted) return;
    setState(() => searching = true);
    try {
      final rows = await context.services.contacts.search(query);
      if (!mounted || search.text.trim() != query) return;
      setState(() {
        searchResults = _candidatesFromSearch(rows);
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

  List<Map<String, dynamic>> get visibleCandidates {
    final base = search.text.trim().length >= 2 ? searchResults : contacts;
    return base
        .where((item) => !selected.containsKey(item['userId']?.toString()))
        .toList(growable: false);
  }

  Future<void> _pickAvatar() async {
    final allowed = await AppPermissionManager.ensurePhotos(
      context,
      reason: 'Photos permission is needed to choose a group photo.',
    );
    if (!allowed || !mounted) return;
    try {
      final image = await picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 92,
        maxWidth: 1600,
        maxHeight: 1600,
      );
      if (image == null || !mounted) return;
      final bytes = await image.readAsBytes();
      final limit = context.services.config.avatarUploadLimitMb * 1024 * 1024;
      if (bytes.length > limit) {
        setState(() => error = 'Group photo is too large. Max ${context.services.config.avatarUploadLimitMb} MB.');
        return;
      }
      final mime = _imageMime(image.name);
      setState(() {
        avatarDataUri = 'data:$mime;base64,${base64Encode(bytes)}';
        error = null;
      });
    } on Object catch (failure) {
      if (mounted) setState(() => error = _message(failure));
    }
  }

  Future<void> _create() async {
    final groupName = name.text.trim();
    final description = desc.text.trim();
    if (groupName.length < 3 || groupName.length > 32) {
      setState(() => error = 'Group name must be between 3 and 32 characters.');
      return;
    }
    if (description.length > 300) {
      setState(() => error = 'Group description is too long (max 300).');
      return;
    }
    if (accessType == 'private' && password.text.length < 4) {
      setState(() => error = 'Private group password must be at least 4 characters.');
      return;
    }

    setState(() {
      creating = true;
      error = null;
    });
    try {
      await context.services.groups.create(
        name: groupName,
        desc: description,
        accessType: accessType,
        password: password.text,
        avatarDataUri: avatarDataUri,
        participantIds: selected.keys.toList(growable: false),
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        creating = false;
        error = _message(failure);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Create group'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 36),
        children: [
          Center(
            child: InkWell(
              onTap: creating ? null : _pickAvatar,
              borderRadius: BorderRadius.circular(28),
              child: Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(28),
                  color: SyncColors.sky.withValues(alpha: .12),
                  border: Border.all(color: context.border),
                ),
                clipBehavior: Clip.antiAlias,
                child: avatarDataUri == null
                    ? const Icon(Icons.add_a_photo_outlined, color: SyncColors.sky, size: 34)
                    : Image.memory(base64Decode(avatarDataUri!.split(',').last), fit: BoxFit.cover),
              ),
            ),
          ),
          const SizedBox(height: 18),
          TextField(
            controller: name,
            enabled: !creating,
            maxLength: 32,
            decoration: const InputDecoration(
              labelText: 'Group name',
              prefixIcon: Icon(Icons.groups_2_outlined),
              hintText: 'Team, Family, Project…',
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: desc,
            enabled: !creating,
            maxLength: 300,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Description',
              prefixIcon: Icon(Icons.notes_rounded),
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'public', label: Text('Public'), icon: Icon(Icons.public_rounded)),
              ButtonSegment(value: 'private', label: Text('Private'), icon: Icon(Icons.lock_outline_rounded)),
            ],
            selected: {accessType},
            onSelectionChanged: creating
                ? null
                : (value) => setState(() {
                    accessType = value.first;
                    if (accessType == 'public') password.clear();
                  }),
          ),
          if (accessType == 'private') ...[
            const SizedBox(height: 12),
            TextField(
              controller: password,
              enabled: !creating,
              obscureText: true,
              maxLength: 64,
              decoration: const InputDecoration(
                labelText: 'Private group password',
                prefixIcon: Icon(Icons.password_rounded),
              ),
            ),
          ],
          const SizedBox(height: 22),
          Row(
            children: [
              const Expanded(
                child: Text('Members', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
              ),
              Text('${selected.length} selected', style: TextStyle(color: context.muted, fontWeight: FontWeight.w700)),
            ],
          ),
          if (selected.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 7,
              runSpacing: 7,
              children: selected.values.map((item) {
                final id = item['userId']?.toString() ?? '';
                return InputChip(
                  avatar: CircleAvatar(child: Text(_initial(_personName(item)))),
                  label: Text(_personName(item)),
                  onDeleted: creating ? null : () => setState(() => selected.remove(id)),
                );
              }).toList(),
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: search,
            enabled: !creating,
            onChanged: _onSearchChanged,
            decoration: InputDecoration(
              hintText: 'Search username, email or phone…',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: searching
                  ? const Padding(
                      padding: EdgeInsets.all(13),
                      child: SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                    )
                  : null,
            ),
          ),
          const SizedBox(height: 8),
          if (loadingPeople)
            const Center(child: Padding(padding: EdgeInsets.all(18), child: CircularProgressIndicator()))
          else if (visibleCandidates.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 18),
              child: Text(
                search.text.trim().length >= 2 ? 'No matching SyncChat users.' : 'No additional saved contacts.',
                textAlign: TextAlign.center,
                style: TextStyle(color: context.muted),
              ),
            )
          else
            ...visibleCandidates.take(30).map((person) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: SyncAvatar(name: _personName(person), radius: 20),
                  title: Text(_personName(person), style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text(_personSubtitle(person)),
                  trailing: IconButton(
                    tooltip: 'Add member',
                    onPressed: creating
                        ? null
                        : () {
                            final id = person['userId']?.toString() ?? '';
                            if (id.isEmpty) return;
                            setState(() => selected[id] = person);
                          },
                    icon: const Icon(Icons.add_circle_outline_rounded),
                  ),
                )),
          if (error != null) ...[
            const SizedBox(height: 12),
            _ErrorBox(error!),
          ],
          const SizedBox(height: 22),
          FilledButton.icon(
            onPressed: creating ? null : _create,
            icon: creating
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.group_add_rounded),
            label: Text(creating ? 'Creating…' : 'Create group'),
          ),
        ],
      ),
    );
  }
}

class LiveGroupInfoScreen extends StatefulWidget {
  const LiveGroupInfoScreen({super.key, required this.inbox});

  final Map<String, dynamic> inbox;

  @override
  State<LiveGroupInfoScreen> createState() => _LiveGroupInfoScreenState();
}

class _LiveGroupInfoScreenState extends State<LiveGroupInfoScreen> {
  final picker = ImagePicker();
  late Map<String, dynamic> inbox;
  Map<String, dynamic>? group;
  Map<String, dynamic>? currentUser;
  List<Map<String, dynamic>> participants = const [];
  List<Map<String, dynamic>> pending = const [];
  bool loading = true;
  bool busy = false;
  String? error;

  String get groupId {
    final value = group ?? (inbox['group'] is Map ? Map<String, dynamic>.from(inbox['group'] as Map) : const <String, dynamic>{});
    return value['_id']?.toString() ?? '';
  }

  String get roomId => group?['roomId']?.toString() ?? inbox['roomId']?.toString() ?? '';
  String get userId => currentUser?['_id']?.toString() ?? '';
  bool get admin => group != null && _isAdmin(group!, userId);

  Map<String, dynamic> get permissions {
    final raw = group?['permissions'];
    return {
      'memberCanEditInfo': raw is Map && raw['memberCanEditInfo'] == true,
      'memberCanSendMessage': raw is! Map || raw['memberCanSendMessage'] != false,
      'memberCanAddMember': raw is Map && raw['memberCanAddMember'] == true,
      'memberCanInviteViaLink': raw is Map && raw['memberCanInviteViaLink'] == true,
      'adminApprovalRequired': raw is Map && raw['adminApprovalRequired'] == true,
    };
  }

  bool get canEditInfo => admin || permissions['memberCanEditInfo'] == true;
  bool get canAddMember => admin || permissions['memberCanAddMember'] == true;

  @override
  void initState() {
    super.initState();
    inbox = Map<String, dynamic>.from(widget.inbox);
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final initial = inbox['group'];
    final id = groupId.isNotEmpty
        ? groupId
        : initial is Map
            ? initial['_id']?.toString() ?? ''
            : '';
    if (id.isEmpty) {
      setState(() {
        loading = false;
        error = 'Group ID is missing from this conversation.';
      });
      return;
    }

    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }
    try {
      final results = await Future.wait<dynamic>([
        context.services.groups.find(id),
        context.services.groups.participants(id),
        context.services.groups.currentUser(refresh: true),
      ]);
      final nextGroup = Map<String, dynamic>.from(results[0] as Map);
      final nextUser = Map<String, dynamic>.from(results[2] as Map);
      final isAdmin = _isAdmin(nextGroup, nextUser['_id']?.toString() ?? '');
      List<Map<String, dynamic>> nextPending = const [];
      if (isAdmin) {
        nextPending = await context.services.groups.pendingMembers(id);
      }
      if (!mounted) return;
      setState(() {
        group = nextGroup;
        currentUser = nextUser;
        participants = (results[1] as List)
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList(growable: false);
        pending = nextPending;
        inbox = {...inbox, 'group': nextGroup};
        loading = false;
        busy = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        busy = false;
        error = _message(failure);
      });
    }
  }

  Future<void> _editInfo() async {
    final source = group;
    if (source == null || !canEditInfo) return;
    final name = TextEditingController(text: source['name']?.toString() ?? '');
    final desc = TextEditingController(text: source['desc']?.toString() ?? '');
    final save = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Edit group info'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: name, maxLength: 32, decoration: const InputDecoration(labelText: 'Group name')),
              const SizedBox(height: 10),
              TextField(controller: desc, maxLength: 300, minLines: 2, maxLines: 5, decoration: const InputDecoration(labelText: 'Description')),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Save')),
        ],
      ),
    );
    if (save != true || !mounted) {
      name.dispose();
      desc.dispose();
      return;
    }
    final nextName = name.text.trim();
    final nextDesc = desc.text.trim();
    name.dispose();
    desc.dispose();
    if (nextName.isEmpty || nextDesc.length > 300) {
      _snack(nextName.isEmpty ? 'Group name is required.' : 'Description is too long.');
      return;
    }
    await _run(() async {
      await context.services.groups.edit(groupId: groupId, name: nextName, desc: nextDesc);
      await _load();
    }, success: 'Group info updated.');
  }

  Future<void> _changeAvatar() async {
    if (!admin) return;
    final allowed = await AppPermissionManager.ensurePhotos(
      context,
      reason: 'Photos permission is needed to choose a new group photo.',
    );
    if (!allowed || !mounted) return;
    final image = await picker.pickImage(source: ImageSource.gallery, imageQuality: 92, maxWidth: 1600, maxHeight: 1600);
    if (image == null || !mounted) return;
    final bytes = await image.readAsBytes();
    final limit = context.services.config.avatarUploadLimitMb * 1024 * 1024;
    if (bytes.length > limit) {
      _snack('Group photo is too large. Max ${context.services.config.avatarUploadLimitMb} MB.');
      return;
    }
    final dataUri = 'data:${_imageMime(image.name)};base64,${base64Encode(bytes)}';
    await _run(() async {
      await context.services.groups.uploadAvatar(groupId, dataUri);
      await _load();
    }, success: 'Group photo updated.');
  }

  Future<void> _privacy() async {
    if (!admin || group == null) return;
    var nextType = group!['accessType']?.toString() == 'private' ? 'private' : 'public';
    final password = TextEditingController();
    final save = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Group privacy'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'public', label: Text('Public')),
                  ButtonSegment(value: 'private', label: Text('Private')),
                ],
                selected: {nextType},
                onSelectionChanged: (value) => setDialogState(() => nextType = value.first),
              ),
              if (nextType == 'private') ...[
                const SizedBox(height: 14),
                TextField(
                  controller: password,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Set private password'),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Update')),
          ],
        ),
      ),
    );
    final secret = password.text;
    password.dispose();
    if (save != true || !mounted) return;
    if (nextType == 'private' && secret.length < 4) {
      _snack('Private group password must be at least 4 characters.');
      return;
    }
    await _run(() async {
      await context.services.groups.updatePrivacy(groupId, accessType: nextType, password: secret);
      await _load();
    }, success: 'Group privacy updated.');
  }

  Future<void> _changePassword() async {
    if (!admin || group?['accessType']?.toString() != 'private') return;
    final oldPassword = TextEditingController();
    final newPassword = TextEditingController();
    final save = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Change group password'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: oldPassword, obscureText: true, decoration: const InputDecoration(labelText: 'Current password')),
            const SizedBox(height: 12),
            TextField(controller: newPassword, obscureText: true, decoration: const InputDecoration(labelText: 'New password')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Change')),
        ],
      ),
    );
    final oldValue = oldPassword.text;
    final newValue = newPassword.text;
    oldPassword.dispose();
    newPassword.dispose();
    if (save != true || !mounted) return;
    if (newValue.length < 4) {
      _snack('New password must be at least 4 characters.');
      return;
    }
    await _run(() async {
      await context.services.groups.updatePassword(groupId, oldPassword: oldValue, newPassword: newValue);
    }, success: 'Group password updated.');
  }

  Future<void> _editPermissions() async {
    if (!admin) return;
    final form = Map<String, dynamic>.from(permissions);
    final save = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) {
          Widget toggle(String key, String title, String subtitle) => SwitchListTile(
                value: form[key] == true,
                title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
                subtitle: Text(subtitle),
                onChanged: (value) => setSheetState(() => form[key] = value),
              );
          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('Group permissions', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
                  ),
                  toggle('memberCanEditInfo', 'Edit group info', 'Members can edit the group name and description.'),
                  toggle('memberCanSendMessage', 'Send messages', 'Members can send messages in this group.'),
                  toggle('memberCanAddMember', 'Add members', 'Members can add other people directly.'),
                  toggle('memberCanInviteViaLink', 'Invite via link', 'Members can use the group invite link.'),
                  toggle('adminApprovalRequired', 'Admin approval required', 'Invite-link joins wait for an admin decision.'),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(onPressed: () => Navigator.pop(sheetContext, true), child: const Text('Save permissions')),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    if (save != true || !mounted) return;
    await _run(() async {
      await context.services.groups.updatePermissions(groupId, form);
      await _load();
    }, success: 'Group permissions updated.');
  }

  Future<void> _editModeration() async {
    if (!admin) return;
    final raw = group?['moderation'];
    final source = raw is Map ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
    var slowMode = (source['slowModeSeconds'] as num?)?.toInt() ?? 0;
    final bannedWords = TextEditingController(
      text: source['bannedWords'] is List ? (source['bannedWords'] as List).join(', ') : '',
    );
    final blocked = source['blockedMediaTypes'] is List
        ? (source['blockedMediaTypes'] as List).map((item) => item.toString()).toSet()
        : <String>{};
    var autoReport = source['autoReportViolations'] != false;

    final save = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => SafeArea(
          child: Padding(
            padding: EdgeInsets.fromLTRB(18, 0, 18, MediaQuery.viewInsetsOf(context).bottom + 18),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Moderation', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 14),
                  DropdownButtonFormField<int>(
                    initialValue: slowMode,
                    decoration: const InputDecoration(labelText: 'Slow mode'),
                    items: const [0, 5, 10, 30, 60, 300]
                        .map((seconds) => DropdownMenuItem(value: seconds, child: Text(seconds == 0 ? 'Off' : '$seconds seconds')))
                        .toList(),
                    onChanged: (value) => setSheetState(() => slowMode = value ?? 0),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: bannedWords,
                    decoration: const InputDecoration(labelText: 'Banned words', hintText: 'word1, word2'),
                    minLines: 2,
                    maxLines: 3,
                  ),
                  const SizedBox(height: 10),
                  const Text('Blocked media', style: TextStyle(fontWeight: FontWeight.w900)),
                  ...['image', 'video', 'audio', 'document'].map((type) => CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        value: blocked.contains(type),
                        title: Text(type[0].toUpperCase() + type.substring(1)),
                        onChanged: (value) => setSheetState(() {
                          if (value == true) {
                            blocked.add(type);
                          } else {
                            blocked.remove(type);
                          }
                        }),
                      )),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    value: autoReport,
                    title: const Text('Auto-report violations'),
                    onChanged: (value) => setSheetState(() => autoReport = value),
                  ),
                  const SizedBox(height: 10),
                  FilledButton(onPressed: () => Navigator.pop(sheetContext, true), child: const Text('Save moderation')),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    final words = bannedWords.text
        .split(',')
        .map((word) => word.trim())
        .where((word) => word.isNotEmpty)
        .toList(growable: false);
    bannedWords.dispose();
    if (save != true || !mounted) return;
    await _run(() async {
      await context.services.groups.updateModeration(groupId, {
        'slowModeSeconds': slowMode,
        'bannedWords': words,
        'blockedMediaTypes': blocked.toList(growable: false),
        'autoReportViolations': autoReport,
      });
      await _load();
    }, success: 'Moderation settings updated.');
  }

  Future<void> _addMembers() async {
    if (!canAddMember) return;
    List<Map<String, dynamic>> contacts;
    try {
      contacts = _candidatesFromContacts(await context.services.contacts.list());
    } on Object catch (failure) {
      _snack(_message(failure));
      return;
    }
    final existing = participants.map((item) => item['userId']?.toString() ?? '').toSet();
    final available = contacts.where((item) => !existing.contains(item['userId']?.toString())).toList(growable: false);
    final selected = <String>{};
    final search = TextEditingController();

    final add = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) {
          final q = search.text.trim().toLowerCase();
          final visible = available.where((item) {
            if (q.isEmpty) return true;
            return '${_personName(item)} ${_personSubtitle(item)}'.toLowerCase().contains(q);
          }).toList(growable: false);
          return SafeArea(
            child: SizedBox(
              height: MediaQuery.sizeOf(context).height * .74,
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                    child: TextField(
                      controller: search,
                      onChanged: (_) => setSheetState(() {}),
                      decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Search saved contacts'),
                    ),
                  ),
                  Expanded(
                    child: visible.isEmpty
                        ? const Center(child: Text('No contacts available to add.'))
                        : ListView.builder(
                            itemCount: visible.length,
                            itemBuilder: (_, index) {
                              final person = visible[index];
                              final id = person['userId']?.toString() ?? '';
                              return CheckboxListTile(
                                value: selected.contains(id),
                                secondary: SyncAvatar(name: _personName(person), radius: 19),
                                title: Text(_personName(person), style: const TextStyle(fontWeight: FontWeight.w800)),
                                subtitle: Text(_personSubtitle(person)),
                                onChanged: (value) => setSheetState(() {
                                  if (value == true) {
                                    selected.add(id);
                                  } else {
                                    selected.remove(id);
                                  }
                                }),
                              );
                            },
                          ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: selected.isEmpty ? null : () => Navigator.pop(sheetContext, true),
                        child: Text('Add ${selected.length} member${selected.length == 1 ? '' : 's'}'),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    search.dispose();
    if (add != true || selected.isEmpty || !mounted) return;
    await _run(() async {
      await context.services.groups.addParticipants(groupId, selected.toList(growable: false));
      await _load();
    }, success: 'Members added.');
  }

  Future<void> _memberActions(Map<String, dynamic> participant) async {
    if (!admin) return;
    final participantId = participant['userId']?.toString() ?? '';
    if (participantId.isEmpty || participantId == userId) return;
    final targetAdmin = _ids(group?['adminsId']).contains(participantId) || group?['adminId']?.toString() == participantId;
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: Icon(targetAdmin ? Icons.shield_outlined : Icons.admin_panel_settings_outlined),
              title: Text(targetAdmin ? 'Remove admin role' : 'Make admin'),
              onTap: () => Navigator.pop(sheetContext, targetAdmin ? 'demote' : 'promote'),
            ),
            ListTile(
              leading: const Icon(Icons.person_remove_outlined, color: SyncColors.danger),
              title: const Text('Remove from group', style: TextStyle(color: SyncColors.danger)),
              onTap: () => Navigator.pop(sheetContext, 'remove'),
            ),
          ],
        ),
      ),
    );
    if (action == null || !mounted) return;
    await _run(() async {
      if (action == 'promote') {
        await context.services.groups.promoteAdmin(groupId, participantId);
      } else if (action == 'demote') {
        await context.services.groups.demoteAdmin(groupId, participantId);
      } else if (action == 'remove') {
        await context.services.groups.removeParticipant(groupId, participantId);
      }
      await _load();
    }, success: action == 'remove' ? 'Member removed.' : 'Admin roles updated.');
  }

  Future<void> _pendingAction(Map<String, dynamic> person, bool approve) async {
    final id = person['userId']?.toString() ?? '';
    if (!admin || id.isEmpty) return;
    await _run(() async {
      if (approve) {
        await context.services.groups.approvePending(groupId, id);
      } else {
        await context.services.groups.rejectPending(groupId, id);
      }
      await _load();
    }, success: approve ? 'Join request approved.' : 'Join request rejected.');
  }

  Future<void> _copyInvite() async {
    final link = group?['link']?.toString().trim() ?? '';
    if (link.isEmpty) {
      _snack('This group does not have an invite link.');
      return;
    }
    await Clipboard.setData(ClipboardData(text: link));
    if (mounted) _snack('Group invite link copied.');
  }

  Future<void> _togglePreference(String action, bool current) async {
    if (roomId.isEmpty) return;
    await _run(() async {
      final updated = await context.services.inbox.updatePreferences(
        roomId,
        {'action': action, 'value': !current},
      );
      if (mounted) setState(() => inbox = updated);
    });
  }

  Future<void> _clearChat() async {
    final yes = await _confirm(
      title: 'Clear group chat?',
      body: 'This clears the chat for your account. Group membership is not changed.',
      confirm: 'Clear chat',
    );
    if (yes != true || !mounted) return;
    await _run(() => context.services.inbox.clearRoom(roomId), success: 'Group chat cleared.');
  }

  Future<void> _exitGroup() async {
    final yes = await _confirm(
      title: 'Leave this group?',
      body: 'You will stop receiving messages from this group.',
      confirm: 'Leave group',
    );
    if (yes != true || !mounted) return;
    await _run(() async {
      await context.services.groups.exit(groupId);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    });
  }

  Future<bool?> _confirm({required String title, required String body, required String confirm}) => showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(title),
          content: Text(body),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: Text(confirm)),
          ],
        ),
      );

  Future<void> _run(Future<void> Function() action, {String? success}) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await action();
      if (!mounted) return;
      setState(() => busy = false);
      if (success != null) _snack(success);
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        busy = false;
        error = _message(failure);
      });
      _snack(_message(failure));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return Scaffold(
        backgroundColor: context.page,
        appBar: AppBar(title: const Text('Group info')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    final source = group;
    if (source == null) {
      return Scaffold(
        backgroundColor: context.page,
        appBar: AppBar(title: const Text('Group info')),
        body: Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(error ?? 'Group unavailable.'))),
      );
    }

    final name = source['name']?.toString().trim().isNotEmpty == true ? source['name'].toString() : 'Group';
    final description = source['desc']?.toString().trim() ?? '';
    final private = source['accessType']?.toString() == 'private';
    final link = source['link']?.toString() ?? '';
    final favourite = _containsUser(inbox['favouriteBy'], userId);
    final muted = _containsUser(inbox['mutedBy'], userId);
    final listed = _containsUser(inbox['listedBy'], userId);

    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Group info'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
        actions: [
          if (busy)
            const Padding(
              padding: EdgeInsets.all(16),
              child: SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)),
            )
          else
            IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(14, 18, 14, 40),
        children: [
          Center(
            child: Column(
              children: [
                InkWell(
                  onTap: admin ? _changeAvatar : null,
                  borderRadius: BorderRadius.circular(32),
                  child: Stack(
                    children: [
                      SyncAvatar(name: name, radius: 47),
                      if (admin)
                        const Positioned(
                          right: 0,
                          bottom: 0,
                          child: CircleAvatar(radius: 15, backgroundColor: SyncColors.sky, child: Icon(Icons.camera_alt_rounded, color: Colors.white, size: 16)),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Flexible(child: Text(name, textAlign: TextAlign.center, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w900))),
                    if (canEditInfo)
                      IconButton(tooltip: 'Edit group info', onPressed: _editInfo, icon: const Icon(Icons.edit_outlined, size: 20)),
                  ],
                ),
                Text(
                  '${participants.length} member${participants.length == 1 ? '' : 's'} · ${private ? 'Private' : 'Public'}${admin ? ' · You are admin' : ''}',
                  style: TextStyle(color: context.muted, fontWeight: FontWeight.w700),
                ),
                if (description.isNotEmpty) ...[
                  const SizedBox(height: 9),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 18),
                    child: Text(description, textAlign: TextAlign.center, style: TextStyle(color: context.muted, height: 1.4)),
                  ),
                ],
              ],
            ),
          ),
          if (error != null) ...[
            const SizedBox(height: 14),
            _ErrorBox(error!),
          ],
          const SizedBox(height: 22),
          _section(context, 'Conversation', [
            ListTile(
              leading: const Icon(Icons.chat_bubble_outline_rounded, color: SyncColors.sky),
              title: const Text('Open group chat', style: TextStyle(fontWeight: FontWeight.w800)),
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => LiveChatRoomScreen(inbox: inbox, name: name))),
            ),
            ListTile(
              leading: Icon(favourite ? Icons.star_rounded : Icons.star_border_rounded, color: SyncColors.sky),
              title: Text(favourite ? 'Remove favourite' : 'Add to favourite', style: const TextStyle(fontWeight: FontWeight.w800)),
              onTap: () => _togglePreference('favourite', favourite),
            ),
            ListTile(
              leading: Icon(muted ? Icons.notifications_active_outlined : Icons.notifications_off_outlined, color: SyncColors.sky),
              title: Text(muted ? 'Unmute notifications' : 'Mute notifications', style: const TextStyle(fontWeight: FontWeight.w800)),
              onTap: () => _togglePreference('mute', muted),
            ),
            ListTile(
              leading: const Icon(Icons.format_list_bulleted_rounded, color: SyncColors.sky),
              title: Text(listed ? 'Remove from list' : 'Add to list', style: const TextStyle(fontWeight: FontWeight.w800)),
              onTap: () => _togglePreference('list', listed),
            ),
            ListTile(
              leading: const Icon(Icons.cleaning_services_outlined, color: SyncColors.sky),
              title: const Text('Clear chat', style: TextStyle(fontWeight: FontWeight.w800)),
              onTap: _clearChat,
            ),
          ]),
          _section(context, 'Invite & privacy', [
            ListTile(
              leading: const Icon(Icons.link_rounded, color: SyncColors.sky),
              title: const Text('Invite link', style: TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text(link.isEmpty ? 'Invite link unavailable' : link, maxLines: 1, overflow: TextOverflow.ellipsis),
              trailing: link.isEmpty ? null : const Icon(Icons.copy_rounded),
              onTap: link.isEmpty ? null : _copyInvite,
            ),
            if (admin)
              ListTile(
                leading: Icon(private ? Icons.lock_outline_rounded : Icons.public_rounded, color: SyncColors.sky),
                title: const Text('Public / Private', style: TextStyle(fontWeight: FontWeight.w800)),
                subtitle: Text(private ? 'Private group' : 'Public group'),
                onTap: _privacy,
              ),
            if (admin && private)
              ListTile(
                leading: const Icon(Icons.password_rounded, color: SyncColors.sky),
                title: const Text('Change group password', style: TextStyle(fontWeight: FontWeight.w800)),
                onTap: _changePassword,
              ),
          ]),
          if (admin)
            _section(context, 'Admin controls', [
              ListTile(
                leading: const Icon(Icons.rule_rounded, color: SyncColors.sky),
                title: const Text('Member permissions', style: TextStyle(fontWeight: FontWeight.w800)),
                subtitle: Text(permissions['adminApprovalRequired'] == true ? 'Join approval enabled' : 'Manage edit, send, add and invite permissions'),
                onTap: _editPermissions,
              ),
              ListTile(
                leading: const Icon(Icons.gavel_outlined, color: SyncColors.sky),
                title: const Text('Moderation', style: TextStyle(fontWeight: FontWeight.w800)),
                subtitle: const Text('Slow mode, banned words and blocked media'),
                onTap: _editModeration,
              ),
            ]),
          _section(context, 'Members', [
            if (canAddMember)
              ListTile(
                leading: const Icon(Icons.person_add_alt_1_rounded, color: SyncColors.sky),
                title: const Text('Add members', style: TextStyle(fontWeight: FontWeight.w800)),
                onTap: _addMembers,
              ),
            ...participants.map((person) {
              final id = person['userId']?.toString() ?? '';
              final targetAdmin = _ids(source['adminsId']).contains(id) || source['adminId']?.toString() == id;
              return ListTile(
                leading: SyncAvatar(name: _personName(person), radius: 20),
                title: Text(_personName(person), style: const TextStyle(fontWeight: FontWeight.w800)),
                subtitle: Text(targetAdmin ? 'Admin' : _personSubtitle(person)),
                trailing: admin && id != userId ? const Icon(Icons.more_vert_rounded) : null,
                onTap: admin && id != userId ? () => _memberActions(person) : null,
              );
            }),
          ]),
          if (admin && pending.isNotEmpty)
            _section(context, 'Pending join requests', pending.map((person) => ListTile(
                  leading: SyncAvatar(name: _personName(person), radius: 20),
                  title: Text(_personName(person), style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text(_personSubtitle(person)),
                  trailing: Wrap(
                    spacing: 2,
                    children: [
                      IconButton(tooltip: 'Reject', onPressed: () => _pendingAction(person, false), icon: const Icon(Icons.close_rounded, color: SyncColors.danger)),
                      IconButton(tooltip: 'Approve', onPressed: () => _pendingAction(person, true), icon: const Icon(Icons.check_rounded, color: SyncColors.success)),
                    ],
                  ),
                )).toList()),
          const SizedBox(height: 20),
          OutlinedButton.icon(
            onPressed: busy ? null : _exitGroup,
            icon: const Icon(Icons.exit_to_app_rounded, color: SyncColors.danger),
            label: const Text('Leave group', style: TextStyle(color: SyncColors.danger)),
          ),
        ],
      ),
    );
  }
}

Widget _section(BuildContext context, String label, List<Widget> children) {
  final divided = <Widget>[];
  for (var index = 0; index < children.length; index++) {
    if (index > 0) divided.add(Divider(height: 1, indent: 56, color: context.border));
    divided.add(children[index]);
  }
  return Padding(
    padding: const EdgeInsets.only(top: 18),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 0, 8, 7),
          child: Text(label.toUpperCase(), style: TextStyle(color: context.muted, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: .7)),
        ),
        Card(
          color: context.panel,
          elevation: 0,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(17), side: BorderSide(color: context.border)),
          child: Column(children: divided),
        ),
      ],
    ),
  );
}

class _StateCard extends StatelessWidget {
  const _StateCard({required this.icon, required this.title, required this.body, required this.action});

  final IconData icon;
  final String title;
  final String body;
  final Widget action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 80),
      child: Column(
        children: [
          Icon(icon, size: 50, color: SyncColors.sky),
          const SizedBox(height: 13),
          Text(title, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          Text(body, textAlign: TextAlign.center, style: TextStyle(color: context.muted, height: 1.4)),
          const SizedBox(height: 16),
          action,
        ],
      ),
    );
  }
}

class _ErrorBox extends StatelessWidget {
  const _ErrorBox(this.message);

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: SyncColors.danger.withValues(alpha: .08),
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: SyncColors.danger.withValues(alpha: .2)),
      ),
      child: Text(message, style: const TextStyle(color: SyncColors.danger, fontWeight: FontWeight.w700)),
    );
  }
}

List<Map<String, dynamic>> _candidatesFromContacts(List<Map<String, dynamic>> rows) {
  final map = <String, Map<String, dynamic>>{};
  for (final row in rows) {
    final profile = row['profile'] is Map
        ? Map<String, dynamic>.from(row['profile'] as Map)
        : Map<String, dynamic>.from(row);
    final id = row['friendId']?.toString() ?? profile['userId']?.toString() ?? '';
    if (id.isEmpty) continue;
    map[id] = {...profile, 'userId': id};
  }
  return map.values.toList(growable: false);
}

List<Map<String, dynamic>> _candidatesFromSearch(List<Map<String, dynamic>> rows) {
  final map = <String, Map<String, dynamic>>{};
  for (final row in rows) {
    final id = row['userId']?.toString() ?? row['_id']?.toString() ?? '';
    if (id.isEmpty) continue;
    map[id] = {...row, 'userId': id};
  }
  return map.values.toList(growable: false);
}

String _personName(Map<String, dynamic> person) {
  final fullname = person['fullname']?.toString().trim() ?? '';
  if (fullname.isNotEmpty) return fullname;
  final username = person['username']?.toString().trim() ?? '';
  if (username.isNotEmpty) return '@$username';
  return 'SyncChat user';
}

String _personSubtitle(Map<String, dynamic> person) {
  final username = person['username']?.toString().trim() ?? '';
  if (username.isNotEmpty) return '@$username';
  final email = person['email']?.toString().trim() ?? '';
  if (email.isNotEmpty) return email;
  final phone = person['phone']?.toString().trim() ?? '';
  if (phone.isNotEmpty) return phone;
  return 'SyncChat member';
}

String _initial(String value) {
  final clean = value.trim();
  return clean.isEmpty ? '?' : clean.substring(0, 1).toUpperCase();
}

bool _isAdmin(Map<String, dynamic> group, String userId) {
  if (userId.isEmpty) return false;
  if (group['adminId']?.toString() == userId) return true;
  return _ids(group['adminsId']).contains(userId);
}

Set<String> _ids(dynamic value) => value is List
    ? value.map((item) => item.toString()).where((id) => id.isNotEmpty).toSet()
    : <String>{};

bool _containsUser(dynamic value, String userId) =>
    userId.isNotEmpty && value is List && value.map((item) => item.toString()).contains(userId);

String _imageMime(String filename) {
  final lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

String _message(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure
      .toString()
      .replaceFirst('Exception: ', '')
      .replaceFirst('Bad state: ', '');
}

extension on _LiveGroupInfoScreenState {
  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}
