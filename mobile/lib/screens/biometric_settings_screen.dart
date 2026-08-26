import 'package:flutter/material.dart';

import '../core/biometric_service.dart';
import '../theme.dart';

class BiometricSettingsScreen extends StatefulWidget {
  const BiometricSettingsScreen({super.key});

  @override
  State<BiometricSettingsScreen> createState() => _BiometricSettingsScreenState();
}

class _BiometricSettingsScreenState extends State<BiometricSettingsScreen> {
  bool loading = true;
  bool available = false;
  bool enabled = false;
  bool saving = false;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final supported = await BiometricService.isAvailable();
      final active = supported && await BiometricService.isEnabled();
      if (!mounted) return;
      setState(() {
        available = supported;
        enabled = active;
        loading = false;
        error = null;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = failure.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _toggle(bool next) async {
    if (saving) return;
    setState(() {
      saving = true;
      error = null;
    });
    try {
      if (next) {
        await BiometricService.setEnabled(true);
        final verified = await BiometricService.authenticate(
          reason: 'Confirm biometric protection for SyncChat',
        );
        if (!verified) {
          await BiometricService.setEnabled(false);
          throw StateError('Biometric verification was not completed.');
        }
      } else {
        await BiometricService.setEnabled(false);
      }
      if (!mounted) return;
      setState(() {
        enabled = next;
        saving = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        saving = false;
        enabled = false;
        error = failure.toString().replaceFirst('Bad state: ', '').replaceFirst('Exception: ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Biometric protection'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  color: context.panel,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                    side: BorderSide(color: context.border),
                  ),
                  child: SwitchListTile(
                    secondary: const Icon(
                      Icons.fingerprint_rounded,
                      color: SyncColors.sky,
                    ),
                    title: const Text(
                      'Unlock with biometrics',
                      style: TextStyle(fontWeight: FontWeight.w900),
                    ),
                    subtitle: Text(
                      available
                          ? 'Require Face ID/fingerprint when SyncChat resumes and before opening protected chats.'
                          : 'This device does not currently expose Face ID/fingerprint authentication.',
                    ),
                    value: available && enabled,
                    onChanged: available && !saving ? _toggle : null,
                  ),
                ),
                const SizedBox(height: 12),
                Card(
                  color: context.panel,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                    side: BorderSide(color: context.border),
                  ),
                  child: const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text(
                      'Your SyncChat login session stays signed in until you explicitly log out or the server revokes the device. Biometric protection locks the local app without destroying that session.',
                      style: TextStyle(height: 1.45),
                    ),
                  ),
                ),
                if (error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: SyncColors.danger,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ],
            ),
    );
  }
}
