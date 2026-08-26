import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../core/permission_manager.dart';
import '../theme.dart';
import '../widgets.dart';
import 'live_chat_room_screen.dart';

const _pollPrefix = '__poll__::';
const _eventPrefix = '__event__::';

class LiveRichAttachmentsHubScreen extends StatefulWidget {
  const LiveRichAttachmentsHubScreen({super.key});

  @override
  State<LiveRichAttachmentsHubScreen> createState() =>
      _LiveRichAttachmentsHubScreenState();
}

class _LiveRichAttachmentsHubScreenState
    extends State<LiveRichAttachmentsHubScreen> {
  List<Map<String, dynamic>> rooms = const [];
  Map<String, dynamic>? currentUser;
  bool loading = true;
  String? error;

  String get userId => currentUser?['_id']?.toString() ?? '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }
    try {
      final result = await Future.wait<dynamic>([
        context.services.chat.currentUser(refresh: true),
        context.services.inbox.list(),
      ]);
      if (!mounted) return;
      setState(() {
        currentUser = Map<String, dynamic>.from(result[0] as Map);
        rooms = (result[1] as List)
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

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'Rich attachments',
      actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded))],
      child: loading && rooms.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : error != null && rooms.isEmpty
              ? _AttachmentError(message: error!, onRetry: _load)
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(8, 8, 8, 30),
                  itemCount: rooms.length,
                  separatorBuilder: (_, __) => Divider(
                    height: 1,
                    indent: 70,
                    color: context.border,
                  ),
                  itemBuilder: (_, index) {
                    final room = rooms[index];
                    final name = _roomName(room, userId);
                    return ListTile(
                      leading: SyncAvatar(name: name, radius: 23),
                      title: Text(name, style: const TextStyle(fontWeight: FontWeight.w900)),
                      subtitle: Text(
                        room['roomType']?.toString() == 'group'
                            ? (room['channel'] is Map ? 'Channel' : 'Group')
                            : 'Private chat',
                      ),
                      trailing: const Icon(Icons.attach_file_rounded),
                      onTap: () => _openActions(room, name),
                    );
                  },
                ),
    );
  }

  Future<void> _openActions(Map<String, dynamic> room, String name) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                title: Text(name, style: const TextStyle(fontWeight: FontWeight.w900)),
                subtitle: const Text('Choose an attachment type'),
              ),
              _action(sheetContext, Icons.location_on_outlined, 'Location', () => _sendLocation(room)),
              _action(sheetContext, Icons.contact_page_outlined, 'Contact', () => _sendContact(room)),
              _action(sheetContext, Icons.poll_outlined, 'Poll / Quiz', () => _sendPoll(room)),
              _action(sheetContext, Icons.event_outlined, 'Event', () => _sendEvent(room)),
              _action(sheetContext, Icons.emoji_emotions_outlined, 'Sticker', () => _sendSticker(room)),
              ListTile(
                leading: const Icon(Icons.chat_bubble_outline_rounded, color: SyncColors.sky),
                title: const Text('Open conversation'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => LiveChatRoomScreen(inbox: room, name: name),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _action(
    BuildContext sheetContext,
    IconData icon,
    String label,
    Future<void> Function() action,
  ) => ListTile(
        leading: Icon(icon, color: SyncColors.sky),
        title: Text(label),
        onTap: () {
          Navigator.pop(sheetContext);
          action();
        },
      );

  Future<void> _sendText(Map<String, dynamic> room, String text, String success) async {
    try {
      await context.services.chat.sendText(inbox: room, text: text);
      if (!mounted) return;
      _snack(success);
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _sendLocation(Map<String, dynamic> room) async {
    final allowed = await AppPermissionManager.ensureLocation(
      context,
      reason: 'Location permission is needed only when you choose to share your current location.',
    );
    if (!allowed || !mounted) return;

    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        _snack('Location services are turned off on this device.');
        return;
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 15),
        ),
      );
      final latitude = position.latitude.toStringAsFixed(6);
      final longitude = position.longitude.toStringAsFixed(6);
      await _sendText(
        room,
        '📍 Live location\nhttps://maps.google.com/?q=$latitude,$longitude',
        'Location shared.',
      );
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _sendContact(Map<String, dynamic> room) async {
    try {
      final contacts = await context.services.contacts.list();
      if (!mounted) return;
      final selected = await showModalBottomSheet<Map<String, dynamic>>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (sheetContext) => SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(sheetContext).height * .68,
            child: Column(
              children: [
                const ListTile(
                  title: Text('Share contact', style: TextStyle(fontWeight: FontWeight.w900)),
                ),
                Expanded(
                  child: ListView.separated(
                    itemCount: contacts.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, index) {
                      final contact = contacts[index];
                      final profile = contact['profile'] is Map
                          ? Map<String, dynamic>.from(contact['profile'] as Map)
                          : <String, dynamic>{};
                      final name = profile['fullname']?.toString() ??
                          profile['username']?.toString() ??
                          'Contact';
                      return ListTile(
                        leading: SyncAvatar(name: name, radius: 22),
                        title: Text(name),
                        subtitle: Text(
                          (profile['username']?.toString() ?? '').isEmpty
                              ? 'SyncChat contact'
                              : '@${profile['username']}',
                        ),
                        onTap: () => Navigator.pop(sheetContext, contact),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      );
      if (selected == null || !mounted) return;
      final profile = selected['profile'] is Map
          ? Map<String, dynamic>.from(selected['profile'] as Map)
          : <String, dynamic>{};
      final lines = <String>[
        '👤 Contact',
        'Name: ${profile['fullname']?.toString() ?? '[unknown]'}',
        if ((profile['username']?.toString() ?? '').isNotEmpty)
          'Username: @${profile['username']}',
        if ((profile['phone']?.toString() ?? '').isNotEmpty) 'Phone: ${profile['phone']}',
        if ((profile['email']?.toString() ?? '').isNotEmpty) 'Email: ${profile['email']}',
      ];
      await _sendText(room, lines.join('\n'), 'Contact shared.');
    } on Object catch (failure) {
      if (mounted) _snack(_errorText(failure));
    }
  }

  Future<void> _sendPoll(Map<String, dynamic> room) async {
    final draft = await showDialog<_PollDraft>(
      context: context,
      builder: (_) => const _PollDialog(),
    );
    if (draft == null || !mounted) return;

    final createdAt = DateTime.now().toUtc().toIso8601String();
    final options = <Map<String, dynamic>>[];
    for (var index = 0; index < draft.options.length; index++) {
      options.add({
        'id': 'poll-opt-${DateTime.now().millisecondsSinceEpoch}-${index + 1}',
        'text': draft.options[index],
        'votes': <String>[],
      });
    }
    final correctIds = draft.quiz && draft.correctIndex != null
        ? [options[draft.correctIndex!]['id']]
        : <String>[];
    final payload = {
      'version': 2,
      'mode': draft.quiz ? 'quiz' : 'poll',
      'question': draft.question,
      'options': options,
      'anonymous': draft.anonymous,
      'multiSelect': draft.multiSelect,
      'correctOptionIds': correctIds,
      'closedAt': null,
      'closedBy': null,
      'createdBy': userId,
      'createdAt': createdAt,
    };
    await _sendText(room, '$_pollPrefix${jsonEncode(payload)}', 'Poll sent.');
  }

  Future<void> _sendEvent(Map<String, dynamic> room) async {
    final draft = await showDialog<_EventDraft>(
      context: context,
      builder: (_) => const _EventDialog(),
    );
    if (draft == null || !mounted) return;
    final payload = {
      'version': 1,
      'title': draft.title,
      'date': draft.date,
      'time': draft.time,
      'details': draft.details,
      'link': draft.url.isEmpty
          ? null
          : {'type': draft.linkType, 'url': draft.url},
      'createdAt': DateTime.now().toUtc().toIso8601String(),
    };
    await _sendText(room, '$_eventPrefix${jsonEncode(payload)}', 'Event sent.');
  }

  Future<void> _sendSticker(Map<String, dynamic> room) async {
    const stickers = [
      '😀', '😂', '😍', '😎', '🥳', '🤯', '😴', '🤖',
      '👻', '🐼', '🦊', '🐸', '🐧', '🐯', '🦄', '🌈',
      '🔥', '⚡', '⭐', '🍕', '☕', '🎉', '💯', '❤️',
    ];
    final sticker = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const ListTile(
                title: Text('Sticker', style: TextStyle(fontWeight: FontWeight.w900)),
              ),
              GridView.count(
                shrinkWrap: true,
                crossAxisCount: 6,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                children: stickers
                    .map(
                      (value) => InkWell(
                        borderRadius: BorderRadius.circular(14),
                        onTap: () => Navigator.pop(sheetContext, value),
                        child: Center(
                          child: Text(value, style: const TextStyle(fontSize: 30)),
                        ),
                      ),
                    )
                    .toList(),
              ),
            ],
          ),
        ),
      ),
    );
    if (sticker != null && mounted) {
      await _sendText(room, sticker, 'Sticker sent.');
    }
  }

  void _snack(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }
}

class _PollDraft {
  const _PollDraft({
    required this.question,
    required this.options,
    required this.quiz,
    required this.anonymous,
    required this.multiSelect,
    required this.correctIndex,
  });
  final String question;
  final List<String> options;
  final bool quiz;
  final bool anonymous;
  final bool multiSelect;
  final int? correctIndex;
}

class _PollDialog extends StatefulWidget {
  const _PollDialog();

  @override
  State<_PollDialog> createState() => _PollDialogState();
}

class _PollDialogState extends State<_PollDialog> {
  final question = TextEditingController();
  final options = [TextEditingController(), TextEditingController()];
  bool quiz = false;
  bool anonymous = false;
  bool multiSelect = false;
  int? correctIndex;
  String? error;

  @override
  void dispose() {
    question.dispose();
    for (final controller in options) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Create poll'),
        content: SizedBox(
          width: 480,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: question, decoration: const InputDecoration(labelText: 'Question')),
                const SizedBox(height: 10),
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(value: false, label: Text('Poll')),
                    ButtonSegment(value: true, label: Text('Quiz')),
                  ],
                  selected: {quiz},
                  onSelectionChanged: (value) => setState(() {
                    quiz = value.first;
                    if (!quiz) correctIndex = null;
                  }),
                ),
                const SizedBox(height: 10),
                ...List.generate(options.length, (index) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        if (quiz)
                          Radio<int>(
                            value: index,
                            groupValue: correctIndex,
                            onChanged: (value) => setState(() => correctIndex = value),
                          ),
                        Expanded(
                          child: TextField(
                            controller: options[index],
                            decoration: InputDecoration(labelText: 'Option ${index + 1}'),
                          ),
                        ),
                        if (options.length > 2)
                          IconButton(
                            onPressed: () => setState(() {
                              options.removeAt(index).dispose();
                              if (correctIndex == index) correctIndex = null;
                            }),
                            icon: const Icon(Icons.close_rounded),
                          ),
                      ],
                    ),
                  );
                }),
                if (options.length < 6)
                  TextButton.icon(
                    onPressed: () => setState(() => options.add(TextEditingController())),
                    icon: const Icon(Icons.add_rounded),
                    label: const Text('Add option'),
                  ),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: anonymous,
                  title: const Text('Anonymous'),
                  onChanged: (value) => setState(() => anonymous = value == true),
                ),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: multiSelect,
                  title: const Text('Allow multiple selections'),
                  onChanged: (value) => setState(() => multiSelect = value == true),
                ),
                if (error != null)
                  Text(error!, style: const TextStyle(color: SyncColors.danger)),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: _submit, child: const Text('Send')),
        ],
      );

  void _submit() {
    final q = question.text.trim();
    final values = options.map((item) => item.text.trim()).where((item) => item.isNotEmpty).toList();
    if (q.isEmpty || values.length < 2) {
      setState(() => error = 'Add a question and at least two options.');
      return;
    }
    if (quiz && correctIndex == null) {
      setState(() => error = 'Choose the correct answer for the quiz.');
      return;
    }
    Navigator.pop(
      context,
      _PollDraft(
        question: q,
        options: values,
        quiz: quiz,
        anonymous: anonymous,
        multiSelect: multiSelect,
        correctIndex: correctIndex,
      ),
    );
  }
}

class _EventDraft {
  const _EventDraft({
    required this.title,
    required this.date,
    required this.time,
    required this.details,
    required this.linkType,
    required this.url,
  });
  final String title;
  final String date;
  final String time;
  final String details;
  final String linkType;
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
  DateTime? date;
  TimeOfDay? time;
  String linkType = 'Website';
  String? error;

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
        content: SizedBox(
          width: 480,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: title, decoration: const InputDecoration(labelText: 'Event title')),
                const SizedBox(height: 10),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.calendar_month_outlined),
                  title: Text(date == null ? 'Choose date' : _dateValue(date!)),
                  onTap: _pickDate,
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.schedule_outlined),
                  title: Text(time == null ? 'Optional time' : time!.format(context)),
                  onTap: _pickTime,
                ),
                TextField(
                  controller: details,
                  minLines: 2,
                  maxLines: 4,
                  decoration: const InputDecoration(labelText: 'Details'),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: linkType,
                  decoration: const InputDecoration(labelText: 'Link type'),
                  items: const ['Website', 'Meet', 'Zoom', 'Maps']
                      .map((value) => DropdownMenuItem(value: value, child: Text(value)))
                      .toList(),
                  onChanged: (value) => setState(() => linkType = value ?? 'Website'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: url,
                  keyboardType: TextInputType.url,
                  decoration: const InputDecoration(labelText: 'Optional URL'),
                ),
                if (error != null) ...[
                  const SizedBox(height: 8),
                  Text(error!, style: const TextStyle(color: SyncColors.danger)),
                ],
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: _submit, child: const Text('Send')),
        ],
      );

  Future<void> _pickDate() async {
    final value = await showDatePicker(
      context: context,
      initialDate: date ?? DateTime.now(),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 730)),
    );
    if (value != null) setState(() => date = value);
  }

  Future<void> _pickTime() async {
    final value = await showTimePicker(
      context: context,
      initialTime: time ?? TimeOfDay.now(),
    );
    if (value != null) setState(() => time = value);
  }

  void _submit() {
    final eventTitle = title.text.trim();
    final link = url.text.trim();
    if (eventTitle.isEmpty || date == null) {
      setState(() => error = 'Event title and date are required.');
      return;
    }
    if (link.isNotEmpty && !RegExp(r'^https?://', caseSensitive: false).hasMatch(link)) {
      setState(() => error = 'URL must start with http:// or https://');
      return;
    }
    Navigator.pop(
      context,
      _EventDraft(
        title: eventTitle,
        date: _dateValue(date!),
        time: time == null
            ? ''
            : '${time!.hour.toString().padLeft(2, '0')}:${time!.minute.toString().padLeft(2, '0')}',
        details: details.text.trim(),
        linkType: linkType,
        url: link,
      ),
    );
  }
}

class _AttachmentError extends StatelessWidget {
  const _AttachmentError({required this.message, required this.onRetry});
  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.attach_file_rounded, size: 48, color: SyncColors.sky),
              const SizedBox(height: 12),
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh_rounded), label: const Text('Retry')),
            ],
          ),
        ),
      );
}

String _roomName(Map<String, dynamic> room, String userId) {
  final channel = room['channel'];
  if (channel is Map && (channel['name']?.toString() ?? '').isNotEmpty) {
    return channel['name'].toString();
  }
  final group = room['group'];
  if (group is Map && (group['name']?.toString() ?? '').isNotEmpty) {
    return group['name'].toString();
  }
  final profile = room['profile'];
  if (profile is Map) {
    final value = profile['fullname'] ?? profile['username'];
    if (value != null) return value.toString();
  }
  final owners = room['owners'];
  if (owners is List) {
    for (final owner in owners.whereType<Map>()) {
      if (owner['userId']?.toString() == userId) continue;
      final value = owner['fullname'] ?? owner['username'];
      if (value != null) return value.toString();
    }
  }
  return 'Chat';
}

String _dateValue(DateTime value) =>
    '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
