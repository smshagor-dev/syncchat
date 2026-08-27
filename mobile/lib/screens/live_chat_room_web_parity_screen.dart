import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../core/chat_repository.dart';
import '../core/permission_manager.dart';
import '../core/realtime_client.dart';
import '../theme.dart';
import '../widgets.dart';
import 'forward_message_sheet.dart';
import 'live_call_screen.dart';
import 'live_groups_screen.dart';
import 'live_room_profile_screen.dart';
import 'voice_note_widgets.dart';

const _pollPrefix = '__poll__::';
const _eventPrefix = '__event__::';

class WebParityChatRoomScreen extends StatefulWidget {
  const WebParityChatRoomScreen({
    super.key,
    required this.inbox,
    required this.name,
  });

  final Map<String, dynamic> inbox;
  final String name;

  @override
  State<WebParityChatRoomScreen> createState() => _WebParityChatRoomScreenState();
}

class _WebParityChatRoomScreenState extends State<WebParityChatRoomScreen> {
  final composer = TextEditingController();
  final search = TextEditingController();
  final scroll = ScrollController();
  final imagePicker = ImagePicker();
  final messages = <Map<String, dynamic>>[];

  late ChatRepository chat;
  StreamSubscription<RealtimeConnectionState>? connectionSubscription;
  Timer? presenceTimer;
  Timer? apiFallbackTimer;

  Map<String, dynamic>? currentUser;
  Map<String, dynamic>? liveInbox;
  Map<String, dynamic> blockState = const {};
  Map<String, dynamic> pinPayload = const {};
  Map<String, dynamic>? replyingTo;
  Map<String, dynamic>? editingMessage;

  Set<String>? selectedMessageIds;
  bool loading = true;
  bool sending = false;
  bool uploading = false;
  bool searchOpen = false;
  bool pinsExpanded = false;
  bool mobileActionsOpen = false;
  bool viewOnceText = false;
  bool e2eeEnabled = false;
  String wallpaperPreset = 'whatsapp';
  String typingText = '';
  String? error;
  int lastSequence = 0;

  String get roomId => widget.inbox['roomId']?.toString() ?? '';
  String get currentUserId => currentUser?['_id']?.toString() ?? '';
  bool get isGroup => effectiveInbox['roomType']?.toString() == 'group';
  bool get isChannel => effectiveInbox['channel'] is Map;
  bool get isPrivate => !isGroup;
  bool get selectMode => selectedMessageIds != null;

  Map<String, dynamic> get effectiveInbox => {
        ...(liveInbox ?? widget.inbox),
        'e2eeEnabled': e2eeEnabled,
      };

  Map<String, dynamic> get group => _map(effectiveInbox['group']);
  Map<String, dynamic> get channel => _map(effectiveInbox['channel']);

  String get friendId {
    if (!isPrivate) return '';
    final owners = effectiveInbox['owners'];
    if (owners is! List) return '';
    for (final raw in owners.whereType<Map>()) {
      final value = Map<String, dynamic>.from(raw);
      final id = value['userId']?.toString() ?? '';
      if (id.isNotEmpty && id != currentUserId) return id;
    }
    final ownersId = effectiveInbox['ownersId'];
    if (ownersId is List) {
      for (final raw in ownersId) {
        final id = raw.toString();
        if (id.isNotEmpty && id != currentUserId) return id;
      }
    }
    return '';
  }

  Map<String, dynamic> get friendProfile {
    if (!isPrivate) return const {};
    final owners = effectiveInbox['owners'];
    if (owners is List) {
      for (final raw in owners.whereType<Map>()) {
        final value = Map<String, dynamic>.from(raw);
        if (value['userId']?.toString() == friendId) return value;
      }
    }
    return _map(effectiveInbox['profile']);
  }

  bool get blockedByMe => blockState['youBlocked'] == true;
  bool get blockedByFriend => blockState['blockedYou'] == true;

  bool get isGroupMember {
    if (!isGroup) return false;
    return _ids(group['participantsId']).contains(currentUserId);
  }

  bool get isGroupAdmin {
    if (!isGroup) return false;
    if (group['adminId']?.toString() == currentUserId) return true;
    if (_ids(group['adminsId']).contains(currentUserId)) return true;
    final admins = group['admins'];
    if (admins is List) {
      return admins.whereType<Map>().any(
            (item) => item['userId']?.toString() == currentUserId || item['_id']?.toString() == currentUserId,
          );
    }
    return false;
  }

  bool get memberCanSend {
    if (!isGroup) return true;
    if (isGroupAdmin) return true;
    final permissions = _map(group['permissions']);
    if (permissions.containsKey('memberCanSendMessage')) {
      return permissions['memberCanSendMessage'] != false;
    }
    return !isChannel;
  }

  bool get adminOnly => isGroup && isGroupMember && !isGroupAdmin && !memberCanSend;

  int get slowModeSeconds {
    final moderation = _map(group['moderation']);
    return (moderation['slowModeSeconds'] as num?)?.toInt() ?? 0;
  }

  List<Map<String, dynamic>> get pinnedItems {
    final raw = pinPayload['pinned'];
    if (raw is! List) return const [];
    return raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList(growable: false);
  }

  Set<String> get pinnedIds => pinnedItems
      .map((e) => e['chatId']?.toString() ?? '')
      .where((e) => e.isNotEmpty)
      .toSet();

  List<Map<String, dynamic>> get pinHistory {
    final raw = pinPayload['history'];
    if (raw is! List) return const [];
    return raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList(growable: false);
  }

  List<Map<String, dynamic>> get visibleMessages {
    final query = search.text.trim().toLowerCase();
    if (query.isEmpty) return List<Map<String, dynamic>>.unmodifiable(messages);
    return messages.where((message) {
      final profile = _map(message['profile']);
      final file = _map(message['file']);
      final blob = [
        message['text'],
        profile['fullname'],
        profile['username'],
        file['originalname'],
      ].map((e) => e?.toString().toLowerCase() ?? '').join(' ');
      return blob.contains(query);
    }).toList(growable: false);
  }

  @override
  void initState() {
    super.initState();
    liveInbox = Map<String, dynamic>.from(widget.inbox);
    e2eeEnabled = widget.inbox['roomType']?.toString() == 'private' && widget.inbox['e2eeEnabled'] == true;
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  @override
  void dispose() {
    if (currentUser != null) {
      chat.off('chat/insert', _onChatInsert);
      chat.off('chat/receipt', _onReceipt);
      chat.off('chat/error', _onChatError);
      chat.off('chat/sync-result', _onSyncResult);
      chat.off('chat/react', _onReaction);
      chat.off('chat/edit', _onEdit);
      chat.off('chat/delete', _onDelete);
      chat.off('chat/view-once', _onViewOnceEvent);
      chat.off('chat/pins', _onPinsEvent);
      chat.off('chat/typing', _onTyping);
      chat.off('chat/typing-ends', _onTypingEnds);
      chat.off('e2ee/room', _onE2eeRoom);
    }
    connectionSubscription?.cancel();
    presenceTimer?.cancel();
    apiFallbackTimer?.cancel();
    composer.dispose();
    search.dispose();
    scroll.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    chat = context.services.chat;
    chat.on('chat/insert', _onChatInsert);
    chat.on('chat/receipt', _onReceipt);
    chat.on('chat/error', _onChatError);
    chat.on('chat/sync-result', _onSyncResult);
    chat.on('chat/react', _onReaction);
    chat.on('chat/edit', _onEdit);
    chat.on('chat/delete', _onDelete);
    chat.on('chat/view-once', _onViewOnceEvent);
    chat.on('chat/pins', _onPinsEvent);
    chat.on('chat/typing', _onTyping);
    chat.on('chat/typing-ends', _onTypingEnds);
    chat.on('e2ee/room', _onE2eeRoom);

    final cachedUser = await context.services.chatCache.readCurrentUser();
    final cachedMessages = await context.services.chatCache.readRoomMessages(roomId);
    if (mounted && (cachedUser.isNotEmpty || cachedMessages.isNotEmpty)) {
      setState(() {
        if (cachedUser.isNotEmpty) currentUser = cachedUser;
        _mergeMessages(cachedMessages);
        loading = false;
      });
    }

    final realtime = context.services.realtime;
    connectionSubscription = realtime.states.listen((state) {
      if (state == RealtimeConnectionState.connected) {
        apiFallbackTimer?.cancel();
        unawaited(_catchUp());
        unawaited(_refreshRoom());
      } else if (state == RealtimeConnectionState.disconnected) {
        _scheduleApiFallback();
      }
    });
    if (realtime.state == RealtimeConnectionState.disconnected) {
      unawaited(realtime.connect());
      _scheduleApiFallback();
    }

    presenceTimer = Timer.periodic(const Duration(minutes: 1), (_) => _refreshRoom());
    await _reload(initial: true);
  }

  void _scheduleApiFallback() {
    apiFallbackTimer?.cancel();
    apiFallbackTimer = Timer(const Duration(milliseconds: 500), () {
      if (!mounted || context.services.realtime.isConnected) return;
      unawaited(_reload());
    });
  }

  Future<void> _reload({bool initial = false}) async {
    if (!mounted) return;
    if (initial && messages.isEmpty) setState(() => loading = true);
    try {
      final results = await Future.wait<dynamic>([
        chat.currentUser(refresh: true),
        chat.listRoom(roomId, limit: 100),
        chat.pinnedMessages(roomId),
        context.services.inbox.findByRoom(roomId),
        isPrivate
            ? chat.e2eeRoomState(roomId)
            : Future<Map<String, dynamic>>.value(const {'enabled': false}),
      ]);
      final me = Map<String, dynamic>.from(results[0] as Map);
      final rows = (results[1] as List)
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList(growable: false);
      final fresh = Map<String, dynamic>.from(results[3] as Map);
      Map<String, dynamic> nextBlock = const {};
      final nextFriendId = _friendIdFrom(fresh, me['_id']?.toString() ?? '');
      if (fresh['roomType']?.toString() == 'private' && nextFriendId.isNotEmpty) {
        try {
          nextBlock = await context.services.contacts.blockState(nextFriendId);
        } on Object {
          nextBlock = const {};
        }
      }
      await chat.openRoom(roomId);
      await chat.markRoomRead(fresh.isEmpty ? widget.inbox : fresh);
      if (!mounted) return;
      setState(() {
        currentUser = me;
        liveInbox = fresh.isEmpty ? Map<String, dynamic>.from(widget.inbox) : fresh;
        messages.clear();
        lastSequence = 0;
        _mergeMessages(rows);
        pinPayload = Map<String, dynamic>.from(results[2] as Map);
        blockState = nextBlock;
        e2eeEnabled = Map<String, dynamic>.from(results[4] as Map)['enabled'] == true;
        loading = false;
        error = null;
      });
      for (final message in messages) {
        if (!_isMine(message)) chat.sendReceipt(message, read: true);
      }
      _scrollToBottom();
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = _errorText(failure);
      });
    }
  }

  Future<void> _refreshRoom() async {
    if (!mounted || roomId.isEmpty) return;
    try {
      final fresh = await context.services.inbox.findByRoom(roomId);
      if (!mounted || fresh.isEmpty) return;
      setState(() => liveInbox = fresh);
    } on Object {
      // Presence refresh is deliberately silent.
    }
  }

  Future<void> _catchUp() async {
    if (!mounted) return;
    try {
      await chat.openRoom(roomId);
      final rows = await chat.syncRoom(roomId, afterSequence: lastSequence);
      if (!mounted || rows.isEmpty) return;
      setState(() => _mergeMessages(rows));
      await chat.markRoomRead(effectiveInbox);
      _scrollToBottom();
    } on Object {
      // HTTP history stays as fallback.
    }
  }

  void _mergeMessages(Iterable<Map<String, dynamic>> incoming) {
    for (final raw in incoming) {
      final message = Map<String, dynamic>.from(raw);
      final id = message['_id']?.toString() ?? '';
      final clientId = message['clientMessageId']?.toString() ?? '';
      final index = messages.indexWhere((item) {
        if (id.isNotEmpty && item['_id']?.toString() == id) return true;
        return clientId.isNotEmpty && item['clientMessageId']?.toString() == clientId;
      });
      if (index >= 0) {
        messages[index] = message;
      } else {
        messages.add(message);
      }
      final sequence = (message['sequence'] as num?)?.toInt() ?? 0;
      if (sequence > lastSequence) lastSequence = sequence;
    }
    messages.sort((a, b) => _date(a['createdAt']).compareTo(_date(b['createdAt'])));
  }

  void _onChatInsert(dynamic data) async {
    if (!mounted || data is! Map || data['roomId']?.toString() != roomId) return;
    final message = await chat.decryptMessage(Map<String, dynamic>.from(data));
    if (!mounted) return;
    setState(() => _mergeMessages([message]));
    if (!_isMine(message)) {
      chat.sendReceipt(message, read: true);
      unawaited(chat.markRoomRead(effectiveInbox));
    }
    _scrollToBottom();
  }

  void _onSyncResult(dynamic data) async {
    if (!mounted || data is! Map || data['roomId']?.toString() != roomId) return;
    final raw = data['messages'];
    if (raw is! List) return;
    final rows = <Map<String, dynamic>>[];
    for (final item in raw.whereType<Map>()) {
      rows.add(await chat.decryptMessage(Map<String, dynamic>.from(item)));
    }
    if (!mounted) return;
    setState(() => _mergeMessages(rows));
  }

  void _onReceipt(dynamic data) {
    if (!mounted || data is! Map || data['roomId']?.toString() != roomId) return;
    final id = data['chatId']?.toString() ?? '';
    final index = messages.indexWhere((m) => m['_id']?.toString() == id);
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
    final id = data['chatId']?.toString() ?? '';
    final index = messages.indexWhere((m) => m['_id']?.toString() == id);
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
    final id = data['chatId']?.toString() ?? '';
    final index = messages.indexWhere((m) => m['_id']?.toString() == id);
    if (index < 0) return;
    setState(() {
      final next = Map<String, dynamic>.from(messages[index]);
      next['text'] = data['text'] ?? next['text'];
      next['replyTo'] = data['replyTo'];
      next['isEdited'] = data['isEdited'] == true;
      next['editedAt'] = data['editedAt'];
      messages[index] = next;
      if (editingMessage?['_id']?.toString() == id) editingMessage = null;
    });
  }

  void _onDelete(dynamic data) {
    if (!mounted || data is! Map || data['chatsId'] is! List) return;
    final ids = (data['chatsId'] as List).map((e) => e.toString()).toSet();
    setState(() {
      messages.removeWhere((m) => ids.contains(m['_id']?.toString()));
      selectedMessageIds?.removeAll(ids);
      if (replyingTo != null && ids.contains(replyingTo!['_id']?.toString())) replyingTo = null;
      if (editingMessage != null && ids.contains(editingMessage!['_id']?.toString())) {
        editingMessage = null;
        composer.clear();
      }
    });
  }

  void _onViewOnceEvent(dynamic data) {
    if (!mounted || data is! Map) return;
    final id = data['chatId']?.toString() ?? '';
    final index = messages.indexWhere((m) => m['_id']?.toString() == id);
    if (index < 0) return;
    setState(() {
      final next = Map<String, dynamic>.from(messages[index]);
      final view = _map(next['viewOnce']);
      next['viewOnce'] = {...view, 'enabled': true, 'opened': true, 'label': 'Opened'};
      messages[index] = next;
    });
  }

  void _onPinsEvent(dynamic data) {
    if (data is Map && data['roomId']?.toString() != roomId) return;
    unawaited(_loadPins());
  }

  void _onTyping(dynamic data) {
    if (!mounted) return;
    final text = data is Map
        ? data['text']?.toString() ?? data['name']?.toString() ?? 'typing...'
        : data?.toString() ?? 'typing...';
    setState(() => typingText = text.isEmpty ? 'typing...' : text);
  }

  void _onTypingEnds(dynamic _) {
    if (mounted) setState(() => typingText = '');
  }

  void _onChatError(dynamic data) {
    final text = data is Map ? data['message']?.toString() : null;
    _snack(text ?? 'Message could not be sent.');
  }

  void _onE2eeRoom(dynamic data) {
    if (!mounted || data is! Map || data['roomId']?.toString() != roomId) return;
    setState(() => e2eeEnabled = data['enabled'] == true);
  }

  Future<void> _loadPins() async {
    try {
      final value = await chat.pinnedMessages(roomId);
      if (mounted) setState(() => pinPayload = value);
    } on Object {
      // Non-blocking.
    }
  }

  bool _isMine(Map<String, dynamic> message) =>
      currentUserId.isNotEmpty && message['userId']?.toString() == currentUserId;

  Future<void> _send() async {
    final text = composer.text.trim();
    if (text.isEmpty || sending || uploading || !_canSendNow) return;

    if (editingMessage != null) {
      if (e2eeEnabled) {
        _snack('Editing is unavailable in device-E2EE chat.');
        return;
      }
      setState(() => sending = true);
      try {
        await chat.editMessage(
          roomId: roomId,
          chatId: editingMessage!['_id']?.toString() ?? '',
          text: text,
          replyTo: editingMessage!['replyTo']?.toString(),
        );
        if (!mounted) return;
        setState(() {
          sending = false;
          editingMessage = null;
          composer.clear();
        });
      } on Object catch (failure) {
        if (mounted) {
          setState(() => sending = false);
          _snack(_errorText(failure));
        }
      }
      return;
    }

    final user = currentUser ?? await chat.currentUser();
    final clientId = chat.createClientMessageId();
    final reply = replyingTo;
    final optimistic = <String, dynamic>{
      'clientMessageId': clientId,
      'roomId': roomId,
      'roomType': effectiveInbox['roomType']?.toString() ?? 'private',
      'userId': user['_id'],
      'text': text,
      'replyTo': reply?['_id'],
      'reply': reply == null ? null : _replyPreview(reply),
      'viewOnce': viewOnceText ? {'enabled': true, 'type': 'text'} : null,
      'createdAt': DateTime.now().toUtc().toIso8601String(),
      'pending': true,
      'profile': {
        'fullname': user['fullname'] ?? user['username'] ?? 'You',
        'avatar': user['avatar'],
      },
    };
    setState(() {
      sending = true;
      composer.clear();
      replyingTo = null;
      viewOnceText = false;
      mobileActionsOpen = false;
      _mergeMessages([optimistic]);
    });
    _scrollToBottom();
    try {
      await chat.sendText(
        inbox: effectiveInbox,
        text: text,
        clientMessageId: clientId,
        replyTo: reply?['_id']?.toString(),
        viewOnce: optimistic['viewOnce'] != null,
      );
      if (mounted) setState(() => sending = false);
    } on Object catch (failure) {
      if (!mounted) return;
      final index = messages.indexWhere((m) => m['clientMessageId']?.toString() == clientId);
      setState(() {
        sending = false;
        if (index >= 0) {
          messages[index] = {...messages[index], 'pending': false, 'failed': true};
        }
      });
      _snack(_errorText(failure));
    }
  }

  bool get _canSendNow {
    if (blockedByMe || blockedByFriend || adminOnly) return false;
    if (isGroup) return isGroupMember && memberCanSend;
    return friendProfile['active'] != false;
  }

  Map<String, dynamic> _replyPreview(Map<String, dynamic> message) {
    final profile = _map(message['profile']);
    final file = _map(message['file']);
    return {
      '_id': message['_id'],
      'userId': message['userId'],
      'fullname': profile['fullname'] ?? profile['username'] ?? 'Message',
      'text': (message['text']?.toString().trim().isNotEmpty ?? false)
          ? message['text']
          : file['originalname'] ?? 'Attachment',
    };
  }

  Future<void> _openAttachmentMenu() async {
    if (uploading || !_canSendNow) return;
    if (e2eeEnabled) {
      _snack('Media sending is unavailable while device E2EE is enabled.');
      return;
    }
    setState(() => mobileActionsOpen = false);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => SafeArea(
        child: Container(
          margin: const EdgeInsets.all(12),
          padding: const EdgeInsets.fromLTRB(12, 14, 12, 16),
          decoration: BoxDecoration(
            color: context.panel,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: context.border),
            boxShadow: const [
              BoxShadow(color: Color(0x2A0F172A), blurRadius: 34, offset: Offset(0, 16)),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('ATTACH', style: TextStyle(fontSize: 11, letterSpacing: 1.8, fontWeight: FontWeight.w800)),
                        SizedBox(height: 2),
                        Text('Share something', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                      ],
                    ),
                  ),
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: SyncColors.success.withValues(alpha: .10),
                    ),
                    child: const Icon(Icons.add_rounded, color: SyncColors.success),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 2.22,
                children: [
                  _attachCard(sheetContext, 'Documents', 'PDF, ZIP, DOC', Icons.insert_drive_file_outlined, _pickDocument),
                  _attachCard(sheetContext, 'Photos & Video', 'Gallery', Icons.photo_library_outlined, _pickMedia),
                  _attachCard(sheetContext, 'Camera', 'camera', Icons.camera_alt_outlined, _pickCamera),
                  _attachCard(sheetContext, 'Audio', 'audio', Icons.mic_none_rounded, _pickAudio),
                  _attachCard(sheetContext, 'Location', 'Live pin', Icons.location_on_outlined, _sendLocation),
                  _attachCard(sheetContext, 'Contact', 'Share card', Icons.account_circle_outlined, _sendContact),
                  _attachCard(sheetContext, 'Poll', 'poll', Icons.poll_outlined, _sendPoll),
                  _attachCard(sheetContext, 'Event', 'event', Icons.event_outlined, _sendEvent),
                  _attachCard(sheetContext, 'New Sticker', 'sticker', Icons.emoji_emotions_outlined, _sendSticker),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _attachCard(
    BuildContext sheetContext,
    String title,
    String subtitle,
    IconData icon,
    Future<void> Function() action,
  ) {
    return InkWell(
      borderRadius: BorderRadius.circular(17),
      onTap: () {
        Navigator.pop(sheetContext);
        unawaited(action());
      },
      child: Container(
        padding: const EdgeInsets.all(9),
        decoration: BoxDecoration(
          color: context.softPanel,
          borderRadius: BorderRadius.circular(17),
          border: Border.all(color: context.border),
        ),
        child: Row(
          children: [
            Container(
              width: 39,
              height: 39,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                color: SyncColors.sky.withValues(alpha: .11),
              ),
              child: Icon(icon, color: SyncColors.sky, size: 20),
            ),
            const SizedBox(width: 9),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
                  Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10, color: context.muted)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickMedia() async {
    try {
      final picked = await imagePicker.pickMedia();
      if (picked == null || !mounted) return;
      await _uploadAndSend(picked.path, picked.name, allowViewOnce: true);
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _pickCamera() async {
    try {
      final picked = await imagePicker.pickImage(source: ImageSource.camera, imageQuality: 92);
      if (picked == null || !mounted) return;
      await _uploadAndSend(picked.path, picked.name, allowViewOnce: true);
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _pickDocument() async {
    try {
      final picked = await FilePicker.platform.pickFiles(allowMultiple: false, withData: false);
      if (picked == null || picked.files.isEmpty || !mounted) return;
      final file = picked.files.single;
      if (file.path == null) return;
      await _uploadAndSend(file.path!, file.name, allowViewOnce: false);
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _pickAudio() async {
    try {
      final picked = await FilePicker.platform.pickFiles(type: FileType.audio, allowMultiple: false, withData: false);
      if (picked == null || picked.files.isEmpty || !mounted) return;
      final file = picked.files.single;
      if (file.path == null) return;
      await _uploadAndSend(file.path!, file.name, allowViewOnce: false, forcedType: 'audio');
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _uploadAndSend(
    String path,
    String filename, {
    required bool allowViewOnce,
    String? forcedType,
  }) async {
    final draft = await _attachmentDraft(filename, allowViewOnce: allowViewOnce);
    if (draft == null || !mounted) return;
    setState(() => uploading = true);
    try {
      var uploaded = await chat.uploadAttachment(filePath: path, filename: filename);
      if (forcedType != null) uploaded = {...uploaded, 'type': forcedType};
      final sent = await chat.sendAttachment(
        inbox: effectiveInbox,
        file: uploaded,
        text: draft.$1,
        replyTo: replyingTo?['_id']?.toString(),
        viewOnce: draft.$2,
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
      _snack(_errorText(failure));
    }
  }

  Future<(String, bool)?> _attachmentDraft(String filename, {required bool allowViewOnce}) async {
    final caption = TextEditingController(text: composer.text.trim());
    var once = false;
    final result = await showDialog<(String, bool)>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (_, setDialogState) => AlertDialog(
          title: const Text('Send attachment'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(filename, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              TextField(controller: caption, maxLines: 3, decoration: const InputDecoration(labelText: 'Caption')),
              if (allowViewOnce)
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: once,
                  title: const Text('View once'),
                  onChanged: (value) => setDialogState(() => once = value == true),
                ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, (caption.text.trim(), once)), child: const Text('Send')),
          ],
        ),
      ),
    );
    caption.dispose();
    if (result != null && mounted) composer.clear();
    return result;
  }

  Future<void> _sendLocation() async {
    final granted = await AppPermissionManager.ensureLocation(
      context,
      reason: 'Location permission is needed only when you choose to share your current location.',
    );
    if (!granted || !mounted) return;
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        _snack('Location services are turned off.');
        return;
      }
      final p = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 15)),
      );
      await chat.sendText(
        inbox: effectiveInbox,
        text: '📍 Live location\nhttps://maps.google.com/?q=${p.latitude.toStringAsFixed(6)},${p.longitude.toStringAsFixed(6)}',
        replyTo: replyingTo?['_id']?.toString(),
      );
      if (mounted) _snack('Location shared.');
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _sendContact() async {
    try {
      final contacts = await context.services.contacts.list();
      if (!mounted) return;
      final selected = await showModalBottomSheet<Map<String, dynamic>>(
        context: context,
        showDragHandle: true,
        builder: (sheetContext) => SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(sheetContext).height * .65,
            child: ListView.separated(
              itemCount: contacts.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (_, index) {
                final item = contacts[index];
                final profile = _map(item['profile']);
                final name = (profile['fullname'] ?? profile['username'] ?? 'Contact').toString();
                return ListTile(
                  leading: SyncAvatar(name: name, imageUrl: profile['avatar']?.toString(), radius: 20),
                  title: Text(name),
                  subtitle: profile['username'] == null ? null : Text('@${profile['username']}'),
                  onTap: () => Navigator.pop(sheetContext, item),
                );
              },
            ),
          ),
        ),
      );
      if (selected == null || !mounted) return;
      final p = _map(selected['profile']);
      final lines = [
        '👤 Contact',
        'Name: ${p['fullname'] ?? p['username'] ?? 'Contact'}',
        if ((p['username']?.toString() ?? '').isNotEmpty) 'Username: @${p['username']}',
        if ((p['phone']?.toString() ?? '').isNotEmpty) 'Phone: ${p['phone']}',
        if ((p['email']?.toString() ?? '').isNotEmpty) 'Email: ${p['email']}',
      ];
      await chat.sendText(inbox: effectiveInbox, text: lines.join('\n'), replyTo: replyingTo?['_id']?.toString());
      if (mounted) _snack('Contact shared.');
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _sendPoll() async {
    final draft = await showDialog<_PollDraft>(context: context, builder: (_) => const _PollDialog());
    if (draft == null || !mounted) return;
    final stamp = DateTime.now().millisecondsSinceEpoch;
    final options = <Map<String, dynamic>>[
      for (var i = 0; i < draft.options.length; i++)
        {'id': 'poll-$stamp-$i', 'text': draft.options[i], 'votes': <String>[]},
    ];
    final payload = {
      'version': 2,
      'mode': draft.quiz ? 'quiz' : 'poll',
      'question': draft.question,
      'options': options,
      'anonymous': draft.anonymous,
      'multiSelect': draft.multi,
      'correctOptionIds': draft.quiz && draft.correctIndex != null ? [options[draft.correctIndex!]['id']] : <String>[],
      'createdBy': currentUserId,
      'createdAt': DateTime.now().toUtc().toIso8601String(),
    };
    await chat.sendText(inbox: effectiveInbox, text: '$_pollPrefix${jsonEncode(payload)}');
  }

  Future<void> _sendEvent() async {
    final draft = await showDialog<_EventDraft>(context: context, builder: (_) => const _EventDialog());
    if (draft == null || !mounted) return;
    final payload = {
      'version': 1,
      'title': draft.title,
      'date': draft.date,
      'time': draft.time,
      'details': draft.details,
      'link': draft.url.isEmpty ? null : {'type': 'url', 'url': draft.url},
      'createdAt': DateTime.now().toUtc().toIso8601String(),
    };
    await chat.sendText(inbox: effectiveInbox, text: '$_eventPrefix${jsonEncode(payload)}');
  }

  Future<void> _sendSticker() async {
    const values = ['😀', '😂', '😍', '😎', '🥳', '🤯', '🤖', '👻', '🐼', '🦊', '🔥', '⚡', '⭐', '🎉', '💯', '❤️'];
    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Wrap(
            spacing: 10,
            runSpacing: 10,
            children: values
                .map((emoji) => InkWell(
                      borderRadius: BorderRadius.circular(18),
                      onTap: () => Navigator.pop(sheetContext, emoji),
                      child: Padding(padding: const EdgeInsets.all(10), child: Text(emoji, style: const TextStyle(fontSize: 32))),
                    ))
                .toList(),
          ),
        ),
      ),
    );
    if (selected != null && mounted) await chat.sendText(inbox: effectiveInbox, text: selected);
  }

  Future<void> _recordVoice() async {
    if (!_canSendNow || uploading || sending || editingMessage != null || e2eeEnabled) return;
    final draft = await showVoiceRecorderSheet(context);
    if (draft == null || !mounted) return;
    setState(() => uploading = true);
    try {
      final uploaded = await chat.uploadAttachment(filePath: draft.path, filename: draft.filename);
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
      if (mounted) {
        setState(() => uploading = false);
        _snack(_errorText(failure));
      }
    } finally {
      await draft.delete();
    }
  }

  Future<void> _schedule() async {
    if (e2eeEnabled || editingMessage != null) return;
    final text = composer.text.trim();
    if (text.isEmpty) {
      _snack('Write a message first.');
      return;
    }
    var mode = 'once';
    var recurring = 'daily';
    DateTime scheduledFor = DateTime.now().add(const Duration(minutes: 5));
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (_, setSheetState) => SafeArea(
          child: Padding(
            padding: EdgeInsets.fromLTRB(16, 2, 16, 20 + MediaQuery.viewInsetsOf(sheetContext).bottom),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(child: Text('Message scheduling', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900))),
                    IconButton(onPressed: () => Navigator.pop(sheetContext), icon: const Icon(Icons.close_rounded)),
                  ],
                ),
                Text('Schedule send, recurring reminders, or send when the recipient comes online.', style: TextStyle(color: context.muted, fontSize: 12)),
                const SizedBox(height: 12),
                SegmentedButton<String>(
                  segments: [
                    const ButtonSegment(value: 'once', label: Text('Schedule send')),
                    const ButtonSegment(value: 'recurring', label: Text('Recurring')),
                    if (isPrivate) const ButtonSegment(value: 'when-online', label: Text('Send online')),
                  ],
                  selected: {mode},
                  onSelectionChanged: (value) => setSheetState(() => mode = value.first),
                ),
                if (mode != 'when-online') ...[
                  const SizedBox(height: 12),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.schedule_outlined),
                    title: const Text('Delivery time'),
                    subtitle: Text(_fullDate(scheduledFor)),
                    onTap: () async {
                      final date = await showDatePicker(
                        context: sheetContext,
                        initialDate: scheduledFor,
                        firstDate: DateTime.now(),
                        lastDate: DateTime.now().add(const Duration(days: 730)),
                      );
                      if (date == null || !sheetContext.mounted) return;
                      final time = await showTimePicker(context: sheetContext, initialTime: TimeOfDay.fromDateTime(scheduledFor));
                      if (time == null) return;
                      setSheetState(() => scheduledFor = DateTime(date.year, date.month, date.day, time.hour, time.minute));
                    },
                  ),
                ],
                if (mode == 'recurring')
                  DropdownButtonFormField<String>(
                    initialValue: recurring,
                    decoration: const InputDecoration(labelText: 'Repeat'),
                    items: const [
                      DropdownMenuItem(value: 'daily', child: Text('Daily reminder')),
                      DropdownMenuItem(value: 'weekly', child: Text('Weekly reminder')),
                      DropdownMenuItem(value: 'monthly', child: Text('Monthly reminder')),
                    ],
                    onChanged: (value) {
                      if (value != null) setSheetState(() => recurring = value);
                    },
                  ),
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(border: Border.all(color: context.border), borderRadius: BorderRadius.circular(12)),
                  child: Text('Draft to schedule: “$text”', maxLines: 2, overflow: TextOverflow.ellipsis),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () => Navigator.pop(sheetContext, true),
                    child: const Text('Save schedule'),
                  ),
                ),
                TextButton.icon(onPressed: () { Navigator.pop(sheetContext); _showScheduledMessages(); }, icon: const Icon(Icons.manage_history_outlined), label: const Text('Upcoming scheduled messages')),
              ],
            ),
          ),
        ),
      ),
    );
    if (result != true || !mounted) return;
    try {
      await chat.scheduleMessage(
        inbox: effectiveInbox,
        text: text,
        replyTo: replyingTo?['_id']?.toString(),
        mode: mode,
        scheduledFor: mode == 'when-online' ? null : scheduledFor,
        recurringType: mode == 'recurring' ? recurring : 'none',
        targetUserId: mode == 'when-online' ? friendId : null,
      );
      if (!mounted) return;
      setState(() {
        composer.clear();
        replyingTo = null;
        mobileActionsOpen = false;
      });
      _snack('Message scheduled.');
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
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
                const ListTile(title: Text('Upcoming', style: TextStyle(fontWeight: FontWeight.w900))),
                Expanded(
                  child: jobs.isEmpty
                      ? const Center(child: Text('No scheduled messages.'))
                      : ListView.separated(
                          itemCount: jobs.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (_, index) {
                            final job = jobs[index];
                            return ListTile(
                              title: Text(job['text']?.toString() ?? '', maxLines: 2, overflow: TextOverflow.ellipsis),
                              subtitle: Text(_scheduleLabel(job)),
                              trailing: TextButton(
                                onPressed: () async {
                                  final id = job['_id']?.toString() ?? '';
                                  if (id.isEmpty) return;
                                  await chat.cancelScheduled(id);
                                  if (sheetContext.mounted) Navigator.pop(sheetContext);
                                },
                                child: const Text('Cancel'),
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
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _showMessageActions(Map<String, dynamic> message) async {
    final id = message['_id']?.toString() ?? '';
    if (id.isEmpty) return;
    final mine = _isMine(message);
    final reactions = _map(message['reactions']);
    final myReaction = reactions[currentUserId]?.toString();
    final starredBy = message['starredBy'] is List ? (message['starredBy'] as List).map((e) => e.toString()).toList() : const <String>[];
    final starred = starredBy.contains(currentUserId);
    final pinned = pinnedIds.contains(id);
    final viewOnce = _map(message['viewOnce'])['enabled'] == true;

    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 18),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: ['👍', '❤️', '😂', '😮', '😢', '🔥']
                    .map((emoji) => InkWell(
                          borderRadius: BorderRadius.circular(22),
                          onTap: () {
                            Navigator.pop(sheetContext);
                            chat.reactToMessage(roomId: roomId, chatId: id, emoji: emoji);
                          },
                          child: Padding(padding: const EdgeInsets.all(9), child: Text(emoji, style: const TextStyle(fontSize: 24))),
                        ))
                    .toList(),
              ),
              if ((myReaction ?? '').isNotEmpty)
                ListTile(
                  leading: const Icon(Icons.emoji_emotions_outlined),
                  title: const Text('Remove my reaction'),
                  onTap: () { Navigator.pop(sheetContext); chat.reactToMessage(roomId: roomId, chatId: id, emoji: null); },
                ),
              _sheetAction(sheetContext, Icons.reply_rounded, 'Reply', () => _startReply(message)),
              if (!e2eeEnabled) _sheetAction(sheetContext, Icons.forward_rounded, 'Forward', () => _forward(message)),
              if (mine && !e2eeEnabled && !viewOnce && (message['text']?.toString().trim().isNotEmpty ?? false))
                _sheetAction(sheetContext, Icons.edit_outlined, 'Edit', () => _startEdit(message)),
              _sheetAction(sheetContext, starred ? Icons.star_rounded : Icons.star_border_rounded, starred ? 'Unstar' : 'Star', () => _toggleStar(message, !starred)),
              _sheetAction(sheetContext, pinned ? Icons.push_pin_rounded : Icons.push_pin_outlined, pinned ? 'Unpin' : 'Pin', () => _togglePin(id, pinned)),
              _sheetAction(sheetContext, Icons.check_circle_outline_rounded, 'Select message', () => _enterSelection(id)),
              _sheetAction(sheetContext, Icons.delete_outline_rounded, 'Delete for me', () => chat.deleteMessages(roomId: roomId, chatIds: [id]), danger: true),
              if (mine)
                _sheetAction(sheetContext, Icons.delete_forever_outlined, 'Delete for everyone', () => chat.deleteMessages(roomId: roomId, chatIds: [id], deleteForEveryone: true), danger: true),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sheetAction(BuildContext sheetContext, IconData icon, String label, FutureOr<void> Function() action, {bool danger = false}) {
    return ListTile(
      leading: Icon(icon, color: danger ? SyncColors.danger : null),
      title: Text(label, style: danger ? const TextStyle(color: SyncColors.danger) : null),
      onTap: () {
        Navigator.pop(sheetContext);
        Future.sync(action);
      },
    );
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
      composer.selection = TextSelection.collapsed(offset: composer.text.length);
    });
  }

  void _cancelComposerMode() {
    setState(() {
      replyingTo = null;
      editingMessage = null;
      composer.clear();
    });
  }

  Future<void> _forward(Map<String, dynamic> message) async {
    final id = message['_id']?.toString() ?? '';
    if (id.isEmpty) return;
    try {
      final ok = await showForwardMessageSheet(context, fromRoomId: roomId, chatIds: [id]);
      if (ok == true && mounted) _snack('Message forwarded.');
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _toggleStar(Map<String, dynamic> message, bool value) async {
    final id = message['_id']?.toString() ?? '';
    try {
      final payload = await chat.toggleStar(id, starred: value);
      if (!mounted) return;
      final index = messages.indexWhere((m) => m['_id']?.toString() == id);
      if (index >= 0) setState(() => messages[index] = {...messages[index], 'starredBy': payload['starredBy'] ?? const []});
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _togglePin(String id, bool currentlyPinned) async {
    try {
      if (currentlyPinned) {
        await chat.unpinMessage(roomId: roomId, chatId: id);
      } else {
        await chat.pinMessage(roomId: roomId, chatId: id);
      }
      await _loadPins();
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  void _enterSelection(String id) {
    setState(() => selectedMessageIds = <String>{id});
  }

  void _toggleSelected(String id) {
    if (selectedMessageIds == null || id.isEmpty) return;
    setState(() {
      final next = <String>{...selectedMessageIds!};
      if (!next.add(id)) next.remove(id);
      selectedMessageIds = next;
    });
  }

  Future<void> _deleteSelected() async {
    final ids = selectedMessageIds?.toList(growable: false) ?? const [];
    if (ids.isEmpty) return;
    await chat.deleteMessages(roomId: roomId, chatIds: ids);
    if (mounted) setState(() => selectedMessageIds = null);
  }

  Future<void> _openViewOnce(Map<String, dynamic> message) async {
    final id = message['_id']?.toString() ?? '';
    if (id.isEmpty) return;
    try {
      final payload = await chat.openViewOnce(id);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => _ViewOnceDialog(payload: payload),
      );
      _onViewOnceEvent({'chatId': id});
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _openRoomInfo() async {
    Widget screen;
    if (isChannel) {
      screen = LiveChannelProfileScreen(inbox: effectiveInbox, name: widget.name);
    } else if (isGroup) {
      screen = LiveGroupInfoScreen(inbox: effectiveInbox);
    } else {
      screen = LiveFriendProfileScreen(inbox: effectiveInbox, name: widget.name);
    }
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
    if (mounted) await _refreshRoom();
  }

  Future<void> _showRoomMenu() async {
    final muted = _hasMe(effectiveInbox['mutedBy']);
    final favourite = _hasMe(effectiveInbox['favouriteBy']);
    final listed = _hasMe(effectiveInbox['listedBy']);
    final choice = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(sheetContext).height * .78,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(8, 0, 8, 18),
            children: [
              _menuChoice(sheetContext, 'info', Icons.info_outline_rounded, isChannel ? 'Channel info' : isGroup ? 'Group info' : 'Contact info'),
              if (isPrivate) _menuChoice(sheetContext, 'security', Icons.shield_outlined, 'Secret chat settings'),
              _menuChoice(sheetContext, 'select', Icons.check_circle_outline_rounded, 'Select message'),
              _menuChoice(sheetContext, 'mute', muted ? Icons.notifications_outlined : Icons.notifications_off_outlined, muted ? 'Unmute Notification' : 'Mute Notification'),
              _menuChoice(sheetContext, 'favourite', Icons.star_border_rounded, favourite ? 'Remove from favourite' : 'Add to favourite'),
              _menuChoice(sheetContext, 'list', Icons.format_list_bulleted_rounded, listed ? 'Remove from list' : 'Add to list'),
              _menuChoice(sheetContext, 'close', Icons.arrow_back_rounded, 'Close chat'),
              const Divider(),
              _menuChoice(sheetContext, 'report', Icons.error_outline_rounded, 'Report', danger: true),
              if (isPrivate) _menuChoice(sheetContext, 'block', Icons.block_rounded, blockedByMe ? 'Unblock' : 'Block', danger: true),
              _menuChoice(sheetContext, 'clear', Icons.cleaning_services_outlined, 'Clear chat', danger: true),
              _menuChoice(sheetContext, 'delete', Icons.delete_outline_rounded, 'Delete chat', danger: true),
              const Divider(),
              if (isPrivate) _menuChoice(sheetContext, 'share', Icons.share_outlined, 'Share contact'),
              _menuChoice(sheetContext, 'wallpaper', Icons.image_outlined, 'Set wallpaper'),
              _menuChoice(sheetContext, 'export', Icons.ios_share_outlined, e2eeEnabled ? 'Export blocked in secret chat' : 'Export chat history', disabled: e2eeEnabled),
              _menuChoice(sheetContext, 'clear-history', Icons.auto_delete_outlined, 'Clear history', danger: true),
              if (isGroup) _menuChoice(sheetContext, 'exit', Icons.exit_to_app_rounded, isChannel ? 'Exit channel' : 'Exit group', danger: true),
            ],
          ),
        ),
      ),
    );
    if (choice == null || !mounted) return;
    await _runRoomMenu(choice);
  }

  Widget _menuChoice(BuildContext sheetContext, String value, IconData icon, String label, {bool danger = false, bool disabled = false}) {
    return ListTile(
      enabled: !disabled,
      leading: Icon(icon, color: danger ? SyncColors.danger : null),
      title: Text(label, style: danger ? const TextStyle(color: SyncColors.danger) : null),
      onTap: disabled ? null : () => Navigator.pop(sheetContext, value),
    );
  }

  Future<void> _runRoomMenu(String action) async {
    try {
      switch (action) {
        case 'info':
          await _openRoomInfo();
          break;
        case 'security':
          await _showE2ee();
          break;
        case 'select':
          setState(() => selectedMessageIds = <String>{});
          break;
        case 'mute':
          await _setPreference('mute', !_hasMe(effectiveInbox['mutedBy']));
          break;
        case 'favourite':
          await _setPreference('favourite', !_hasMe(effectiveInbox['favouriteBy']));
          break;
        case 'list':
          await _setPreference('list', !_hasMe(effectiveInbox['listedBy']));
          break;
        case 'close':
          if (mounted) Navigator.maybePop(context);
          break;
        case 'report':
          await _report();
          break;
        case 'block':
          if (friendId.isNotEmpty) {
            if (blockedByMe) {
              await context.services.contacts.unblock(friendId);
            } else {
              await context.services.contacts.block(friendId);
            }
            blockState = await context.services.contacts.blockState(friendId);
            if (mounted) setState(() {});
          }
          break;
        case 'clear':
          if (await _confirm('Clear chat?', 'Messages in this chat will be cleared for your account.', 'Clear')) {
            await context.services.inbox.clearRoom(roomId);
            await _reload();
          }
          break;
        case 'delete':
          await _deleteChat();
          break;
        case 'share':
          await _shareCurrentContact();
          break;
        case 'wallpaper':
          await _setWallpaper();
          break;
        case 'export':
          await _exportHistory();
          break;
        case 'clear-history':
          if (await _confirm('Clear history?', 'Clear this chat history from your account?', 'Clear')) {
            await context.services.inbox.deleteRoom(roomId, scope: 'self');
            await _reload();
          }
          break;
        case 'exit':
          await _exitGroup();
          break;
      }
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _setPreference(String action, bool value) async {
    final updated = await context.services.inbox.setPreference(roomId, action, value);
    if (!mounted) return;
    setState(() {
      if (updated.isNotEmpty) liveInbox = updated;
    });
  }

  Future<void> _report() async {
    final reason = TextEditingController();
    final form = GlobalKey<FormState>();
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Report'),
        content: Form(
          key: form,
          child: TextFormField(
            controller: reason,
            autofocus: true,
            maxLength: 500,
            minLines: 3,
            maxLines: 6,
            decoration: const InputDecoration(labelText: 'Reason'),
            validator: (value) => (value ?? '').trim().length < 3 ? 'Reason must be at least 3 characters' : null,
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (form.currentState?.validate() != true) return;
              Navigator.pop(dialogContext, reason.text.trim());
            },
            child: const Text('Submit'),
          ),
        ],
      ),
    );
    reason.dispose();
    if (value == null || !mounted) return;
    await context.services.api.post('/reports/chat', body: {
      'roomId': roomId,
      'roomType': effectiveInbox['roomType'],
      'targetId': isGroup ? group['_id'] : friendId,
      'reason': value,
    });
    if (mounted) _snack('Report submitted.');
  }

  Future<void> _deleteChat() async {
    var scope = 'self';
    if (isPrivate) {
      final result = await showDialog<String>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Delete chat'),
          content: const Text('Choose how this chat should be deleted.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.pop(dialogContext, 'self'), child: const Text('Delete for me')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, 'both'), child: const Text('Delete for both')),
          ],
        ),
      );
      if (result == null) return;
      scope = result;
    } else if (!await _confirm('Delete chat?', 'Delete this chat from your account?', 'Delete')) {
      return;
    }
    await context.services.inbox.deleteRoom(roomId, scope: scope);
    if (mounted) Navigator.pop(context);
  }

  Future<void> _shareCurrentContact() async {
    if (!isPrivate) return;
    final rooms = await context.services.inbox.list();
    if (!mounted) return;
    final target = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(sheetContext).height * .62,
          child: ListView.separated(
            itemCount: rooms.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (_, index) {
              final room = rooms[index];
              final name = _roomName(room, currentUserId);
              return ListTile(
                leading: SyncAvatar(name: name, radius: 20),
                title: Text(name),
                onTap: () => Navigator.pop(sheetContext, room),
              );
            },
          ),
        ),
      ),
    );
    if (target == null || !mounted) return;
    final p = friendProfile;
    final lines = [
      '👤 Contact',
      'Name: ${p['fullname'] ?? p['username'] ?? widget.name}',
      if ((p['username']?.toString() ?? '').isNotEmpty) 'Username: @${p['username']}',
      if ((p['phone']?.toString() ?? '').isNotEmpty) 'Phone: ${p['phone']}',
      if ((p['email']?.toString() ?? '').isNotEmpty) 'Email: ${p['email']}',
    ];
    await chat.sendText(inbox: target, text: lines.join('\n'));
    if (mounted) _snack('Contact shared.');
  }

  Future<void> _setWallpaper() async {
    const presets = <(String, String, String, IconData)>[
      ('whatsapp', 'Pattern', 'Soft texture background', Icons.auto_awesome_mosaic_outlined),
      ('plain', 'Plain', 'Minimal clean base', Icons.crop_square_rounded),
      ('sunset', 'Sunset', 'Warm evening tones', Icons.wb_twilight_outlined),
      ('ocean', 'Ocean', 'Cool aqua blend', Icons.water_outlined),
      ('forest', 'Forest', 'Natural green feel', Icons.forest_outlined),
    ];
    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(title: Text('Set wallpaper', style: TextStyle(fontWeight: FontWeight.w900))),
            for (final item in presets)
              ListTile(
                leading: Icon(item.$4, color: wallpaperPreset == item.$1 ? SyncColors.sky : null),
                title: Text(item.$2),
                subtitle: Text(item.$3),
                trailing: wallpaperPreset == item.$1 ? const Icon(Icons.check_rounded, color: SyncColors.sky) : null,
                onTap: () => Navigator.pop(sheetContext, item.$1),
              ),
          ],
        ),
      ),
    );
    if (selected != null && mounted) setState(() => wallpaperPreset = selected);
  }

  Future<void> _exportHistory() async {
    if (e2eeEnabled) return;
    final all = <Map<String, dynamic>>[];
    var skip = 0;
    const limit = 200;
    while (true) {
      final chunk = await chat.listRoom(roomId, skip: skip, limit: limit);
      all.addAll(chunk);
      if (chunk.length < limit) break;
      skip += limit;
    }
    all.sort((a, b) => _date(a['createdAt']).compareTo(_date(b['createdAt'])));
    final lines = all.map((m) {
      final profile = _map(m['profile']);
      final sender = profile['fullname'] ?? profile['username'] ?? m['userId'] ?? 'unknown';
      final file = _map(m['file']);
      final text = (m['text']?.toString().trim().isNotEmpty ?? false) ? m['text'] : file['originalname'] ?? '[attachment]';
      return '[${_fullDate(_date(m['createdAt']).toLocal())}] $sender: $text';
    }).join('\n');
    final dir = await getApplicationDocumentsDirectory();
    final safeName = widget.name.replaceAll(RegExp(r'[^A-Za-z0-9_-]+'), '_');
    final file = File('${dir.path}/${safeName}_history.txt');
    await file.writeAsString(lines);
    if (mounted) {
      await Clipboard.setData(ClipboardData(text: file.path));
      _snack('Chat history exported. File path copied.');
    }
  }

  Future<void> _exitGroup() async {
    final id = group['_id']?.toString() ?? '';
    if (id.isEmpty) return;
    if (!await _confirm(isChannel ? 'Exit channel?' : 'Exit group?', 'You will leave this conversation.', 'Exit')) return;
    await context.services.groups.exit(id);
    if (mounted) Navigator.pop(context);
  }

  Future<bool> _confirm(String title, String message, String action) async {
    return await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: Text(title),
            content: Text(message),
            actions: [
              TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
              FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: Text(action)),
            ],
          ),
        ) ??
        false;
  }

  Future<void> _showPinHistory() async {
    final history = pinHistory;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(sheetContext).height * .55,
          child: Column(
            children: [
              const ListTile(title: Text('Pin History', style: TextStyle(fontWeight: FontWeight.w900))),
              Expanded(
                child: history.isEmpty
                    ? const Center(child: Text('No history'))
                    : ListView.separated(
                        itemCount: history.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (_, index) {
                          final item = history[index];
                          final actor = _map(item['actorProfile']);
                          return ListTile(
                            title: Text('${actor['fullname'] ?? 'Unknown'} ${item['action'] ?? ''}ed'),
                            subtitle: Text(_fullDate(_date(item['at']).toLocal())),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showE2ee() async {
    if (!isPrivate) return;
    var enabled = e2eeEnabled;
    var busy = false;
    String? fingerprint;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (_, setSheetState) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 4, 18, 22),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('End-to-end encryption', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
                const SizedBox(height: 6),
                Text(enabled ? 'Enabled for this private chat' : 'Available for this private chat', style: TextStyle(color: context.muted)),
                if (fingerprint != null) ...[
                  const SizedBox(height: 12),
                  SelectableText(fingerprint!, style: const TextStyle(fontFamily: 'monospace', fontSize: 11)),
                ],
                if (busy) ...[
                  const SizedBox(height: 12),
                  const LinearProgressIndicator(minHeight: 2),
                ],
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: busy
                            ? null
                            : () async {
                                setSheetState(() => busy = true);
                                try {
                                  final record = await chat.registerE2eeDevice();
                                  setSheetState(() { fingerprint = record.fingerprint; busy = false; });
                                } on Object catch (failure) {
                                  setSheetState(() => busy = false);
                                  if (mounted) _snack(_errorText(failure));
                                }
                              },
                        icon: const Icon(Icons.phonelink_lock_outlined),
                        label: const Text('Register device'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: busy
                            ? null
                            : () async {
                                setSheetState(() => busy = true);
                                try {
                                  final result = await chat.setE2eeRoomEnabled(roomId, enabled: !enabled);
                                  enabled = result['enabled'] == true;
                                  if (mounted) setState(() => e2eeEnabled = enabled);
                                  setSheetState(() => busy = false);
                                } on Object catch (failure) {
                                  setSheetState(() => busy = false);
                                  if (mounted) _snack(_errorText(failure));
                                }
                              },
                        icon: Icon(enabled ? Icons.lock_open_rounded : Icons.lock_rounded),
                        label: Text(enabled ? 'Disable' : 'Enable'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !scroll.hasClients) return;
      scroll.animateTo(scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 180), curve: Curves.easeOut);
    });
  }

  void _scrollToMessage(String id) {
    final list = visibleMessages;
    final index = list.indexWhere((m) => m['_id']?.toString() == id);
    if (index < 0 || !scroll.hasClients) return;
    final fraction = list.length <= 1 ? 0.0 : index / (list.length - 1);
    final target = scroll.position.maxScrollExtent * fraction;
    scroll.animateTo(target.clamp(0, scroll.position.maxScrollExtent), duration: const Duration(milliseconds: 260), curve: Curves.easeOut);
  }

  void _snack(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text), behavior: SnackBarBehavior.floating));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.panel,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            if (!selectMode && pinnedItems.isNotEmpty && !searchOpen && typingText.isEmpty) _buildPinnedStrip(),
            if (e2eeEnabled)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                color: context.panel,
                child: const Row(
                  children: [
                    Icon(Icons.lock_rounded, size: 13, color: SyncColors.sky),
                    SizedBox(width: 5),
                    Text('End-to-end encrypted · Device E2EE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
            Expanded(child: _buildBody()),
            _buildComposer(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    if (selectMode) {
      return Container(
        height: 64,
        color: context.panel,
        child: Row(
          children: [
            IconButton(onPressed: () => setState(() => selectedMessageIds = null), icon: const Icon(Icons.arrow_back_rounded)),
            Expanded(child: Text('${selectedMessageIds?.length ?? 0}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17))),
            IconButton(tooltip: 'Delete', onPressed: _deleteSelected, icon: const Icon(Icons.delete_outline_rounded)),
          ],
        ),
      );
    }

    final presence = _presenceMeta();
    return Container(
      constraints: const BoxConstraints(minHeight: 64),
      padding: const EdgeInsets.fromLTRB(4, 5, 4, 5),
      decoration: BoxDecoration(color: context.panel, border: Border(bottom: BorderSide(color: context.border))),
      child: Row(
        children: [
          IconButton(onPressed: () => Navigator.maybePop(context), icon: const Icon(Icons.arrow_back_rounded)),
          if (!searchOpen) ...[
            InkWell(
              onTap: _openRoomInfo,
              borderRadius: BorderRadius.circular(24),
              child: SyncAvatar(name: widget.name, imageUrl: _roomAvatar(effectiveInbox, currentUserId), online: presence.$2, radius: 20),
            ),
            const SizedBox(width: 9),
            Expanded(
              child: InkWell(
                onTap: _openRoomInfo,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        if (isChannel) const Padding(padding: EdgeInsets.only(right: 4), child: Icon(Icons.podcasts_rounded, size: 14, color: SyncColors.sky)),
                        if (isGroup && (group['accessType']?.toString() == 'private' || channel['accessType']?.toString() == 'private'))
                          const Padding(padding: EdgeInsets.only(right: 4), child: Icon(Icons.lock_outline_rounded, size: 13, color: Color(0xFFD97706))),
                        Expanded(child: Text(widget.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800))),
                      ],
                    ),
                    Text(
                      typingText.isNotEmpty
                          ? typingText
                          : presence.$1.isNotEmpty
                              ? presence.$1
                              : isGroup
                                  ? (isChannel ? 'click here for channel info' : 'click here for group info')
                                  : 'click here for contact info',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 10.5, color: typingText.isNotEmpty ? SyncColors.sky : presence.$2 ? SyncColors.success : context.muted, fontWeight: typingText.isNotEmpty || presence.$2 ? FontWeight.w700 : FontWeight.w400),
                    ),
                  ],
                ),
              ),
            ),
          ] else
            Expanded(
              child: SizedBox(
                height: 40,
                child: TextField(
                  controller: search,
                  autofocus: true,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    hintText: 'Search in chat...',
                    prefixIcon: const Icon(Icons.search_rounded, size: 18),
                    suffixIcon: search.text.isEmpty
                        ? null
                        : IconButton(onPressed: () { search.clear(); setState(() {}); }, icon: const Icon(Icons.close_rounded, size: 17)),
                    contentPadding: EdgeInsets.zero,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide(color: context.border)),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide(color: context.border)),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide(color: context.border)),
                  ),
                ),
              ),
            ),
          IconButton(
            tooltip: 'Search',
            onPressed: () => setState(() {
              searchOpen = !searchOpen;
              if (!searchOpen) search.clear();
            }),
            icon: Icon(searchOpen ? Icons.close_rounded : Icons.search_rounded, size: 21),
          ),
          IconButton(
            tooltip: 'Voice call',
            onPressed: () => openOutgoingCall(context, inbox: effectiveInbox, name: widget.name, video: false),
            icon: const Icon(Icons.call_outlined, size: 21),
          ),
          IconButton(
            tooltip: 'Video call',
            onPressed: () => openOutgoingCall(context, inbox: effectiveInbox, name: widget.name, video: true),
            icon: const Icon(Icons.videocam_outlined, size: 22),
          ),
          IconButton(tooltip: 'More', onPressed: _showRoomMenu, icon: const Icon(Icons.more_vert_rounded, size: 22)),
        ],
      ),
    );
  }

  Widget _buildPinnedStrip() {
    return Container(
      width: double.infinity,
      color: context.softPanel,
      padding: const EdgeInsets.fromLTRB(10, 5, 8, 5),
      child: Column(
        children: [
          Row(
            children: [
              const Icon(Icons.push_pin_rounded, size: 14, color: SyncColors.sky),
              const SizedBox(width: 5),
              Expanded(
                child: InkWell(
                  onTap: () => setState(() => pinsExpanded = !pinsExpanded),
                  child: Row(
                    children: [
                      Text('Pinned Messages (${pinnedItems.length})', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: SyncColors.sky700)),
                      const SizedBox(width: 3),
                      Icon(pinsExpanded ? Icons.keyboard_arrow_up_rounded : Icons.keyboard_arrow_down_rounded, size: 16),
                    ],
                  ),
                ),
              ),
              IconButton(tooltip: 'Pin history', onPressed: _showPinHistory, icon: const Icon(Icons.more_vert_rounded, size: 16), visualDensity: VisualDensity.compact),
            ],
          ),
          if (pinsExpanded)
            ...pinnedItems.map((item) {
              final profile = _map(item['pinnedByProfile']);
              final id = item['chatId']?.toString() ?? '';
              return Container(
                margin: const EdgeInsets.only(top: 4),
                padding: const EdgeInsets.fromLTRB(7, 5, 3, 5),
                decoration: BoxDecoration(color: context.panel.withValues(alpha: .82), borderRadius: BorderRadius.circular(8)),
                child: Row(
                  children: [
                    SyncAvatar(name: profile['fullname']?.toString() ?? 'User', imageUrl: profile['avatar']?.toString(), radius: 14),
                    const SizedBox(width: 7),
                    Expanded(
                      child: InkWell(
                        onTap: () => _scrollToMessage(id),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(profile['fullname']?.toString() ?? 'Unknown user', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
                            Text(_pinPreview(item), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10, color: context.muted)),
                          ],
                        ),
                      ),
                    ),
                    TextButton(onPressed: id.isEmpty ? null : () => _togglePin(id, true), child: const Text('Unpin', style: TextStyle(fontSize: 10))),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (loading && messages.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (error != null && messages.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined, size: 44, color: SyncColors.sky),
              const SizedBox(height: 10),
              Text(error!, textAlign: TextAlign.center),
              const SizedBox(height: 10),
              FilledButton.icon(onPressed: _reload, icon: const Icon(Icons.refresh_rounded), label: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    final rows = visibleMessages;
    return Container(
      decoration: _wallpaperDecoration(),
      child: RefreshIndicator(
        onRefresh: _reload,
        child: rows.isEmpty
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  SizedBox(height: MediaQuery.sizeOf(context).height * .30),
                  Center(child: Text(search.text.isEmpty ? 'No messages yet.' : 'No matching messages.')),
                ],
              )
            : ListView.builder(
                controller: scroll,
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(10, 12, 10, 16),
                itemCount: rows.length,
                itemBuilder: (_, index) {
                  final message = rows[index];
                  final id = message['_id']?.toString() ?? '';
                  final selected = selectedMessageIds?.contains(id) == true;
                  final showDate = index == 0 || !_sameDay(_date(rows[index - 1]['createdAt']), _date(message['createdAt']));
                  return Column(
                    children: [
                      if (showDate) _dateSeparator(_date(message['createdAt']).toLocal()),
                      Material(
                        color: selected ? SyncColors.sky.withValues(alpha: .13) : Colors.transparent,
                        child: InkWell(
                          onTap: selectMode ? () => _toggleSelected(id) : null,
                          onLongPress: selectMode ? () => _toggleSelected(id) : () => _showMessageActions(message),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 1),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.center,
                              children: [
                                if (selectMode)
                                  Padding(
                                    padding: const EdgeInsets.only(right: 6),
                                    child: Container(
                                      width: 21,
                                      height: 21,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: selected ? SyncColors.sky : Colors.transparent,
                                        border: Border.all(color: selected ? SyncColors.sky : context.muted),
                                      ),
                                      child: selected ? const Icon(Icons.check_rounded, size: 13, color: Colors.white) : null,
                                    ),
                                  ),
                                Expanded(
                                  child: _WebMessageBubble(
                                    message: message,
                                    mine: _isMine(message),
                                    pinned: pinnedIds.contains(id),
                                    onViewOnce: () => _openViewOnce(message),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
      ),
    );
  }

  Widget _dateSeparator(DateTime date) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final value = DateTime(date.year, date.month, date.day);
    final delta = today.difference(value).inDays;
    final label = delta == 0
        ? 'TODAY'
        : delta == 1
            ? 'YESTERDAY'
            : '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(color: context.panel.withValues(alpha: .92), borderRadius: BorderRadius.circular(8), boxShadow: const [BoxShadow(color: Color(0x140F172A), blurRadius: 5)]),
          child: Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: context.muted)),
        ),
      ),
    );
  }

  Widget _buildComposer() {
    if (blockedByMe) {
      return _composerNotice(
        'You blocked this contact',
        action: TextButton(
          onPressed: () async {
            if (friendId.isEmpty) return;
            await context.services.contacts.unblock(friendId);
            blockState = await context.services.contacts.blockState(friendId);
            if (mounted) setState(() {});
          },
          child: const Text('Unblock now'),
        ),
      );
    }
    if (blockedByFriend) {
      return _composerNotice('${widget.name} Block You. you can not send message.', icon: Icons.block_rounded, danger: true);
    }
    if (adminOnly) {
      return _composerNotice('Only Admins can send messages', icon: Icons.admin_panel_settings_outlined);
    }

    final modeMessage = editingMessage ?? replyingTo;
    final hasText = composer.text.trim().isNotEmpty;
    return Container(
      decoration: BoxDecoration(color: context.panel, border: Border(top: BorderSide(color: context.border))),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (modeMessage != null)
            Container(
              padding: const EdgeInsets.fromLTRB(12, 6, 6, 6),
              decoration: BoxDecoration(
                color: editingMessage != null ? const Color(0xFFFFFBEB) : context.softPanel,
                border: Border(bottom: BorderSide(color: context.border)),
              ),
              child: Row(
                children: [
                  Expanded(child: Text(editingMessage != null ? 'Editing message' : 'Replying to message', style: TextStyle(fontSize: 11, color: editingMessage != null ? const Color(0xFFB45309) : context.muted))),
                  IconButton(onPressed: _cancelComposerMode, icon: const Icon(Icons.close_rounded, size: 17), visualDensity: VisualDensity.compact),
                ],
              ),
            ),
          if (viewOnceText)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.fromLTRB(10, 8, 10, 0),
              padding: const EdgeInsets.all(9),
              decoration: BoxDecoration(color: SyncColors.sky.withValues(alpha: .08), borderRadius: BorderRadius.circular(13), border: Border.all(color: SyncColors.sky.withValues(alpha: .24))),
              child: const Text('This text will be blurred in chat and can be opened only one time.', style: TextStyle(fontSize: 11, color: SyncColors.sky700)),
            ),
          if (slowModeSeconds > 0)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.fromLTRB(10, 8, 10, 0),
              padding: const EdgeInsets.all(9),
              decoration: BoxDecoration(color: context.softPanel, borderRadius: BorderRadius.circular(13), border: Border.all(color: context.border)),
              child: Text('Slow mode is enabled. Non-admin members can send one message every ${slowModeSeconds}s.', style: TextStyle(fontSize: 11, color: context.muted)),
            ),
          if (uploading) const LinearProgressIndicator(minHeight: 2),
          Padding(
            padding: EdgeInsets.fromLTRB(8, 7, 8, MediaQuery.paddingOf(context).bottom + 8),
            child: Row(
              children: [
                SizedBox(
                  width: 40,
                  height: 40,
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      if (mobileActionsOpen)
                        Positioned(
                          left: 44,
                          top: 2,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                            decoration: BoxDecoration(color: context.panel.withValues(alpha: .98), borderRadius: BorderRadius.circular(22), border: Border.all(color: context.border), boxShadow: const [BoxShadow(color: Color(0x250F172A), blurRadius: 18)]),
                            child: Row(
                              children: [
                                _composerAction(Icons.emoji_emotions_outlined, 'Emoji', _sendSticker),
                                _composerAction(Icons.attach_file_rounded, 'Attach', _openAttachmentMenu),
                                _composerAction(Icons.visibility_off_outlined, '1-time', () async { setState(() => viewOnceText = !viewOnceText); }),
                                _composerAction(Icons.schedule_outlined, 'Schedule', _schedule),
                              ],
                            ),
                          ),
                        ),
                      InkWell(
                        onTap: uploading || editingMessage != null ? null : () => setState(() => mobileActionsOpen = !mobileActionsOpen),
                        customBorder: const CircleBorder(),
                        child: Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(shape: BoxShape.circle, color: mobileActionsOpen ? SyncColors.sky.withValues(alpha: .10) : context.softPanel, border: Border.all(color: mobileActionsOpen ? SyncColors.sky.withValues(alpha: .35) : context.border)),
                          child: Icon(mobileActionsOpen ? Icons.close_rounded : Icons.add_rounded, size: 21, color: mobileActionsOpen ? SyncColors.sky : context.muted),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 7),
                Expanded(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 44),
                    child: TextField(
                      controller: composer,
                      minLines: 1,
                      maxLines: 5,
                      onChanged: (_) {
                        chat.typing(effectiveInbox);
                        setState(() {});
                      },
                      onSubmitted: (_) => _send(),
                      decoration: InputDecoration(
                        hintText: editingMessage != null ? 'Edit message' : 'Type a message',
                        contentPadding: const EdgeInsets.symmetric(horizontal: 15, vertical: 11),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: context.border)),
                        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: context.border)),
                        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: context.border)),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 5),
                IconButton(
                  tooltip: hasText || editingMessage != null ? 'Send' : 'Voice',
                  onPressed: sending || uploading
                      ? null
                      : hasText || editingMessage != null
                          ? _send
                          : _recordVoice,
                  icon: Icon(hasText || editingMessage != null ? Icons.send_rounded : Icons.mic_none_rounded, size: 23),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _composerAction(IconData icon, String tooltip, FutureOr<void> Function() action) {
    return IconButton(
      tooltip: tooltip,
      onPressed: () {
        setState(() => mobileActionsOpen = false);
        Future.sync(action);
      },
      icon: Icon(icon, size: 19),
    );
  }

  Widget _composerNotice(String text, {Widget? action, IconData? icon, bool danger = false}) {
    return Container(
      padding: EdgeInsets.fromLTRB(10, 8, 10, MediaQuery.paddingOf(context).bottom + 8),
      decoration: BoxDecoration(color: context.panel, border: Border(top: BorderSide(color: context.border))),
      child: Container(
        constraints: const BoxConstraints(minHeight: 44),
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: danger ? SyncColors.danger.withValues(alpha: .07) : SyncColors.sky.withValues(alpha: .07),
          borderRadius: BorderRadius.circular(9),
          border: Border.all(color: danger ? SyncColors.danger.withValues(alpha: .22) : SyncColors.sky.withValues(alpha: .22)),
        ),
        child: Row(
          children: [
            if (icon != null) ...[Icon(icon, size: 18, color: danger ? SyncColors.danger : SyncColors.sky), const SizedBox(width: 7)],
            Expanded(child: Text(text, textAlign: action == null ? TextAlign.center : TextAlign.start, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: danger ? SyncColors.danger : context.ink))),
            if (action != null) action,
          ],
        ),
      ),
    );
  }

  (String, bool) _presenceMeta() {
    if (!isPrivate) {
      final participants = effectiveInbox['owners'];
      if (participants is List && participants.isNotEmpty) {
        final names = participants.whereType<Map>().map((e) => e['fullname']?.toString() ?? '').where((e) => e.isNotEmpty).take(3).join(', ');
        if (names.isNotEmpty) return (names, false);
      }
      return ('', false);
    }
    final profile = friendProfile;
    if (profile['canSeeOnline'] == true && profile['online'] == true) return ('Online', true);
    if (profile['canSeeLastSeen'] == true && profile['lastSeenAt'] != null) {
      final date = _date(profile['lastSeenAt']).toLocal();
      final delta = DateTime.now().difference(date);
      if (delta.inMinutes < 1) return ('last seen just now', false);
      if (delta.inHours < 1) return ('last seen ${delta.inMinutes} min${delta.inMinutes == 1 ? '' : 's'} ago', false);
      if (delta.inDays < 1) return ('last seen ${delta.inHours} hour${delta.inHours == 1 ? '' : 's'} ago', false);
      return ('last seen ${delta.inDays} day${delta.inDays == 1 ? '' : 's'} ago', false);
    }
    return ('', false);
  }

  Decoration _wallpaperDecoration() {
    if (wallpaperPreset == 'plain') return BoxDecoration(color: context.isDark ? SyncColors.spill950 : SyncColors.slate200);
    if (wallpaperPreset == 'sunset') {
      return const BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFFFE4B7), Color(0xFFFFD1C7), Color(0xFFE9D5FF)]));
    }
    if (wallpaperPreset == 'ocean') {
      return const BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFDDF4FF), Color(0xFFD8F8FA), Color(0xFFD5FAF1)]));
    }
    if (wallpaperPreset == 'forest') {
      return const BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFE4F8E8), Color(0xFFDDF8EF), Color(0xFFF0F8DB)]));
    }
    return BoxDecoration(color: context.isDark ? SyncColors.spill950 : const Color(0xFFE5DDD5));
  }

  bool _hasMe(dynamic value) => value is List && value.map((e) => e.toString()).contains(currentUserId);

  String _pinPreview(Map<String, dynamic> item) {
    final text = item['text']?.toString().trim() ?? '';
    if (text.isNotEmpty) return text;
    final file = _map(item['file']);
    return file['originalname']?.toString() ?? 'Message';
  }

  String _scheduleLabel(Map<String, dynamic> job) {
    if (job['mode']?.toString() == 'when-online') return 'Send when ${widget.name} is online';
    final date = _date(job['nextRunAt'] ?? job['scheduledFor']).toLocal();
    final recurring = job['mode']?.toString() == 'recurring' ? '${job['recurringType'] ?? 'recurring'} reminder • ' : '';
    return '$recurring${_fullDate(date)}';
  }
}

class _WebMessageBubble extends StatelessWidget {
  const _WebMessageBubble({
    required this.message,
    required this.mine,
    required this.pinned,
    required this.onViewOnce,
  });

  final Map<String, dynamic> message;
  final bool mine;
  final bool pinned;
  final VoidCallback onViewOnce;

  @override
  Widget build(BuildContext context) {
    final profile = _map(message['profile']);
    final sender = profile['fullname']?.toString() ?? profile['username']?.toString() ?? '';
    final text = message['text']?.toString() ?? '';
    final reactions = _reactionSummary(message['reactions']);
    final reply = _map(message['reply']);
    final failed = message['failed'] == true;
    final pending = message['pending'] == true;
    final read = message['readed'] == true;
    final delivered = message['delivered'] == true;

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * .80),
        margin: const EdgeInsets.only(bottom: 7),
        padding: const EdgeInsets.fromLTRB(11, 7, 9, 5),
        decoration: BoxDecoration(
          color: mine
              ? (context.isDark ? const Color(0xFF164E63) : const Color(0xFFCCECFF))
              : (context.isDark ? SyncColors.spill900 : Colors.white),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(mine ? 16 : 4),
            bottomRight: Radius.circular(mine ? 4 : 16),
          ),
          boxShadow: const [BoxShadow(color: Color(0x160F172A), blurRadius: 4, offset: Offset(0, 1))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!mine && sender.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Text(sender, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: SyncColors.sky600)),
              ),
            if (reply.isNotEmpty)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
                decoration: BoxDecoration(color: context.softPanel.withValues(alpha: .72), borderRadius: BorderRadius.circular(9), border: const Border(left: BorderSide(color: SyncColors.sky, width: 3))),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(reply['fullname']?.toString() ?? 'Reply', style: const TextStyle(color: SyncColors.sky, fontSize: 10, fontWeight: FontWeight.w800)),
                    Text(reply['text']?.toString() ?? 'Message', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11)),
                  ],
                ),
              ),
            _MessageContent(message: message, onViewOnce: onViewOnce),
            if (text.isNotEmpty && !_isSpecialText(text) && !(_map(message['viewOnce'])['enabled'] == true && _map(message['file']).isEmpty)) ...[
              if (_map(message['file']).isNotEmpty) const SizedBox(height: 5),
              Text(text, style: const TextStyle(fontSize: 14, height: 1.28)),
            ],
            if (reactions.isNotEmpty) ...[
              const SizedBox(height: 5),
              Wrap(
                spacing: 4,
                runSpacing: 4,
                children: reactions.entries
                    .map((e) => Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(color: context.softPanel, borderRadius: BorderRadius.circular(99), border: Border.all(color: context.border)),
                          child: Text('${e.key} ${e.value}', style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700)),
                        ))
                    .toList(),
              ),
            ],
            const SizedBox(height: 3),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (message['e2eeEnvelope'] is Map) ...[const Icon(Icons.lock_rounded, size: 11, color: SyncColors.sky), const SizedBox(width: 3)],
                if (pinned) ...[const Icon(Icons.push_pin_rounded, size: 11, color: SyncColors.sky), const SizedBox(width: 3)],
                if (message['isEdited'] == true) ...[Text('edited', style: TextStyle(fontSize: 9, color: context.muted)), const SizedBox(width: 4)],
                Text(_clock(_date(message['createdAt']).toLocal()), style: TextStyle(fontSize: 9.5, color: context.muted)),
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
                    size: 13,
                    color: failed ? SyncColors.danger : read ? SyncColors.sky : context.muted,
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MessageContent extends StatelessWidget {
  const _MessageContent({required this.message, required this.onViewOnce});

  final Map<String, dynamic> message;
  final VoidCallback onViewOnce;

  @override
  Widget build(BuildContext context) {
    final text = message['text']?.toString() ?? '';
    final view = _map(message['viewOnce']);
    final file = _map(message['file']);

    if (view['enabled'] == true) {
      final opened = view['opened'] == true;
      final type = view['type']?.toString() ?? (file.isEmpty ? 'text' : file['type']?.toString() ?? 'message');
      return InkWell(
        onTap: opened ? null : onViewOnce,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          width: 215,
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 11),
          decoration: BoxDecoration(color: context.softPanel, borderRadius: BorderRadius.circular(10), border: Border.all(color: context.border)),
          child: Row(
            children: [
              Icon(opened ? Icons.check_circle_outline_rounded : Icons.visibility_off_outlined, color: SyncColors.sky),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(type == 'image' ? '1-time photo' : type == 'video' ? '1-time video' : '1-time message', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
                    Text(opened ? 'Opened' : 'Tap to open', style: TextStyle(fontSize: 10, color: context.muted)),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (text.startsWith(_pollPrefix)) return _PollCard(text: text);
    if (text.startsWith(_eventPrefix)) return _EventCard(text: text);
    if (text.startsWith('📍 Live location')) return _LocationCard(text: text);
    if (text.startsWith('👤 Contact')) return _ContactCard(text: text);

    if (file.isEmpty) return const SizedBox.shrink();
    final type = file['type']?.toString() ?? 'document';
    final url = file['url']?.toString() ?? '';
    final name = file['originalname']?.toString() ?? 'Attachment';
    if (type == 'image' && url.isNotEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Image.network(
          url,
          width: 230,
          height: 180,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => _FileCard(icon: Icons.broken_image_outlined, title: name, subtitle: 'Image'),
        ),
      );
    }
    if (type == 'audio' && url.isNotEmpty) return VoiceNotePlayer(file: file);
    return _FileCard(
      icon: type == 'video' ? Icons.play_circle_outline_rounded : type == 'audio' ? Icons.graphic_eq_rounded : Icons.insert_drive_file_outlined,
      title: name,
      subtitle: type == 'video' ? 'Video' : type == 'audio' ? 'Audio' : 'File',
    );
  }
}

class _PollCard extends StatelessWidget {
  const _PollCard({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    Map<String, dynamic> payload = const {};
    try {
      payload = Map<String, dynamic>.from(jsonDecode(text.substring(_pollPrefix.length)) as Map);
    } on Object {
      return const Text('Poll');
    }
    final options = payload['options'] is List ? payload['options'] as List : const [];
    return Container(
      width: 245,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: context.softPanel, borderRadius: BorderRadius.circular(11), border: Border.all(color: context.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [const Icon(Icons.poll_outlined, size: 17, color: SyncColors.success), const SizedBox(width: 6), Text(payload['mode'] == 'quiz' ? 'Quiz' : 'Poll', style: const TextStyle(fontWeight: FontWeight.w800))]),
          const SizedBox(height: 7),
          Text(payload['question']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 7),
          ...options.whereType<Map>().map((option) => Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 5),
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
                decoration: BoxDecoration(color: context.panel, borderRadius: BorderRadius.circular(8), border: Border.all(color: context.border)),
                child: Text(option['text']?.toString() ?? '', style: const TextStyle(fontSize: 12)),
              )),
        ],
      ),
    );
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    Map<String, dynamic> payload = const {};
    try {
      payload = Map<String, dynamic>.from(jsonDecode(text.substring(_eventPrefix.length)) as Map);
    } on Object {
      return const Text('Event');
    }
    return Container(
      width: 245,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: context.softPanel, borderRadius: BorderRadius.circular(11), border: Border.all(color: context.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(children: [Icon(Icons.event_outlined, size: 17, color: SyncColors.danger), SizedBox(width: 6), Text('Event', style: TextStyle(fontWeight: FontWeight.w800))]),
          const SizedBox(height: 6),
          Text(payload['title']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w800)),
          Text('${payload['date'] ?? ''} ${payload['time'] ?? ''}', style: TextStyle(fontSize: 11, color: context.muted)),
          if ((payload['details']?.toString() ?? '').isNotEmpty) ...[const SizedBox(height: 4), Text(payload['details'].toString(), style: const TextStyle(fontSize: 12))],
        ],
      ),
    );
  }
}

class _LocationCard extends StatelessWidget {
  const _LocationCard({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Container(
        width: 235,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: context.softPanel, borderRadius: BorderRadius.circular(11), border: Border.all(color: context.border)),
        child: Row(children: [const Icon(Icons.location_on_rounded, color: SyncColors.success), const SizedBox(width: 8), Expanded(child: Text(text.split('\n').first, style: const TextStyle(fontWeight: FontWeight.w800)))]),
      );
}

class _ContactCard extends StatelessWidget {
  const _ContactCard({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Container(
        width: 235,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: context.softPanel, borderRadius: BorderRadius.circular(11), border: Border.all(color: context.border)),
        child: Row(children: [const Icon(Icons.account_circle_outlined, color: SyncColors.cyan), const SizedBox(width: 8), Expanded(child: Text(text, maxLines: 4, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)))]),
      );
}

class _FileCard extends StatelessWidget {
  const _FileCard({required this.icon, required this.title, required this.subtitle});
  final IconData icon;
  final String title;
  final String subtitle;
  @override
  Widget build(BuildContext context) => Container(
        width: 230,
        padding: const EdgeInsets.all(9),
        decoration: BoxDecoration(color: context.softPanel, borderRadius: BorderRadius.circular(10), border: Border.all(color: context.border)),
        child: Row(
          children: [
            Container(width: 40, height: 40, decoration: BoxDecoration(color: SyncColors.sky.withValues(alpha: .10), borderRadius: BorderRadius.circular(10)), child: Icon(icon, color: SyncColors.sky)),
            const SizedBox(width: 8),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800)), Text(subtitle, style: TextStyle(fontSize: 10, color: context.muted))])),
          ],
        ),
      );
}

class _ViewOnceDialog extends StatelessWidget {
  const _ViewOnceDialog({required this.payload});
  final Map<String, dynamic> payload;

  @override
  Widget build(BuildContext context) {
    final type = payload['viewOnceType']?.toString() ?? 'text';
    final text = payload['text']?.toString() ?? '';
    final file = _map(payload['file']);
    final url = file['url']?.toString() ?? '';
    Widget body;
    if (type == 'image' && url.isNotEmpty) {
      body = Image.network(url, fit: BoxFit.contain, errorBuilder: (_, __, ___) => const Text('Image could not be displayed.'));
    } else if (type == 'video') {
      body = const Column(mainAxisSize: MainAxisSize.min, children: [Icon(Icons.play_circle_outline_rounded, size: 64, color: SyncColors.sky), SizedBox(height: 8), Text('Video opened')]);
    } else {
      body = Text(text.isEmpty ? 'One-time message opened.' : text);
    }
    return AlertDialog(
      title: const Row(children: [Icon(Icons.visibility_off_outlined, color: SyncColors.sky), SizedBox(width: 7), Text('View once')]),
      content: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 420, maxHeight: 520), child: body),
      actions: [FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Close'))],
    );
  }
}

class _PollDraft {
  const _PollDraft({required this.question, required this.options, required this.anonymous, required this.multi, required this.quiz, required this.correctIndex});
  final String question;
  final List<String> options;
  final bool anonymous;
  final bool multi;
  final bool quiz;
  final int? correctIndex;
}

class _PollDialog extends StatefulWidget {
  const _PollDialog();
  @override
  State<_PollDialog> createState() => _PollDialogState();
}

class _PollDialogState extends State<_PollDialog> {
  final question = TextEditingController();
  final options = List.generate(4, (_) => TextEditingController());
  bool anonymous = false;
  bool multi = false;
  bool quiz = false;
  int correct = 0;

  @override
  void dispose() {
    question.dispose();
    for (final item in options) item.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Poll / Quiz'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: question, decoration: const InputDecoration(labelText: 'Question')),
              const SizedBox(height: 8),
              for (var i = 0; i < options.length; i++) ...[
                TextField(controller: options[i], decoration: InputDecoration(labelText: 'Option ${i + 1}')),
                const SizedBox(height: 7),
              ],
              SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, value: quiz, title: const Text('Quiz'), onChanged: (v) => setState(() => quiz = v)),
              if (quiz)
                DropdownButtonFormField<int>(
                  initialValue: correct,
                  decoration: const InputDecoration(labelText: 'Correct option'),
                  items: List.generate(options.length, (i) => DropdownMenuItem(value: i, child: Text('Option ${i + 1}'))),
                  onChanged: (v) => setState(() => correct = v ?? 0),
                ),
              SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, value: anonymous, title: const Text('Anonymous votes'), onChanged: (v) => setState(() => anonymous = v)),
              SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, value: multi, title: const Text('Multiple choice'), onChanged: (v) => setState(() => multi = v)),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              final q = question.text.trim();
              final rows = options.map((e) => e.text.trim()).where((e) => e.isNotEmpty).toList();
              if (q.isEmpty || rows.length < 2) return;
              Navigator.pop(context, _PollDraft(question: q, options: rows, anonymous: anonymous, multi: multi, quiz: quiz, correctIndex: quiz && correct < rows.length ? correct : null));
            },
            child: const Text('Send'),
          ),
        ],
      );
}

class _EventDraft {
  const _EventDraft({required this.title, required this.date, required this.time, required this.details, required this.url});
  final String title;
  final String date;
  final String time;
  final String details;
  final String url;
}

class _EventDialog extends StatefulWidget {
  const _EventDialog();
  @override
  State<_EventDialog> createState() => _EventDialogState();
}

class _EventDialogState extends State<_EventDialog> {
  final title = TextEditingController();
  final details = TextEditingController();
  final url = TextEditingController();
  DateTime date = DateTime.now().add(const Duration(days: 1));
  TimeOfDay time = const TimeOfDay(hour: 18, minute: 0);

  @override
  void dispose() {
    title.dispose();
    details.dispose();
    url.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Create event'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: title, decoration: const InputDecoration(labelText: 'Event title')),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.calendar_today_outlined),
                title: Text('${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}'),
                onTap: () async {
                  final picked = await showDatePicker(context: context, initialDate: date, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 730)));
                  if (picked != null) setState(() => date = picked);
                },
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.schedule_outlined),
                title: Text(time.format(context)),
                onTap: () async {
                  final picked = await showTimePicker(context: context, initialTime: time);
                  if (picked != null) setState(() => time = picked);
                },
              ),
              TextField(controller: details, minLines: 2, maxLines: 4, decoration: const InputDecoration(labelText: 'Details')),
              const SizedBox(height: 8),
              TextField(controller: url, decoration: const InputDecoration(labelText: 'Link (optional)')),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (title.text.trim().isEmpty) return;
              Navigator.pop(
                context,
                _EventDraft(
                  title: title.text.trim(),
                  date: '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}',
                  time: '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}',
                  details: details.text.trim(),
                  url: url.text.trim(),
                ),
              );
            },
            child: const Text('Send'),
          ),
        ],
      );
}

Map<String, dynamic> _map(dynamic value) => value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

Set<String> _ids(dynamic value) => value is List ? value.map((e) => e.toString()).where((e) => e.isNotEmpty).toSet() : <String>{};

DateTime _date(dynamic value) => DateTime.tryParse(value?.toString() ?? '') ?? DateTime.fromMillisecondsSinceEpoch(0);

bool _sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

String _clock(DateTime date) {
  final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
  final minute = date.minute.toString().padLeft(2, '0');
  return '$hour:$minute ${date.hour >= 12 ? 'PM' : 'AM'}';
}

String _fullDate(DateTime date) => '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year} ${_clock(date)}';

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}

String _friendIdFrom(Map<String, dynamic> inbox, String currentUserId) {
  final owners = inbox['owners'];
  if (owners is List) {
    for (final raw in owners.whereType<Map>()) {
      final id = raw['userId']?.toString() ?? '';
      if (id.isNotEmpty && id != currentUserId) return id;
    }
  }
  final ownersId = inbox['ownersId'];
  if (ownersId is List) {
    for (final raw in ownersId) {
      final id = raw.toString();
      if (id.isNotEmpty && id != currentUserId) return id;
    }
  }
  return '';
}

String _roomName(Map<String, dynamic> inbox, String currentUserId) {
  if (inbox['channel'] is Map) {
    final channel = _map(inbox['channel']);
    return channel['name']?.toString() ?? 'Channel';
  }
  if (inbox['roomType']?.toString() == 'group') {
    final group = _map(inbox['group']);
    return group['name']?.toString() ?? 'Group';
  }
  final owners = inbox['owners'];
  if (owners is List) {
    for (final raw in owners.whereType<Map>()) {
      if (raw['userId']?.toString() == currentUserId) continue;
      return raw['fullname']?.toString() ?? raw['username']?.toString() ?? 'Chat';
    }
  }
  return 'Chat';
}

String? _roomAvatar(Map<String, dynamic> inbox, String currentUserId) {
  if (inbox['channel'] is Map) return _map(inbox['channel'])['avatar']?.toString();
  if (inbox['roomType']?.toString() == 'group') return _map(inbox['group'])['avatar']?.toString();
  final owners = inbox['owners'];
  if (owners is List) {
    for (final raw in owners.whereType<Map>()) {
      if (raw['userId']?.toString() == currentUserId) continue;
      return raw['avatar']?.toString();
    }
  }
  return null;
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

bool _isSpecialText(String value) => value.startsWith(_pollPrefix) || value.startsWith(_eventPrefix) || value.startsWith('📍 Live location') || value.startsWith('👤 Contact');
