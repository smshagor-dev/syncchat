import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';
import '../widgets.dart';

class LiveChannelInsightsScreen extends StatefulWidget {
  const LiveChannelInsightsScreen({super.key});

  @override
  State<LiveChannelInsightsScreen> createState() => _LiveChannelInsightsScreenState();
}

class _LiveChannelInsightsScreenState extends State<LiveChannelInsightsScreen> {
  List<Map<String, dynamic>> channels = const [];
  Map<String, dynamic>? analytics;
  Map<String, dynamic>? reviews;
  String? selectedChannelId;
  bool loading = true;
  bool loadingInsights = false;
  bool savingReview = false;
  String? error;

  final reviewText = TextEditingController();
  int rating = 5;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadChannels());
  }

  @override
  void dispose() {
    reviewText.dispose();
    super.dispose();
  }

  Future<void> _loadChannels() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final rows = await context.services.channels.list();
      final subscribed = rows.where((item) {
        if (item['subscribed'] == true) return true;
        final participants = item['participantsId'];
        return participants is List && participants.isNotEmpty;
      }).toList(growable: false);
      if (!mounted) return;
      setState(() {
        channels = subscribed;
        selectedChannelId = subscribed.any(
          (item) => item['_id']?.toString() == selectedChannelId,
        )
            ? selectedChannelId
            : (subscribed.isEmpty ? null : subscribed.first['_id']?.toString());
        loading = false;
      });
      if (selectedChannelId != null) await _loadInsights();
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = _message(failure);
      });
    }
  }

  Future<void> _loadInsights() async {
    final channelId = selectedChannelId;
    if (channelId == null || channelId.isEmpty) return;
    setState(() {
      loadingInsights = true;
      error = null;
    });
    try {
      final responses = await Future.wait([
        context.services.api.get('/channels/$channelId/analytics'),
        context.services.api.get('/channels/$channelId/reviews'),
      ]);
      final nextAnalytics = _map(responses[0].payload);
      final nextReviews = _map(responses[1].payload);
      final mine = nextReviews['myReview'];
      if (!mounted) return;
      setState(() {
        analytics = nextAnalytics;
        reviews = nextReviews;
        rating = mine is Map ? ((mine['rating'] as num?)?.toInt() ?? 5) : 5;
        reviewText.text = mine is Map ? mine['review']?.toString() ?? '' : '';
        loadingInsights = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loadingInsights = false;
        error = _message(failure);
      });
    }
  }

  Future<void> _submitReview() async {
    final channelId = selectedChannelId;
    if (channelId == null || channelId.isEmpty || savingReview) return;
    setState(() {
      savingReview = true;
      error = null;
    });
    try {
      await context.services.api.post(
        '/channels/$channelId/reviews',
        body: {
          'rating': rating,
          'review': reviewText.text.trim(),
        },
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Channel review saved.')),
      );
      setState(() => savingReview = false);
      await _loadInsights();
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        savingReview = false;
        error = _message(failure);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Channel analytics & reviews'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: loading || loadingInsights ? null : _loadInsights,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadChannels,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 36),
                children: [
                  if (error != null) _errorCard(error!),
                  if (channels.isEmpty)
                    const _EmptyInsights()
                  else ...[
                    _channelPicker(),
                    const SizedBox(height: 14),
                    if (loadingInsights)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 70),
                        child: Center(child: CircularProgressIndicator()),
                      )
                    else ...[
                      _analyticsSection(),
                      const SizedBox(height: 18),
                      _reviewEditor(),
                      const SizedBox(height: 18),
                      _reviewsSection(),
                    ],
                  ],
                ],
              ),
            ),
    );
  }

  Widget _channelPicker() {
    return Card(
      color: context.panel,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(17),
        side: BorderSide(color: context.border),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
        child: DropdownButtonFormField<String>(
          initialValue: selectedChannelId,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'Channel',
            prefixIcon: Icon(Icons.podcasts_rounded),
            border: InputBorder.none,
          ),
          items: channels.map((channel) {
            final id = channel['_id']?.toString() ?? '';
            final name = channel['name']?.toString().trim();
            return DropdownMenuItem(
              value: id,
              child: Text(
                name?.isNotEmpty == true ? name! : 'Channel',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            );
          }).toList(growable: false),
          onChanged: (value) async {
            if (value == null || value == selectedChannelId) return;
            setState(() => selectedChannelId = value);
            await _loadInsights();
          },
        ),
      ),
    );
  }

  Widget _analyticsSection() {
    final data = analytics ?? const <String, dynamic>{};
    final growth = _map(data['subscriberGrowth']);
    final reach = _map(data['postReach']);
    final reactions = _map(data['reactions']);
    final trend = _map(data['muteLeaveTrend']);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _heading('30-day performance', Icons.insights_rounded),
        const SizedBox(height: 10),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 9,
          crossAxisSpacing: 9,
          childAspectRatio: 1.65,
          children: [
            _metric('Subscribers', _num(growth['currentSubscribers']), Icons.group_outlined),
            _metric('Net growth', _signed(growth['netLast30Days']), Icons.trending_up_rounded),
            _metric('View rate', '${_decimal(reach['viewRate'])}%', Icons.visibility_outlined),
            _metric('Delivery rate', '${_decimal(reach['deliveryRate'])}%', Icons.done_all_rounded),
            _metric('Reactions', _num(reactions['totalReactions']), Icons.favorite_border_rounded),
            _metric('Muted now', _num(trend['currentMutedSubscribers']), Icons.notifications_off_outlined),
          ],
        ),
        const SizedBox(height: 12),
        _dailyTrendCard(growth),
        const SizedBox(height: 10),
        _reactionCard(reactions),
      ],
    );
  }

  Widget _metric(String label, String value, IconData icon) => Container(
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: context.panel,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: SyncColors.sky, size: 20),
            const Spacer(),
            Text(value, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900)),
            Text(label, style: TextStyle(color: context.muted, fontSize: 11, fontWeight: FontWeight.w700)),
          ],
        ),
      );

  Widget _dailyTrendCard(Map<String, dynamic> growth) {
    final daily = _list(growth['daily']);
    final maxValue = daily.fold<int>(1, (max, row) {
      final join = (row['join'] as num?)?.toInt() ?? 0;
      final leave = (row['leave'] as num?)?.toInt() ?? 0;
      return [max, join, leave].reduce((a, b) => a > b ? a : b);
    });
    final recent = daily.length > 14 ? daily.sublist(daily.length - 14) : daily;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.panel,
        borderRadius: BorderRadius.circular(17),
        border: Border.all(color: context.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Subscriber movement', style: TextStyle(fontWeight: FontWeight.w900)),
          const SizedBox(height: 4),
          Text('Last ${recent.length} days · joins vs leaves', style: TextStyle(color: context.muted, fontSize: 11)),
          const SizedBox(height: 14),
          SizedBox(
            height: 92,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: recent.map((row) {
                final join = (row['join'] as num?)?.toInt() ?? 0;
                final leave = (row['leave'] as num?)?.toInt() ?? 0;
                return Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 1.5),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Expanded(
                          child: Align(
                            alignment: Alignment.bottomCenter,
                            child: Container(
                              width: 5,
                              height: 70 * join / maxValue,
                              decoration: BoxDecoration(
                                color: SyncColors.success,
                                borderRadius: BorderRadius.circular(4),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Container(
                          width: 5,
                          height: 70 * leave / maxValue,
                          decoration: BoxDecoration(
                            color: SyncColors.danger,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(growable: false),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              _legend(SyncColors.success, 'Joined ${_num(growth['joinedLast30Days'])}'),
              const SizedBox(width: 16),
              _legend(SyncColors.danger, 'Left ${_num(growth['leftLast30Days'])}'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _reactionCard(Map<String, dynamic> reactions) {
    final top = _list(reactions['topReactions']);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.panel,
        borderRadius: BorderRadius.circular(17),
        border: Border.all(color: context.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Reaction quality', style: TextStyle(fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          Text(
            '${_num(reactions['uniqueReactors'])} unique reactors · ${_decimal(reactions['averagePerPost'])} avg/post',
            style: TextStyle(color: context.muted, fontSize: 12),
          ),
          if (top.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: top.map((item) {
                return Chip(
                  label: Text('${item['emoji'] ?? '•'} ${_num(item['count'])}'),
                  side: BorderSide(color: context.border),
                );
              }).toList(growable: false),
            ),
          ],
        ],
      ),
    );
  }

  Widget _reviewEditor() {
    final mine = reviews?['myReview'];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _heading(mine is Map ? 'Your review' : 'Review this channel', Icons.rate_review_outlined),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: context.panel,
            borderRadius: BorderRadius.circular(17),
            border: Border.all(color: context.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: List.generate(5, (index) {
                  final value = index + 1;
                  return IconButton(
                    tooltip: '$value star${value == 1 ? '' : 's'}',
                    onPressed: savingReview ? null : () => setState(() => rating = value),
                    icon: Icon(
                      value <= rating ? Icons.star_rounded : Icons.star_border_rounded,
                      color: Colors.amber,
                      size: 30,
                    ),
                  );
                }),
              ),
              const SizedBox(height: 6),
              TextField(
                controller: reviewText,
                enabled: !savingReview,
                minLines: 2,
                maxLines: 5,
                maxLength: 500,
                decoration: const InputDecoration(
                  labelText: 'Review (optional)',
                  hintText: 'What is useful about this channel?',
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: savingReview ? null : _submitReview,
                  icon: savingReview
                      ? const SizedBox(width: 17, height: 17, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.check_rounded),
                  label: Text(mine is Map ? 'Update review' : 'Submit review'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _reviewsSection() {
    final data = reviews ?? const <String, dynamic>{};
    final items = _list(data['reviews']);
    final avg = _decimal(data['ratingAvg']);
    final count = _num(data['ratingCount']);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(child: _heading('Subscriber reviews', Icons.forum_outlined)),
            const Icon(Icons.star_rounded, size: 18, color: Colors.amber),
            const SizedBox(width: 3),
            Text('$avg · $count', style: const TextStyle(fontWeight: FontWeight.w900)),
          ],
        ),
        const SizedBox(height: 10),
        if (items.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: context.panel,
              borderRadius: BorderRadius.circular(17),
              border: Border.all(color: context.border),
            ),
            child: Text('No reviews yet.', textAlign: TextAlign.center, style: TextStyle(color: context.muted)),
          )
        else
          ...items.map(_reviewCard),
      ],
    );
  }

  Widget _reviewCard(Map<String, dynamic> item) {
    final profile = _map(item['profile']);
    final name = profile['fullname']?.toString().trim();
    final username = profile['username']?.toString().trim();
    final stars = (item['rating'] as num?)?.toInt() ?? 0;
    final text = item['review']?.toString().trim() ?? '';
    return Card(
      color: context.panel,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 9),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(17),
        side: BorderSide(color: context.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(13),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SyncAvatar(name: name?.isNotEmpty == true ? name! : (username ?? 'Member'), radius: 20),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name?.isNotEmpty == true ? name! : (username?.isNotEmpty == true ? '@$username' : 'Subscriber'),
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: List.generate(5, (index) => Icon(
                      index < stars ? Icons.star_rounded : Icons.star_border_rounded,
                      size: 16,
                      color: Colors.amber,
                    )),
                  ),
                  if (text.isNotEmpty) ...[
                    const SizedBox(height: 7),
                    Text(text, style: const TextStyle(height: 1.35)),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _heading(String text, IconData icon) => Row(
        children: [
          Icon(icon, color: SyncColors.sky, size: 20),
          const SizedBox(width: 7),
          Text(text, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
        ],
      );

  Widget _legend(Color color, String text) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 5),
          Text(text, style: TextStyle(color: context.muted, fontSize: 11, fontWeight: FontWeight.w700)),
        ],
      );

  Widget _errorCard(String message) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: SyncColors.danger.withValues(alpha: .08),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Text(message, style: const TextStyle(color: SyncColors.danger, fontWeight: FontWeight.w700)),
      );

  Map<String, dynamic> _map(dynamic value) =>
      value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

  List<Map<String, dynamic>> _list(dynamic value) => value is List
      ? value.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false)
      : const [];

  String _num(dynamic value) => ((value as num?)?.toInt() ?? 0).toString();
  String _signed(dynamic value) {
    final number = (value as num?)?.toInt() ?? 0;
    return number > 0 ? '+$number' : '$number';
  }

  String _decimal(dynamic value) {
    final number = (value as num?)?.toDouble() ?? 0;
    return number == number.roundToDouble() ? number.toStringAsFixed(0) : number.toStringAsFixed(1);
  }

  String _message(Object error) => error is ApiException
      ? error.message
      : error.toString().replaceFirst('Exception: ', '');
}

class _EmptyInsights extends StatelessWidget {
  const _EmptyInsights();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 100),
      child: Column(
        children: [
          const Icon(Icons.insights_outlined, size: 54, color: SyncColors.sky),
          const SizedBox(height: 14),
          const Text('No subscribed channels', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          Text(
            'Subscribe to a channel first to view analytics and reviews.',
            textAlign: TextAlign.center,
            style: TextStyle(color: context.muted),
          ),
        ],
      ),
    );
  }
}
