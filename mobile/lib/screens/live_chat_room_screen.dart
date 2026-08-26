import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../core/chat_repository.dart';
import '../core/realtime_client.dart';
import '../theme.dart';
import '../widgets.dart';
import 'forward_message_sheet.dart';
import 'voice_note_widgets.dart';

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
  final imagePicker = ImagePicker();

  late ChatRepository chat;
  bool chatBound = false;
  StreamSubscription<RealtimeConnectionState>? connectionSubscription;
  Map<String, dynamic>? currentUser;
  Map<String, dynamic>? replyingTo;
  Map<String, dynamic>? editingMessage;
  Set<String> pinnedIds = <String>{};
  bool loading = true;
  bool sending = false;
  bool uploading = false;
  String? error;
  String typingText = '';
  int lastSequence = 0;
  late bool e2eeEnabled;

  String get roomId => widget.inbox['roomId']?.toString() ?? '';
  String get currentUserId => currentUser?['_id']?.toString() ?? '';
  Map<String, dynamic> get effectiveInbox => {
    ...widget.inbox,
    'e2eeEnabled': e2eeEnabled,
  };

  @override
  void initState() {
    super.initState();
    e2eeEnabled =
        widget.inbox['roomType']?.toString() == 'private' &&
        widget.inbox['e2eeEnabled'] == true;
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  @override
  void dispose() {
    if (chatBound) {
      chat.off('chat/insert', _onChatInsert);
      chat.off('chat/receipt', _onReceipt);
      chat.off('chat/error', _onChatError);
      chat.off('chat/sync-result', _onSyncResult);
      chat.off('chat/react', _onReaction);
      chat.off('chat/edit', _onEdit);
      chat.off('chat/delete', _onDelete);
      chat.off('chat/view-once', _onViewOnceEvent);
      chat.off('chat/pins', _onPinsEvent);
      chat.off('chat/typing', _onTypingEvent);
      chat.off('chat/typing-ends', _onTypingEnds);
      chat.off('e2ee/room', _onE2eeRoom);
      chat.off('e2ee/key-changed', _onE2eeKeyChanged);
    }
    connectionSubscription?.cancel();
    composer.dispose();
    scroll.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    final services = context.services;
    chat = services.chat;
    chatBound = true;

    chat.on('chat/insert', _onChatInsert);
    chat.on('chat/receipt', _onReceipt);
    chat.on('chat/error', _onChatError);
    chat.on('chat/sync-result', _onSyncResult);
    chat.on('chat/react', _onReaction);
    chat.on('chat/edit', _onEdit);
    chat.on('chat/delete', _onDelete);
    chat.on('chat/view-once', _onViewOnceEvent);
    chat.on('chat/pins', _onPinsEvent);
    chat.on('chat/typing', _onTypingEvent);
    chat.on('chat/typing-ends', _onTypingEnds);
    chat.on('e2ee/room', _onE2eeRoom);
    chat.on('e2ee/key-changed', _onE2eeKeyChanged);

    connectionSubscription = services.realtime.states.listen((state) {
      if (state == RealtimeConnectionState.connected) _catchUp();
    });

    try {
      final results = await Future.wait<dynamic>([
        chat.currentUser(),
        chat.listRoom(roomId, limit: 100),
        chat.openRoom(roomId),
        chat.pinnedMessages(roomId),
        widget.inbox['roomType']?.toString() == 'private'
            ? chat.e2eeRoomState(roomId)
            : Future<Map<String, dynamic>>.value(const {
                'enabled': false,
                'version': 0,
              }),
      ]);
      currentUser = Map<String, dynamic>.from(results[0] as Map);
      e2eeEnabled =
          Map<String, dynamic>.from(results[4] as Map)['enabled'] == true;
      final loaded = (results[1] as List).whereType<Map>().map(
        (item) => Map<String, dynamic>.from(item),
      );
      _mergeMessages(loaded);
      _applyPins(Map<String, dynamic>.from(results[3] as Map));
      await chat.markRoomRead(widget.inbox);
      for (final message in messages) {
        if (!_isMine(message)) chat.sendReceipt(message, read: true);
      }
      if (!mounted) return;
      setState(() {
        loading = false;
        error = null;
      });
      _scrollToBottom();
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
      final results = await Future.wait<dynamic>([
        chat.listRoom(roomId, limit: 100),
        chat.pinnedMessages(roomId),
        widget.inbox['roomType']?.toString() == 'private'
            ? chat.e2eeRoomState(roomId)
            : Future<Map<String, dynamic>>.value(const {
                'enabled': false,
                'version': 0,
              }),
      ]);
      messages.clear();
      lastSequence = 0;
      _mergeMessages(
        (results[0] as List).whereType<Map>().map(
          (item) => Map<String, dynamic>.from(item),
        ),
      );
      _applyPins(Map<String, dynamic>.from(results[1] as Map));
      await chat.markRoomRead(effectiveInbox);
      if (!mounted) return;
      setState(() {
        e2eeEnabled =
            Map<String, dynamic>.from(results[2] as Map)['enabled'] == true;
        loading = false;
      });
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
      await chat.openRoom(roomId);
      final rows = await chat.syncRoom(roomId, afterSequence: lastSequence);
      if (!mounted || rows.isEmpty) return;
      setState(() => _mergeMessages(rows));
      await chat.markRoomRead(widget.inbox);
      _scrollToBottom();
    } on Object {
      // HTTP room history remains the fallback if realtime catch-up fails.
    }
  }

  Future<void> _loadPins() async {
    try {
      final payload = await chat.pinnedMessages(roomId);
      if (!mounted) return;
      setState(() => _applyPins(payload));
    } on Object {
      // Pin status is non-blocking for the room.
    }
  }

  void _applyPins(Map<String, dynamic> payload) {
    final raw = payload['pinned'];
    pinnedIds = raw is List
        ? raw
              .whereType<Map>()
              .map((item) => item['chatId']?.toString() ?? '')
              .where((id) => id.isNotEmpty)
              .toSet()
        : <String>{};
  }

  void _onSyncResult(dynamic data) async {
    if (!mounted || data is! Map || data['roomId']?.toString() != roomId)
      return;
    final rows = data['messages'];
    if (rows is! List) return;
    final decrypted = <Map<String, dynamic>>[];
    for (final raw in rows.whereType<Map>()) {
      decrypted.add(await chat.decryptMessage(Map<String, dynamic>.from(raw)));
    }
    if (!mounted) return;
    setState(() => _mergeMessages(decrypted));
    _scrollToBottom();
  }

  void _onChatInsert(dynamic data) async {
    if (!mounted || data is! Map || data['roomId']?.toString() != roomId)
      return;
    final message = await chat.decryptMessage(Map<String, dynamic>.from(data));
    if (!mounted) return;
    setState(() => _mergeMessages([message]));
    if (!_isMine(message)) {
      chat.sendReceipt(message, read: true);
      chat.markRoomRead(effectiveInbox);
    }
    _scrollToBottom();
  }

  void _onReceipt(dynamic data) {
    if (!mounted || data is! Map || data['roomId']?.toString() != roomId)
      return;
    final chatId = data['chatId']?.toString();
    if (chatId == null || chatId.isEmpty) return;
    final index = messages.indexWhere(
      (item) => item['_id']?.toString() == chatId,
    );
    if (index < 0) return;
    setState(() {
      final next = Map<String, dynamic>.from(messages[index]);
      next['delivered'] = true;
      if (data['type'] == 'read') next['readed'] = true;
      messages[index] = next;
    });
  }

  void _onReaction(dynamic data) {
    if (!mounted || data is! Map) return;
    final chatId = data['chatId']?.toString() ?? '';
    if (chatId.isEmpty) return;
    final index = messages.indexWhere(
      (item) => item['_id']?.toString() == chatId,
    );
    if (index < 0) return;
    setState(() {
      final next = Map<String, dynamic>.from(messages[index]);
      next['reactions'] = data['reactions'] is Map
          ? Map<String, dynamic>.from(data['reactions'] as Map)
          : <String, dynamic>{};
      messages[index] = next;
    });
  }

  void _onEdit(dynamic data) {
    if (!mounted || data is! Map) return;
    final chatId = data['chatId']?.toString() ?? '';
    final index = messages.indexWhere(
      (item) => item['_id']?.toString() == chatId,
    );
    if (index < 0) return;
    setState(() {
      final next = Map<String, dynamic>.from(messages[index]);
      next['text'] = data['text']?.toString() ?? next['text'];
      next['replyTo'] = data['replyTo'];
      next['isEdited'] = data['isEdited'] == true;
      next['editedAt'] = data['editedAt'];
      next['editHistory'] = data['editHistory'];
      messages[index] = next;
      if (editingMessage?['_id']?.toString() == chatId) editingMessage = null;
    });
  }

  void _onDelete(dynamic data) {
    if (!mounted || data is! Map || data['chatsId'] is! List) return;
    final ids = (data['chatsId'] as List)
        .map((item) => item.toString())
        .toSet();
    setState(() {
      messages.removeWhere((item) => ids.contains(item['_id']?.toString()));
      pinnedIds.removeAll(ids);
      if (replyingTo != null && ids.contains(replyingTo!['_id']?.toString())) {
        replyingTo = null;
      }
      if (editingMessage != null &&
          ids.contains(editingMessage!['_id']?.toString())) {
        editingMessage = null;
        composer.clear();
      }
    });
  }

  void _onViewOnceEvent(dynamic data) {
    if (!mounted || data is! Map) return;
    final chatId = data['chatId']?.toString() ?? '';
    final index = messages.indexWhere(
      (item) => item['_id']?.toString() == chatId,
    );
    if (index < 0) return;
    setState(() {
      final next = Map<String, dynamic>.from(messages[index]);
      final display = next['viewOnce'] is Map
          ? Map<String, dynamic>.from(next['viewOnce'] as Map)
          : <String, dynamic>{'enabled': true};
      display['opened'] = true;
      display['label'] = 'Opened';
      next['viewOnce'] = display;
      messages[index] = next;
    });
  }

  void _onPinsEvent(dynamic data) {
    if (data is Map && data['roomId']?.toString() != roomId) return;
    _loadPins();
  }

  void _onTypingEvent(dynamic data) {
    if (!mounted) return;
    setState(() => typingText = data?.toString() ?? 'typing...');
  }

  void _onTypingEnds(dynamic _) {
    if (!mounted) return;
    setState(() => typingText = '');
  }

  void _onChatError(dynamic data) {
    if (!mounted) return;
    final message = data is Map
        ? data['message']?.toString() ?? 'Message could not be sent.'
        : 'Message could not be sent.';
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  void _onE2eeRoom(dynamic data) {
    if (!mounted || data is! Map || data['roomId']?.toString() != roomId)
      return;
    final enabled = data['enabled'] == true;
    setState(() {
      e2eeEnabled = enabled;
      if (enabled && editingMessage != null) {
        editingMessage = null;
        composer.clear();
      }
    });
    _snack(
      enabled
          ? 'End-to-end encryption enabled.'
          : 'End-to-end encryption disabled.',
    );
  }

  void _onE2eeKeyChanged(dynamic data) {
    if (!mounted || data is! Map) return;
    _snack('An E2EE device key changed. Verify the contact security code.');
  }

  void _mergeMessages(Iterable<Map<String, dynamic>> incoming) {
    for (final raw in incoming) {
      final message = Map<String, dynamic>.from(raw);
      final id = message['_id']?.toString();
      final clientId = message['clientMessageId']?.toString();
      final index = messages.indexWhere((item) {
        if (id != null && id.isNotEmpty && item['_id']?.toString() == id)
          return true;
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
      return (a ?? DateTime.fromMillisecondsSinceEpoch(0)).compareTo(
        b ?? DateTime.fromMillisecondsSinceEpoch(0),
      );
    });
  }

  Future<void> _send() async {
    final text = composer.text.trim();
    if (text.isEmpty || sending || uploading) return;

    if (editingMessage != null && e2eeEnabled) {
      _cancelComposerMode();
      _snack(
        'Editing is disabled for device-E2EE messages until encrypted edit envelopes are supported.',
      );
      return;
    }

    if (editingMessage != null) {
      final editing = editingMessage!;
      setState(() => sending = true);
      try {
        await chat.editMessage(
          roomId: roomId,
          chatId: editing['_id']?.toString() ?? '',
          text: text,
          replyTo: editing['replyTo']?.toString(),
        );
        if (!mounted) return;
        setState(() {
          sending = false;
          editingMessage = null;
          composer.clear();
        });
      } on Object catch (failure) {
        if (!mounted) return;
        setState(() => sending = false);
        _snack(_messageFor(failure));
      }
      return;
    }

    final user = currentUser ?? await chat.currentUser();
    final clientMessageId = chat.createClientMessageId();
    final reply = replyingTo;
    final optimistic = <String, dynamic>{
      'clientMessageId': clientMessageId,
      'roomId': roomId,
      'roomType': widget.inbox['roomType']?.toString() ?? 'private',
      'userId': user['_id']?.toString(),
      'text': text,
      'replyTo': reply?['_id'],
      'reply': reply == null ? null : _replyPreview(reply),
      'createdAt': DateTime.now().toUtc().toIso8601String(),
      'pending': true,
      'profile': {
        'fullname':
            user['fullname']?.toString() ??
            user['username']?.toString() ??
            'You',
        'avatar': user['avatar'],
      },
    };

    setState(() {
      sending = true;
      composer.clear();
      replyingTo = null;
      _mergeMessages([optimistic]);
    });
    _scrollToBottom();

    try {
      await chat.sendText(
        inbox: effectiveInbox,
        text: text,
        clientMessageId: clientMessageId,
        replyTo: reply?['_id']?.toString(),
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
      _snack(_messageFor(failure));
      return;
    }

    if (mounted) setState(() => sending = false);
  }

  Map<String, dynamic> _replyPreview(Map<String, dynamic> message) {
    final profile = message['profile'];
    final file = message['file'];
    return {
      '_id': message['_id'],
      'userId': message['userId'],
      'fullname': profile is Map
          ? profile['fullname']?.toString() ?? 'Message'
          : 'Message',
      'text': (message['text']?.toString().trim().isNotEmpty ?? false)
          ? message['text']?.toString()
          : file is Map
          ? file['originalname']?.toString() ?? 'Attachment'
          : 'Message',
    };
  }

  Future<void> _showAttachmentSheet() async {
    if (uploading) return;
    if (e2eeEnabled) {
      _snack(
        'Media sending is disabled while device E2EE is enabled because encrypted media attachments are not implemented yet.',
      );
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 18),
          child: Wrap(
            runSpacing: 4,
            children: [
              const ListTile(
                title: Text(
                  'Attach',
                  style: TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
              ListTile(
                leading: const Icon(
                  Icons.photo_library_outlined,
                  color: SyncColors.sky,
                ),
                title: const Text('Photo from gallery'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _pickImage(ImageSource.gallery);
                },
              ),
              ListTile(
                leading: const Icon(
                  Icons.camera_alt_outlined,
                  color: SyncColors.sky,
                ),
                title: const Text('Take photo'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _pickImage(ImageSource.camera);
                },
              ),
              ListTile(
                leading: const Icon(
                  Icons.video_library_outlined,
                  color: SyncColors.sky,
                ),
                title: const Text('Video from gallery'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _pickVideo(ImageSource.gallery);
                },
              ),
              ListTile(
                leading: const Icon(
                  Icons.videocam_outlined,
                  color: SyncColors.sky,
                ),
                title: const Text('Record video'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _pickVideo(ImageSource.camera);
                },
              ),
              ListTile(
                leading: const Icon(
                  Icons.description_outlined,
                  color: SyncColors.sky,
                ),
                title: const Text('Document / file'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _pickDocument();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pickImage(ImageSource source) async {
    try {
      final picked = await imagePicker.pickImage(
        source: source,
        imageQuality: 92,
      );
      if (picked == null || !mounted) return;
      await _prepareAttachment(
        filePath: picked.path,
        filename: picked.name,
        allowViewOnce: true,
      );
    } on Object catch (failure) {
      if (mounted) _snack(_messageFor(failure));
    }
  }

  Future<void> _pickVideo(ImageSource source) async {
    try {
      final picked = await imagePicker.pickVideo(source: source);
      if (picked == null || !mounted) return;
      await _prepareAttachment(
        filePath: picked.path,
        filename: picked.name,
        allowViewOnce: true,
      );
    } on Object catch (failure) {
      if (mounted) _snack(_messageFor(failure));
    }
  }

  Future<void> _pickDocument() async {
    try {
      final picked = await FilePicker.platform.pickFiles(
        allowMultiple: false,
        withData: false,
      );
      if (picked == null || picked.files.isEmpty || !mounted) return;
      final file = picked.files.single;
      final path = file.path;
      if (path == null || path.isEmpty) {
        _snack('The selected file is not available on this device.');
        return;
      }
      await _prepareAttachment(
        filePath: path,
        filename: file.name,
        allowViewOnce: false,
      );
    } on Object catch (failure) {
      if (mounted) _snack(_messageFor(failure));
    }
  }

  Future<void> _prepareAttachment({
    required String filePath,
    required String filename,
    required bool allowViewOnce,
  }) async {
    final caption = TextEditingController();
    bool viewOnce = false;
    final draft = await showDialog<_AttachmentDraft>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Send attachment'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                filename,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: caption,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Caption',
                  hintText: 'Add a caption...',
                ),
              ),
              if (allowViewOnce) ...[
                const SizedBox(height: 8),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: viewOnce,
                  title: const Text('View once'),
                  subtitle: const Text(
                    'Recipient can open this media one time.',
                  ),
                  onChanged: (value) =>
                      setDialogState(() => viewOnce = value == true),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(
                dialogContext,
                _AttachmentDraft(
                  caption: caption.text.trim(),
                  viewOnce: viewOnce,
                ),
              ),
              child: const Text('Send'),
            ),
          ],
        ),
      ),
    );
    caption.dispose();
    if (draft == null || !mounted) return;

    setState(() => uploading = true);
    try {
      final uploaded = await chat.uploadAttachment(
        filePath: filePath,
        filename: filename,
      );
      final sent = await chat.sendAttachment(
        inbox: effectiveInbox,
        file: uploaded,
        text: draft.caption,
        replyTo: replyingTo?['_id']?.toString(),
        viewOnce: draft.viewOnce,
      );
      if (!mounted) return;
      setState(() {
        uploading = false;
        replyingTo = null;
        _mergeMessages([sent]);
      });
      _scrollToBottom();
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => uploading = false);
      _snack(_messageFor(failure));
    }
  }

  Future<void> _showMessageActions(Map<String, dynamic> message) async {
    final chatId = message['_id']?.toString() ?? '';
    if (chatId.isEmpty) return;
    final mine = _isMine(message);
    final reactions = message['reactions'] is Map
        ? Map<String, dynamic>.from(message['reactions'] as Map)
        : <String, dynamic>{};
    final myReaction = reactions[currentUserId]?.toString();
    final starredBy = message['starredBy'] is List
        ? (message['starredBy'] as List).map((item) => item.toString()).toList()
        : const <String>[];
    final starred = starredBy.contains(currentUserId);
    final pinned = pinnedIds.contains(chatId);
    final viewOnce =
        message['viewOnce'] is Map && message['viewOnce']['enabled'] == true;
    final canEdit =
        mine &&
        !e2eeEnabled &&
        !viewOnce &&
        (message['text']?.toString().trim().isNotEmpty ?? false);

    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: ['👍', '❤️', '😂', '😮', '😢', '🔥'].map((emoji) {
                  return InkWell(
                    borderRadius: BorderRadius.circular(22),
                    onTap: () {
                      Navigator.pop(sheetContext);
                      chat.reactToMessage(
                        roomId: roomId,
                        chatId: chatId,
                        emoji: emoji,
                      );
                    },
                    child: Padding(
                      padding: const EdgeInsets.all(9),
                      child: Text(emoji, style: const TextStyle(fontSize: 24)),
                    ),
                  );
                }).toList(),
              ),
              if (myReaction != null && myReaction.isNotEmpty)
                ListTile(
                  leading: const Icon(Icons.emoji_emotions_outlined),
                  title: const Text('Remove my reaction'),
                  onTap: () {
                    Navigator.pop(sheetContext);
                    chat.reactToMessage(
                      roomId: roomId,
                      chatId: chatId,
                      emoji: null,
                    );
                  },
                ),
              ListTile(
                leading: const Icon(Icons.reply_rounded),
                title: const Text('Reply'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _startReply(message);
                },
              ),
              if (!e2eeEnabled)
                ListTile(
                  leading: const Icon(Icons.forward_rounded),
                  title: const Text('Forward'),
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _forwardMessage(message);
                  },
                ),
              if (canEdit)
                ListTile(
                  leading: const Icon(Icons.edit_outlined),
                  title: const Text('Edit'),
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _startEdit(message);
                  },
                ),
              ListTile(
                leading: Icon(
                  starred ? Icons.star_rounded : Icons.star_border_rounded,
                ),
                title: Text(starred ? 'Unstar' : 'Star'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _toggleStar(message, starred: !starred);
                },
              ),
              ListTile(
                leading: Icon(
                  pinned ? Icons.push_pin_rounded : Icons.push_pin_outlined,
                ),
                title: Text(pinned ? 'Unpin' : 'Pin'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _togglePin(chatId, currentlyPinned: pinned);
                },
              ),
              ListTile(
                leading: const Icon(
                  Icons.delete_outline_rounded,
                  color: SyncColors.danger,
                ),
                title: const Text('Delete for me'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  chat.deleteMessages(roomId: roomId, chatIds: [chatId]);
                },
              ),
              if (mine)
                ListTile(
                  leading: const Icon(
                    Icons.delete_forever_outlined,
                    color: SyncColors.danger,
                  ),
                  title: const Text('Delete for everyone'),
                  onTap: () {
                    Navigator.pop(sheetContext);
                    chat.deleteMessages(
                      roomId: roomId,
                      chatIds: [chatId],
                      deleteForEveryone: true,
                    );
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _forwardMessage(Map<String, dynamic> message) async {
    if (e2eeEnabled || message['e2eeEnvelope'] is Map) {
      _snack(
        'Forwarding device-E2EE messages is disabled to prevent plaintext downgrade.',
      );
      return;
    }
    final chatId = message['_id']?.toString() ?? '';
    if (chatId.isEmpty) return;
    try {
      final forwarded = await showForwardMessageSheet(
        context,
        fromRoomId: roomId,
        chatIds: [chatId],
      );
      if (forwarded == true && mounted) _snack('Message forwarded.');
    } on Object catch (failure) {
      if (mounted) _snack(_messageFor(failure));
    }
  }

  void _startReply(Map<String, dynamic> message) {
    setState(() {
      replyingTo = message;
      editingMessage = null;
    });
  }

  void _startEdit(Map<String, dynamic> message) {
    setState(() {
      editingMessage = message;
      replyingTo = null;
      composer.text = message['text']?.toString() ?? '';
      composer.selection = TextSelection.collapsed(
        offset: composer.text.length,
      );
    });
  }

  void _cancelComposerMode() {
    setState(() {
      replyingTo = null;
      editingMessage = null;
      composer.clear();
    });
  }

  Future<void> _toggleStar(
    Map<String, dynamic> message, {
    required bool starred,
  }) async {
    final chatId = message['_id']?.toString() ?? '';
    try {
      final payload = await chat.toggleStar(chatId, starred: starred);
      if (!mounted) return;
      final index = messages.indexWhere(
        (item) => item['_id']?.toString() == chatId,
      );
      if (index < 0) return;
      setState(() {
        final next = Map<String, dynamic>.from(messages[index]);
        next['starredBy'] = payload['starredBy'] is List
            ? payload['starredBy']
            : const [];
        messages[index] = next;
      });
    } on Object catch (failure) {
      if (mounted) _snack(_messageFor(failure));
    }
  }

  Future<void> _togglePin(
    String chatId, {
    required bool currentlyPinned,
  }) async {
    try {
      if (currentlyPinned) {
        await chat.unpinMessage(roomId: roomId, chatId: chatId);
      } else {
        await chat.pinMessage(roomId: roomId, chatId: chatId);
      }
      await _loadPins();
    } on Object catch (failure) {
      if (mounted) _snack(_messageFor(failure));
    }
  }

  Future<void> _openViewOnce(Map<String, dynamic> message) async {
    final chatId = message['_id']?.toString() ?? '';
    if (chatId.isEmpty) return;
    try {
      final payload = await chat.openViewOnce(chatId);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => _ViewOnceDialog(payload: payload),
      );
      _onViewOnceEvent({'chatId': chatId, 'userId': currentUserId});
    } on Object catch (failure) {
      if (mounted) _snack(_messageFor(failure));
    }
  }

  Future<void> _recordVoiceNote() async {
    if (sending || uploading || editingMessage != null) return;
    if (e2eeEnabled) {
      _snack(
        'Media sending is disabled while device E2EE is enabled because encrypted media attachments are not implemented yet.',
      );
      return;
    }

    final draft = await showVoiceRecorderSheet(context);
    if (draft == null || !mounted) return;
    setState(() => uploading = true);

    try {
      final uploaded = await chat.uploadAttachment(
        filePath: draft.path,
        filename: draft.filename,
      );
      final sent = await chat.sendAttachment(
        inbox: effectiveInbox,
        file: {...uploaded, 'type': 'audio', 'duration': draft.durationSeconds},
        replyTo: replyingTo?['_id']?.toString(),
      );
      if (!mounted) return;
      setState(() {
        uploading = false;
        replyingTo = null;
        _mergeMessages([sent]);
      });
      _scrollToBottom();
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => uploading = false);
      _snack(_messageFor(failure));
    } finally {
      await draft.delete();
    }
  }

  Future<void> _showScheduleMenu() async {
    if (e2eeEnabled) {
      _snack(
        'Scheduled send is disabled while device E2EE is enabled because the server cannot encrypt a message later without device private keys.',
      );
      return;
    }
    if (editingMessage != null) {
      _snack('Finish editing before scheduling a message.');
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(
              title: Text(
                'Schedule message',
                style: TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.schedule_send_outlined),
              title: const Text('Send later'),
              onTap: () {
                Navigator.pop(sheetContext);
                _scheduleAt(mode: 'once');
              },
            ),
            if (widget.inbox['roomType']?.toString() == 'private')
              ListTile(
                leading: const Icon(Icons.wifi_tethering_rounded),
                title: const Text('Send when online'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _scheduleWhenOnline();
                },
              ),
            ListTile(
              leading: const Icon(Icons.repeat_rounded),
              title: const Text('Daily reminder'),
              onTap: () {
                Navigator.pop(sheetContext);
                _scheduleAt(mode: 'recurring', recurringType: 'daily');
              },
            ),
            ListTile(
              leading: const Icon(Icons.calendar_view_week_outlined),
              title: const Text('Weekly reminder'),
              onTap: () {
                Navigator.pop(sheetContext);
                _scheduleAt(mode: 'recurring', recurringType: 'weekly');
              },
            ),
            ListTile(
              leading: const Icon(Icons.calendar_month_outlined),
              title: const Text('Monthly reminder'),
              onTap: () {
                Navigator.pop(sheetContext);
                _scheduleAt(mode: 'recurring', recurringType: 'monthly');
              },
            ),
            ListTile(
              leading: const Icon(Icons.manage_history_rounded),
              title: const Text('Scheduled messages'),
              onTap: () {
                Navigator.pop(sheetContext);
                _showScheduledMessages();
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _scheduleAt({
    required String mode,
    String recurringType = 'none',
  }) async {
    final text = composer.text.trim();
    if (text.isEmpty) {
      _snack('Write a message first.');
      return;
    }
    final initial = DateTime.now().add(const Duration(minutes: 5));
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 730)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
    );
    if (time == null || !mounted) return;
    final scheduled = DateTime(
      date.year,
      date.month,
      date.day,
      time.hour,
      time.minute,
    );

    try {
      await chat.scheduleMessage(
        inbox: effectiveInbox,
        text: text,
        replyTo: replyingTo?['_id']?.toString(),
        mode: mode,
        scheduledFor: scheduled,
        recurringType: recurringType,
      );
      if (!mounted) return;
      setState(() {
        composer.clear();
        replyingTo = null;
      });
      _snack(
        mode == 'recurring'
            ? 'Recurring message scheduled.'
            : 'Message scheduled.',
      );
    } on Object catch (failure) {
      if (mounted) _snack(_messageFor(failure));
    }
  }

  Future<void> _scheduleWhenOnline() async {
    final text = composer.text.trim();
    if (text.isEmpty) {
      _snack('Write a message first.');
      return;
    }
    try {
      await chat.scheduleMessage(
        inbox: effectiveInbox,
        text: text,
        replyTo: replyingTo?['_id']?.toString(),
        mode: 'when-online',
      );
      if (!mounted) return;
      setState(() {
        composer.clear();
        replyingTo = null;
      });
      _snack('Message will send when the contact is online.');
    } on Object catch (failure) {
      if (mounted) _snack(_messageFor(failure));
    }
  }

  Future<void> _showScheduledMessages() async {
    try {
      final jobs = await chat.listScheduled(roomId);
      if (!mounted) return;
      await showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (sheetContext) => SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(sheetContext).height * .58,
            child: Column(
              children: [
                const ListTile(
                  title: Text(
                    'Scheduled messages',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
                Expanded(
                  child: jobs.isEmpty
                      ? const Center(child: Text('No scheduled messages.'))
                      : ListView.separated(
                          itemCount: jobs.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (_, index) {
                            final job = jobs[index];
                            return ListTile(
                              leading: const Icon(Icons.schedule_send_outlined),
                              title: Text(
                                job['text']?.toString() ?? 'Scheduled message',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              subtitle: Text(_scheduleLabel(job)),
                              trailing: IconButton(
                                tooltip: 'Cancel',
                                onPressed: () async {
                                  final id = job['_id']?.toString() ?? '';
                                  if (id.isEmpty) return;
                                  await chat.cancelScheduled(id);
                                  if (!sheetContext.mounted) return;
                                  Navigator.pop(sheetContext);
                                  if (mounted)
                                    _snack('Scheduled message cancelled.');
                                },
                                icon: const Icon(Icons.close_rounded),
                              ),
                            );
                          },
                        ),
                ),
              ],
            ),
          ),
        ),
      );
    } on Object catch (failure) {
      if (mounted) _snack(_messageFor(failure));
    }
  }

  String _scheduleLabel(Map<String, dynamic> job) {
    final mode = job['mode']?.toString() ?? 'once';
    if (mode == 'when-online') return 'When contact is online';
    final raw = job['nextRunAt'] ?? job['scheduledFor'];
    final date = DateTime.tryParse(raw?.toString() ?? '')?.toLocal();
    final when = date == null
        ? ''
        : '${date.day}/${date.month}/${date.year} ${_clock(date)}';
    if (mode == 'recurring') {
      final recurring = job['recurringType']?.toString() ?? 'recurring';
      return '${recurring[0].toUpperCase()}${recurring.substring(1)} · $when';
    }
    return when;
  }

  bool _isMine(Map<String, dynamic> message) =>
      currentUserId.isNotEmpty &&
      message['userId']?.toString() == currentUserId;

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

  Future<void> _showE2eeSheet() async {
    if (widget.inbox['roomType']?.toString() != 'private') {
      _snack('Device E2EE is currently available for private chats only.');
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _E2eeSecuritySheet(
        chat: chat,
        roomId: roomId,
        initialEnabled: e2eeEnabled,
        onChanged: (enabled) {
          if (mounted) setState(() => e2eeEnabled = enabled);
        },
      ),
    );
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  String _messageFor(Object error) {
    if (error is ApiException) return error.message;
    return error.toString().replaceFirst('Exception: ', '');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.isDark
          ? SyncColors.spill950
          : SyncColors.slate200,
      body: SafeArea(
        child: Column(
          children: [
            _RoomHeader(
              name: widget.name,
              inbox: effectiveInbox,
              typingText: typingText,
              e2eeEnabled: e2eeEnabled,
              onSecurity: _showE2eeSheet,
            ),
            if (e2eeEnabled)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 7,
                ),
                color: context.panel,
                child: const Row(
                  children: [
                    Icon(Icons.lock_rounded, size: 15, color: SyncColors.sky),
                    SizedBox(width: 7),
                    Expanded(
                      child: Text(
                        'End-to-end encrypted · Device E2EE',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            if (pinnedIds.isNotEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 7,
                ),
                color: context.panel,
                child: Row(
                  children: [
                    const Icon(
                      Icons.push_pin_rounded,
                      size: 15,
                      color: SyncColors.sky,
                    ),
                    const SizedBox(width: 7),
                    Text(
                      '${pinnedIds.length} pinned message${pinnedIds.length == 1 ? '' : 's'}',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            Expanded(child: _body()),
            _Composer(
              controller: composer,
              sending: sending,
              uploading: uploading,
              replyingTo: replyingTo,
              editingMessage: editingMessage,
              onCancelMode: _cancelComposerMode,
              onAttachment: _showAttachmentSheet,
              onSchedule: _showScheduleMenu,
              onVoice: _recordVoiceNote,
              onTyping: () => chat.typing(effectiveInbox),
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
              const Icon(
                Icons.cloud_off_outlined,
                size: 44,
                color: SyncColors.sky,
              ),
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
          return _MessageBubble(
            message: message,
            mine: _isMine(message),
            pinned: pinnedIds.contains(message['_id']?.toString()),
            onLongPress: () => _showMessageActions(message),
            onViewOnce: () => _openViewOnce(message),
          );
        },
      ),
    );
  }
}

class _E2eeSecuritySheet extends StatefulWidget {
  const _E2eeSecuritySheet({
    required this.chat,
    required this.roomId,
    required this.initialEnabled,
    required this.onChanged,
  });

  final ChatRepository chat;
  final String roomId;
  final bool initialEnabled;
  final ValueChanged<bool> onChanged;

  @override
  State<_E2eeSecuritySheet> createState() => _E2eeSecuritySheetState();
}

class _E2eeSecuritySheetState extends State<_E2eeSecuritySheet> {
  late bool enabled;
  bool busy = false;
  String? fingerprint;
  String? error;

  @override
  void initState() {
    super.initState();
    enabled = widget.initialEnabled;
  }

  Future<void> _registerDevice() async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final record = await widget.chat.registerE2eeDevice();
      if (!mounted) return;
      setState(() {
        fingerprint = record.fingerprint;
        busy = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        busy = false;
        error = failure is ApiException
            ? failure.message
            : failure.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _toggle() async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final payload = await widget.chat.setE2eeRoomEnabled(
        widget.roomId,
        enabled: !enabled,
      );
      if (!mounted) return;
      final next = payload['enabled'] == true;
      setState(() {
        enabled = next;
        busy = false;
      });
      widget.onChanged(next);
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        busy = false;
        error = failure is ApiException
            ? failure.message
            : failure.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  String _formatFingerprint(String value) {
    final clean = value.replaceAll(RegExp(r'\s+'), '');
    final chunks = <String>[];
    for (var index = 0; index < clean.length; index += 4) {
      final end = (index + 4).clamp(0, clean.length);
      chunks.add(clean.substring(index, end));
    }
    return chunks.join(' ');
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 6, 18, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: SyncColors.sky.withValues(alpha: .12),
                  ),
                  child: Icon(
                    enabled ? Icons.lock_rounded : Icons.security_outlined,
                    color: SyncColors.sky,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'End-to-end encryption',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      Text(
                        enabled
                            ? 'Enabled for this private chat'
                            : 'Available for this private chat',
                        style: TextStyle(fontSize: 12, color: context.muted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              'Messages use ECDH P-256, HKDF-SHA256 and AES-256-GCM. Private keys stay in secure storage on this device and are never uploaded.',
              style: TextStyle(height: 1.4, color: context.muted),
            ),
            const SizedBox(height: 14),
            if (error != null)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(11),
                decoration: BoxDecoration(
                  color: SyncColors.danger.withValues(alpha: .08),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(error!, style: const TextStyle(fontSize: 12)),
              ),
            if (fingerprint != null) ...[
              Text(
                'This device security code',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: context.muted,
                ),
              ),
              const SizedBox(height: 5),
              SelectableText(
                _formatFingerprint(fingerprint!),
                style: const TextStyle(
                  fontSize: 11,
                  fontFamily: 'monospace',
                  height: 1.45,
                ),
              ),
              const SizedBox(height: 14),
            ],
            if (busy) const LinearProgressIndicator(minHeight: 2),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: busy ? null : _registerDevice,
                    icon: const Icon(Icons.phonelink_lock_outlined),
                    label: const Text('Register this device'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: busy ? null : _toggle,
                    icon: Icon(
                      enabled ? Icons.lock_open_rounded : Icons.lock_rounded,
                    ),
                    label: Text(enabled ? 'Disable' : 'Enable'),
                  ),
                ),
              ],
            ),
            if (enabled) ...[
              const SizedBox(height: 12),
              Text(
                'Encrypted media, scheduled send, forwarding and message editing remain disabled until encrypted versions of those protocols are supported.',
                style: TextStyle(
                  fontSize: 11,
                  height: 1.35,
                  color: context.muted,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _RoomHeader extends StatelessWidget {
  const _RoomHeader({
    required this.name,
    required this.inbox,
    required this.typingText,
    required this.e2eeEnabled,
    required this.onSecurity,
  });

  final String name;
  final Map<String, dynamic> inbox;
  final String typingText;
  final bool e2eeEnabled;
  final VoidCallback onSecurity;

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
                  typingText.isNotEmpty
                      ? typingText
                      : e2eeEnabled
                      ? 'End-to-end encrypted'
                      : group
                      ? 'Group conversation'
                      : 'SyncChat contact',
                  style: TextStyle(
                    fontSize: 12,
                    color: typingText.isNotEmpty
                        ? SyncColors.sky
                        : context.muted,
                    fontWeight: typingText.isNotEmpty
                        ? FontWeight.w700
                        : FontWeight.w400,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.videocam_outlined),
          ),
          IconButton(onPressed: () {}, icon: const Icon(Icons.call_outlined)),
          IconButton(
            tooltip: 'Security',
            onPressed: onSecurity,
            icon: Icon(
              e2eeEnabled ? Icons.lock_rounded : Icons.security_outlined,
            ),
          ),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.message,
    required this.mine,
    required this.pinned,
    required this.onLongPress,
    required this.onViewOnce,
  });

  final Map<String, dynamic> message;
  final bool mine;
  final bool pinned;
  final VoidCallback onLongPress;
  final VoidCallback onViewOnce;

  @override
  Widget build(BuildContext context) {
    final text = message['text']?.toString() ?? '';
    final failed = message['failed'] == true;
    final pending = message['pending'] == true;
    final read = message['readed'] == true;
    final delivered = message['delivered'] == true;
    final profile = message['profile'];
    final sender = profile is Map ? profile['fullname']?.toString() : null;
    final reactions = _reactionSummary(message['reactions']);
    final reply = message['reply'];

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: GestureDetector(
        onLongPress: onLongPress,
        child: Container(
          constraints: BoxConstraints(
            maxWidth: MediaQuery.sizeOf(context).width * .78,
          ),
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
              BoxShadow(
                color: Color(0x160F172A),
                blurRadius: 5,
                offset: Offset(0, 2),
              ),
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
              if (reply is Map)
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 6),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 9,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    color: context.softPanel.withOpacity(.7),
                    borderRadius: BorderRadius.circular(10),
                    border: const Border(
                      left: BorderSide(color: SyncColors.sky, width: 3),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        reply['fullname']?.toString() ?? 'Reply',
                        style: const TextStyle(
                          color: SyncColors.sky,
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      Text(
                        reply['text']?.toString() ?? 'Message',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12),
                      ),
                    ],
                  ),
                ),
              _AttachmentContent(message: message, onViewOnce: onViewOnce),
              if (text.isNotEmpty) ...[
                if (message['file'] != null || message['viewOnce'] != null)
                  const SizedBox(height: 6),
                Text(text, style: const TextStyle(height: 1.28)),
              ],
              if (reactions.isNotEmpty) ...[
                const SizedBox(height: 6),
                Wrap(
                  spacing: 5,
                  runSpacing: 4,
                  children: reactions.entries
                      .map(
                        (entry) => Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 7,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: context.softPanel,
                            borderRadius: BorderRadius.circular(99),
                            border: Border.all(color: context.border),
                          ),
                          child: Text(
                            '${entry.key} ${entry.value}',
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ],
              const SizedBox(height: 4),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (message['e2eeEnvelope'] is Map) ...[
                    const Icon(
                      Icons.lock_rounded,
                      size: 12,
                      color: SyncColors.sky,
                    ),
                    const SizedBox(width: 3),
                  ],
                  if (pinned) ...[
                    const Icon(
                      Icons.push_pin_rounded,
                      size: 12,
                      color: SyncColors.sky,
                    ),
                    const SizedBox(width: 3),
                  ],
                  if (message['isEdited'] == true) ...[
                    Text(
                      'edited',
                      style: TextStyle(fontSize: 9, color: context.muted),
                    ),
                    const SizedBox(width: 4),
                  ],
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
      ),
    );
  }

  Map<String, int> _reactionSummary(dynamic value) {
    if (value is! Map) return const {};
    final summary = <String, int>{};
    for (final emoji in value.values) {
      final key = emoji?.toString() ?? '';
      if (key.isEmpty) continue;
      summary[key] = (summary[key] ?? 0) + 1;
    }
    return summary;
  }

  static String _time(dynamic value) {
    final date = DateTime.tryParse(value?.toString() ?? '')?.toLocal();
    if (date == null) return '';
    return _clock(date);
  }
}

class _AttachmentContent extends StatelessWidget {
  const _AttachmentContent({required this.message, required this.onViewOnce});

  final Map<String, dynamic> message;
  final VoidCallback onViewOnce;

  @override
  Widget build(BuildContext context) {
    final viewOnce = message['viewOnce'];
    if (viewOnce is Map && viewOnce['enabled'] == true) {
      final opened = viewOnce['opened'] == true;
      final type = viewOnce['type']?.toString() ?? 'message';
      return InkWell(
        onTap: opened ? null : onViewOnce,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: 210,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
          decoration: BoxDecoration(
            color: context.softPanel,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: context.border),
          ),
          child: Row(
            children: [
              Icon(
                opened
                    ? Icons.check_circle_outline_rounded
                    : Icons.looks_one_outlined,
                color: SyncColors.sky,
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      type == 'image'
                          ? 'View-once photo'
                          : type == 'video'
                          ? 'View-once video'
                          : 'View-once message',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    Text(
                      opened ? 'Opened' : 'Tap to open',
                      style: TextStyle(fontSize: 11, color: context.muted),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    final rawFile = message['file'];
    if (rawFile is! Map) return const SizedBox.shrink();
    final file = Map<String, dynamic>.from(rawFile);
    final type = file['type']?.toString() ?? 'document';
    final url = file['url']?.toString() ?? '';
    final name = file['originalname']?.toString() ?? 'Attachment';

    if (type == 'image' && url.isNotEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Image.network(
          url,
          width: 230,
          height: 180,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => _FileCard(
            icon: Icons.broken_image_outlined,
            title: name,
            subtitle: 'Image',
          ),
        ),
      );
    }

    if (type == 'video') {
      return _FileCard(
        icon: Icons.play_circle_outline_rounded,
        title: name,
        subtitle: 'Video',
      );
    }
    if (type == 'audio' && url.isNotEmpty) {
      return VoiceNotePlayer(file: file);
    }
    if (type == 'audio') {
      return _FileCard(
        icon: Icons.graphic_eq_rounded,
        title: name,
        subtitle: 'Audio',
      );
    }
    return _FileCard(
      icon: Icons.insert_drive_file_outlined,
      title: name,
      subtitle: 'File',
    );
  }
}

class _FileCard extends StatelessWidget {
  const _FileCard({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 230,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: context.softPanel,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.border),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: SyncColors.sky.withOpacity(.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: SyncColors.sky),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  subtitle,
                  style: TextStyle(fontSize: 10, color: context.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ViewOnceDialog extends StatelessWidget {
  const _ViewOnceDialog({required this.payload});

  final Map<String, dynamic> payload;

  @override
  Widget build(BuildContext context) {
    final type = payload['viewOnceType']?.toString() ?? 'text';
    final text = payload['text']?.toString() ?? '';
    final file = payload['file'];
    final url = file is Map ? file['url']?.toString() ?? '' : '';
    final name = file is Map
        ? file['originalname']?.toString() ?? 'Media'
        : 'Media';

    Widget content;
    if (type == 'image' && url.isNotEmpty) {
      content = Image.network(
        url,
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) =>
            const Center(child: Text('Image could not be displayed.')),
      );
    } else if (type == 'video') {
      content = Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.play_circle_outline_rounded,
            size: 64,
            color: SyncColors.sky,
          ),
          const SizedBox(height: 10),
          Text(name, textAlign: TextAlign.center),
          const SizedBox(height: 4),
          const Text(
            'Video opened. Native playback is added in the media-runtime wave.',
          ),
        ],
      );
    } else {
      content = Text(text.isEmpty ? 'One-time message opened.' : text);
    }

    return AlertDialog(
      title: const Row(
        children: [
          Icon(Icons.looks_one_outlined, color: SyncColors.sky),
          SizedBox(width: 8),
          Text('View once'),
        ],
      ),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420, maxHeight: 520),
        child: content,
      ),
      actions: [
        FilledButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Close'),
        ),
      ],
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.sending,
    required this.uploading,
    required this.replyingTo,
    required this.editingMessage,
    required this.onCancelMode,
    required this.onAttachment,
    required this.onSchedule,
    required this.onVoice,
    required this.onTyping,
    required this.onSend,
  });

  final TextEditingController controller;
  final bool sending;
  final bool uploading;
  final Map<String, dynamic>? replyingTo;
  final Map<String, dynamic>? editingMessage;
  final VoidCallback onCancelMode;
  final VoidCallback onAttachment;
  final VoidCallback onSchedule;
  final VoidCallback onVoice;
  final VoidCallback onTyping;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final modeMessage = editingMessage ?? replyingTo;
    final modeTitle = editingMessage != null ? 'Editing message' : 'Replying';
    return Container(
      padding: EdgeInsets.fromLTRB(
        8,
        7,
        8,
        MediaQuery.paddingOf(context).bottom + 8,
      ),
      decoration: BoxDecoration(
        color: context.panel,
        border: Border(top: BorderSide(color: context.border)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (modeMessage != null)
            Container(
              margin: const EdgeInsets.fromLTRB(4, 0, 4, 7),
              padding: const EdgeInsets.fromLTRB(10, 7, 4, 7),
              decoration: BoxDecoration(
                color: context.softPanel,
                borderRadius: BorderRadius.circular(12),
                border: const Border(
                  left: BorderSide(color: SyncColors.sky, width: 3),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          modeTitle,
                          style: const TextStyle(
                            color: SyncColors.sky,
                            fontSize: 11,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        Text(
                          modeMessage['text']?.toString().trim().isNotEmpty ==
                                  true
                              ? modeMessage['text'].toString()
                              : 'Attachment',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: onCancelMode,
                    icon: const Icon(Icons.close_rounded, size: 18),
                  ),
                ],
              ),
            ),
          if (uploading)
            const Padding(
              padding: EdgeInsets.only(bottom: 7),
              child: LinearProgressIndicator(minHeight: 2),
            ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              IconButton(
                onPressed: uploading ? null : onAttachment,
                icon: const Icon(Icons.add_circle_outline_rounded),
              ),
              Expanded(
                child: TextField(
                  controller: controller,
                  minLines: 1,
                  maxLines: 5,
                  textCapitalization: TextCapitalization.sentences,
                  onChanged: (_) => onTyping(),
                  onSubmitted: (_) => onSend(),
                  decoration: InputDecoration(
                    hintText: editingMessage != null
                        ? 'Edit message'
                        : 'Message',
                    prefixIcon: const Icon(Icons.emoji_emotions_outlined),
                    suffixIcon: IconButton(
                      tooltip: 'Schedule',
                      onPressed: uploading ? null : onSchedule,
                      icon: const Icon(Icons.schedule_send_outlined),
                    ),
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Voice message',
                onPressed: sending || uploading ? null : onVoice,
                icon: const Icon(Icons.mic_none_rounded),
              ),
              const SizedBox(width: 2),
              Material(
                color: SyncColors.sky,
                shape: const CircleBorder(),
                child: InkWell(
                  onTap: sending || uploading ? null : onSend,
                  onLongPress: sending || uploading ? null : onSchedule,
                  customBorder: const CircleBorder(),
                  child: SizedBox(
                    width: 46,
                    height: 46,
                    child: sending
                        ? const Padding(
                            padding: EdgeInsets.all(13),
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(
                            Icons.send_rounded,
                            color: Colors.white,
                            size: 20,
                          ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AttachmentDraft {
  const _AttachmentDraft({required this.caption, required this.viewOnce});

  final String caption;
  final bool viewOnce;
}

String _clock(DateTime date) {
  final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
  final minute = date.minute.toString().padLeft(2, '0');
  final suffix = date.hour >= 12 ? 'PM' : 'AM';
  return '$hour:$minute $suffix';
}
