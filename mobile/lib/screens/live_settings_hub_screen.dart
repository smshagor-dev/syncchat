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
    return ProfessionalMobileSurface(
      child: parity.LiveSettingsHubScreen(
        onThemeChanged: onThemeChanged,
        onLogout: onLogout,
      ),
    );
  }
}
