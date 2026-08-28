import 'package:flutter/material.dart';

import '../widgets/professional_mobile_surface.dart';
import 'live_channels_web_parity_screen.dart' as parity;

class ChannelHubScreen extends StatelessWidget {
  const ChannelHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const ProfessionalMobileSurface(
      child: parity.ChannelHubScreen(),
    );
  }
}
