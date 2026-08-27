import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/app_scope.dart';
import '../core/device_integration_service.dart';
import '../core/permission_manager.dart';
import '../theme.dart';
import '../widgets.dart';
import 'live_chat_room_screen.dart';

class LiveDeviceContactsScreen extends StatefulWidget {
  const LiveDeviceContactsScreen({super.key});

  @override
  State<LiveDeviceContactsScreen> createState() => _LiveDeviceContactsScreenState();
}

class _LiveDeviceContactsScreenState extends State<LiveDeviceContactsScreen> {
  bool syncing = false;
  String? openingUserId;
  List<Map<String, dynamic>> registered = const [];
  List<Map<String, dynamic>> unregistered = const [];
  String? error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => sync(automatic: true));
  }

  Future<void> sync({bool automatic = false}) async {
    if (syncing || !mounted) return;
    setState(() {
      syncing = true;
      error = null;
    });

    final granted = await AppPermissionManager.ensureContacts(
      context,
      reason:
          'Contacts permission is required to read your phone book and find people you know on SyncChat.',
    );
    if (!mounted) return;
    if (!granted) {
      setState(() {
        syncing = false;
        error = automatic
            ? 'Allow Contacts permission to automatically find people from your phone book.'
            : 'Contacts permission is required to sync your phone book.';
      });
      return;
    }

    try {
      final result = await DeviceIntegrationService.syncAddressBook(
        context.services.contacts,
      );
      if (!mounted) return;
      setState(() {
        syncing = false;
        registered = mapList(result['registered']);
        unregistered = mapList(result['unregistered']);
        error = null;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        syncing = false;
        error = failure
            .toString()
            .replaceFirst('Bad state: ', '')
            .replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> addContact() async {
    final identity = TextEditingController();
    final name = TextEditingController();
    bool saveToPhone = true;
    bool submitting = false;
    String? dialogError;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) {
          final value = identity.text.trim();
          final phoneLike = RegExp(r'^\+?[0-9][0-9\s().-]{5,}$').hasMatch(value);

          Future<void> submit() async {
            final target = identity.text.trim();
            if (target.length < 2 || submitting) return;
            setDialogState(() {
              submitting = true;
              dialogError = null;
            });

            String? backendError;
            bool phoneSaved = false;
            bool phonePermissionDenied = false;
            try {
              await context.services.contacts.add({'identity': target});
            } on Object catch (failure) {
              backendError = failure.toString().replaceFirst('Exception: ', '');
            }

            if (backendError == null && saveToPhone && phoneLike && mounted) {
              final granted = await AppPermissionManager.ensureContacts(
                context,
                reason: 'Contacts permission is required to save this person to your phone book.',
              );
              if (granted) {
                try {
                  await DeviceIntegrationService.createPhoneContact(
                    name: name.text,
                    phone: target,
                  );
                  phoneSaved = true;
                } on Object catch (failure) {
                  backendError = failure
                      .toString()
                      .replaceFirst('Exception: ', '')
                      .replaceFirst('Bad state: ', '');
                }
              } else {
                phonePermissionDenied = true;
              }
            }

            if (!mounted || !dialogContext.mounted) return;
            if (backendError != null) {
              setDialogState(() {
                submitting = false;
                dialogError = backendError;
              });
              return;
            }

            Navigator.of(dialogContext).pop();
            final message = phoneSaved
                ? 'Contact added to SyncChat and phone book.'
                : phonePermissionDenied
                    ? 'SyncChat contact added. Phone-book permission was not granted.'
                    : 'SyncChat contact added.';
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(message)),
            );
            if (phoneSaved) await sync();
          }

          return AlertDialog(
            title: const Text('New contact'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: name,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                      labelText: 'Name for phone book',
                      prefixIcon: Icon(Icons.badge_outlined),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: identity,
                    keyboardType: TextInputType.text,
                    onChanged: (_) => setDialogState(() {}),
                    decoration: const InputDecoration(
                      labelText: 'Username, email, or phone number',
                      prefixIcon: Icon(Icons.person_add_alt_1_rounded),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    value: saveToPhone && phoneLike,
                    onChanged: phoneLike && !submitting
                        ? (value) => setDialogState(() => saveToPhone = value)
                        : null,
                    title: const Text(
                      'Also save to phone book',
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                    ),
                    subtitle: phoneLike
                        ? null
                        : const Text('Enter a phone number to enable this option.'),
                  ),
                  if (dialogError != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      dialogError!,
                      style: const TextStyle(
                        color: SyncColors.danger,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: submitting
                    ? null
                    : () => Navigator.of(dialogContext).pop(),
                child: const Text('Cancel'),
              ),
              FilledButton.icon(
                onPressed: submitting ? null : submit,
                icon: submitting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.person_add_rounded),
                label: Text(submitting ? 'Adding…' : 'Add contact'),
              ),
            ],
          );
        },
      ),
    );

    identity.dispose();
    name.dispose();
  }

  Future<void> _openRegisteredChat(Map<String, dynamic> item) async {
    final profile = item['profile'] is Map
        ? Map<String, dynamic>.from(item['profile'] as Map)
        : <String, dynamic>{};
    final userId = profile['userId']?.toString().trim() ?? '';
    if (userId.isEmpty || openingUserId != null) return;

    setState(() => openingUserId = userId);
    try {
      var roomId = item['roomId']?.toString().trim() ?? '';
      if (item['isSaved'] != true || roomId.isEmpty) {
        final identity = [
          profile['username'],
          profile['email'],
          profile['phone'],
        ]
            .map((value) => value?.toString().trim() ?? '')
            .firstWhere((value) => value.isNotEmpty, orElse: () => '');
        if (identity.isEmpty) {
          throw StateError('This contact does not expose an identity that can be saved.');
        }

        try {
          final saved = await context.services.contacts.add({'identity': identity});
          roomId = saved['roomId']?.toString().trim() ?? '';
        } on Object catch (failure) {
          final message = _failureText(failure);
          if (!RegExp(r'already saved|have saved this contact', caseSensitive: false)
              .hasMatch(message)) {
            rethrow;
          }
          final contacts = await context.services.contacts.list();
          for (final contact in contacts) {
            if (contact['friendId']?.toString() == userId) {
              roomId = contact['roomId']?.toString().trim() ?? '';
              break;
            }
          }
        }
      }

      if (roomId.isEmpty) {
        throw StateError('Chat room is unavailable for this contact.');
      }
      final inbox = await context.services.inbox.findByRoom(roomId);
      if (inbox.isEmpty) {
        throw StateError('Chat room could not be loaded.');
      }

      final name = _registeredName(item, profile);
      if (!mounted) return;
      setState(() {
        registered = [
          for (final row in registered)
            if (_registeredUserId(row) == userId)
              {...row, 'isSaved': true, 'roomId': roomId}
            else
              row,
        ];
      });
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => LiveChatRoomScreen(inbox: inbox, name: name),
        ),
      );
    } on Object catch (failure) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_failureText(failure))),
        );
      }
    } finally {
      if (mounted) setState(() => openingUserId = null);
    }
  }

  Future<void> _invite(Map<String, dynamic> item) async {
    final name = item['name']?.toString().trim();
    final displayName = name?.isNotEmpty == true ? name! : 'friend';
    final inviteText = 'Hi $displayName, join me on SyncChat: https://syncchat.live';
    await Clipboard.setData(ClipboardData(text: inviteText));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Invite message copied. Share it with your contact.')),
    );
  }

  String _registeredUserId(Map<String, dynamic> item) {
    final profile = item['profile'];
    return profile is Map ? profile['userId']?.toString() ?? '' : '';
  }

  String _registeredName(
    Map<String, dynamic> item,
    Map<String, dynamic> profile,
  ) {
    final contactName = item['contactName']?.toString().trim() ?? '';
    if (contactName.isNotEmpty) return contactName;
    final fullname = profile['fullname']?.toString().trim() ?? '';
    if (fullname.isNotEmpty) return fullname;
    final username = profile['username']?.toString().trim() ?? '';
    return username.isEmpty ? 'SyncChat user' : username;
  }

  String _firstPhone(Map<String, dynamic> item) {
    final phones = item['phones'];
    if (phones is! List || phones.isEmpty) return '';
    return phones.first?.toString().trim() ?? '';
  }

  String _failureText(Object failure) => failure
      .toString()
      .replaceFirst('Bad state: ', '')
      .replaceFirst('Exception: ', '');

  List<Map<String, dynamic>> mapList(dynamic value) => value is List
      ? value
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false)
      : const [];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('People on SyncChat'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(
            tooltip: 'New contact',
            onPressed: addContact,
            icon: const Icon(Icons.person_add_alt_1_rounded),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: addContact,
        icon: const Icon(Icons.person_add_alt_1_rounded),
        label: const Text('New contact'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 96),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: context.panel,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: context.border),
            ),
            child: Column(
              children: [
                Container(
                  width: 58,
                  height: 58,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: SyncColors.sky.withValues(alpha: .13),
                  ),
                  child: const Icon(
                    Icons.contacts_rounded,
                    color: SyncColors.sky,
                    size: 30,
                  ),
                ),
                const SizedBox(height: 14),
                const Text(
                  'Find people you already know',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 7),
                Text(
                  'This page automatically reads and syncs phone contacts after you grant Contacts permission. If you denied it earlier, SyncChat asks again when you use this page.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.muted, fontSize: 13, height: 1.45),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: syncing ? null : sync,
                    icon: syncing
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.sync_rounded),
                    label: Text(syncing ? 'Syncing contacts…' : 'Sync contacts'),
                  ),
                ),
              ],
            ),
          ),
          if (error != null) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: SyncColors.danger.withValues(alpha: .09),
                borderRadius: BorderRadius.circular(13),
              ),
              child: Text(
                error!,
                style: const TextStyle(
                  color: SyncColors.danger,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
          if (registered.isNotEmpty || unregistered.isNotEmpty) ...[
            const SizedBox(height: 24),
            Text(
              'On SyncChat · ${registered.length}',
              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15),
            ),
            const SizedBox(height: 8),
            ...registered.map((item) {
              final profile = item['profile'] is Map
                  ? Map<String, dynamic>.from(item['profile'] as Map)
                  : <String, dynamic>{};
              final name = _registeredName(item, profile);
              final username = profile['username']?.toString().trim() ?? '';
              final phone = item['contactPhone']?.toString().trim() ?? '';
              final userId = profile['userId']?.toString() ?? '';
              final opening = openingUserId == userId;
              return Card(
                color: context.panel,
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                  side: BorderSide(color: context.border),
                ),
                child: ListTile(
                  leading: SyncAvatar(
                    name: name,
                    imageUrl: profile['avatar']?.toString(),
                    radius: 23,
                  ),
                  title: Text(
                    name,
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  subtitle: Text(
                    [
                      if (username.isNotEmpty) '@$username',
                      if (phone.isNotEmpty) phone,
                    ].join(' · '),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: FilledButton(
                    onPressed: openingUserId == null
                        ? () => _openRegisteredChat(item)
                        : null,
                    child: opening
                        ? const SizedBox.square(
                            dimension: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Chat now'),
                  ),
                ),
              );
            }),
            if (unregistered.isNotEmpty) ...[
              const SizedBox(height: 18),
              Text(
                'Not on SyncChat · ${unregistered.length}',
                style: const TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 15,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Tap Invite to copy a ready-to-share SyncChat invitation.',
                style: TextStyle(color: context.muted, fontSize: 12),
              ),
              const SizedBox(height: 8),
              ...unregistered.map((item) {
                final name = item['name']?.toString().trim() ?? '';
                final displayName = name.isEmpty ? 'Phone contact' : name;
                final phone = _firstPhone(item);
                return Card(
                  color: context.panel,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                    side: BorderSide(color: context.border),
                  ),
                  child: ListTile(
                    leading: SyncAvatar(name: displayName, radius: 23),
                    title: Text(
                      displayName,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    subtitle: phone.isEmpty ? null : Text(phone),
                    trailing: OutlinedButton.icon(
                      onPressed: () => _invite(item),
                      icon: const Icon(Icons.ios_share_rounded, size: 17),
                      label: const Text('Invite'),
                    ),
                  ),
                );
              }),
            ],
          ],
        ],
      ),
    );
  }
}
