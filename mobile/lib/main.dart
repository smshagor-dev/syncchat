import 'dart:async';

import 'package:flutter/material.dart';

import 'core/api_client.dart';
import 'core/app_scope.dart';
import 'core/app_services.dart';
import 'core/device_integration_service.dart';
import 'core/native_call_push.dart';
import 'screens.dart';
import 'screens/global_call_layer.dart';
import 'screens/live_mobile_shell.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // Always render Flutter's first frame before touching optional native
  // integrations. A slow OEM Firebase/CallKit/notification plugin must never
  // be able to keep Android's system splash screen on-screen indefinitely.
  runApp(const SyncChatMobileApp());
  unawaited(_bootstrapNativeServices());
}

Future<void> _bootstrapNativeServices() async {
  try {
    await NativeCallPushService.bootstrapBeforeRunApp().timeout(
      const Duration(seconds: 8),
    );
  } on Object catch (error, stackTrace) {
    debugPrint('SyncChat native push bootstrap skipped: $error');
    debugPrintStack(stackTrace: stackTrace);
  }

  try {
    await DeviceIntegrationService.initialize().timeout(
      const Duration(seconds: 8),
    );
  } on Object catch (error, stackTrace) {
    debugPrint('SyncChat notification bootstrap skipped: $error');
    debugPrintStack(stackTrace: stackTrace);
  }
}

class SyncChatMobileApp extends StatefulWidget {
  const SyncChatMobileApp({super.key, this.services});

  final AppServices? services;

  @override
  State<SyncChatMobileApp> createState() => _SyncChatMobileAppState();
}

class _SyncChatMobileAppState extends State<SyncChatMobileApp> {
  ThemeMode _themeMode = ThemeMode.system;
  late final AppServices _services;
  late final Future<bool> _sessionFuture;

  @override
  void initState() {
    super.initState();
    _services = widget.services ?? AppServices.create();
    _sessionFuture = _restoreSession();
  }

  @override
  void dispose() {
    DeviceIntegrationService.dispose();
    _services.dispose();
    super.dispose();
  }

  void _setDarkMode(bool enabled) {
    setState(() {
      _themeMode = enabled ? ThemeMode.dark : ThemeMode.light;
    });
  }

  Widget _authenticatedHome() {
    return GlobalCallLayer(
      child: LiveMobileShell(
        onThemeChanged: _setDarkMode,
        onLogout: _logout,
      ),
    );
  }

  Widget _authScreen() {
    return AuthScreen(
      authRepository: _services.auth,
      onAuthenticated: (context) async {
        // Authentication success must not wait on sockets, FCM token
        // registration, OEM permission APIs, or notification channels.
        unawaited(_startAuthenticatedIntegrations());
        if (!context.mounted) return;
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute<void>(builder: (_) => _authenticatedHome()),
          (_) => false,
        );
      },
    );
  }

  Future<void> _startAuthenticatedIntegrations() async {
    try {
      await _services.realtime.connect().timeout(const Duration(seconds: 5));
    } on Object catch (error) {
      debugPrint('SyncChat realtime startup deferred: $error');
    }

    try {
      await _services.nativeCallPush
          .startAuthenticated()
          .timeout(const Duration(seconds: 8));
    } on Object catch (error) {
      debugPrint('SyncChat native push startup deferred: $error');
    }

    try {
      await DeviceIntegrationService.startForegroundMessaging().timeout(
        const Duration(seconds: 5),
      );
    } on Object catch (error) {
      debugPrint('SyncChat foreground messaging startup deferred: $error');
    }
  }

  Future<void> _logout(BuildContext context) async {
    try {
      await _services.nativeCallPush
          .unregisterCurrentDevice()
          .timeout(const Duration(seconds: 5));
    } on Object {
      // Local logout must still succeed when the network/native layer is down.
    }
    _services.realtime.disconnect();
    await _services.auth.logoutLocal();
    await DeviceIntegrationService.dispose();
    if (!context.mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(builder: (_) => _authScreen()),
      (_) => false,
    );
  }

  Future<bool> _restoreSession() async {
    final hasSession = await _services.auth.hasSession().timeout(
      const Duration(seconds: 3),
      onTimeout: () => false,
    );
    if (!hasSession) return false;

    try {
      await _services.auth.currentUser().timeout(const Duration(seconds: 8));
      unawaited(_startAuthenticatedIntegrations());
      return true;
    } on ApiException catch (error) {
      if (error.isUnauthorized) {
        await _services.auth.logoutLocal();
      }
      return false;
    } on Exception {
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppServicesScope(
      services: _services,
      child: MaterialApp(
        title: 'SyncChat',
        debugShowCheckedModeBanner: false,
        theme: SyncChatTheme.light(),
        darkTheme: SyncChatTheme.dark(),
        themeMode: _themeMode,
        home: FutureBuilder<bool>(
          future: _sessionFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const _BootScreen();
            }
            if (snapshot.data == true) {
              return _authenticatedHome();
            }
            return _authScreen();
          },
        ),
      ),
    );
  }
}

class _BootScreen extends StatelessWidget {
  const _BootScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SyncColors.slate950,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset(
              'assets/syncchat_logo.png',
              width: 72,
              height: 72,
              filterQuality: FilterQuality.high,
            ),
            const SizedBox(height: 16),
            const CircularProgressIndicator(),
            const SizedBox(height: 12),
            const Text(
              'SyncChat',
              style: TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
