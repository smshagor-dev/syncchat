import 'dart:async';

import 'package:flutter/material.dart';

import '../core/app_scope.dart';
import '../core/public_app_config.dart';
import '../core/realtime_client.dart';
import '../theme.dart';
import '../widgets.dart';
import '../widgets/professional_mobile_surface.dart';
import 'live_p0_status_web_parity_screen.dart';

class LiveP0StatusScreen extends StatefulWidget {
  const LiveP0StatusScreen({super.key});

  @override
  State<LiveP0StatusScreen> createState() => _LiveP0StatusScreenState();
}

class _LiveP0StatusScreenState extends State<LiveP0StatusScreen> {
  RealtimeClient? _realtime;
  Timer? _refreshTimer;
  int _revision = 0;
  bool _bound = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_bound) return;
    _bound = true;
    _realtime = context.services.realtime;
    _realtime?.on('status/new', _onStatusEvent);
    _realtime?.on('status/update', _onStatusEvent);
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    if (_bound) {
      _realtime?.off('status/new', _onStatusEvent);
      _realtime?.off('status/update', _onStatusEvent);
    }
    super.dispose();
  }

  void _onStatusEvent(dynamic _) {
    if (!mounted || !context.publicAppConfig.featureEnabled('status')) return;
    _refreshTimer?.cancel();
    _refreshTimer = Timer(const Duration(milliseconds: 180), () {
      if (!mounted) return;
      setState(() => _revision += 1);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!context.publicAppConfig.featureEnabled('status')) {
      return const ProfessionalMobileSurface(
        child: _StatusDisabledScreen(),
      );
    }

    return ProfessionalMobileSurface(
      child: KeyedSubtree(
        key: ValueKey<int>(_revision),
        child: const WebParityStatusScreen(),
      ),
    );
  }
}

class _StatusDisabledScreen extends StatelessWidget {
  const _StatusDisabledScreen();

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'Status',
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: context.softPanel,
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: context.border),
              ),
              child: const Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.donut_large_rounded,
                    color: SyncColors.sky,
                    size: 50,
                  ),
                  SizedBox(height: 14),
                  Text(
                    'Status is disabled',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'This feature is currently turned off by the admin.',
                    textAlign: TextAlign.center,
                    style: TextStyle(height: 1.45),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
