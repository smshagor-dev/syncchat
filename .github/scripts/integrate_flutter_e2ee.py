from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# 1) WebCrypto-compatible standard Base64 for envelope byte fields.
e2ee_path = Path("mobile/lib/core/e2ee_service.dart")
e2ee = e2ee_path.read_text()
for old, new, label in [
    ("'salt': _base64Url(salt),", "'salt': _base64(salt),", "salt base64"),
    ("'wrapIv': _base64Url(wrapIv),", "'wrapIv': _base64(wrapIv),", "wrap iv base64"),
    ("'wrappedKey': _base64Url(wrappedKey),", "'wrappedKey': _base64(wrappedKey),", "wrapped key base64"),
    ("'messageIv': _base64Url(messageIv),", "'messageIv': _base64(messageIv),", "message iv base64"),
    ("'ciphertext': _base64Url(ciphertext),", "'ciphertext': _base64(ciphertext),", "ciphertext base64"),
    ("final salt = _base64UrlDecode(target['salt']?.toString() ?? '');", "final salt = _base64Decode(target['salt']?.toString() ?? '');", "salt decode"),
    ("final wrapIv = _base64UrlDecode(target['wrapIv']?.toString() ?? '');", "final wrapIv = _base64Decode(target['wrapIv']?.toString() ?? '');", "wrap iv decode"),
    ("input: _base64UrlDecode(target['wrappedKey']?.toString() ?? ''),", "input: _base64Decode(target['wrappedKey']?.toString() ?? ''),", "wrapped key decode"),
    ("nonce: _base64UrlDecode(envelope['messageIv']?.toString() ?? ''),", "nonce: _base64Decode(envelope['messageIv']?.toString() ?? ''),", "message iv decode"),
    ("input: _base64UrlDecode(envelope['ciphertext']?.toString() ?? ''),", "input: _base64Decode(envelope['ciphertext']?.toString() ?? ''),", "ciphertext decode"),
]:
    e2ee = replace_once(e2ee, old, new, label)

needle = """  Uint8List _base64UrlDecode(String value) {
    if (value.isEmpty) return Uint8List(0);
    return Uint8List.fromList(base64Url.decode(base64Url.normalize(value)));
  }

  BigInt _bigInt(Uint8List bytes) {"""
replacement = """  Uint8List _base64UrlDecode(String value) {
    if (value.isEmpty) return Uint8List(0);
    return Uint8List.fromList(base64Url.decode(base64Url.normalize(value)));
  }

  String _base64(Uint8List bytes) => base64Encode(bytes);

  Uint8List _base64Decode(String value) {
    if (value.isEmpty) return Uint8List(0);
    return Uint8List.fromList(base64.decode(value));
  }

  BigInt _bigInt(Uint8List bytes) {"""
e2ee = replace_once(e2ee, needle, replacement, "base64 helper insertion")
e2ee_path.write_text(e2ee)

# 2) Forwarding must never downgrade E2EE source/destination rooms.
forward_path = Path("mobile/lib/screens/forward_message_sheet.dart")
forward = forward_path.read_text()
forward = replace_once(
    forward,
    """  bool _forwardBlocked(Map<String, dynamic> inbox) =>
      inbox['secretChatEnabled'] == true &&
      (inbox['secretForwardBlocked'] == null || inbox['secretForwardBlocked'] == true);""",
    """  bool _forwardBlocked(Map<String, dynamic> inbox) {
    if (inbox['e2eeEnabled'] == true) return true;
    return inbox['secretChatEnabled'] == true &&
        (inbox['secretForwardBlocked'] == null ||
            inbox['secretForwardBlocked'] == true);
  }""",
    "forward e2ee filter",
)
forward = replace_once(
    forward,
    """      if (_forwardBlocked(fromInbox) || _forwardBlocked(toInbox)) {
        throw const ApiException(
          statusCode: 403,
          message: 'Forward is blocked in secret chat',
        );
      }""",
    """      if (fromInbox['e2eeEnabled'] == true ||
          toInbox['e2eeEnabled'] == true) {
        throw const ApiException(
          statusCode: 403,
          message:
              'Forwarding device-E2EE messages is disabled to prevent plaintext downgrade.',
          payload: {'code': 'E2EE_FORWARD_BLOCKED'},
        );
      }
      if (_forwardBlocked(fromInbox) || _forwardBlocked(toInbox)) {
        throw const ApiException(
          statusCode: 403,
          message: 'Forward is blocked in secret chat',
        );
      }""",
    "forward source validation",
)
forward_path.write_text(forward)

# 3) Bind E2EE state/encryption/decryption/security controls into the live room.
room_path = Path("mobile/lib/screens/live_chat_room_screen.dart")
room = room_path.read_text()
room = replace_once(
    room,
    """  String typingText = '';
  int lastSequence = 0;

  String get roomId => widget.inbox['roomId']?.toString() ?? '';
  String get currentUserId => currentUser?['_id']?.toString() ?? '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }""",
    """  String typingText = '';
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
    e2eeEnabled = widget.inbox['roomType']?.toString() == 'private' &&
        widget.inbox['e2eeEnabled'] == true;
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }""",
    "room e2ee state",
)
room = replace_once(
    room,
    """      chat.off('chat/typing', _onTypingEvent);
      chat.off('chat/typing-ends', _onTypingEnds);""",
    """      chat.off('chat/typing', _onTypingEvent);
      chat.off('chat/typing-ends', _onTypingEnds);
      chat.off('e2ee/room', _onE2eeRoom);
      chat.off('e2ee/key-changed', _onE2eeKeyChanged);""",
    "room e2ee dispose listeners",
)
room = replace_once(
    room,
    """    chat.on('chat/typing', _onTypingEvent);
    chat.on('chat/typing-ends', _onTypingEnds);""",
    """    chat.on('chat/typing', _onTypingEvent);
    chat.on('chat/typing-ends', _onTypingEnds);
    chat.on('e2ee/room', _onE2eeRoom);
    chat.on('e2ee/key-changed', _onE2eeKeyChanged);""",
    "room e2ee active listeners",
)
room = replace_once(
    room,
    """        chat.openRoom(roomId),
        chat.pinnedMessages(roomId),
      ]);
      currentUser = Map<String, dynamic>.from(results[0] as Map);""",
    """        chat.openRoom(roomId),
        chat.pinnedMessages(roomId),
        widget.inbox['roomType']?.toString() == 'private'
            ? chat.e2eeRoomState(roomId)
            : Future<Map<String, dynamic>>.value(
                const {'enabled': false, 'version': 0},
              ),
      ]);
      currentUser = Map<String, dynamic>.from(results[0] as Map);
      e2eeEnabled =
          Map<String, dynamic>.from(results[4] as Map)['enabled'] == true;""",
    "room initial e2ee state",
)
room = replace_once(
    room,
    """        chat.listRoom(roomId, limit: 100),
        chat.pinnedMessages(roomId),
      ]);""",
    """        chat.listRoom(roomId, limit: 100),
        chat.pinnedMessages(roomId),
        widget.inbox['roomType']?.toString() == 'private'
            ? chat.e2eeRoomState(roomId)
            : Future<Map<String, dynamic>>.value(
                const {'enabled': false, 'version': 0},
              ),
      ]);""",
    "room reload e2ee request",
)
room = replace_once(
    room,
    """      _applyPins(Map<String, dynamic>.from(results[1] as Map));
      await chat.markRoomRead(widget.inbox);
      if (!mounted) return;
      setState(() => loading = false);""",
    """      _applyPins(Map<String, dynamic>.from(results[1] as Map));
      await chat.markRoomRead(effectiveInbox);
      if (!mounted) return;
      setState(() {
        e2eeEnabled =
            Map<String, dynamic>.from(results[2] as Map)['enabled'] == true;
        loading = false;
      });""",
    "room reload e2ee apply",
)
room = replace_once(
    room,
    """  void _onSyncResult(dynamic data) {
    if (!mounted || data is! Map || data['roomId']?.toString() != roomId) return;
    final rows = data['messages'];
    if (rows is! List) return;
    setState(() {
      _mergeMessages(
        rows.whereType<Map>().map((item) => Map<String, dynamic>.from(item)),
      );
    });
    _scrollToBottom();
  }

  void _onChatInsert(dynamic data) {
    if (!mounted || data is! Map || data['roomId']?.toString() != roomId) return;
    final message = Map<String, dynamic>.from(data);
    setState(() => _mergeMessages([message]));
    if (!_isMine(message)) {
      chat.sendReceipt(message, read: true);
      chat.markRoomRead(widget.inbox);
    }
    _scrollToBottom();
  }""",
    """  void _onSyncResult(dynamic data) async {
    if (!mounted || data is! Map || data['roomId']?.toString() != roomId) return;
    final rows = data['messages'];
    if (rows is! List) return;
    final decrypted = <Map<String, dynamic>>[];
    for (final raw in rows.whereType<Map>()) {
      decrypted.add(
        await chat.decryptMessage(Map<String, dynamic>.from(raw)),
      );
    }
    if (!mounted) return;
    setState(() => _mergeMessages(decrypted));
    _scrollToBottom();
  }

  void _onChatInsert(dynamic data) async {
    if (!mounted || data is! Map || data['roomId']?.toString() != roomId) return;
    final message = await chat.decryptMessage(Map<String, dynamic>.from(data));
    if (!mounted) return;
    setState(() => _mergeMessages([message]));
    if (!_isMine(message)) {
      chat.sendReceipt(message, read: true);
      chat.markRoomRead(effectiveInbox);
    }
    _scrollToBottom();
  }""",
    "realtime e2ee decrypt",
)
room = replace_once(
    room,
    """  void _onChatError(dynamic data) {
    if (!mounted) return;
    final message = data is Map
        ? data['message']?.toString() ?? 'Message could not be sent.'
        : 'Message could not be sent.';
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  void _mergeMessages""",
    """  void _onChatError(dynamic data) {
    if (!mounted) return;
    final message = data is Map
        ? data['message']?.toString() ?? 'Message could not be sent.'
        : 'Message could not be sent.';
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  void _onE2eeRoom(dynamic data) {
    if (!mounted || data is! Map || data['roomId']?.toString() != roomId) return;
    final enabled = data['enabled'] == true;
    setState(() {
      e2eeEnabled = enabled;
      if (enabled && editingMessage != null) {
        editingMessage = null;
        composer.clear();
      }
    });
    _snack(enabled
        ? 'End-to-end encryption enabled.'
        : 'End-to-end encryption disabled.');
  }

  void _onE2eeKeyChanged(dynamic data) {
    if (!mounted || data is! Map) return;
    _snack('An E2EE device key changed. Verify the contact security code.');
  }

  void _mergeMessages""",
    "room e2ee socket handlers",
)
room = replace_once(
    room,
    """  Future<void> _send() async {
    final text = composer.text.trim();
    if (text.isEmpty || sending || uploading) return;

    if (editingMessage != null) {""",
    """  Future<void> _send() async {
    final text = composer.text.trim();
    if (text.isEmpty || sending || uploading) return;

    if (editingMessage != null && e2eeEnabled) {
      _cancelComposerMode();
      _snack(
        'Editing is disabled for device-E2EE messages until encrypted edit envelopes are supported.',
      );
      return;
    }

    if (editingMessage != null) {""",
    "e2ee edit defense",
)
room = replace_once(
    room,
    """      await chat.sendText(
        inbox: widget.inbox,""",
    """      await chat.sendText(
        inbox: effectiveInbox,""",
    "encrypted send effective inbox",
)
room = replace_once(
    room,
    """  Future<void> _showAttachmentSheet() async {
    if (uploading) return;""",
    """  Future<void> _showAttachmentSheet() async {
    if (uploading) return;
    if (e2eeEnabled) {
      _snack(
        'Media sending is disabled while device E2EE is enabled because encrypted media attachments are not implemented yet.',
      );
      return;
    }""",
    "e2ee media guard",
)
room = replace_once(
    room,
    """      final sent = await chat.sendAttachment(
        inbox: widget.inbox,
        file: uploaded,""",
    """      final sent = await chat.sendAttachment(
        inbox: effectiveInbox,
        file: uploaded,""",
    "attachment effective inbox",
)
room = replace_once(
    room,
    """    final canEdit = mine && !viewOnce && (message['text']?.toString().trim().isNotEmpty ?? false);""",
    """    final canEdit = mine &&
        !e2eeEnabled &&
        !viewOnce &&
        (message['text']?.toString().trim().isNotEmpty ?? false);""",
    "e2ee edit action hide",
)
room = replace_once(
    room,
    """              ListTile(
                leading: const Icon(Icons.forward_rounded),
                title: const Text('Forward'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _forwardMessage(message);
                },
              ),""",
    """              if (!e2eeEnabled)
                ListTile(
                  leading: const Icon(Icons.forward_rounded),
                  title: const Text('Forward'),
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _forwardMessage(message);
                  },
                ),""",
    "e2ee forward action hide",
)
room = replace_once(
    room,
    """  Future<void> _forwardMessage(Map<String, dynamic> message) async {
    final chatId = message['_id']?.toString() ?? '';""",
    """  Future<void> _forwardMessage(Map<String, dynamic> message) async {
    if (e2eeEnabled || message['e2eeEnvelope'] is Map) {
      _snack(
        'Forwarding device-E2EE messages is disabled to prevent plaintext downgrade.',
      );
      return;
    }
    final chatId = message['_id']?.toString() ?? '';""",
    "e2ee forward defense",
)
room = replace_once(
    room,
    """    if (widget.inbox['e2eeEnabled'] == true) {
      _snack(
        'This room uses device E2EE. Mobile key exchange must be enabled before sending.',
      );
      return;
    }""",
    """    if (e2eeEnabled) {
      _snack(
        'Media sending is disabled while device E2EE is enabled because encrypted media attachments are not implemented yet.',
      );
      return;
    }""",
    "voice e2ee guard",
)
# Voice has a second sendAttachment occurrence after the attachment composer occurrence was replaced.
room = replace_once(
    room,
    """      final sent = await chat.sendAttachment(
        inbox: widget.inbox,
        file: {""",
    """      final sent = await chat.sendAttachment(
        inbox: effectiveInbox,
        file: {""",
    "voice effective inbox",
)
room = replace_once(
    room,
    """  Future<void> _showScheduleMenu() async {
    if (editingMessage != null) {""",
    """  Future<void> _showScheduleMenu() async {
    if (e2eeEnabled) {
      _snack(
        'Scheduled send is disabled while device E2EE is enabled because the server cannot encrypt a message later without device private keys.',
      );
      return;
    }
    if (editingMessage != null) {""",
    "schedule e2ee guard",
)
# Both schedule call sites should use effectiveInbox.
if room.count("inbox: widget.inbox,") != 2:
    raise SystemExit(
        f"schedule effective inbox: expected 2 remaining matches, found {room.count('inbox: widget.inbox,')}"
    )
room = room.replace("inbox: widget.inbox,", "inbox: effectiveInbox,", 2)

security_method = """
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

"""
room = replace_once(
    room,
    """  void _snack(String message) {""",
    security_method + """  void _snack(String message) {""",
    "room security sheet method",
)
room = replace_once(
    room,
    """            _RoomHeader(
              name: widget.name,
              inbox: widget.inbox,
              typingText: typingText,
            ),
            if (pinnedIds.isNotEmpty)""",
    """            _RoomHeader(
              name: widget.name,
              inbox: effectiveInbox,
              typingText: typingText,
              e2eeEnabled: e2eeEnabled,
              onSecurity: _showE2eeSheet,
            ),
            if (e2eeEnabled)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                color: context.panel,
                child: const Row(
                  children: [
                    Icon(Icons.lock_rounded, size: 15, color: SyncColors.sky),
                    SizedBox(width: 7),
                    Expanded(
                      child: Text(
                        'End-to-end encrypted · Device E2EE',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
                      ),
                    ),
                  ],
                ),
              ),
            if (pinnedIds.isNotEmpty)""",
    "room e2ee banner",
)
room = replace_once(
    room,
    """              onVoice: _recordVoiceNote,
              onTyping: () => chat.typing(widget.inbox),""",
    """              onVoice: _recordVoiceNote,
              onTyping: () => chat.typing(effectiveInbox),""",
    "typing effective inbox",
)
room = replace_once(
    room,
    """  const _RoomHeader({
    required this.name,
    required this.inbox,
    required this.typingText,
  });

  final String name;
  final Map<String, dynamic> inbox;
  final String typingText;""",
    """  const _RoomHeader({
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
  final VoidCallback onSecurity;""",
    "room header e2ee props",
)
room = replace_once(
    room,
    """                  typingText.isNotEmpty
                      ? typingText
                      : group
                          ? 'Group conversation'
                          : 'SyncChat contact',""",
    """                  typingText.isNotEmpty
                      ? typingText
                      : e2eeEnabled
                          ? 'End-to-end encrypted'
                          : group
                              ? 'Group conversation'
                              : 'SyncChat contact',""",
    "room header e2ee subtitle",
)
room = replace_once(
    room,
    """          IconButton(onPressed: () {}, icon: const Icon(Icons.more_vert_rounded)),""",
    """          IconButton(
            tooltip: 'Security',
            onPressed: onSecurity,
            icon: Icon(
              e2eeEnabled ? Icons.lock_rounded : Icons.security_outlined,
            ),
          ),""",
    "room security action",
)
room = replace_once(
    room,
    """                  if (pinned) ...[
                    const Icon(Icons.push_pin_rounded, size: 12, color: SyncColors.sky),""",
    """                  if (message['e2eeEnvelope'] is Map) ...[
                    const Icon(Icons.lock_rounded, size: 12, color: SyncColors.sky),
                    const SizedBox(width: 3),
                  ],
                  if (pinned) ...[
                    const Icon(Icons.push_pin_rounded, size: 12, color: SyncColors.sky),""",
    "message e2ee lock indicator",
)

sheet_class = r'''
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
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                      ),
                      Text(
                        enabled ? 'Enabled for this private chat' : 'Available for this private chat',
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
                    icon: Icon(enabled ? Icons.lock_open_rounded : Icons.lock_rounded),
                    label: Text(enabled ? 'Disable' : 'Enable'),
                  ),
                ),
              ],
            ),
            if (enabled) ...[
              const SizedBox(height: 12),
              Text(
                'Encrypted media, scheduled send, forwarding and message editing remain disabled until encrypted versions of those protocols are supported.',
                style: TextStyle(fontSize: 11, height: 1.35, color: context.muted),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

'''
room = replace_once(
    room,
    """class _RoomHeader extends StatelessWidget {""",
    sheet_class + """class _RoomHeader extends StatelessWidget {""",
    "e2ee security sheet class",
)
room_path.write_text(room)

# 4) Pure crypto tests: P-256 key integrity, per-device envelopes and Base64 compatibility.
test_path = Path("mobile/test/e2ee_crypto_test.dart")
test_path.write_text(r'''import 'dart:convert';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:syncchat_mobile/core/e2ee_service.dart';

void main() {
  group('E2eeCrypto', () {
    test('generates a valid P-256 device key and stable fingerprint', () {
      final crypto = E2eeCrypto(random: Random(11));
      final record = crypto.generateDeviceKey(
        userId: '11111111-1111-4111-8111-111111111111',
        sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );

      expect(crypto.validates(record), isTrue);
      expect(record.publicJwk['kty'], 'EC');
      expect(record.publicJwk['crv'], 'P-256');
      expect(record.x, isNotEmpty);
      expect(record.y, isNotEmpty);
      expect(record.fingerprint, hasLength(64));
      expect(crypto.fingerprint(record.publicJwk), record.fingerprint);
    });

    test('encrypts once and decrypts on every target device', () {
      final crypto = E2eeCrypto(random: Random(23));
      final first = crypto.generateDeviceKey(
        userId: '11111111-1111-4111-8111-111111111111',
        sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
      final second = crypto.generateDeviceKey(
        userId: '22222222-2222-4222-8222-222222222222',
        sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      );
      const roomId = 'private-room-e2ee';
      const plaintext = 'hello encrypted world';
      final peers = [first, second]
          .map(
            (record) => <String, dynamic>{
              'userId': record.userId,
              'sessionId': record.sessionId,
              'fingerprint': record.fingerprint,
              'publicJwk': record.publicJwk,
            },
          )
          .toList(growable: false);

      final envelope = crypto.encryptText(
        text: plaintext,
        roomId: roomId,
        current: first,
        peerKeys: peers,
      );

      expect(envelope['version'], 1);
      expect(
        envelope['algorithm'],
        'ECDH-P256+HKDF-SHA256+AES-256-GCM',
      );
      expect(envelope['roomId'], roomId);
      expect((envelope['devices'] as List), hasLength(2));
      expect(envelope['ciphertext'].toString(), isNot(contains(plaintext)));

      // Web e2eeV2.js uses btoa/atob for envelope bytes, so these must be
      // standard Base64 rather than JWK-style Base64URL.
      expect(base64.decode(envelope['messageIv'].toString()), hasLength(12));
      expect(base64.decode(envelope['ciphertext'].toString()).length, greaterThan(16));
      for (final raw in (envelope['devices'] as List).whereType<Map>()) {
        expect(base64.decode(raw['salt'].toString()), hasLength(16));
        expect(base64.decode(raw['wrapIv'].toString()), hasLength(12));
        expect(base64.decode(raw['wrappedKey'].toString()), hasLength(48));
      }

      expect(
        crypto.decryptText(
          envelope: envelope,
          roomId: roomId,
          current: first,
        ),
        plaintext,
      );
      expect(
        crypto.decryptText(
          envelope: envelope,
          roomId: roomId,
          current: second,
        ),
        plaintext,
      );
    });

    test('a session not targeted by the envelope cannot decrypt', () {
      final crypto = E2eeCrypto(random: Random(31));
      final first = crypto.generateDeviceKey(
        userId: '11111111-1111-4111-8111-111111111111',
        sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
      final second = crypto.generateDeviceKey(
        userId: '22222222-2222-4222-8222-222222222222',
        sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      );
      final newSession = crypto.generateDeviceKey(
        userId: second.userId,
        sessionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      );
      const roomId = 'private-room-e2ee';
      final envelope = crypto.encryptText(
        text: 'secret',
        roomId: roomId,
        current: first,
        peerKeys: [
          {
            'userId': first.userId,
            'sessionId': first.sessionId,
            'fingerprint': first.fingerprint,
            'publicJwk': first.publicJwk,
          },
          {
            'userId': second.userId,
            'sessionId': second.sessionId,
            'fingerprint': second.fingerprint,
            'publicJwk': second.publicJwk,
          },
        ],
      );

      expect(
        crypto.decryptText(
          envelope: envelope,
          roomId: roomId,
          current: newSession,
        ),
        isNull,
      );
    });
  });
}
''')

print("Flutter E2EE integration applied")
