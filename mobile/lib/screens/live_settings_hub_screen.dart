import 'package:flutter/material.dart';

import '../widgets/professional_mobile_surface.dart';
import 'live_settings_hub_web_parity_screen.dart' as parity;

class LiveSettingsHubScreen extends StatelessWidget {
  const LiveSettingsHubScreen({
    super.key,
    required this.onThemeChanged,
    required this.onLogout,
  });

  final ValueChanged<bool> onThemeChanged;
  final Future<void> Function(BuildContext context) onLogout;

  @override
  Widget build(BuildContext context) {
    const dockHeight = 64.0;
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    return ProfessionalMobileSurface(
      child: Padding(
        padding: EdgeInsets.only(bottom: dockHeight + bottomInset),
        child: parity.LiveSettingsHubScreen(
          onThemeChanged: onThemeChanged,
          onLogout: onLogout,
        ),
      ),
    );
  }
}
