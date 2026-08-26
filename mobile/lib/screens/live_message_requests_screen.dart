import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';

class LiveMessageRequestsScreen extends StatefulWidget {
  const LiveMessageRequestsScreen({super.key});

  @override
  State<LiveMessageRequestsScreen> createState() => _LiveMessageRequestsScreenState();
}

class _LiveMessageRequestsScreenState extends State<LiveMessageRequestsScreen> {
  List<Map<String, dynamic>> requests = const [];
  bool loading = true;
  String? error;
  final Set<String> busyIds = <String>{};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => load());
  }

  Future<void> load() async {
    try {
      final response = await context.services.api.get('/chat-v2/message-requests');
      final payload = response.payload;
      if (!mounted) return;
      setState(() {
        requests = payload is List
            ? payload.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList(growable: false)
            : const [];
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
      await context.services.api.post(
        '/chat-v2/message-requests/$id/action',
        body: {'action': action},
      );
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

  String messageFor(Object failure) => failure is ApiException
      ? failure.message
      : failure.toString().replaceFirst('Exception: ', '');

  String timeLabel(dynamic raw) {
    final date = DateTime.tryParse(raw?.toString() ?? '')?.toLocal();
    if (date == null) return '';
    final now = DateTime.now();
    if (now.difference(date).inDays == 0) {
      final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
      final minute = date.minute.toString().padLeft(2, '0');
      return '$hour:$minute ${date.hour >= 12 ? 'PM' : 'AM'}';
    }
    return '${date.day}/${date.month}/${date.year}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Message requests'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
      ),
      body: RefreshIndicator(
        onRefresh: load,
        child: loading
            ? const ListView(children: [SizedBox(height: 280), Center(child: CircularProgressIndicator())])
            : error != null
                ? ListView(
                    padding: const EdgeInsets.all(24),
                    children: [
                      const SizedBox(height: 120),
                      const Icon(Icons.cloud_off_outlined, size: 44, color: SyncColors.sky),
                      const SizedBox(height: 12),
                      Text(error!, textAlign: TextAlign.center),
                      const SizedBox(height: 12),
                      FilledButton.icon(onPressed: load, icon: const Icon(Icons.refresh_rounded), label: const Text('Retry')),
                    ],
                  )
                : requests.isEmpty
                    ? ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        children: [
                          const SizedBox(height: 180),
                          Icon(Icons.mark_chat_read_outlined, size: 52, color: context.muted),
                          const SizedBox(height: 12),
                          const Text('No pending message requests', textAlign: TextAlign.center, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                          const SizedBox(height: 6),
                          Text('Messages from people outside your contacts appear here.', textAlign: TextAlign.center, style: TextStyle(color: context.muted, fontSize: 13)),
                        ],
                      )
                    : ListView.separated(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(14, 12, 14, 28),
                        itemCount: requests.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (_, index) {
                          final item = requests[index];
                          final profile = item['profile'] is Map ? Map<String, dynamic>.from(item['profile'] as Map) : <String, dynamic>{};
                          final name = profile['fullname']?.toString().trim().isNotEmpty == true
                              ? profile['fullname'].toString()
                              : profile['username']?.toString().trim().isNotEmpty == true
                                  ? '@${profile['username']}'
                                  : 'Unknown user';
                          final id = item['_id']?.toString() ?? '';
                          final isBusy = busyIds.contains(id);
                          return Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: context.panel,
                              borderRadius: BorderRadius.circular(18),
                              border: Border.all(color: context.border),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    CircleAvatar(
                                      radius: 23,
                                      backgroundColor: SyncColors.sky.withValues(alpha: .13),
                                      child: Text(name.characters.first.toUpperCase(), style: const TextStyle(color: SyncColors.sky, fontWeight: FontWeight.w900)),
                                    ),
                                    const SizedBox(width: 11),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(name, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
                                          const SizedBox(height: 3),
                                          Text(timeLabel(item['lastMessageAt']), style: TextStyle(color: context.muted, fontSize: 11)),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 11),
                                Text(item['preview']?.toString().trim().isNotEmpty == true ? item['preview'].toString() : 'New message request', maxLines: 3, overflow: TextOverflow.ellipsis, style: TextStyle(color: context.muted, height: 1.4)),
                                const SizedBox(height: 13),
                                Row(
                                  children: [
                                    Expanded(child: FilledButton(onPressed: isBusy ? null : () => act(item, 'accept'), child: const Text('Accept'))),
                                    const SizedBox(width: 8),
                                    Expanded(child: OutlinedButton(onPressed: isBusy ? null : () => act(item, 'decline'), child: const Text('Delete'))),
                                    const SizedBox(width: 8),
                                    IconButton.filledTonal(
                                      tooltip: 'Block',
                                      onPressed: isBusy ? null : () => act(item, 'block'),
                                      icon: const Icon(Icons.block_rounded, color: SyncColors.danger),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          );
                        },
                      ),
      ),
    );
  }
}
