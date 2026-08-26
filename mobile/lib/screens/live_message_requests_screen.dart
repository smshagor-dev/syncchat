import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';

class LiveMessageRequestsScreen extends StatefulWidget {
  const LiveMessageRequestsScreen({super.key, this.embedded = false});

  final bool embedded;

  @override
  State<LiveMessageRequestsScreen> createState() => _LiveMessageRequestsScreenState();
}

class _LiveMessageRequestsScreenState extends State<LiveMessageRequestsScreen> {
  List<Map<String, dynamic>> requests = const [];
  final Set<String> busyIds = <String>{};
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => load());
  }

  Future<void> load() async {
    try {
      final response = await context.services.api.get('/chat-v2/message-requests');
      if (!mounted) return;
      setState(() {
        requests = mapList(response.payload);
        loading = false;
        error = null;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = messageFor(failure);
      });
    }
  }

  Future<void> act(Map<String, dynamic> request, String action) async {
    final id = request['_id']?.toString() ?? '';
    if (id.isEmpty || busyIds.contains(id)) return;
    setState(() => busyIds.add(id));
    try {
      await context.services.api.post('/chat-v2/message-requests/$id/action', body: {'action': action});
      if (!mounted) return;
      setState(() {
        busyIds.remove(id);
        requests = requests.where((item) => item['_id']?.toString() != id).toList(growable: false);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(action == 'accept' ? 'Message request accepted.' : action == 'block' ? 'User blocked.' : 'Message request deleted.')),
      );
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busyIds.remove(id));
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(messageFor(failure))));
    }
  }

  List<Map<String, dynamic>> mapList(dynamic value) => value is List
      ? value.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false)
      : const [];

  String messageFor(Object failure) => failure is ApiException
      ? failure.message
      : failure.toString().replaceFirst('Exception: ', '');

  String timeLabel(dynamic raw) {
    final date = DateTime.tryParse(raw?.toString() ?? '')?.toLocal();
    if (date == null) return '';
    final now = DateTime.now();
    if (now.difference(date).inDays == 0) {
      final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
      return '$hour:${date.minute.toString().padLeft(2, '0')} ${date.hour >= 12 ? 'PM' : 'AM'}';
    }
    return '${date.day}/${date.month}/${date.year}';
  }

  @override
  Widget build(BuildContext context) {
    final content = RefreshIndicator(onRefresh: load, child: body());
    if (widget.embedded) return content;
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(title: const Text('Message requests'), backgroundColor: context.panel, surfaceTintColor: Colors.transparent),
      body: content,
    );
  }

  Widget body() {
    if (loading) {
      return const ListView(children: [SizedBox(height: 240), Center(child: CircularProgressIndicator())]);
    }
    if (error != null) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 90),
          const Icon(Icons.cloud_off_outlined, size: 44, color: SyncColors.sky),
          const SizedBox(height: 12),
          Text(error!, textAlign: TextAlign.center),
          const SizedBox(height: 12),
          FilledButton.icon(onPressed: load, icon: const Icon(Icons.refresh_rounded), label: const Text('Retry')),
        ],
      );
    }
    if (requests.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20),
        children: [
          const SizedBox(height: 130),
          Icon(Icons.mark_chat_read_outlined, size: 52, color: context.muted),
          const SizedBox(height: 12),
          const Text('No pending message requests', textAlign: TextAlign.center, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text('Messages from people outside your contacts appear here.', textAlign: TextAlign.center, style: TextStyle(color: context.muted, fontSize: 13)),
        ],
      );
    }
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 28),
      itemCount: requests.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, index) => requestCard(requests[index]),
    );
  }

  Widget requestCard(Map<String, dynamic> item) {
    final profile = item['profile'] is Map ? Map<String, dynamic>.from(item['profile'] as Map) : <String, dynamic>{};
    final fullname = profile['fullname']?.toString().trim() ?? '';
    final username = profile['username']?.toString().trim() ?? '';
    final name = fullname.isNotEmpty ? fullname : username.isNotEmpty ? '@$username' : 'Unknown user';
    final id = item['_id']?.toString() ?? '';
    final busy = busyIds.contains(id);
    final initial = name.isEmpty ? '?' : name.characters.first.toUpperCase();
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: context.panel, borderRadius: BorderRadius.circular(18), border: Border.all(color: context.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(radius: 23, backgroundColor: SyncColors.sky.withValues(alpha: .13), child: Text(initial, style: const TextStyle(color: SyncColors.sky, fontWeight: FontWeight.w900))),
              const SizedBox(width: 11),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(name, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15)), const SizedBox(height: 3), Text(timeLabel(item['lastMessageAt']), style: TextStyle(color: context.muted, fontSize: 11))])),
            ],
          ),
          const SizedBox(height: 11),
          Text(item['preview']?.toString().trim().isNotEmpty == true ? item['preview'].toString() : 'New message request', maxLines: 3, overflow: TextOverflow.ellipsis, style: TextStyle(color: context.muted, height: 1.4)),
          const SizedBox(height: 13),
          Row(
            children: [
              Expanded(child: FilledButton(onPressed: busy ? null : () => act(item, 'accept'), child: const Text('Accept'))),
              const SizedBox(width: 8),
              Expanded(child: OutlinedButton(onPressed: busy ? null : () => act(item, 'decline'), child: const Text('Delete'))),
              const SizedBox(width: 8),
              IconButton.filledTonal(tooltip: 'Block', onPressed: busy ? null : () => act(item, 'block'), icon: const Icon(Icons.block_rounded, color: SyncColors.danger)),
            ],
          ),
        ],
      ),
    );
  }
}
