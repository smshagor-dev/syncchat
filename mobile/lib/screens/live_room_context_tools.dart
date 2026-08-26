import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../core/permission_manager.dart';
import '../theme.dart';
import '../widgets.dart';

const _pollPrefix = '__poll__::';
const _eventPrefix = '__event__::';

Future<void> showLiveRoomContextTools(
  BuildContext context, {
  required Map<String, dynamic> inbox,
  required String roomName,
  String currentUserId = '',
}) async {
  final action = await showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    builder: (sheetContext) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            title: Text(roomName, style: const TextStyle(fontWeight: FontWeight.w900)),
            subtitle: const Text('Share rich content in this conversation'),
          ),
          const Divider(height: 1),
          _choice(sheetContext, 'location', Icons.location_on_outlined, 'Location'),
          _choice(sheetContext, 'contact', Icons.contact_page_outlined, 'Contact'),
          _choice(sheetContext, 'poll', Icons.poll_outlined, 'Poll / Quiz'),
          _choice(sheetContext, 'event', Icons.event_outlined, 'Event'),
          _choice(sheetContext, 'sticker', Icons.emoji_emotions_outlined, 'Sticker'),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
  if (action == null || !context.mounted) return;
  final tools = _RoomTools(
    context: context,
    inbox: inbox,
    currentUserId: currentUserId,
  );
  await switch (action) {
    'location' => tools.location(),
    'contact' => tools.contact(),
    'poll' => tools.poll(),
    'event' => tools.event(),
    'sticker' => tools.sticker(),
    _ => Future<void>.value(),
  };
}

Widget _choice(BuildContext context, String value, IconData icon, String label) => ListTile(
      leading: Icon(icon, color: SyncColors.sky),
      title: Text(label),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: () => Navigator.pop(context, value),
    );

class _RoomTools {
  const _RoomTools({
    required this.context,
    required this.inbox,
    required this.currentUserId,
  });

  final BuildContext context;
  final Map<String, dynamic> inbox;
  final String currentUserId;

  Future<void> _send(String text, String success) async {
    try {
      await context.services.chat.sendText(inbox: inbox, text: text);
      if (!context.mounted) return;
      _toast(success);
    } on Object catch (failure) {
      if (!context.mounted) return;
      _toast(_errorText(failure));
    }
  }

  Future<void> location() async {
    final granted = await AppPermissionManager.ensureLocation(
      context,
      reason: 'Location permission is needed only when you choose to share your current location.',
    );
    if (!granted || !context.mounted) return;
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        _toast('Location services are turned off.');
        return;
      }
      final p = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 15),
        ),
      );
      await _send(
        '📍 Live location\nhttps://maps.google.com/?q=${p.latitude.toStringAsFixed(6)},${p.longitude.toStringAsFixed(6)}',
        'Location shared.',
      );
    } on Object catch (failure) {
      if (context.mounted) _toast(_errorText(failure));
    }
  }

  Future<void> contact() async {
    try {
      final contacts = await context.services.contacts.list();
      if (!context.mounted) return;
      final selected = await showModalBottomSheet<Map<String, dynamic>>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (sheetContext) => SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(sheetContext).height * .68,
            child: Column(
              children: [
                const ListTile(title: Text('Share contact', style: TextStyle(fontWeight: FontWeight.w900))),
                Expanded(
                  child: ListView.separated(
                    itemCount: contacts.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, index) {
                      final item = contacts[index];
                      final p = item['profile'] is Map
                          ? Map<String, dynamic>.from(item['profile'] as Map)
                          : <String, dynamic>{};
                      final name = (p['fullname'] ?? p['username'] ?? 'Contact').toString();
                      return ListTile(
                        leading: SyncAvatar(name: name, radius: 21),
                        title: Text(name),
                        subtitle: (p['username']?.toString() ?? '').isEmpty ? null : Text('@${p['username']}'),
                        onTap: () => Navigator.pop(sheetContext, item),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      );
      if (selected == null || !context.mounted) return;
      final p = selected['profile'] is Map
          ? Map<String, dynamic>.from(selected['profile'] as Map)
          : <String, dynamic>{};
      final lines = <String>[
        '👤 Contact',
        'Name: ${(p['fullname'] ?? p['username'] ?? 'Contact')}',
        if ((p['username']?.toString() ?? '').isNotEmpty) 'Username: @${p['username']}',
        if ((p['phone']?.toString() ?? '').isNotEmpty) 'Phone: ${p['phone']}',
        if ((p['email']?.toString() ?? '').isNotEmpty) 'Email: ${p['email']}',
      ];
      await _send(lines.join('\n'), 'Contact shared.');
    } on Object catch (failure) {
      if (context.mounted) _toast(_errorText(failure));
    }
  }

  Future<void> poll() async {
    final draft = await showDialog<_PollDraft>(context: context, builder: (_) => const _PollDialog());
    if (draft == null || !context.mounted) return;
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
      'correctOptionIds': draft.quiz && draft.correctIndex != null
          ? [options[draft.correctIndex!]['id']]
          : <String>[],
      'closedAt': null,
      'closedBy': null,
      'createdBy': currentUserId,
      'createdAt': DateTime.now().toUtc().toIso8601String(),
    };
    await _send('$_pollPrefix${jsonEncode(payload)}', draft.quiz ? 'Quiz sent.' : 'Poll sent.');
  }

  Future<void> event() async {
    final draft = await showDialog<_EventDraft>(context: context, builder: (_) => const _EventDialog());
    if (draft == null || !context.mounted) return;
    final payload = {
      'version': 1,
      'title': draft.title,
      'date': draft.date,
      'time': draft.time,
      'details': draft.details,
      'link': draft.url.isEmpty ? null : {'type': 'url', 'url': draft.url},
      'createdAt': DateTime.now().toUtc().toIso8601String(),
    };
    await _send('$_eventPrefix${jsonEncode(payload)}', 'Event shared.');
  }

  Future<void> sticker() async {
    const values = ['😀', '😂', '😍', '😎', '🥳', '🤯', '🤖', '👻', '🐼', '🦊', '🔥', '⚡', '⭐', '🎉', '💯', '❤️'];
    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 2, 18, 24),
          child: Wrap(
            spacing: 10,
            runSpacing: 10,
            children: values.map((emoji) => InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: () => Navigator.pop(sheetContext, emoji),
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Text(emoji, style: const TextStyle(fontSize: 32)),
              ),
            )).toList(),
          ),
        ),
      ),
    );
    if (selected != null && context.mounted) await _send(selected, 'Sticker sent.');
  }

  void _toast(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
}

class _PollDraft {
  const _PollDraft({
    required this.question,
    required this.options,
    required this.anonymous,
    required this.multi,
    required this.quiz,
    required this.correctIndex,
  });
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
  int? correct = 0;
  String? error;

  @override
  void dispose() {
    question.dispose();
    for (final item in options) item.dispose();
    super.dispose();
  }

  void _submit() {
    final q = question.text.trim();
    final rows = options.map((e) => e.text.trim()).where((e) => e.isNotEmpty).toList();
    if (q.isEmpty || rows.length < 2) {
      setState(() => error = 'Question and at least two options are required.');
      return;
    }
    final safeCorrect = quiz && correct != null && correct! < rows.length ? correct : null;
    Navigator.pop(context, _PollDraft(
      question: q,
      options: rows,
      anonymous: anonymous,
      multi: multi,
      quiz: quiz,
      correctIndex: safeCorrect,
    ));
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Poll / Quiz'),
    content: SingleChildScrollView(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(controller: question, decoration: const InputDecoration(labelText: 'Question')),
        const SizedBox(height: 10),
        for (var i = 0; i < options.length; i++) ...[
          TextField(controller: options[i], decoration: InputDecoration(labelText: 'Option ${i + 1}')),
          const SizedBox(height: 8),
        ],
        SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, title: const Text('Quiz'), value: quiz, onChanged: (v) => setState(() => quiz = v)),
        if (quiz)
          DropdownButtonFormField<int>(
            initialValue: correct,
            decoration: const InputDecoration(labelText: 'Correct option'),
            items: List.generate(options.length, (i) => DropdownMenuItem(value: i, child: Text('Option ${i + 1}'))),
            onChanged: (v) => setState(() => correct = v),
          ),
        SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, title: const Text('Anonymous votes'), value: anonymous, onChanged: (v) => setState(() => anonymous = v)),
        SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, title: const Text('Multiple choice'), value: multi, onChanged: (v) => setState(() => multi = v)),
        if (error != null) Text(error!, style: const TextStyle(color: SyncColors.danger)),
      ]),
    ),
    actions: [
      TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
      FilledButton(onPressed: _submit, child: const Text('Send')),
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
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(controller: title, decoration: const InputDecoration(labelText: 'Event title')),
        const SizedBox(height: 10),
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
        const SizedBox(height: 10),
        TextField(controller: url, decoration: const InputDecoration(labelText: 'Link (optional)')),
      ]),
    ),
    actions: [
      TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
      FilledButton(
        onPressed: () {
          final value = title.text.trim();
          if (value.isEmpty) return;
          Navigator.pop(context, _EventDraft(
            title: value,
            date: '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}',
            time: '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}',
            details: details.text.trim(),
            url: url.text.trim(),
          ));
        },
        child: const Text('Send'),
      ),
    ],
  );
}

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
