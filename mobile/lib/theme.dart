import 'package:flutter/material.dart';

abstract final class SyncColors {
  // Keep the historical token names for compatibility across the existing
  // mobile codebase, but move the production brand accent to the approved
  // violet system used by the current SyncChat visual direction.
  static const sky = Color(0xFF8B5CF6);
  static const sky600 = Color(0xFF7C3AED);
  static const sky700 = Color(0xFF6D28D9);
  static const cyan = Color(0xFFA78BFA);
  static const teal = Color(0xFFC084FC);

  static const slate50 = Color(0xFFF8FAFC);
  static const slate100 = Color(0xFFF1F5F9);
  static const slate200 = Color(0xFFE2E8F0);
  static const slate300 = Color(0xFFCBD5E1);
  static const slate500 = Color(0xFF64748B);
  static const slate600 = Color(0xFF475569);
  static const slate700 = Color(0xFF334155);
  static const slate900 = Color(0xFF0F172A);
  static const slate950 = Color(0xFF020617);

  // Navy messenger surfaces matching the current desktop/mobile visual family.
  static const spill950 = Color(0xFF070B14);
  static const spill900 = Color(0xFF0D1422);
  static const spill800 = Color(0xFF131D2D);
  static const spill700 = Color(0xFF202B40);
  static const spill600 = Color(0xFF2D3A52);
  static const spill300 = Color(0xFF94A3B8);

  static const sentBubble = Color(0xFFEDE9FE);
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
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        toolbarHeight: 58,
        titleTextStyle: TextStyle(
          color: SyncColors.slate900,
          fontSize: 20,
          fontWeight: FontWeight.w700,
          letterSpacing: -.2,
        ),
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: SyncColors.slate200),
        ),
      ),
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 2),
        minLeadingWidth: 36,
        minVerticalPadding: 8,
        iconColor: SyncColors.slate600,
        textColor: SyncColors.slate900,
        titleTextStyle: TextStyle(
          color: SyncColors.slate900,
          fontSize: 15,
          fontWeight: FontWeight.w700,
        ),
        subtitleTextStyle: TextStyle(
          color: SyncColors.slate500,
          fontSize: 12.5,
          height: 1.35,
        ),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: SyncColors.sky600,
        linearTrackColor: SyncColors.slate100,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFFF6F4FF),
        hintStyle: const TextStyle(color: SyncColors.slate500, fontSize: 14),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: SyncColors.sky600, width: 1.2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: SyncColors.danger),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: SyncColors.danger, width: 1.2),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 44),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(0, 44),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          side: const BorderSide(color: SyncColors.slate200),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          minimumSize: const Size(42, 42),
          shape: const CircleBorder(),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: const Color(0xFFF8F7FF),
        selectedColor: const Color(0xFFF0ECFF),
        side: const BorderSide(color: Color(0xFFE7E2F8)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        labelStyle: const TextStyle(
          color: SyncColors.slate600,
          fontSize: 12.5,
          fontWeight: FontWeight.w600,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 5),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: SyncColors.sky600,
        foregroundColor: Colors.white,
        elevation: 3,
        focusElevation: 3,
        hoverElevation: 4,
        highlightElevation: 4,
        shape: CircleBorder(),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: SyncColors.slate900,
        contentTextStyle: const TextStyle(color: Colors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: Colors.white,
        surfaceTintColor: Colors.transparent,
        elevation: 5,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      dividerTheme: const DividerThemeData(
        color: SyncColors.slate200,
        thickness: .7,
        space: 1,
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
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        toolbarHeight: 58,
        titleTextStyle: TextStyle(
          color: Color(0xFFF8FAFC),
          fontSize: 20,
          fontWeight: FontWeight.w700,
          letterSpacing: -.2,
        ),
      ),
      cardTheme: CardThemeData(
        color: SyncColors.spill900,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: SyncColors.spill700),
        ),
      ),
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 2),
        minLeadingWidth: 36,
        minVerticalPadding: 8,
        iconColor: SyncColors.spill300,
        textColor: Color(0xFFF8FAFC),
        titleTextStyle: TextStyle(
          color: Color(0xFFF8FAFC),
          fontSize: 15,
          fontWeight: FontWeight.w700,
        ),
        subtitleTextStyle: TextStyle(
          color: SyncColors.spill300,
          fontSize: 12.5,
          height: 1.35,
        ),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: SyncColors.sky,
        linearTrackColor: SyncColors.spill800,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: SyncColors.spill800,
        hintStyle: const TextStyle(color: SyncColors.spill300, fontSize: 14),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: SyncColors.sky, width: 1.2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: SyncColors.danger),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: SyncColors.danger, width: 1.2),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 44),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(0, 44),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          side: const BorderSide(color: SyncColors.spill700),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          minimumSize: const Size(42, 42),
          shape: const CircleBorder(),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: SyncColors.spill800,
        selectedColor: const Color(0x337C3AED),
        side: const BorderSide(color: SyncColors.spill700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        labelStyle: const TextStyle(
          color: SyncColors.spill300,
          fontSize: 12.5,
          fontWeight: FontWeight.w600,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 5),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: SyncColors.sky600,
        foregroundColor: Colors.white,
        elevation: 3,
        focusElevation: 3,
        hoverElevation: 4,
        highlightElevation: 4,
        shape: CircleBorder(),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: SyncColors.spill800,
        contentTextStyle: const TextStyle(color: Colors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: SyncColors.spill900,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: SyncColors.spill900,
        surfaceTintColor: Colors.transparent,
        elevation: 5,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      dividerTheme: const DividerThemeData(
        color: SyncColors.spill700,
        thickness: .7,
        space: 1,
      ),
    );
  }
}

extension SyncContext on BuildContext {
  bool get isDark => Theme.of(this).brightness == Brightness.dark;
  Color get page => isDark ? SyncColors.spill950 : const Color(0xFFFAF9FF);
  Color get panel => isDark ? SyncColors.spill900 : Colors.white;
  Color get softPanel => isDark ? SyncColors.spill800 : const Color(0xFFF6F4FF);
  Color get border => isDark ? SyncColors.spill700 : const Color(0xFFE7E2F8);
  Color get muted => isDark ? SyncColors.spill300 : SyncColors.slate500;
  Color get ink => isDark ? const Color(0xFFF8FAFC) : SyncColors.slate900;
}
