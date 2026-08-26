import 'dart:async';

import 'package:flutter/material.dart';

import '../core/biometric_service.dart';
import '../theme.dart';

class BiometricGate extends StatefulWidget {
  const BiometricGate({
    super.key,
    required this.child,
    this.onLogout,
  });

  final Widget child;
  final Future<void> Function(BuildContext context)? onLogout;

  @override
  State<BiometricGate> createState() => _BiometricGateState();
}

class _BiometricGateState extends State<BiometricGate>
    with WidgetsBindingObserver {
  bool _checking = true;
  bool _unlocked = false;
  bool _authenticating = false;
  DateTime? _backgroundedAt;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => unawaited(_unlock()));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive ||
        state == AppLifecycleState.detached) {
      _backgroundedAt ??= DateTime.now();
      return;
    }
    if (state != AppLifecycleState.resumed) return;

    final backgroundedAt = _backgroundedAt;
    _backgroundedAt = null;
    if (backgroundedAt == null) return;
    if (DateTime.now().difference(backgroundedAt) < const Duration(seconds: 8)) {
      return;
    }
    BiometricService.expireUnlock();
    if (mounted) {
      setState(() {
        _checking = false;
        _unlocked = false;
      });
      unawaited(_unlock());
    }
  }

  Future<void> _unlock() async {
    if (_authenticating || !mounted) return;
    _authenticating = true;
    final success = await BiometricService.authenticate(
      reason: 'Unlock SyncChat',
    );
    if (!mounted) return;
    setState(() {
      _checking = false;
      _unlocked = success;
      _authenticating = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_checking || !_unlocked) {
      return Scaffold(
        backgroundColor: SyncColors.slate950,
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 82,
                    height: 82,
                    decoration: BoxDecoration(
                      color: SyncColors.sky.withValues(alpha: .15),
                      borderRadius: BorderRadius.circular(26),
                    ),
                    child: const Icon(
                      Icons.fingerprint_rounded,
                      color: SyncColors.sky,
                      size: 46,
                    ),
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'SyncChat locked',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Use your device biometric to continue.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white60, height: 1.4),
                  ),
                  const SizedBox(height: 22),
                  FilledButton.icon(
                    onPressed: _authenticating ? null : _unlock,
                    icon: _authenticating
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.fingerprint_rounded),
                    label: Text(_authenticating ? 'Checking…' : 'Unlock'),
                  ),
                  if (widget.onLogout != null) ...[
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _authenticating
                          ? null
                          : () => widget.onLogout!(context),
                      child: const Text('Sign out'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      );
    }
    return widget.child;
  }
}
