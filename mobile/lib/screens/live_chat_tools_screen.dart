import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../core/cached_repositories.dart';
import '../core/topic_selection_store.dart';
import '../theme.dart';
import 'live_message_requests_screen.dart';
import 'live_resumable_upload_screen.dart';

enum _ToolTab { search, requests, mentions, topics, security, outbox }

class LiveChatToolsScreen extends StatefulWidget {
  const LiveChatToolsScreen({super.key, this.inbox});

  final Map<String, dynamic>? inbox;

  @override
  State<LiveChatToolsScreen> createState() => _LiveChatToolsScreenState();
}

class _LiveChatToolsScreenState extends State<LiveChatToolsScreen> {
  _ToolTab tab = _ToolTab.search;
  final query = TextEditingController();
  final topicName = TextEditingController();
  final targetLanguageController = TextEditingController(text: 'en');
  String type = 'all';
  String scope = 'all';
  String targetLanguage = 'en';
  String selectedTopicId = '';
  bool loading = false;
  bool outboxBusy = false;
  String? error;
  String? notice;
  List<Map<String, dynamic>> results = const [];
  List<Map<String, dynamic>> mentions = const [];
  List<Map<String, dynamic>> topics = const [];
  List<Map<String, dynamic>> outbox = const [];
  Map<String, dynamic> e2ee = const {'enabled': false};

  String get roomId => widget.inbox?['roomId']?.toString() ?? '';
  String get roomType => widget.inbox?['roomType']?.toString() ?? '';

  @override
  void initState() {
    super.initState();
    if (roomId.isNotEmpty) scope = 'current';
    WidgetsBinding.instance.addPostFrameCallback((_) => loadTab());
  }

  @override
  void dispose() {
    query.dispose();
    topicName.dispose();
    targetLanguageController.dispose();
    super.dispose();
  }

  Future<void> loadTab() async {
    if (tab == _ToolTab.requests) return;
    if (tab == _ToolTab.search) return search();
    if (tab == _ToolTab.mentions) return loadMentions();
    if (tab == _ToolTab.topics) return loadTopics();
    if (tab == _ToolTab.security) return loadSecurity();
    if (tab == _ToolTab.outbox) return loadOutbox();
  }

  Future<void> search() async {
    setState(() {
      loading = true;
      error = null;
      notice = null;
    });
    try {
      if (roomId.isNotEmpty) {
        selectedTopicId = await TopicSelectionStore.read(roomId) ?? '';
      }
      final response = await context.services.api.get(
        '/chat-v2/search',
        query: {
          'q': query.text.trim(),
          'type': type,
          if (scope == 'current' && roomId.isNotEmpty) 'roomId': roomId,
          if (selectedTopicId.isNotEmpty) 'topicId': selectedTopicId,
          'limit': 80,
        },
      );
      if (!mounted) return;
      setState(() {
        results = mapList(response.payload);
        loading = false;
      });
    } on Object catch (failure) {
      fail(failure);
    }
  }

  Future<void> loadMentions() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final response = await context.services.api.get('/chat-v2/mentions', query: {'limit': 100});
      if (!mounted) return;
      setState(() {
        mentions = mapList(response.payload);
        loading = false;
      });
    } on Object catch (failure) {
      fail(failure);
    }
  }

  Future<void> loadTopics() async {
    if (roomId.isEmpty || roomType != 'group') {
      setState(() {
        loading = false;
        topics = const [];
        selectedTopicId = '';
        error = null;
      });
      return;
    }
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final response = await context.services.api.get('/chat-v2/topics/$roomId');
      final rows = mapList(response.payload);
      var selected = await TopicSelectionStore.read(roomId) ?? '';
      if (selected.isNotEmpty && !rows.any((item) => item['_id']?.toString() == selected)) {
        selected = '';
        await TopicSelectionStore.clear(roomId);
      }
      if (!mounted) return;
      setState(() {
        topics = rows;
        selectedTopicId = selected;
        loading = false;
      });
    } on Object catch (failure) {
      fail(failure);
    }
  }

  Future<void> createTopic() async {
    final name = topicName.text.trim();
    if (name.isEmpty || roomId.isEmpty) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final response = await context.services.api.post('/chat-v2/topics/$roomId', body: {'name': name});
      final created = response.payload is Map ? Map<String, dynamic>.from(response.payload as Map) : const <String, dynamic>{};
      topicName.clear();
      await loadTopics();
      final id = created['_id']?.toString() ?? '';
      if (id.isNotEmpty) await chooseTopic(id);
    } on Object catch (failure) {
      fail(failure);
    }
  }

  Future<void> chooseTopic(String topicId) async {
    if (roomId.isEmpty) return;
    final value = topicId.trim();
    await TopicSelectionStore.write(roomId, value.isEmpty ? null : value);
    if (!mounted) return;
    final selectedName = value.isEmpty
        ? 'All messages'
        : topics.firstWhere(
            (item) => item['_id']?.toString() == value,
            orElse: () => const <String, dynamic>{},
          )['name']?.toString() ?? 'Selected topic';
    setState(() {
      selectedTopicId = value;
      notice = value.isEmpty
          ? 'Showing all messages. New messages are not assigned to a topic.'
          : '$selectedName selected. New messages will be sent to this topic.';
    });
  }

  Future<void> loadSecurity() async {
    if (roomId.isEmpty || roomType != 'private') {
      setState(() {
        loading = false;
        e2ee = const {'enabled': false};
        error = null;
      });
      return;
    }
    setState(() => loading = true);
    try {
      final response = await context.services.api.get('/chat-v2/e2ee/rooms/$roomId');
      if (!mounted) return;
      setState(() {
        e2ee = response.payload is Map ? Map<String, dynamic>.from(response.payload as Map) : const {'enabled': false};
        loading = false;
      });
    } on Object catch (failure) {
      fail(failure);
    }
  }

  Future<void> toggleE2ee() async {
    if (roomId.isEmpty || roomType != 'private') return;
    setState(() => loading = true);
    try {
      if (e2ee['enabled'] != true) {
        await context.services.chat.registerE2eeDevice();
      }
      final response = await context.services.api.post(
        '/chat-v2/e2ee/rooms/$roomId',
        body: {'enabled': e2ee['enabled'] != true},
      );
      if (!mounted) return;
      setState(() {
        loading = false;
        e2ee = response.payload is Map ? Map<String, dynamic>.from(response.payload as Map) : {'enabled': e2ee['enabled'] != true};
        notice = e2ee['enabled'] == true ? 'Device E2EE enabled.' : 'Device E2EE disabled.';
      });
    } on Object catch (failure) {
      fail(failure);
    }
  }

  Future<void> loadOutbox() async {
    if (!mounted) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final rows = await context.services.chatCache.readOutbox();
      rows.sort((a, b) => _queuedAt(b).compareTo(_queuedAt(a)));
      if (!mounted) return;
      setState(() {
        outbox = rows;
        loading = false;
      });
    } on Object catch (failure) {
      fail(failure);
    }
  }

  Future<void> flushOutbox({String? retryClientMessageId}) async {
    if (outboxBusy) return;
    final repository = context.services.chat;
    if (repository is! CachedChatRepository) {
      setState(() => error = 'Offline queue recovery is unavailable.');
      return;
    }
    setState(() {
      outboxBusy = true;
      error = null;
      notice = null;
    });
    try {
      final sent = await repository.drainOutbox();
      final remaining = await context.services.chatCache.readOutbox();
      remaining.sort((a, b) => _queuedAt(b).compareTo(_queuedAt(a)));
      if (!mounted) return;
      setState(() {
        outbox = remaining;
        outboxBusy = false;
        notice = sent > 0
            ? '$sent queued ${sent == 1 ? 'message' : 'messages'} sent.'
            : remaining.isEmpty
                ? 'Outbox is empty.'
                : retryClientMessageId == null
                    ? 'No queued messages were sent yet. Check your connection and try again.'
                    : 'Retry could not send the queued message yet.';
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => outboxBusy = false);
      fail(failure);
    }
  }

  Future<void> openResumableUpload() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const LiveResumableUploadScreen()),
    );
    if (mounted) await loadOutbox();
  }

  Future<void> inspect(Map<String, dynamic> message, String action) async {
    final id = message['_id']?.toString() ?? '';
    if (id.isEmpty) return;
    try {
      dynamic payload;
      String title;
      if (action == 'receipts') {
        final response = await context.services.api.get('/chat-v2/messages/$id/receipts');
        payload = response.payload;
        title = 'Message receipts';
      } else if (action == 'history') {
        final response = await context.services.api.get('/chat-v2/messages/$id/history');
        payload = response.payload;
        title = 'Edit history';
      } else if (action == 'translate') {
        final response = await context.services.api.post('/chat-v2/translate', body: {'chatId': id, 'targetLanguage': targetLanguage});
        payload = response.payload;
        title = 'Translation ($targetLanguage)';
      } else {
        final response = await context.services.api.post('/chat-v2/transcribe', body: {'chatId': id});
        payload = response.payload;
        title = 'Voice transcription';
      }
      if (!mounted) return;
      showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (_) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 4, 18, 26),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                const SizedBox(height: 12),
                ConstrainedBox(
                  constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * .55),
                  child: SingleChildScrollView(child: SelectableText(payload.toString())),
                ),
              ],
            ),
          ),
        ),
      );
    } on Object catch (failure) {
      fail(failure);
    }
  }

  void fail(Object failure) {
    if (!mounted) return;
    setState(() {
      loading = false;
      error = failure is ApiException ? failure.message : failure.toString().replaceFirst('Exception: ', '');
    });
  }

  List<Map<String, dynamic>> mapList(dynamic value) => value is List
      ? value.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false)
      : const [];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Chat tools'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
      ),
      body: Column(
        children: [
          SizedBox(
            height: 54,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              children: _ToolTab.values.map((value) {
                final selected = tab == value;
                return Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: ChoiceChip(
                    selected: selected,
                    label: Text(label(value)),
                    onSelected: (_) {
                      setState(() {
                        tab = value;
                        error = null;
                        notice = null;
                      });
                      loadTab();
                    },
                  ),
                );
              }).toList(),
            ),
          ),
          if (loading || outboxBusy) const LinearProgressIndicator(minHeight: 2),
          if (error != null)
            Container(width: double.infinity, padding: const EdgeInsets.all(10), color: SyncColors.danger.withValues(alpha: .08), child: Text(error!, style: const TextStyle(color: SyncColors.danger))),
          if (notice != null)
            Container(width: double.infinity, padding: const EdgeInsets.all(10), color: Colors.green.withValues(alpha: .08), child: Text(notice!, style: const TextStyle(color: Colors.green))),
          Expanded(child: bodyForTab()),
        ],
      ),
    );
  }

  Widget bodyForTab() {
    return switch (tab) {
      _ToolTab.search => searchBody(),
      _ToolTab.requests => const LiveMessageRequestsScreen(embedded: true),
      _ToolTab.mentions => simpleMessages(mentions, empty: 'No recent mentions.'),
      _ToolTab.topics => topicsBody(),
      _ToolTab.security => securityBody(),
      _ToolTab.outbox => outboxBody(),
    };
  }

  Widget searchBody() => ListView(
    padding: const EdgeInsets.fromLTRB(14, 12, 14, 24),
    children: [
      TextField(
        controller: query,
        onSubmitted: (_) => search(),
        decoration: InputDecoration(
          hintText: 'Search messages…',
          prefixIcon: const Icon(Icons.search_rounded),
          suffixIcon: IconButton(onPressed: search, icon: const Icon(Icons.arrow_forward_rounded)),
        ),
      ),
      const SizedBox(height: 10),
      Row(
        children: [
          Expanded(child: DropdownButtonFormField<String>(value: type, decoration: const InputDecoration(labelText: 'Type'), items: ['all', 'text', 'image', 'video', 'audio', 'document', 'link', 'call', 'poll'].map((value) => DropdownMenuItem(value: value, child: Text(value))).toList(), onChanged: (value) => setState(() => type = value ?? 'all'))),
          const SizedBox(width: 10),
          Expanded(child: DropdownButtonFormField<String>(value: scope, decoration: const InputDecoration(labelText: 'Scope'), items: const [DropdownMenuItem(value: 'all', child: Text('All chats')), DropdownMenuItem(value: 'current', child: Text('Current chat'))], onChanged: roomId.isEmpty ? null : (value) => setState(() => scope = value ?? 'all'))),
        ],
      ),
      const SizedBox(height: 10),
      TextField(
        decoration: const InputDecoration(labelText: 'AI target language', prefixIcon: Icon(Icons.translate_rounded)),
        controller: targetLanguageController,
        maxLength: 16,
        onChanged: (value) => targetLanguage = value.trim().isEmpty ? 'en' : value.trim(),
      ),
      const SizedBox(height: 14),
      ...results.map(messageCard),
      if (!loading && results.isEmpty) Padding(padding: const EdgeInsets.only(top: 80), child: Text('No messages found.', textAlign: TextAlign.center, style: TextStyle(color: context.muted))),
    ],
  );

  Widget messageCard(Map<String, dynamic> item) {
    final audio = item['file'] is Map && (item['file'] as Map)['type']?.toString() == 'audio';
    return Card(
      color: context.panel,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 9),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15), side: BorderSide(color: context.border)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(item['text']?.toString().trim().isNotEmpty == true ? item['text'].toString() : item['transcript']?.toString() ?? '[attachment]', maxLines: 4, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 5,
              children: [
                actionChip('Receipts', () => inspect(item, 'receipts')),
                if (item['isEdited'] == true) actionChip('Edit history', () => inspect(item, 'history')),
                if (item['text']?.toString().trim().isNotEmpty == true && item['e2eeEnvelope'] == null) actionChip('Translate', () => inspect(item, 'translate')),
                if (audio && item['e2eeEnvelope'] == null) actionChip('Transcribe', () => inspect(item, 'transcribe')),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget actionChip(String text, VoidCallback tap) => ActionChip(label: Text(text, style: const TextStyle(fontSize: 11)), onPressed: tap);

  Widget simpleMessages(List<Map<String, dynamic>> data, {required String empty}) => data.isEmpty && !loading
      ? Center(child: Text(empty, style: TextStyle(color: context.muted)))
      : ListView.builder(
          padding: const EdgeInsets.all(14),
          itemCount: data.length,
          itemBuilder: (_, index) => messageCard(data[index]),
        );

  Widget topicsBody() {
    if (roomId.isEmpty || roomType != 'group') {
      return Center(child: Padding(padding: const EdgeInsets.all(30), child: Text('Open Chat Tools from a group conversation to manage topics.', textAlign: TextAlign.center, style: TextStyle(color: context.muted))));
    }
    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        Row(children: [Expanded(child: TextField(controller: topicName, decoration: const InputDecoration(labelText: 'New topic name'))), const SizedBox(width: 8), FilledButton(onPressed: loading ? null : createTopic, child: const Text('Create'))]),
        const SizedBox(height: 14),
        _topicCard(
          id: '',
          name: 'All messages',
          subtitle: 'Show messages from every topic',
          icon: Icons.forum_outlined,
        ),
        ...topics.map((item) => _topicCard(
              id: item['_id']?.toString() ?? '',
              name: '${item['icon']?.toString().trim().isNotEmpty == true ? '${item['icon']} ' : ''}${item['name']?.toString() ?? 'Topic'}',
              subtitle: '${item['closed'] == true ? 'Closed' : 'Open'}${item['pinned'] == true ? ' · pinned' : ''}',
              icon: item['pinned'] == true ? Icons.push_pin_outlined : Icons.tag_rounded,
            )),
      ],
    );
  }

  Widget _topicCard({required String id, required String name, required String subtitle, required IconData icon}) {
    final selected = selectedTopicId == id;
    return Card(
      color: selected ? SyncColors.sky.withValues(alpha: .10) : context.panel,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: selected ? SyncColors.sky : context.border, width: selected ? 1.5 : 1),
      ),
      child: ListTile(
        leading: Icon(icon, color: selected ? SyncColors.sky : context.muted),
        title: Text(name, style: TextStyle(fontWeight: selected ? FontWeight.w900 : FontWeight.w700)),
        subtitle: Text(subtitle),
        trailing: selected ? const Icon(Icons.check_circle_rounded, color: SyncColors.sky) : null,
        onTap: () => chooseTopic(id),
      ),
    );
  }

  Widget securityBody() {
    if (roomId.isEmpty || roomType != 'private') {
      return Center(child: Padding(padding: const EdgeInsets.all(30), child: Text('Open Chat Tools from a private conversation to manage device E2EE.', textAlign: TextAlign.center, style: TextStyle(color: context.muted))));
    }
    final enabled = e2ee['enabled'] == true;
    return ListView(
      padding: const EdgeInsets.all(18),
      children: [
        Card(
          color: context.panel,
          elevation: 0,
          child: SwitchListTile(
            secondary: Icon(enabled ? Icons.lock_rounded : Icons.security_outlined, color: SyncColors.sky),
            title: const Text('Device end-to-end encryption', style: TextStyle(fontWeight: FontWeight.w900)),
            subtitle: Text(enabled ? 'Enabled for new text messages' : 'Disabled'),
            value: enabled,
            onChanged: loading ? null : (_) => toggleE2ee(),
          ),
        ),
        const SizedBox(height: 10),
        Text('Device E2EE follows the web contract. Encrypted media and some server-side transformations stay disabled when that mode cannot preserve end-to-end encryption.', style: TextStyle(color: context.muted, fontSize: 12, height: 1.45)),
      ],
    );
  }

  Widget outboxBody() => RefreshIndicator(
        onRefresh: loadOutbox,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(18),
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Offline send queue', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                      const SizedBox(height: 3),
                      Text('Queued messages keep their original client message ID and retry after reconnect.', style: TextStyle(color: context.muted, fontSize: 12)),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton.icon(
                  onPressed: outboxBusy ? null : () => flushOutbox(),
                  icon: const Icon(Icons.cloud_upload_outlined, size: 18),
                  label: const Text('Flush now'),
                ),
              ],
            ),
            const SizedBox(height: 14),
            if (!loading && outbox.isEmpty)
              Card(
                color: context.panel,
                elevation: 0,
                child: ListTile(
                  leading: const Icon(Icons.cloud_done_outlined, color: SyncColors.sky),
                  title: const Text('Outbox is empty', style: TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: const Text('Nothing is waiting to be sent.'),
                ),
              ),
            ...outbox.map(_outboxCard),
            if (roomId.isNotEmpty) ...[
              const SizedBox(height: 10),
              Card(
                color: context.panel,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15), side: BorderSide(color: context.border)),
                child: ListTile(
                  leading: const Icon(Icons.upload_file_rounded, color: SyncColors.sky),
                  title: const Text('Resumable large-file upload', style: TextStyle(fontWeight: FontWeight.w900)),
                  subtitle: const Text('Upload in resumable chunks, pause/resume, then send to a conversation.'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: outboxBusy ? null : openResumableUpload,
                ),
              ),
            ],
          ],
        ),
      );

  Widget _outboxCard(Map<String, dynamic> item) {
    final file = item['file'] is Map ? Map<String, dynamic>.from(item['file'] as Map) : const <String, dynamic>{};
    final text = item['text']?.toString().trim() ?? '';
    final filename = file['originalname']?.toString().trim().isNotEmpty == true
        ? file['originalname'].toString().trim()
        : file['_syncchatFilename']?.toString().trim() ?? '';
    final title = text.isNotEmpty ? text : filename.isNotEmpty ? filename : '[attachment/message]';
    final clientId = item['clientMessageId']?.toString() ?? '';
    final kind = item['kind']?.toString() == 'attachment' ? 'Attachment' : 'Message';
    return Card(
      color: context.panel,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15), side: BorderSide(color: context.border)),
      child: ListTile(
        leading: Icon(kind == 'Attachment' ? Icons.attach_file_rounded : Icons.chat_bubble_outline_rounded, color: SyncColors.sky),
        title: Text(title, maxLines: 2, overflow: TextOverflow.ellipsis),
        subtitle: Text('$kind · ${_relativeQueuedTime(item)}${clientId.isEmpty ? '' : '\n${_shortId(clientId)}'}'),
        isThreeLine: clientId.isNotEmpty,
        trailing: TextButton(
          onPressed: outboxBusy ? null : () => flushOutbox(retryClientMessageId: clientId),
          child: const Text('Retry'),
        ),
      ),
    );
  }

  DateTime _queuedAt(Map<String, dynamic> item) =>
      DateTime.tryParse(item['queuedAt']?.toString() ?? item['createdAt']?.toString() ?? '') ??
      DateTime.fromMillisecondsSinceEpoch(0);

  String _relativeQueuedTime(Map<String, dynamic> item) {
    final time = _queuedAt(item).toLocal();
    if (time.year <= 1970) return 'queued';
    final diff = DateTime.now().difference(time);
    if (diff.isNegative || diff.inMinutes < 1) return 'queued now';
    if (diff.inMinutes < 60) return 'queued ${diff.inMinutes}m ago';
    if (diff.inHours < 24) return 'queued ${diff.inHours}h ago';
    return 'queued ${diff.inDays}d ago';
  }

  String _shortId(String value) => value.length <= 20 ? value : '${value.substring(0, 10)}…${value.substring(value.length - 7)}';

  String label(_ToolTab value) => switch (value) {
    _ToolTab.search => 'Search',
    _ToolTab.requests => 'Requests',
    _ToolTab.mentions => 'Mentions',
    _ToolTab.topics => 'Topics',
    _ToolTab.security => 'Security',
    _ToolTab.outbox => 'Outbox',
  };
}
