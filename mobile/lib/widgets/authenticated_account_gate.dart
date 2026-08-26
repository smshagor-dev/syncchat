import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../core/realtime_client.dart';
import '../theme.dart';

class AuthenticatedAccountGate extends StatefulWidget {
  const AuthenticatedAccountGate({
    super.key,
    required this.child,
    required this.onLogout,
  });

  final Widget child;
  final Future<void> Function(BuildContext context) onLogout;

  @override
  State<AuthenticatedAccountGate> createState() =>
      _AuthenticatedAccountGateState();
}

class _AuthenticatedAccountGateState extends State<AuthenticatedAccountGate> {
  Future<Map<String, dynamic>>? _accountFuture;
  RealtimeClient? _realtime;
  bool _bound = false;
  bool _sessionInactive = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_accountFuture == null) {
      _accountFuture = context.services.chat.currentUser(refresh: true);
    }
    if (!_bound) {
      _bound = true;
      _realtime = context.services.realtime;
      _realtime?.on('user/inactivate', _onInactive);
    }
  }

  @override
  void dispose() {
    if (_bound) {
      _realtime?.off('user/inactivate', _onInactive);
    }
    super.dispose();
  }

  void _onInactive(dynamic _) {
    if (!mounted) return;
    setState(() => _sessionInactive = true);
  }

  Future<void> _reload() async {
    if (!mounted) return;
    final future = context.services.chat.currentUser(refresh: true);
    setState(() {
      _sessionInactive = false;
      _accountFuture = future;
    });
    await future;
  }

  @override
  Widget build(BuildContext context) {
    if (_sessionInactive) {
      return _SessionInactiveScreen(onLogout: widget.onLogout, onRetry: _reload);
    }

    return FutureBuilder<Map<String, dynamic>>(
      future: _accountFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const _AccountGateLoading();
        }

        if (snapshot.hasError) {
          final error = snapshot.error;
          return _AccountUnavailableScreen(
            message: error is ApiException
                ? error.message
                : 'Unable to load this SyncChat account.',
            onRetry: _reload,
            onLogout: widget.onLogout,
          );
        }

        final account = snapshot.data ?? const <String, dynamic>{};
        final status = account['status']?.toString().trim().toLowerCase() ?? 'active';
        if (status != 'active') {
          return _AccountUnavailableScreen(
            message: status == 'blocked'
                ? 'This SyncChat account is blocked.'
                : status == 'banned'
                    ? 'This SyncChat account is banned.'
                    : status == 'deleted'
                        ? 'This SyncChat account is no longer available.'
                        : 'This SyncChat account is inactive.',
            onRetry: _reload,
            onLogout: widget.onLogout,
          );
        }

        if (account['verified'] != true) {
          return AccountVerificationScreen(
            account: account,
            onVerified: _reload,
            onLogout: widget.onLogout,
          );
        }

        return widget.child;
      },
    );
  }
}

class AccountVerificationScreen extends StatefulWidget {
  const AccountVerificationScreen({
    super.key,
    required this.account,
    required this.onVerified,
    required this.onLogout,
  });

  final Map<String, dynamic> account;
  final Future<void> Function() onVerified;
  final Future<void> Function(BuildContext context) onLogout;

  @override
  State<AccountVerificationScreen> createState() =>
      _AccountVerificationScreenState();
}

class _AccountVerificationScreenState extends State<AccountVerificationScreen> {
  final _code = TextEditingController();
  bool _submitting = false;
  bool _resending = false;
  String? _error;
  String? _notice;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (_submitting) return;
    final code = _code.text.replaceAll(RegExp(r'\D+'), '');
    if (code.length != 6) {
      setState(() => _error = 'Enter the 6-digit verification code.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
      _notice = null;
    });
    try {
      final message = await context.services.auth.verifyAccount(code);
      if (!mounted) return;
      setState(() => _notice = message);
      await widget.onVerified();
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        _error = failure is ApiException
            ? failure.message
            : failure.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _resend() async {
    if (_resending) return;
    setState(() {
      _resending = true;
      _error = null;
      _notice = null;
    });
    try {
      final message = await context.services.auth.resendVerification();
      if (!mounted) return;
      setState(() => _notice = message);
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        _error = failure is ApiException
            ? failure.message
            : failure.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final email = widget.account['email']?.toString().trim() ?? '';
    return Scaffold(
      backgroundColor: context.page,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Image.asset(
                      'assets/syncchat_logo.png',
                      width: 72,
                      height: 72,
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    'Verify your account',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    email.isEmpty
                        ? 'Enter the 6-digit code sent to your email.'
                        : 'Enter the 6-digit code sent to $email.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: context.muted, height: 1.45),
                  ),
                  const SizedBox(height: 28),
                  TextField(
                    controller: _code,
                    autofocus: true,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.done,
                    maxLength: 6,
                    onSubmitted: (_) => _verify(),
                    decoration: const InputDecoration(
                      labelText: 'Verification code',
                      prefixIcon: Icon(Icons.verified_user_outlined),
                      counterText: '',
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: SyncColors.danger,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                  if (_notice != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      _notice!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: SyncColors.sky,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                  const SizedBox(height: 18),
                  FilledButton(
                    onPressed: _submitting ? null : _verify,
                    child: _submitting
                        ? const SizedBox.square(
                            dimension: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Verify account'),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: _resending ? null : _resend,
                    child: Text(
                      _resending ? 'Sending…' : 'Re-send verification code',
                    ),
                  ),
                  TextButton(
                    onPressed: () => widget.onLogout(context),
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
}

class _SessionInactiveScreen extends StatelessWidget {
  const _SessionInactiveScreen({
    required this.onLogout,
    required this.onRetry,
  });

  final Future<void> Function(BuildContext context) onLogout;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return _GateMessageScreen(
      icon: Icons.phonelink_erase_rounded,
      title: 'Session changed',
      body:
          'This SyncChat session was superseded by another active session for the same account.',
      primaryLabel: 'Reconnect here',
      onPrimary: onRetry,
      onLogout: onLogout,
    );
  }
}

class _AccountUnavailableScreen extends StatelessWidget {
  const _AccountUnavailableScreen({
    required this.message,
    required this.onRetry,
    required this.onLogout,
  });

  final String message;
  final Future<void> Function() onRetry;
  final Future<void> Function(BuildContext context) onLogout;

  @override
  Widget build(BuildContext context) {
    return _GateMessageScreen(
      icon: Icons.account_circle_outlined,
      title: 'Account unavailable',
      body: message,
      primaryLabel: 'Try again',
      onPrimary: onRetry,
      onLogout: onLogout,
    );
  }
}

class _GateMessageScreen extends StatelessWidget {
  const _GateMessageScreen({
    required this.icon,
    required this.title,
    required this.body,
    required this.primaryLabel,
    required this.onPrimary,
    required this.onLogout,
  });

  final IconData icon;
  final String title;
  final String body;
  final String primaryLabel;
  final Future<void> Function() onPrimary;
  final Future<void> Function(BuildContext context) onLogout;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 60, color: SyncColors.sky),
                  const SizedBox(height: 18),
                  Text(
                    title,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 25,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    body,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: context.muted, height: 1.5),
                  ),
                  const SizedBox(height: 22),
                  FilledButton.icon(
                    onPressed: onPrimary,
                    icon: const Icon(Icons.refresh_rounded),
                    label: Text(primaryLabel),
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
}

class _AccountGateLoading extends StatelessWidget {
  const _AccountGateLoading();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      body: const Center(child: CircularProgressIndicator()),
    );
  }
}
