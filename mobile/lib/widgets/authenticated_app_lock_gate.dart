import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
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
  Future<Map<String, dynamic>>? settingsFuture;
  bool unlocked = false;
  bool checking = false;
  String? error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    settingsFuture ??= context.services.settings.get();
  }

  @override
  void dispose() {
    password.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    if (!mounted) return;
    final future = context.services.settings.get();
    setState(() {
      settingsFuture = future;
      error = null;
    });
    await future;
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
    return FutureBuilder<Map<String, dynamic>>(
      future: settingsFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const _AppLockLoading();
        }
        if (snapshot.hasError) {
          final failure = snapshot.error;
          return _AppLockUnavailable(
            message: failure is ApiException
                ? failure.message
                : 'Unable to verify SyncChat security settings.',
            onRetry: _reload,
            onLogout: widget.onLogout,
          );
        }

        final settings = snapshot.data ?? const <String, dynamic>{};
        if (settings['appLockEnabled'] != true || unlocked) {
          return widget.child;
        }
        return _lockScreen();
      },
    );
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

class _AppLockLoading extends StatelessWidget {
  const _AppLockLoading();

  @override
  Widget build(BuildContext context) => const Scaffold(
        backgroundColor: SyncColors.slate950,
        body: Center(child: CircularProgressIndicator()),
      );
}

class _AppLockUnavailable extends StatelessWidget {
  const _AppLockUnavailable({
    required this.message,
    required this.onRetry,
    required this.onLogout,
  });

  final String message;
  final Future<void> Function() onRetry;
  final Future<void> Function(BuildContext context) onLogout;

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: context.page,
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 430),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.security_rounded,
                      size: 58,
                      color: SyncColors.sky,
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'Security check unavailable',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 23,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 9),
                    Text(
                      message,
                      textAlign: TextAlign.center,
                      style: TextStyle(color: context.muted, height: 1.45),
                    ),
                    const SizedBox(height: 20),
                    FilledButton.icon(
                      onPressed: onRetry,
                      icon: const Icon(Icons.refresh_rounded),
                      label: const Text('Try again'),
                    ),
                    TextButton(
                      onPressed: () => onLogout(context),
                      child: const Text('Sign out'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
}
