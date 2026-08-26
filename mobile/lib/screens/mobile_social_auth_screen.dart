import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../core/api_client.dart';
import '../core/auth_repository.dart';
import '../theme.dart';
import 'final_auth_screen.dart';

class MobileSocialAuthScreen extends StatefulWidget {
  const MobileSocialAuthScreen({
    super.key,
    required this.authRepository,
    required this.onAuthenticated,
  });

  final AuthRepository authRepository;
  final Future<void> Function(BuildContext context) onAuthenticated;

  @override
  State<MobileSocialAuthScreen> createState() => _MobileSocialAuthScreenState();
}

class _MobileSocialAuthScreenState extends State<MobileSocialAuthScreen> {
  Map<String, dynamic> _config = const {};
  String? _loadingProvider;
  String? _error;

  bool get _googleEnabled =>
      (_config['googleClientId']?.toString().trim() ?? '').isNotEmpty;
  bool get _facebookEnabled =>
      (_config['facebookAppId']?.toString().trim() ?? '').isNotEmpty;

  @override
  void initState() {
    super.initState();
    unawaited(_loadConfig());
  }

  Future<void> _loadConfig() async {
    try {
      final config = await widget.authRepository.socialConfig();
      if (!mounted) return;
      setState(() {
        _config = config;
        _error = null;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        _error = failure is ApiException
            ? failure.message
            : failure.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _google() async {
    if (_loadingProvider != null || !_googleEnabled) return;
    final clientId = _config['googleClientId'].toString().trim();
    setState(() {
      _loadingProvider = 'google';
      _error = null;
    });
    try {
      final signIn = GoogleSignIn(
        scopes: const <String>['email', 'profile'],
        serverClientId: clientId,
      );
      await signIn.signOut().catchError((_) => null);
      final account = await signIn.signIn();
      if (account == null) {
        throw const ApiException(
          statusCode: 400,
          message: 'Google sign-in was cancelled.',
        );
      }
      final authentication = await account.authentication;
      final idToken = authentication.idToken?.trim() ?? '';
      if (idToken.isEmpty) {
        throw const ApiException(
          statusCode: 500,
          message: 'Google did not return a secure ID token.',
        );
      }
      final result = await widget.authRepository.socialAuth(
        provider: 'google',
        payload: {'credential': idToken},
      );
      await _finish(result);
    } on Object catch (failure) {
      _fail(failure);
    } finally {
      if (mounted) setState(() => _loadingProvider = null);
    }
  }

  Future<void> _facebook() async {
    if (_loadingProvider != null || !_facebookEnabled) return;
    final appId = _config['facebookAppId'].toString().trim();
    setState(() {
      _loadingProvider = 'facebook';
      _error = null;
    });
    try {
      final accessToken = await Navigator.of(context).push<String>(
        MaterialPageRoute<String>(
          fullscreenDialog: true,
          builder: (_) => FacebookOAuthScreen(appId: appId),
        ),
      );
      if (accessToken == null || accessToken.trim().isEmpty) {
        if (mounted) setState(() => _loadingProvider = null);
        return;
      }
      final result = await widget.authRepository.socialAuth(
        provider: 'facebook',
        payload: {'accessToken': accessToken.trim()},
      );
      await _finish(result);
    } on Object catch (failure) {
      _fail(failure);
    } finally {
      if (mounted) setState(() => _loadingProvider = null);
    }
  }

  Future<void> _finish(AuthResult result) async {
    if (!mounted) return;
    if (result.requiresTwoFactor) {
      final verified = await _verifySocialTwoFactor(result);
      if (!verified || !mounted) return;
    }
    await widget.onAuthenticated(context);
  }

  Future<bool> _verifySocialTwoFactor(AuthResult challenge) async {
    final controller = TextEditingController();
    var recovery = false;
    String? dialogError;
    var submitting = false;
    final verified = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Two-factor verification'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                challenge.message,
                style: TextStyle(color: context.muted),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: controller,
                autofocus: true,
                keyboardType:
                    recovery ? TextInputType.text : TextInputType.number,
                decoration: InputDecoration(
                  labelText:
                      recovery ? 'Recovery code' : 'Authenticator code',
                  errorText: dialogError,
                ),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: recovery,
                title: const Text('Use recovery code'),
                onChanged: submitting
                    ? null
                    : (value) => setDialogState(() {
                          recovery = value;
                          dialogError = null;
                          controller.clear();
                        }),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: submitting
                  ? null
                  : () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: submitting
                  ? null
                  : () async {
                      final code = controller.text.trim();
                      if (code.isEmpty) {
                        setDialogState(
                          () => dialogError = 'Verification code is required.',
                        );
                        return;
                      }
                      setDialogState(() {
                        submitting = true;
                        dialogError = null;
                      });
                      try {
                        await widget.authRepository.verifyTwoFactor(
                          tempToken: challenge.tempToken ?? '',
                          code: code,
                          recoveryCode: recovery,
                        );
                        if (dialogContext.mounted) {
                          Navigator.pop(dialogContext, true);
                        }
                      } on Object catch (failure) {
                        if (!dialogContext.mounted) return;
                        setDialogState(() {
                          submitting = false;
                          dialogError = failure is ApiException
                              ? failure.message
                              : failure
                                  .toString()
                                  .replaceFirst('Exception: ', '');
                        });
                      }
                    },
              child: submitting
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Verify'),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    return verified == true;
  }

  void _fail(Object failure) {
    if (!mounted) return;
    setState(() {
      _error = failure is ApiException
          ? failure.message
          : failure.toString().replaceFirst('Exception: ', '');
    });
  }

  @override
  Widget build(BuildContext context) {
    final hasProviders = _googleEnabled || _facebookEnabled;
    return Scaffold(
      backgroundColor: context.page,
      body: Column(
        children: [
          Expanded(
            child: AuthScreen(
              authRepository: widget.authRepository,
              onAuthenticated: widget.onAuthenticated,
            ),
          ),
          if (hasProviders || _error != null)
            SafeArea(
              top: false,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 14),
                decoration: BoxDecoration(
                  color: context.panel,
                  border: Border(top: BorderSide(color: context.border)),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (_error != null) ...[
                      Text(
                        _error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: SyncColors.danger,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 8),
                    ],
                    if (hasProviders) ...[
                      Row(
                        children: [
                          Expanded(child: Divider(color: context.border)),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 10),
                            child: Text(
                              'or continue with',
                              style: TextStyle(
                                color: context.muted,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          Expanded(child: Divider(color: context.border)),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          if (_googleEnabled)
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed:
                                    _loadingProvider == null ? _google : null,
                                icon: _loadingProvider == 'google'
                                    ? const SizedBox.square(
                                        dimension: 18,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : const Icon(Icons.g_mobiledata_rounded),
                                label: const Text('Google'),
                              ),
                            ),
                          if (_googleEnabled && _facebookEnabled)
                            const SizedBox(width: 10),
                          if (_facebookEnabled)
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed:
                                    _loadingProvider == null ? _facebook : null,
                                icon: _loadingProvider == 'facebook'
                                    ? const SizedBox.square(
                                        dimension: 18,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : const Icon(Icons.facebook_rounded),
                                label: const Text('Facebook'),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class FacebookOAuthScreen extends StatefulWidget {
  const FacebookOAuthScreen({super.key, required this.appId});

  final String appId;

  @override
  State<FacebookOAuthScreen> createState() => _FacebookOAuthScreenState();
}

class _FacebookOAuthScreenState extends State<FacebookOAuthScreen> {
  static const _redirect = 'https://www.facebook.com/connect/login_success.html';
  late final WebViewController _controller;
  var _loading = true;

  @override
  void initState() {
    super.initState();
    final uri = Uri.https('www.facebook.com', '/v19.0/dialog/oauth', {
      'client_id': widget.appId,
      'redirect_uri': _redirect,
      'response_type': 'token',
      'scope': 'public_profile,email',
      'auth_type': 'rerequest',
    });
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (mounted) setState(() => _loading = true);
          },
          onPageFinished: (_) {
            if (mounted) setState(() => _loading = false);
          },
          onNavigationRequest: (request) {
            final url = request.url;
            if (!url.startsWith(_redirect)) {
              return NavigationDecision.navigate;
            }
            final uri = Uri.parse(url);
            final fragment = uri.fragment.isEmpty
                ? const <String, String>{}
                : Uri.splitQueryString(uri.fragment);
            final accessToken = fragment['access_token']?.trim() ?? '';
            final error = fragment['error_description'] ??
                uri.queryParameters['error_description'] ??
                uri.queryParameters['error'];
            if (accessToken.isNotEmpty) {
              Navigator.of(context).pop(accessToken);
            } else if (error != null && error.trim().isNotEmpty) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(error)),
              );
              Navigator.of(context).pop();
            }
            return NavigationDecision.prevent;
          },
        ),
      )
      ..loadRequest(uri);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Continue with Facebook')),
      body: Stack(
        children: [
          Positioned.fill(child: WebViewWidget(controller: _controller)),
          if (_loading)
            const Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: LinearProgressIndicator(minHeight: 2),
            ),
        ],
      ),
    );
  }
}
