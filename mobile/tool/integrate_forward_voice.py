from pathlib import Path

path = Path('mobile/lib/screens/live_chat_room_screen.dart')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    "import '../widgets.dart';\n",
    "import '../widgets.dart';\nimport 'forward_message_sheet.dart';\nimport 'voice_note_widgets.dart';\n",
    'imports',
)

replace_once(
    """              ListTile(\n                leading: const Icon(Icons.reply_rounded),\n                title: const Text('Reply'),\n                onTap: () {\n                  Navigator.pop(sheetContext);\n                  _startReply(message);\n                },\n              ),\n""",
    """              ListTile(\n                leading: const Icon(Icons.reply_rounded),\n                title: const Text('Reply'),\n                onTap: () {\n                  Navigator.pop(sheetContext);\n                  _startReply(message);\n                },\n              ),\n              ListTile(\n                leading: const Icon(Icons.forward_rounded),\n                title: const Text('Forward'),\n                onTap: () {\n                  Navigator.pop(sheetContext);\n                  _forwardMessage(message);\n                },\n              ),\n""",
    'forward action',
)

replace_once(
    """  void _startReply(Map<String, dynamic> message) {\n""",
    """  Future<void> _forwardMessage(Map<String, dynamic> message) async {\n    final chatId = message['_id']?.toString() ?? '';\n    if (chatId.isEmpty) return;\n    try {\n      final forwarded = await showForwardMessageSheet(\n        context,\n        fromRoomId: roomId,\n        chatIds: [chatId],\n      );\n      if (forwarded == true && mounted) _snack('Message forwarded.');\n    } on Object catch (failure) {\n      if (mounted) _snack(_messageFor(failure));\n    }\n  }\n\n  void _startReply(Map<String, dynamic> message) {\n""",
    'forward method',
)

replace_once(
    """  Future<void> _showScheduleMenu() async {\n""",
    """  Future<void> _recordVoiceNote() async {\n    if (sending || uploading || editingMessage != null) return;\n    if (widget.inbox['e2eeEnabled'] == true) {\n      _snack(\n        'This room uses device E2EE. Mobile key exchange must be enabled before sending.',\n      );\n      return;\n    }\n\n    final draft = await showVoiceRecorderSheet(context);\n    if (draft == null || !mounted) return;\n    setState(() => uploading = true);\n\n    try {\n      final uploaded = await chat.uploadAttachment(\n        filePath: draft.path,\n        filename: draft.filename,\n      );\n      final sent = await chat.sendAttachment(\n        inbox: widget.inbox,\n        file: {\n          ...uploaded,\n          'type': 'audio',\n          'duration': draft.durationSeconds,\n        },\n        replyTo: replyingTo?['_id']?.toString(),\n      );\n      if (!mounted) return;\n      setState(() {\n        uploading = false;\n        replyingTo = null;\n        _mergeMessages([sent]);\n      });\n      _scrollToBottom();\n    } on Object catch (failure) {\n      if (!mounted) return;\n      setState(() => uploading = false);\n      _snack(_messageFor(failure));\n    } finally {\n      await draft.delete();\n    }\n  }\n\n  Future<void> _showScheduleMenu() async {\n""",
    'voice method',
)

replace_once(
    """              onSchedule: _showScheduleMenu,\n              onTyping: () => chat.typing(widget.inbox),\n""",
    """              onSchedule: _showScheduleMenu,\n              onVoice: _recordVoiceNote,\n              onTyping: () => chat.typing(widget.inbox),\n""",
    'composer voice callback',
)

replace_once(
    """    if (type == 'audio') {\n      return _FileCard(\n        icon: Icons.graphic_eq_rounded,\n        title: name,\n        subtitle: 'Audio',\n      );\n    }\n""",
    """    if (type == 'audio' && url.isNotEmpty) {\n      return VoiceNotePlayer(file: file);\n    }\n    if (type == 'audio') {\n      return _FileCard(\n        icon: Icons.graphic_eq_rounded,\n        title: name,\n        subtitle: 'Audio',\n      );\n    }\n""",
    'voice renderer',
)

replace_once(
    """    required this.onSchedule,\n    required this.onTyping,\n""",
    """    required this.onSchedule,\n    required this.onVoice,\n    required this.onTyping,\n""",
    'composer constructor',
)

replace_once(
    """  final VoidCallback onSchedule;\n  final VoidCallback onTyping;\n""",
    """  final VoidCallback onSchedule;\n  final VoidCallback onVoice;\n  final VoidCallback onTyping;\n""",
    'composer field',
)

replace_once(
    """              ),\n              const SizedBox(width: 6),\n              Material(\n                color: SyncColors.sky,\n""",
    """              ),\n              IconButton(\n                tooltip: 'Voice message',\n                onPressed: sending || uploading ? null : onVoice,\n                icon: const Icon(Icons.mic_none_rounded),\n              ),\n              const SizedBox(width: 2),\n              Material(\n                color: SyncColors.sky,\n""",
    'composer microphone button',
)

path.write_text(text, encoding='utf-8')
print('Forward and voice messaging integrated into live chat room.')
