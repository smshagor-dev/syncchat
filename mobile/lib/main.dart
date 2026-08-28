import 'dart:async';

import 'package:flutter/material.dart';

import 'core/api_client.dart';
import 'core/app_scope.dart';
import 'core/app_services.dart';
import 'core/background_message_handler.dart';
import 'core/biometric_service.dart';
import 'core/device_integration_service.dart';
import 'core/native_call_push.dart';
import 'core/public_app_config.dart';
import 'core/standard_push_registration.dart';
import 'screens/global_call_layer.dart';
import 'screens/live_mobile_shell.dart';
import 'screens/mobile_social_auth_screen.dart';
import 'theme.dart';
import 'widgets/authenticated_account_gate.dart';
import 'widgets/authenticated_app_lock_gate.dart';
import 'widgets/biometric_setup_prompt_gate.dart';
import 'widgets/connection_resilience_layer.dart';
import 'widgets/notification_navigation_layer.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const SyncChatMobileApp());
  unawaited(_bootstrapNativeServices());
}

Future<void> _bootstrapNativeServices() async {
  try {
    await NativeCallPushService.bootstrapBeforeRunApp().timeout(
      const Duration(seconds: 8),
    );
    await registerSyncChatBackgroundMessaging().timeout(
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
  PublicAppConfig _runtimeConfig = PublicAppConfig.fallback;

  @override
  void initState() {
    super.initState();
    _services = widget.services ?? AppServices.create();
    _sessionFuture = _restoreSession();

    // Public configuration is deliberately outside the critical launch path.
    // The fallback is a complete SyncChat configuration, so the first frame
    // can render while branding/limits/maintenance are reconciled silently.
    unawaited(_refreshPublicAppConfig());
  }

  @override
  void dispose() {
    DeviceIntegrationService.dispose();
    _services.dispose();
    super.dispose();
  }

  Future<void> _refreshPublicAppConfig() async {
    try {
      final runtime = await _services.publicAppConfig.load().timeout(
        const Duration(seconds: 5),
      );
      _services.applyPublicAppConfig(runtime);
      if (!mounted) return;
      setState(() => _runtimeConfig = runtime);
    } on Object catch (error) {
      debugPrint('SyncChat public app config deferred: $error');
    }
  }

  void _setDarkMode(bool enabled) {
    setState(() {
      _themeMode = enabled ? ThemeMode.dark : ThemeMode.light;
    });
  }

  Widget _authenticatedHome() {
    return AuthenticatedAccountGate(
      onLogout: _logout,
      child: AuthenticatedAppLockGate(
        onLogout: _logout,
        child: BiometricSetupPromptGate(
          child: ConnectionResilienceLayer(
            child: NotificationNavigationLayer(
              child: GlobalCallLayer(
                child: LiveMobileShell(
                  onThemeChanged: _setDarkMode,
                  onLogout: _logout,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _authScreen() {
    return MobileSocialAuthScreen(
      authRepository: _services.auth,
      onAuthenticated: (context) async {
        unawaited(_services.chat.currentUser(refresh: true));
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
      await _services.nativeCallPush.startAuthenticated().timeout(
        const Duration(seconds: 8),
      );
    } on Object catch (error) {
      debugPrint('SyncChat native push startup deferred: $error');
    }

    try {
      await StandardPushRegistration.registerIOS(
        api: _services.api,
        config: _services.config,
      ).timeout(const Duration(seconds: 8));
    } on Object catch (error) {
      debugPrint('SyncChat iOS standard push registration deferred: $error');
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
      await _services.nativeCallPush.unregisterCurrentDevice().timeout(
        const Duration(seconds: 5),
      );
    } on Object {}
    _services.realtime.disconnect();
    await _services.auth.logout();
    await _services.chatCache.clear();
    BiometricService.expireUnlock();
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

    // Render the signed-in UI immediately from local state/cache. Network,
    // profile refresh, sockets and push registration continue in background.
    unawaited(_refreshAuthenticatedSession());
    return true;
  }

  Future<void> _refreshAuthenticatedSession() async {
    try {
      await _services.chat
          .currentUser(refresh: true)
          .timeout(const Duration(seconds: 10));
      unawaited(_services.api.ensurePersistentSession());
    } on ApiException catch (error) {
      if (error.isUnauthorized) {
        debugPrint(
          'SyncChat session refresh rejected; account gate will reconcile.',
        );
      }
    } on Object catch (error) {
      debugPrint('SyncChat background session refresh deferred: $error');
    }
    unawaited(_startAuthenticatedIntegrations());
  }

  @override
  Widget build(BuildContext context) {
    return AppServicesScope(
      services: _services,
      child: PublicAppConfigScope(
        config: _runtimeConfig,
        child: MaterialApp(
          title: _runtimeConfig.appName,
          debugShowCheckedModeBanner: false,
          theme: SyncChatTheme.light(),
          darkTheme: SyncChatTheme.dark(),
          themeMode: _themeMode,
          home: _runtimeConfig.maintenanceEnabled
              ? _MaintenanceScreen(config: _runtimeConfig)
              : FutureBuilder<bool>(
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
      ),
    );
  }
}

class _MaintenanceScreen extends StatelessWidget {
  const _MaintenanceScreen({required this.config});

  final PublicAppConfig config;

  @override
  Widget build(BuildContext context) {
    final message = config.maintenanceMessage.isNotEmpty
        ? config.maintenanceMessage
        : 'We are performing scheduled maintenance.';
    return Scaffold(
      backgroundColor: SyncColors.slate950,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Container(
                padding: const EdgeInsets.all(26),
                decoration: BoxDecoration(
                  color: SyncColors.slate900,
                  borderRadius: BorderRadius.circular(26),
                  border: Border.all(color: SyncColors.slate700),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.construction_rounded,
                      color: SyncColors.sky,
                      size: 48,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      config.appName,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 26,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      message,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: SyncColors.slate300,
                        fontSize: 15,
                        height: 1.45,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Please try again later.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: SyncColors.slate500),
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
            const SizedBox(height: 12),
            Text(
              context.publicAppConfig.appName,
              style: const TextStyle(
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
