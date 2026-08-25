import 'dart:async';

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../core/realtime_client.dart';
import '../theme.dart';
import '../widgets.dart';

class LiveChatRoomScreen extends StatefulWidget {
  const LiveChatRoomScreen({
    super.key,
    required this.inbox,
    required this.name,
  });

  final Map<String, dynamic> inbox;
  final String name;

  @override
  State<LiveChatRoomScreen> createState() => _LiveChatRoomScreenState();
}

class _LiveChatRoomScreenState extends State<LiveChatRoomScreen> {
  final composer = TextEditingController();
  final scroll = ScrollController();
  final messages = <Map<String, dynamic>>[];

  StreamSubscription<RealtimeConnectionState>? connectionSubscription;
  Map<String, dynamic>? currentUser;
  bool loading = true;
  bool sending = false;
  String? error;
  int lastSequence = 0;

  String get roomId => widget.inbox['roomId']?.toString() ?? '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  @override
  void dispose() {
    final chat = context.maybeServices?.chat;
    if (chat != null) {
      chat.off('chat/insert', _onChatInsert);
      chat.off('chat/receipt', _onReceipt);
      chat.off('chat/error', _onChatError);
      chat.off('chat/sync-result', _onSyncResult);
    }
    connectionSubscription?.cancel();
    composer.dispose();
    scroll.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    final services = context.services;
    final chat = services.chat;

    chat.on('chat/insert', _onChatInsert);
    chat.on('chat/receipt', _onReceipt);
    chat.on('chat/error', _onChatError);
    chat.on('chat/sync-result', _onSyncResult);
    connectionSubscription = services.realtime.states.listen((state) {
      if (state == RealtimeConnectionState.connected) {
        _catchUp();
      }
    });

    try {
      final results = await Future.wait<dynamic>([
        chat.currentUser(),
        chat.listRoom(roomId, limit: 100),
        chat.openRoom(roomId),
      ]);
      currentUser = Map<String, dynamic>.from(results[0] as Map);
      final loaded = (results[1] as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item));
      _mergeMessages(loaded);
      await chat.markRoomRead(widget.inbox);
      for (final message in messages) {
        if (!_isMine(message)) chat.sendReceipt(message, read: true);
      }
      if (mounted) {
        setState(() {
          loading = false;
          error = null;
        });
        _scrollToBottom();
      }
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = _messageFor(failure);
      });
    }
  }

  Future<void> _reload() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final loaded = await context.services.chat.listRoom(roomId, limit: 100);
      messages.clear();
      lastSequence = 0;
      _mergeMessages(loaded);
      await context.services.chat.markRoomRead(widget.inbox);
      if (!mounted) return;
      setState(() => loading = false);
      _scrollToBottom();
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = _messageFor(failure);
      });
    }
  }

  Future<void> _catchUp() async {
    if (!mounted || roomId.isEmpty) return;
    try {
      await context.services.chat.openRoom(roomId);
      final rows = await context.services.chat.syncRoom(
        roomId,
        afterSequence: lastSequence,
      );
      if (!mounted || rows.isEmpty) return;
      setState(() => _mergeMessages(rows));
      await context.services.chat.markRoomRead(widget.inbox);
      _scrollToBottom();
    } on Object {
      // HTTP history remains the recovery fallback if realtime catch-up fails.
    }
  }

  void _onSyncResult(dynamic data) {
    if (!mounted || data is! Map || data['roomId']?.toString() != roomId) return;
    final rows = data['messages'];
    if (rows is! List) return;
    setState(() => _mergeMessages(
          rows.whereType<Map>().map((item) => Map<String, dynamic>.from(item)),
        ));
    _scrollToBottom();
  }

  void _onChatInsert(dynamic data) {
    if (!mounted || data is! Map || data['roomId']?.toString() != roomId) return;
    final message = Map<String, dynamic>.from(data);
    setState(() => _mergeMessages([message]));
    if (!_isMine(message)) {
      context.services.chat.sendReceipt(message, read: true);
      context.services.chat.markRoomRead(widget.inbox);
    }
    _scrollToBottom();
  }

  void _onReceipt(dynamic data) {
    if (!mounted || data is! Map || data['roomId']?.toString() != roomId) return;
    final chatId = data['chatId']?.toString();
    if (chatId == null || chatId.isEmpty) return;
    final index = messages.indexWhere((item) => item['_id']?.toString() == chatId);
    if (index < 0) return;
    setState(() {
      final next = Map<String, dynamic>.from(messages[index]);
      next['delivered'] = true;
      if (data['type'] == 'read') next['readed'] = true;
      messages[index] = next;
    });
  }

  void _onChatError(dynamic data) {
    if (!mounted) return;
    final message = data is Map
        ? data['message']?.toString() ?? 'Message could not be sent.'
        : 'Message could not be sent.';
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  void _mergeMessages(Iterable<Map<String, dynamic>> incoming) {
    for (final raw in incoming) {
      final message = Map<String, dynamic>.from(raw);
      final id = message['_id']?.toString();
      final clientId = message['clientMessageId']?.toString();
      final index = messages.indexWhere((item) {
        if (id != null && id.isNotEmpty && item['_id']?.toString() == id) return true;
        return clientId != null &&
            clientId.isNotEmpty &&
            item['clientMessageId']?.toString() == clientId;
      });
      if (index >= 0) {
        messages[index] = message;
      } else {
        messages.add(message);
      }
      final sequence = (message['sequence'] as num?)?.toInt() ?? 0;
      if (sequence > lastSequence) lastSequence = sequence;
    }
    messages.sort((left, right) {
      final a = DateTime.tryParse(left['createdAt']?.toString() ?? '');
      final b = DateTime.tryParse(right['createdAt']?.toString() ?? '');
      return (a ?? DateTime.fromMillisecondsSinceEpoch(0))
          .compareTo(b ?? DateTime.fromMillisecondsSinceEpoch(0));
    });
  }

  Future<void> _send() async {
    final text = composer.text.trim();
    if (text.isEmpty || sending) return;
    final user = currentUser ?? await context.services.chat.currentUser();
    final clientMessageId = context.services.chat.createClientMessageId();
    final optimistic = <String, dynamic>{
      'clientMessageId': clientMessageId,
      'roomId': roomId,
      'roomType': widget.inbox['roomType']?.toString() ?? 'private',
      'userId': user['_id']?.toString(),
      'text': text,
      'createdAt': DateTime.now().toUtc().toIso8601String(),
      'pending': true,
      'profile': {
        'fullname': user['fullname']?.toString() ?? user['username']?.toString() ?? 'You',
        'avatar': user['avatar'],
      },
    };

    setState(() {
      sending = true;
      composer.clear();
      _mergeMessages([optimistic]);
    });
    _scrollToBottom();

    try {
      await context.services.chat.sendText(
        inbox: widget.inbox,
        text: text,
        clientMessageId: clientMessageId,
      );
    } on Object catch (failure) {
      if (!mounted) return;
      final index = messages.indexWhere(
        (item) => item['clientMessageId']?.toString() == clientMessageId,
      );
      setState(() {
        sending = false;
        if (index >= 0) {
          final failed = Map<String, dynamic>.from(messages[index]);
          failed['pending'] = false;
          failed['failed'] = true;
          messages[index] = failed;
        }
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_messageFor(failure))),
      );
      return;
    }

    if (mounted) setState(() => sending = false);
  }

  bool _isMine(Map<String, dynamic> message) {
    final myId = currentUser?['_id']?.toString() ?? '';
    return myId.isNotEmpty && message['userId']?.toString() == myId;
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !scroll.hasClients) return;
      scroll.animateTo(
        scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
      );
    });
  }

  String _messageFor(Object error) {
    if (error is ApiException) return error.message;
    return error.toString().replaceFirst('Exception: ', '');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.isDark ? SyncColors.spill950 : SyncColors.slate200,
      body: SafeArea(
        child: Column(
          children: [
            _RoomHeader(name: widget.name, inbox: widget.inbox),
            Expanded(child: _body()),
            _Composer(
              controller: composer,
              sending: sending,
              onSend: _send,
            ),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (error != null && messages.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined, size: 44, color: SyncColors.sky),
              const SizedBox(height: 12),
              Text(error!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: _reload,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView.builder(
        controller: scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(12, 18, 12, 18),
        itemCount: messages.length + 1,
        itemBuilder: (context, index) {
          if (index == 0) {
            return const Padding(
              padding: EdgeInsets.only(bottom: 14),
              child: Center(child: Chip(label: Text('TODAY'))),
            );
          }
          final message = messages[index - 1];
          return _MessageBubble(message: message, mine: _isMine(message));
        },
      ),
    );
  }
}

class _RoomHeader extends StatelessWidget {
  const _RoomHeader({required this.name, required this.inbox});

  final String name;
  final Map<String, dynamic> inbox;

  @override
  Widget build(BuildContext context) {
    final group = inbox['roomType']?.toString() == 'group';
    return Container(
      constraints: const BoxConstraints(minHeight: 64),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 7),
      decoration: BoxDecoration(
        color: context.panel,
        border: Border(bottom: BorderSide(color: context.border)),
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.maybePop(context),
            icon: const Icon(Icons.arrow_back_rounded),
          ),
          SyncAvatar(name: name, online: !group, radius: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                Text(
                  group ? 'Group conversation' : 'SyncChat contact',
                  style: TextStyle(fontSize: 12, color: context.muted),
                ),
              ],
            ),
          ),
          IconButton(onPressed: () {}, icon: const Icon(Icons.videocam_outlined)),
          IconButton(onPressed: () {}, icon: const Icon(Icons.call_outlined)),
          IconButton(onPressed: () {}, icon: const Icon(Icons.more_vert_rounded)),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message, required this.mine});

  final Map<String, dynamic> message;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final text = message['text']?.toString() ?? '';
    final failed = message['failed'] == true;
    final pending = message['pending'] == true;
    final read = message['readed'] == true;
    final delivered = message['delivered'] == true;
    final profile = message['profile'];
    final sender = profile is Map ? profile['fullname']?.toString() : null;

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * .78),
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.fromLTRB(12, 8, 10, 6),
        decoration: BoxDecoration(
          color: mine
              ? (context.isDark ? SyncColors.sky700 : const Color(0xFFCCECFF))
              : context.panel,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(18),
            topRight: const Radius.circular(18),
            bottomLeft: Radius.circular(mine ? 18 : 5),
            bottomRight: Radius.circular(mine ? 5 : 18),
          ),
          boxShadow: const [
            BoxShadow(color: Color(0x160F172A), blurRadius: 5, offset: Offset(0, 2)),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!mine && sender != null && sender.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Text(
                  sender,
                  style: const TextStyle(
                    color: SyncColors.sky,
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            if (text.isNotEmpty) Text(text, style: const TextStyle(height: 1.28)),
            if (text.isEmpty && message['file'] != null)
              const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.attach_file_rounded, size: 16),
                  SizedBox(width: 5),
                  Text('Attachment'),
                ],
              ),
            const SizedBox(height: 4),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _time(message['createdAt']),
                  style: TextStyle(fontSize: 10, color: context.muted),
                ),
                if (mine) ...[
                  const SizedBox(width: 4),
                  Icon(
                    failed
                        ? Icons.error_outline_rounded
                        : pending
                            ? Icons.schedule_rounded
                            : read
                                ? Icons.done_all_rounded
                                : delivered
                                    ? Icons.done_all_rounded
                                    : Icons.done_rounded,
                    size: 14,
                    color: failed
                        ? SyncColors.danger
                        : read
                            ? SyncColors.sky
                            : context.muted,
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  static String _time(dynamic value) {
    final date = DateTime.tryParse(value?.toString() ?? '')?.toLocal();
    if (date == null) return '';
    final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
    final minute = date.minute.toString().padLeft(2, '0');
    final suffix = date.hour >= 12 ? 'PM' : 'AM';
    return '$hour:$minute $suffix';
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.sending,
    required this.onSend,
  });

  final TextEditingController controller;
  final bool sending;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(8, 8, 8, MediaQuery.paddingOf(context).bottom + 8),
      decoration: BoxDecoration(
        color: context.panel,
        border: Border(top: BorderSide(color: context.border)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          IconButton(onPressed: () {}, icon: const Icon(Icons.add_circle_outline_rounded)),
          Expanded(
            child: TextField(
              controller: controller,
              minLines: 1,
              maxLines: 5,
              textCapitalization: TextCapitalization.sentences,
              onSubmitted: (_) => onSend(),
              decoration: InputDecoration(
                hintText: 'Message',
                prefixIcon: const Icon(Icons.emoji_emotions_outlined),
                suffixIcon: IconButton(
                  onPressed: () {},
                  icon: const Icon(Icons.camera_alt_outlined),
                ),
              ),
            ),
          ),
          const SizedBox(width: 6),
          Material(
            color: SyncColors.sky,
            shape: const CircleBorder(),
            child: InkWell(
              onTap: sending ? null : onSend,
              customBorder: const CircleBorder(),
              child: SizedBox(
                width: 46,
                height: 46,
                child: sending
                    ? const Padding(
                        padding: EdgeInsets.all(13),
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.send_rounded, color: Colors.white, size: 20),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
