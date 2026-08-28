import 'package:flutter/material.dart';

import '../widgets/professional_mobile_surface.dart';
import 'live_full_profile_web_parity_screen.dart' as parity;

class LiveFullProfileScreen extends StatelessWidget {
  const LiveFullProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const ProfessionalMobileSurface(
      child: parity.LiveFullProfileScreen(),
    );
  }
}
