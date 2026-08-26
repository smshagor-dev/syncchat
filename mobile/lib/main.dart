import 'package:flutter/material.dart';

import 'core/api_client.dart';
import 'core/app_scope.dart';
import 'core/app_services.dart';
import 'core/native_call_push.dart';
import 'screens.dart';
import 'screens/global_call_layer.dart';
import 'screens/live_mobile_shell.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await NativeCallPushService.bootstrapBeforeRunApp();
  runApp(const SyncChatMobileApp());
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
      child: LiveMobileShell(onThemeChanged: _setDarkMode),
    );
  }

  Future<bool> _restoreSession() async {
    if (!await _services.auth.hasSession()) return false;
    try {
      await _services.auth.currentUser();
      await _services.realtime.connect();
      await _services.nativeCallPush.startAuthenticated();
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
            return AuthScreen(
              authRepository: _services.auth,
              onAuthenticated: (context) async {
                await _services.realtime.connect();
                await _services.nativeCallPush.startAuthenticated();
                if (!context.mounted) return;
                Navigator.of(context).pushReplacement(
                  MaterialPageRoute<void>(builder: (_) => _authenticatedHome()),
                );
              },
            );
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
    return const Scaffold(
      backgroundColor: SyncColors.slate950,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.sync_rounded, color: SyncColors.sky, size: 52),
            SizedBox(height: 16),
            CircularProgressIndicator(),
            SizedBox(height: 12),
            Text(
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
