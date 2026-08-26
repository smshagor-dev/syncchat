import 'package:flutter/material.dart';

import '../core/app_scope.dart';
import '../core/device_integration_service.dart';
import '../theme.dart';

class LiveDeviceContactsScreen extends StatefulWidget {
  const LiveDeviceContactsScreen({super.key});

  @override
  State<LiveDeviceContactsScreen> createState() => _LiveDeviceContactsScreenState();
}

class _LiveDeviceContactsScreenState extends State<LiveDeviceContactsScreen> {
  bool syncing = false;
  List<Map<String, dynamic>> registered = const [];
  List<Map<String, dynamic>> unregistered = const [];
  String? error;

  Future<void> sync() async {
    if (syncing) return;
    setState(() {
      syncing = true;
      error = null;
    });
    try {
      final result = await DeviceIntegrationService.syncAddressBook(context.services.contacts);
      if (!mounted) return;
      setState(() {
        syncing = false;
        registered = mapList(result['registered']);
        unregistered = mapList(result['unregistered']);
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        syncing = false;
        error = failure.toString().replaceFirst('Bad state: ', '').replaceFirst('Exception: ', '');
      });
    }
  }

  List<Map<String, dynamic>> mapList(dynamic value) => value is List
      ? value.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false)
      : const [];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('People on SyncChat'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 32),
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
                  decoration: BoxDecoration(shape: BoxShape.circle, color: SyncColors.sky.withValues(alpha: .13)),
                  child: const Icon(Icons.contacts_rounded, color: SyncColors.sky, size: 30),
                ),
                const SizedBox(height: 14),
                const Text('Find people you already know', textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                const SizedBox(height: 7),
                Text(
                  'SyncChat compares phone numbers from your address book with registered accounts only after you grant Contacts permission.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.muted, fontSize: 13, height: 1.45),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: syncing ? null : sync,
                    icon: syncing
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
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
              decoration: BoxDecoration(color: SyncColors.danger.withValues(alpha: .09), borderRadius: BorderRadius.circular(13)),
              child: Text(error!, style: const TextStyle(color: SyncColors.danger, fontWeight: FontWeight.w700)),
            ),
          ],
          if (registered.isNotEmpty || unregistered.isNotEmpty) ...[
            const SizedBox(height: 24),
            Text('On SyncChat · ${registered.length}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
            const SizedBox(height: 8),
            ...registered.map((item) {
              final profile = item['profile'] is Map ? Map<String, dynamic>.from(item['profile'] as Map) : item;
              final name = profile['fullname']?.toString().trim().isNotEmpty == true
                  ? profile['fullname'].toString()
                  : item['contactName']?.toString().trim().isNotEmpty == true
                      ? item['contactName'].toString()
                      : profile['username']?.toString() ?? 'SyncChat user';
              final username = profile['username']?.toString() ?? '';
              return Card(
                color: context.panel,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: context.border)),
                child: ListTile(
                  leading: CircleAvatar(backgroundColor: SyncColors.sky.withValues(alpha: .14), child: Text(name.characters.first.toUpperCase(), style: const TextStyle(color: SyncColors.sky, fontWeight: FontWeight.w900))),
                  title: Text(name, style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: username.isEmpty ? null : Text('@$username'),
                  trailing: const Icon(Icons.check_circle_rounded, color: SyncColors.sky),
                ),
              );
            }),
            if (unregistered.isNotEmpty) ...[
              const SizedBox(height: 18),
              Text('Not on SyncChat · ${unregistered.length}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
              const SizedBox(height: 6),
              Text('You can invite these contacts from your phone share sheet.', style: TextStyle(color: context.muted, fontSize: 12)),
            ],
          ],
        ],
      ),
    );
  }
}
