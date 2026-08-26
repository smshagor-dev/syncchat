import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';

import '../core/app_scope.dart';
import '../core/cached_repositories.dart';
import '../core/realtime_client.dart';
import '../theme.dart';

class ConnectionResilienceLayer extends StatefulWidget {
  const ConnectionResilienceLayer({super.key, required this.child});

  final Widget child;

  @override
  State<ConnectionResilienceLayer> createState() =>
      _ConnectionResilienceLayerState();
}

class _ConnectionResilienceLayerState extends State<ConnectionResilienceLayer>
    with WidgetsBindingObserver {
  final Connectivity _connectivity = Connectivity();
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  StreamSubscription<RealtimeConnectionState>? _realtimeSubscription;
  bool _networkAvailable = true;
  bool _recovering = false;
  RealtimeConnectionState _realtimeState =
      RealtimeConnectionState.disconnected;
  int _syncEpoch = 0;

  bool get _contacting =>
      _networkAvailable &&
      _realtimeState != RealtimeConnectionState.connected;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => unawaited(_start()));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _connectivitySubscription?.cancel();
    _realtimeSubscription?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_checkAndRecover());
    }
  }

  Future<void> _start() async {
    if (!mounted) return;
    _realtimeState = context.services.realtime.state;
    _realtimeSubscription = context.services.realtime.states.listen((state) {
      if (!mounted) return;
      final wasConnected = _realtimeState == RealtimeConnectionState.connected;
      setState(() => _realtimeState = state);
      if (!wasConnected && state == RealtimeConnectionState.connected) {
        setState(() => _syncEpoch += 1);
        unawaited(_recoverConnection());
      }
      if (state == RealtimeConnectionState.authenticationFailed) {
        unawaited(_recoverConnection());
      }
    });

    _connectivitySubscription = _connectivity.onConnectivityChanged.listen(
      _onConnectivity,
    );
    await _checkAndRecover();
  }

  void _onConnectivity(List<ConnectivityResult> results) {
    final available = results.any((result) => result != ConnectivityResult.none);
    if (!mounted) return;
    setState(() => _networkAvailable = available);
    if (available) unawaited(_recoverConnection());
  }

  Future<void> _checkAndRecover() async {
    try {
      final results = await _connectivity.checkConnectivity();
      final available = results.any((result) => result != ConnectivityResult.none);
      if (!mounted) return;
      setState(() => _networkAvailable = available);
      if (available) await _recoverConnection();
    } on Object {
      // Socket/API recovery below remains the source of truth if an OEM does
      // not report connectivity state correctly.
      await _recoverConnection();
    }
  }

  Future<void> _recoverConnection() async {
    if (_recovering || !mounted || !_networkAvailable) return;
    _recovering = true;
    try {
      final services = context.services;
      if (services.realtime.state == RealtimeConnectionState.authenticationFailed) {
        await services.api.refreshSession();
      }
      if (!services.realtime.isConnected) {
        await services.realtime.connect().timeout(const Duration(seconds: 8));
      }
      if (services.realtime.isConnected) {
        final chat = services.chat;
        if (chat is CachedChatRepository) {
          await chat.drainOutbox().timeout(const Duration(seconds: 12));
        }
        // Refresh the inbox cache immediately after replaying pending text so
        // unread counts and previews match the server before the shell rebuilds.
        await services.inbox.list().timeout(const Duration(seconds: 8));
        if (mounted) setState(() => _syncEpoch += 1);
      }
    } on Object {
      // Keep showing Contacting. Socket.IO and connectivity callbacks retry on
      // the next network/lifecycle transition without blocking the UI.
    } finally {
      _recovering = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final showBanner = !_networkAvailable || _contacting;
    return Stack(
      children: [
        Positioned.fill(
          child: KeyedSubtree(
            key: ValueKey<int>(_syncEpoch),
            child: widget.child,
          ),
        ),
        if (showBanner)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              bottom: false,
              child: IgnorePointer(
                child: Container(
                  margin: const EdgeInsets.fromLTRB(10, 7, 10, 0),
                  padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
                  decoration: BoxDecoration(
                    color: context.panel.withValues(alpha: .96),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: context.border),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x26000000),
                        blurRadius: 14,
                        offset: Offset(0, 5),
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const SizedBox.square(
                        dimension: 15,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                      const SizedBox(width: 9),
                      Expanded(
                        child: Text(
                          _networkAvailable
                              ? 'Contacting SyncChat…'
                              : 'Waiting for internet…',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
