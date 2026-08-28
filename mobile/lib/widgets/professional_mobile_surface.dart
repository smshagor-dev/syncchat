import 'package:flutter/material.dart';

import '../theme.dart';

/// Shared presentation wrapper for feature-rich mobile screens that still own
/// Web-parity behavior. It changes only visual density/surfaces so production
/// APIs, realtime events and feature contracts remain untouched.
class ProfessionalMobileSurface extends StatelessWidget {
  const ProfessionalMobileSurface({
    super.key,
    required this.child,
  });

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final base = Theme.of(context);
    final dark = base.brightness == Brightness.dark;
    final page = dark ? SyncColors.spill950 : Colors.white;
    final panel = dark ? SyncColors.spill900 : Colors.white;
    final soft = dark ? SyncColors.spill800 : const Color(0xFFF6F4FF);
    final border = dark ? SyncColors.spill700 : const Color(0xFFE7E2F8);
    final muted = dark ? SyncColors.spill300 : SyncColors.slate500;

    final tuned = base.copyWith(
      scaffoldBackgroundColor: page,
      canvasColor: panel,
      dividerColor: border,
      splashColor: SyncColors.sky.withValues(alpha: dark ? .14 : .08),
      highlightColor: SyncColors.sky.withValues(alpha: dark ? .09 : .05),
      hoverColor: SyncColors.sky.withValues(alpha: .06),
      visualDensity: const VisualDensity(horizontal: -1, vertical: -1),
      appBarTheme: base.appBarTheme.copyWith(
        backgroundColor: panel,
        foregroundColor: dark ? Colors.white : SyncColors.slate900,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        toolbarHeight: 58,
      ),
      cardTheme: CardThemeData(
        color: panel,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: border.withValues(alpha: .82)),
        ),
      ),
      listTileTheme: base.listTileTheme.copyWith(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 1),
        minLeadingWidth: 34,
        minVerticalPadding: 7,
        iconColor: muted,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      inputDecorationTheme: base.inputDecorationTheme.copyWith(
        filled: true,
        fillColor: soft,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: SyncColors.sky, width: 1.2),
        ),
      ),
      chipTheme: base.chipTheme.copyWith(
        showCheckmark: false,
        backgroundColor: soft,
        selectedColor: SyncColors.sky.withValues(alpha: dark ? .22 : .12),
        side: BorderSide(color: border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
      popupMenuTheme: base.popupMenuTheme.copyWith(
        color: panel,
        surfaceTintColor: Colors.transparent,
        elevation: 8,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      bottomSheetTheme: base.bottomSheetTheme.copyWith(
        backgroundColor: panel,
        modalBackgroundColor: panel,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
      ),
      dialogTheme: base.dialogTheme.copyWith(
        backgroundColor: panel,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      floatingActionButtonTheme: base.floatingActionButtonTheme.copyWith(
        backgroundColor: SyncColors.sky,
        foregroundColor: Colors.white,
        elevation: 3,
        highlightElevation: 5,
      ),
      progressIndicatorTheme: base.progressIndicatorTheme.copyWith(
        color: SyncColors.sky,
        linearTrackColor: soft,
      ),
      navigationBarTheme: base.navigationBarTheme.copyWith(
        backgroundColor: panel,
        indicatorColor: SyncColors.sky.withValues(alpha: dark ? .2 : .12),
        surfaceTintColor: Colors.transparent,
        elevation: 0,
      ),
    );

    return Theme(
      data: tuned,
      child: ScrollConfiguration(
        behavior: const _MessengerScrollBehavior(),
        child: child,
      ),
    );
  }
}

class _MessengerScrollBehavior extends MaterialScrollBehavior {
  const _MessengerScrollBehavior();

  @override
  Widget buildOverscrollIndicator(
    BuildContext context,
    Widget child,
    ScrollableDetails details,
  ) {
    return child;
  }
}
