import 'package:flutter/material.dart';

abstract final class SyncColors {
  static const sky = Color(0xFF0EA5E9);
  static const sky600 = Color(0xFF0284C7);
  static const sky700 = Color(0xFF0369A1);
  static const cyan = Color(0xFF06B6D4);
  static const teal = Color(0xFF14B8A6);

  static const slate50 = Color(0xFFF8FAFC);
  static const slate100 = Color(0xFFF1F5F9);
  static const slate200 = Color(0xFFE2E8F0);
  static const slate300 = Color(0xFFCBD5E1);
  static const slate500 = Color(0xFF64748B);
  static const slate600 = Color(0xFF475569);
  static const slate700 = Color(0xFF334155);
  static const slate900 = Color(0xFF0F172A);
  static const slate950 = Color(0xFF020617);

  static const spill950 = Color(0xFF0C1116);
  static const spill900 = Color(0xFF141D26);
  static const spill800 = Color(0xFF1D2935);
  static const spill700 = Color(0xFF273645);
  static const spill600 = Color(0xFF334557);
  static const spill300 = Color(0xFF94A3B8);

  static const sentBubble = Color(0xFFCCECFF);
  static const receivedBubble = Color(0xFFFFFFFF);
  static const success = Color(0xFF22C55E);
  static const danger = Color(0xFFF43F5E);
  static const warning = Color(0xFFF59E0B);
}

abstract final class SyncChatTheme {
  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(
      seedColor: SyncColors.sky,
      brightness: Brightness.light,
      surface: Colors.white,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: scheme,
      scaffoldBackgroundColor: Colors.white,
      dividerColor: SyncColors.slate200,
      fontFamily: 'Roboto',
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        foregroundColor: SyncColors.slate900,
        elevation: 0,
        centerTitle: false,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: SyncColors.slate100,
        hintStyle: const TextStyle(color: SyncColors.slate500),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: SyncColors.slate200),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: SyncColors.slate200),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: SyncColors.sky, width: 1.4),
        ),
      ),
    );
  }

  static ThemeData dark() {
    final scheme = ColorScheme.fromSeed(
      seedColor: SyncColors.sky,
      brightness: Brightness.dark,
      surface: SyncColors.spill900,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
      scaffoldBackgroundColor: SyncColors.spill950,
      dividerColor: SyncColors.spill700,
      fontFamily: 'Roboto',
      appBarTheme: const AppBarTheme(
        backgroundColor: SyncColors.spill900,
        foregroundColor: Color(0xFFF8FAFC),
        elevation: 0,
        centerTitle: false,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: SyncColors.spill800,
        hintStyle: const TextStyle(color: SyncColors.spill300),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: SyncColors.spill700),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: SyncColors.spill700),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: SyncColors.sky, width: 1.4),
        ),
      ),
    );
  }
}

extension SyncContext on BuildContext {
  bool get isDark => Theme.of(this).brightness == Brightness.dark;
  Color get page => isDark ? SyncColors.spill950 : SyncColors.slate50;
  Color get panel => isDark ? SyncColors.spill900 : Colors.white;
  Color get softPanel => isDark ? SyncColors.spill800 : SyncColors.slate100;
  Color get border => isDark ? SyncColors.spill700 : SyncColors.slate200;
  Color get muted => isDark ? SyncColors.spill300 : SyncColors.slate500;
  Color get ink => isDark ? const Color(0xFFF8FAFC) : SyncColors.slate900;
}
