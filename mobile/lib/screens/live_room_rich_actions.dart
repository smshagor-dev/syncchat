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

Future<void> showLiveRoomRichAttachmentSheet(
  BuildContext context, {
  required Map<String, dynamic> inbox,
  required String currentUserId,
}) async {
  Future<void> sendText(String text, String success) async {
    try {
      await context.services.chat.sendText(inbox: inbox, text: text);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(success)));
    } on Object catch (failure) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_errorText(failure))),
      );
    }
  }

  Future<void> sendLocation() async {
    final allowed = await AppPermissionManager.ensureLocation(
      context,
      reason: 'Location permission is needed only when you choose to share your current location.',
    );
    if (!allowed || !context.mounted) return;
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Location services are turned off.')),
          );
        }
        return;
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 15),
        ),
      );
      final lat = position.latitude.toStringAsFixed(6);
      final lng = position.longitude.toStringAsFixed(6);
      await sendText('📍 Live location\nhttps://maps.google.com/?q=$lat,$lng', 'Location shared.');
    } on Object catch (failure) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_errorText(failure))),
        );
      }
    }
  }

  Future<void> sendContact() async {
    try {
      final contacts = await context.services.contacts.list();
      if (!context.mounted) return;
      final selected = await showModalBottomSheet<Map<String, dynamic>>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (sheetContext) => SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(sheetContext).height * .68,
            child: Column(
              children: [
                const ListTile(
                  title: Text('Share contact', style: TextStyle(fontWeight: FontWeight.w900)),
                ),
                Expanded(
                  child: contacts.isEmpty
                      ? const Center(child: Text('No saved contacts.'))
                      : ListView.separated(
                          itemCount: contacts.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (_, index) {
                            final contact = contacts[index];
                            final profile = _map(contact['profile']);
                            final name = profile['fullname']?.toString() ??
                                profile['username']?.toString() ??
                                'Contact';
                            return ListTile(
                              leading: SyncAvatar(name: name, radius: 21),
                              title: Text(name),
                              subtitle: (profile['username']?.toString() ?? '').isEmpty
                                  ? null
                                  : Text('@${profile['username']}'),
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
      if (selected == null || !context.mounted) return;
      final profile = _map(selected['profile']);
      final lines = <String>[
        '👤 SyncChat contact',
        'Name: ${profile['fullname']?.toString() ?? profile['username']?.toString() ?? 'Contact'}',
        if ((profile['username']?.toString() ?? '').isNotEmpty) 'Username: @${profile['username']}',
        if ((profile['phone']?.toString() ?? '').isNotEmpty) 'Phone: ${profile['phone']}',
        if ((profile['email']?.toString() ?? '').isNotEmpty) 'Email: ${profile['email']}',
      ];
      await sendText(lines.join('\n'), 'Contact shared.');
    } on Object catch (failure) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_errorText(failure))));
      }
    }
  }

  Future<void> sendPoll() async {
    final question = TextEditingController();
    final option1 = TextEditingController();
    final option2 = TextEditingController();
    final option3 = TextEditingController();
    bool anonymous = false;
    bool multiSelect = false;
    bool quiz = false;
    int correct = 0;
    final formKey = GlobalKey<FormState>();
    final draft = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (_, setDialogState) => AlertDialog(
          title: const Text('Create poll / quiz'),
          content: Form(
            key: formKey,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextFormField(
                    controller: question,
                    maxLength: 180,
                    decoration: const InputDecoration(labelText: 'Question'),
                    validator: (value) => (value ?? '').trim().length < 3 ? 'Enter a question.' : null,
                  ),
                  TextFormField(controller: option1, maxLength: 100, decoration: const InputDecoration(labelText: 'Option 1'), validator: (value) => (value ?? '').trim().isEmpty ? 'Required' : null),
                  TextFormField(controller: option2, maxLength: 100, decoration: const InputDecoration(labelText: 'Option 2'), validator: (value) => (value ?? '').trim().isEmpty ? 'Required' : null),
                  TextFormField(controller: option3, maxLength: 100, decoration: const InputDecoration(labelText: 'Option 3 (optional)')),
                  SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, title: const Text('Quiz mode'), value: quiz, onChanged: (value) => setDialogState(() => quiz = value)),
                  if (quiz)
                    DropdownButtonFormField<int>(
                      value: correct,
                      decoration: const InputDecoration(labelText: 'Correct answer'),
                      items: const [
                        DropdownMenuItem(value: 0, child: Text('Option 1')),
                        DropdownMenuItem(value: 1, child: Text('Option 2')),
                        DropdownMenuItem(value: 2, child: Text('Option 3')),
                      ],
                      onChanged: (value) => setDialogState(() => correct = value ?? 0),
                    ),
                  SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, title: const Text('Anonymous votes'), value: anonymous, onChanged: (value) => setDialogState(() => anonymous = value)),
                  if (!quiz)
                    SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, title: const Text('Allow multiple answers'), value: multiSelect, onChanged: (value) => setDialogState(() => multiSelect = value)),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                if (formKey.currentState?.validate() != true) return;
                final options = [option1.text.trim(), option2.text.trim(), option3.text.trim()].where((item) => item.isNotEmpty).toList(growable: false);
                if (quiz && correct >= options.length) return;
                Navigator.pop(dialogContext, {
                  'question': question.text.trim(),
                  'options': options,
                  'anonymous': anonymous,
                  'multiSelect': multiSelect,
                  'quiz': quiz,
                  'correct': correct,
                });
              },
              child: const Text('Send'),
            ),
          ],
        ),
      ),
    );
    question.dispose();
    option1.dispose();
    option2.dispose();
    option3.dispose();
    if (draft == null || !context.mounted) return;

    final now = DateTime.now().millisecondsSinceEpoch;
    final options = <Map<String, dynamic>>[];
    final labels = (draft['options'] as List).map((item) => item.toString()).toList(growable: false);
    for (var i = 0; i < labels.length; i++) {
      options.add({'id': 'poll-opt-$now-${i + 1}', 'text': labels[i], 'votes': <String>[]});
    }
    final quiz = draft['quiz'] == true;
    final correctIndex = (draft['correct'] as num?)?.toInt() ?? 0;
    final payload = {
      'version': 2,
      'mode': quiz ? 'quiz' : 'poll',
      'question': draft['question'],
      'options': options,
      'anonymous': draft['anonymous'] == true,
      'multiSelect': quiz ? false : draft['multiSelect'] == true,
      'correctOptionIds': quiz && correctIndex < options.length ? [options[correctIndex]['id']] : <String>[],
      'closedAt': null,
      'closedBy': null,
      'createdBy': currentUserId,
      'createdAt': DateTime.now().toUtc().toIso8601String(),
    };
    await sendText('$_pollPrefix${jsonEncode(payload)}', 'Poll sent.');
  }

  Future<void> sendEvent() async {
    final title = TextEditingController();
    final details = TextEditingController();
    final link = TextEditingController();
    DateTime date = DateTime.now().add(const Duration(days: 1));
    TimeOfDay time = const TimeOfDay(hour: 18, minute: 0);
    final formKey = GlobalKey<FormState>();
    final draft = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (_, setDialogState) => AlertDialog(
          title: const Text('Create event'),
          content: Form(
            key: formKey,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextFormField(controller: title, maxLength: 120, decoration: const InputDecoration(labelText: 'Event title'), validator: (value) => (value ?? '').trim().length < 2 ? 'Enter an event title.' : null),
                  TextFormField(controller: details, maxLength: 500, minLines: 2, maxLines: 4, decoration: const InputDecoration(labelText: 'Details (optional)')),
                  TextFormField(controller: link, decoration: const InputDecoration(labelText: 'Meeting / website link (optional)')),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () async {
                            final picked = await showDatePicker(context: dialogContext, initialDate: date, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 730)));
                            if (picked != null) setDialogState(() => date = picked);
                          },
                          icon: const Icon(Icons.calendar_month_outlined),
                          label: Text('${date.day}/${date.month}/${date.year}'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () async {
                            final picked = await showTimePicker(context: dialogContext, initialTime: time);
                            if (picked != null) setDialogState(() => time = picked);
                          },
                          icon: const Icon(Icons.schedule_outlined),
                          label: Text(time.format(dialogContext)),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                if (formKey.currentState?.validate() != true) return;
                Navigator.pop(dialogContext, {
                  'title': title.text.trim(),
                  'details': details.text.trim(),
                  'link': link.text.trim(),
                  'date': '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}',
                  'time': '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}',
                });
              },
              child: const Text('Send'),
            ),
          ],
        ),
      ),
    );
    title.dispose();
    details.dispose();
    link.dispose();
    if (draft == null || !context.mounted) return;
    final url = draft['link']?.toString() ?? '';
    final payload = {
      'version': 1,
      'title': draft['title'],
      'date': draft['date'],
      'time': draft['time'],
      'details': draft['details'],
      'link': url.isEmpty ? null : {'type': 'url', 'url': url},
      'createdAt': DateTime.now().toUtc().toIso8601String(),
    };
    await sendText('$_eventPrefix${jsonEncode(payload)}', 'Event sent.');
  }

  Future<void> sendSticker() async {
    const stickers = ['😀', '😂', '😍', '😎', '🥳', '🤯', '😴', '🤖', '👻', '🐼', '🦊', '🐸', '🐧', '🐯', '🦄', '🌈', '🔥', '⚡', '⭐', '🍕', '☕', '🎉', '💯', '❤️'];
    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Sticker', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: stickers.map((emoji) => InkWell(
                  onTap: () => Navigator.pop(sheetContext, emoji),
                  borderRadius: BorderRadius.circular(14),
                  child: Container(
                    width: 48,
                    height: 48,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: context.softPanel, borderRadius: BorderRadius.circular(14), border: Border.all(color: context.border)),
                    child: Text(emoji, style: const TextStyle(fontSize: 28)),
                  ),
                )).toList(growable: false),
              ),
            ],
          ),
        ),
      ),
    );
    if (selected != null && context.mounted) await sendText(selected, 'Sticker sent.');
  }

  await showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (sheetContext) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 0, 10, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(
              title: Text('More attachments', style: TextStyle(fontWeight: FontWeight.w900)),
              subtitle: Text('Share live room content'),
            ),
            _action(sheetContext, Icons.location_on_outlined, 'Location', sendLocation),
            _action(sheetContext, Icons.contact_page_outlined, 'Contact', sendContact),
            _action(sheetContext, Icons.poll_outlined, 'Poll / Quiz', sendPoll),
            _action(sheetContext, Icons.event_outlined, 'Event', sendEvent),
            _action(sheetContext, Icons.emoji_emotions_outlined, 'Sticker', sendSticker),
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

Map<String, dynamic> _map(dynamic value) => value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
