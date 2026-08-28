import 'dart:async';

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../core/cached_settings_repository.dart';
import '../theme.dart';

class AuthenticatedAppLockGate extends StatefulWidget {
  const AuthenticatedAppLockGate({
    super.key,
    required this.child,
    required this.onLogout,
  });

  final Widget child;
  final Future<void> Function(BuildContext context) onLogout;

  @override
  State<AuthenticatedAppLockGate> createState() =>
      _AuthenticatedAppLockGateState();
}

class _AuthenticatedAppLockGateState extends State<AuthenticatedAppLockGate> {
  final password = TextEditingController();

  Map<String, dynamic> settings = const {};
  bool cacheReady = false;
  bool started = false;
  bool unlocked = false;
  bool checking = false;
  String? error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (started) return;
    started = true;
    unawaited(_bootstrap());
  }

  @override
  void dispose() {
    password.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    Map<String, dynamic> cached = const {};
    final repository = context.services.settings;
    if (repository is CachedSettingsRepository) {
      cached = await repository.readCached();
    }
    if (!mounted) return;
    setState(() {
      settings = cached;
      cacheReady = true;
    });

    // Server settings are authoritative, but must never block the first useful
    // frame. A successful refresh also updates the encrypted secure cache.
    unawaited(_refreshServer());
  }

  Future<void> _refreshServer() async {
    try {
      final fresh = await context.services.settings.get().timeout(
        const Duration(seconds: 8),
      );
      if (!mounted) return;
      setState(() {
        settings = fresh;
        error = null;
        if (fresh['appLockEnabled'] == true) unlocked = false;
      });
    } on Object catch (failure) {
      // Keep the cached decision. Network health is not a launch dependency.
      debugPrint('SyncChat app-lock refresh deferred: $failure');
    }
  }

  Future<void> _unlock() async {
    if (checking) return;
    final value = password.text;
    if (value.length < 4) {
      setState(() => error = 'Enter your app lock password.');
      return;
    }
    setState(() {
      checking = true;
      error = null;
    });
    try {
      await context.services.api.post(
        '/settings/app-lock/verify',
        body: {'password': value},
      );
      if (!mounted) return;
      password.clear();
      setState(() {
        checking = false;
        unlocked = true;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        checking = false;
        error = failure is ApiException
            ? failure.message
            : failure.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    // This wait is local secure-storage I/O only. No API call sits in front of
    // the chat list anymore.
    if (!cacheReady) return const _AppLockCacheLoading();

    if (settings['appLockEnabled'] != true || unlocked) {
      return widget.child;
    }
    return _lockScreen();
  }

  Widget _lockScreen() {
    return Scaffold(
      backgroundColor: SyncColors.slate950,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Container(
                padding: const EdgeInsets.all(22),
                decoration: BoxDecoration(
                  color: SyncColors.slate900,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: SyncColors.slate700),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Icon(
                      Icons.lock_outline_rounded,
                      color: SyncColors.sky,
                      size: 44,
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'App Lock',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 7),
                    const Text(
                      'Enter your app lock password to continue.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: SyncColors.slate300),
                    ),
                    const SizedBox(height: 20),
                    TextField(
                      controller: password,
                      autofocus: true,
                      obscureText: true,
                      enabled: !checking,
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _unlock(),
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'App lock password',
                        prefixIcon: Icon(Icons.password_rounded),
                      ),
                    ),
                    if (error != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: SyncColors.danger,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: checking ? null : _unlock,
                      child: checking
                          ? const SizedBox.square(
                              dimension: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Unlock app'),
                    ),
                    TextButton(
                      onPressed:
                          checking ? null : () => widget.onLogout(context),
                      child: const Text('Sign out'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AppLockCacheLoading extends StatelessWidget {
  const _AppLockCacheLoading();

  @override
  Widget build(BuildContext context) => const Scaffold(
        backgroundColor: SyncColors.slate950,
        body: SizedBox.expand(),
      );
}
