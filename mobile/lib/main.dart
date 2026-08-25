import 'package:flutter/material.dart';
import 'screens.dart';
import 'theme.dart';

void main() {
  runApp(const SyncChatMobileApp());
}

class SyncChatMobileApp extends StatefulWidget {
  const SyncChatMobileApp({super.key});

  @override
  State<SyncChatMobileApp> createState() => _SyncChatMobileAppState();
}

class _SyncChatMobileAppState extends State<SyncChatMobileApp> {
  ThemeMode _themeMode = ThemeMode.system;

  void _setDarkMode(bool enabled) {
    setState(() {
      _themeMode = enabled ? ThemeMode.dark : ThemeMode.light;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SyncChat',
      debugShowCheckedModeBanner: false,
      theme: SyncChatTheme.light(),
      darkTheme: SyncChatTheme.dark(),
      themeMode: _themeMode,
      home: AuthScreen(
        onAuthenticated: (context) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute<void>(
              builder: (_) => MobileShell(onThemeChanged: _setDarkMode),
            ),
          );
        },
      ),
    );
  }
}
