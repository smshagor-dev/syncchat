import 'package:flutter/material.dart';

import '../theme.dart';
import 'live_messenger_chats_screen.dart';

/// Production chat-list surface tuned around the interaction patterns users
/// already understand from WhatsApp and Telegram.
///
/// The underlying SyncChat inbox/realtime behaviour remains owned by
/// [LiveMessengerChatsScreen]. This layer deliberately changes presentation
/// only, so chat contracts and room behaviour are not duplicated or forked.
class LiveProfessionalChatsScreen extends StatelessWidget {
  const LiveProfessionalChatsScreen({
    super.key,
    required this.onMenu,
    required this.onOpenStatus,
    required this.onThemeChanged,
    required this.onLogout,
  });

  final VoidCallback onMenu;
  final VoidCallback onOpenStatus;
  final ValueChanged<bool> onThemeChanged;
  final Future<void> Function(BuildContext context) onLogout;

  @override
  Widget build(BuildContext context) {
    final base = Theme.of(context);
    final dark = base.brightness == Brightness.dark;
    final surface = dark ? SyncColors.spill950 : Colors.white;
    final softSurface = dark ? SyncColors.spill800 : const Color(0xFFF2F4F7);
    final border = dark
        ? Colors.white.withValues(alpha: .08)
        : const Color(0xFFE5E7EB);

    final tuned = base.copyWith(
      scaffoldBackgroundColor: surface,
      canvasColor: surface,
      dividerColor: border,
      splashColor: SyncColors.sky600.withValues(alpha: dark ? .12 : .08),
      highlightColor: SyncColors.sky600.withValues(alpha: dark ? .08 : .05),
      hoverColor: SyncColors.sky600.withValues(alpha: .05),
      visualDensity: const VisualDensity(horizontal: -1, vertical: -1),
      textTheme: base.textTheme.copyWith(
        titleLarge: base.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: -.25,
        ),
        titleMedium: base.textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w600,
          letterSpacing: -.1,
        ),
        bodyMedium: base.textTheme.bodyMedium?.copyWith(height: 1.22),
      ),
      inputDecorationTheme: base.inputDecorationTheme.copyWith(
        filled: true,
        fillColor: softSurface,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(22),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(22),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(22),
          borderSide: BorderSide(
            color: SyncColors.sky600.withValues(alpha: .55),
            width: 1,
          ),
        ),
      ),
      chipTheme: base.chipTheme.copyWith(
        showCheckmark: false,
        padding: const EdgeInsets.symmetric(horizontal: 5),
        labelPadding: const EdgeInsets.symmetric(horizontal: 5),
        side: BorderSide(color: border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
      popupMenuTheme: base.popupMenuTheme.copyWith(
        color: dark ? SyncColors.spill800 : Colors.white,
        elevation: 8,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      bottomSheetTheme: base.bottomSheetTheme.copyWith(
        backgroundColor: dark ? SyncColors.spill900 : Colors.white,
        modalBackgroundColor: dark ? SyncColors.spill900 : Colors.white,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
      ),
      floatingActionButtonTheme: base.floatingActionButtonTheme.copyWith(
        backgroundColor: SyncColors.sky600,
        foregroundColor: Colors.white,
        elevation: 3,
        highlightElevation: 5,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
      snackBarTheme: base.snackBarTheme.copyWith(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );

    return Theme(
      data: tuned,
      child: ScrollConfiguration(
        behavior: const _MessengerScrollBehavior(),
        child: LiveMessengerChatsScreen(
          onMenu: onMenu,
          onOpenStatus: onOpenStatus,
          onThemeChanged: onThemeChanged,
          onLogout: onLogout,
        ),
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
