import 'dart:async';

import 'package:flutter/material.dart';

import '../core/biometric_service.dart';
import '../theme.dart';

class BiometricSetupPromptGate extends StatefulWidget {
  const BiometricSetupPromptGate({
    super.key,
    required this.child,
  });

  final Widget child;

  @override
  State<BiometricSetupPromptGate> createState() =>
      _BiometricSetupPromptGateState();
}

class _BiometricSetupPromptGateState extends State<BiometricSetupPromptGate> {
  bool _checked = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_offerIfNeeded());
    });
  }

  Future<void> _offerIfNeeded() async {
    if (_checked || !mounted) return;
    _checked = true;

    final shouldOffer = await BiometricService.shouldOfferSetup();
    if (!mounted || !shouldOffer) return;

    final enable = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        icon: const Icon(
          Icons.fingerprint_rounded,
          color: SyncColors.sky,
          size: 40,
        ),
        title: const Text('Protect SyncChat with biometrics?'),
        content: const Text(
          'Use Face ID or fingerprint to add local protection on this device. You can change this later in Settings.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Not now'),
          ),
          FilledButton.icon(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            icon: const Icon(Icons.fingerprint_rounded),
            label: const Text('Enable'),
          ),
        ],
      ),
    );

    if (!mounted) return;

    if (enable != true) {
      await BiometricService.setEnabled(false);
      return;
    }

    try {
      final activated = await BiometricService.setEnabled(
        true,
        reason: 'Confirm your identity to enable biometric protection',
      );
      if (!mounted || activated) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Biometric protection was not enabled because verification was cancelled or unsuccessful.',
          ),
        ),
      );
    } on Object catch (failure) {
      if (!mounted) return;
      final message = failure
          .toString()
          .replaceFirst('Bad state: ', '')
          .replaceFirst('Exception: ', '');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
