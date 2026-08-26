import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../core/api_client.dart';
import '../core/auth_repository.dart';
import '../theme.dart';

enum _LinkStage { scan, verify, twoFactor }

class DeviceLinkQrScreen extends StatefulWidget {
  const DeviceLinkQrScreen({
    super.key,
    required this.authRepository,
    required this.onAuthenticated,
  });

  final AuthRepository authRepository;
  final Future<void> Function(BuildContext context) onAuthenticated;

  @override
  State<DeviceLinkQrScreen> createState() => _DeviceLinkQrScreenState();
}

class _DeviceLinkQrScreenState extends State<DeviceLinkQrScreen> {
  final MobileScannerController scanner = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
  );
  final emailCode = TextEditingController();
  final supportCode = TextEditingController();
  final twoFactorCode = TextEditingController();

  _LinkStage stage = _LinkStage.scan;
  Map<String, dynamic>? info;
  String token = '';
  String? tempToken;
  bool recoveryCode = false;
  bool busy = false;
  bool detected = false;
  String? error;

  @override
  void dispose() {
    scanner.dispose();
    emailCode.dispose();
    supportCode.dispose();
    twoFactorCode.dispose();
    super.dispose();
  }

  String _extractToken(String rawValue) {
    final raw = rawValue.trim();
    if (raw.isEmpty) return '';
    final uri = Uri.tryParse(raw);
    if (uri != null && uri.hasScheme) {
      final link = uri.queryParameters['link']?.trim() ?? '';
      if (link.isNotEmpty) return link;
      if (uri.pathSegments.isNotEmpty) return uri.pathSegments.last.trim();
    }
    return raw;
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (detected || busy || stage != _LinkStage.scan) return;
    final raw = capture.barcodes
        .map((barcode) => barcode.rawValue?.trim() ?? '')
        .firstWhere((value) => value.isNotEmpty, orElse: () => '');
    final nextToken = _extractToken(raw);
    if (nextToken.isEmpty) return;

    detected = true;
    await scanner.stop();
    if (!mounted) return;
    setState(() {
      busy = true;
      error = null;
    });

    try {
      final value = await widget.authRepository.deviceLinkInfo(token: nextToken);
      if (!mounted) return;
      setState(() {
        token = value['token']?.toString().trim().isNotEmpty == true
            ? value['token'].toString().trim()
            : nextToken;
        info = value;
        stage = _LinkStage.verify;
        busy = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        busy = false;
        detected = false;
        error = _message(failure);
      });
      await scanner.start();
    }
  }

  Future<void> _complete() async {
    if (busy || token.isEmpty) return;
    if (emailCode.text.trim().length != 6 || supportCode.text.trim().length != 6) {
      setState(() => error = 'Enter both 6-digit verification codes.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = await widget.authRepository.completeDeviceLink(
        token: token,
        emailCode: emailCode.text,
        supportCode: supportCode.text,
      );
      if (!mounted) return;
      if (result.requiresTwoFactor) {
        setState(() {
          busy = false;
          tempToken = result.tempToken;
          stage = _LinkStage.twoFactor;
          twoFactorCode.clear();
        });
        return;
      }
      setState(() => busy = false);
      await widget.onAuthenticated(context);
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        busy = false;
        error = _message(failure);
      });
    }
  }

  Future<void> _verifyTwoFactor() async {
    final challenge = tempToken;
    if (busy || challenge == null || twoFactorCode.text.trim().isEmpty) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.authRepository.verifyTwoFactor(
        tempToken: challenge,
        code: twoFactorCode.text,
        recoveryCode: recoveryCode,
      );
      if (!mounted) return;
      setState(() => busy = false);
      await widget.onAuthenticated(context);
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        busy = false;
        error = _message(failure);
      });
    }
  }

  Future<void> _scanAgain() async {
    emailCode.clear();
    supportCode.clear();
    twoFactorCode.clear();
    setState(() {
      stage = _LinkStage.scan;
      info = null;
      token = '';
      tempToken = null;
      recoveryCode = false;
      detected = false;
      error = null;
    });
    await scanner.start();
  }

  String _message(Object failure) => failure is ApiException
      ? failure.message
      : failure.toString().replaceFirst('Exception: ', '').replaceFirst('Bad state: ', '');

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Scan QR to sign in'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
        actions: [
          if (stage == _LinkStage.scan)
            IconButton(
              tooltip: 'Flashlight',
              onPressed: scanner.toggleTorch,
              icon: const Icon(Icons.flashlight_on_rounded),
            ),
        ],
      ),
      body: stage == _LinkStage.scan ? _scannerBody() : _verificationBody(),
    );
  }

  Widget _scannerBody() {
    return Stack(
      fit: StackFit.expand,
      children: [
        MobileScanner(
          controller: scanner,
          tapToFocus: true,
          onDetect: _onDetect,
          errorBuilder: (_, failure) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'Camera could not start. Allow Camera permission and try again.\n${failure.errorCode.name}',
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
        IgnorePointer(
          child: Center(
            child: Container(
              width: 250,
              height: 250,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(28),
                border: Border.all(color: Colors.white, width: 3),
              ),
            ),
          ),
        ),
        Positioned(
          left: 20,
          right: 20,
          bottom: 28,
          child: Container(
            padding: const EdgeInsets.all(15),
            decoration: BoxDecoration(
              color: const Color(0xD90F172A),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Point the camera at the QR code from your signed-in SyncChat device.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, height: 1.4),
                ),
                if (busy) ...[
                  const SizedBox(height: 12),
                  const LinearProgressIndicator(),
                ],
                if (error != null) ...[
                  const SizedBox(height: 10),
                  Text(error!, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFFFFB4B4))),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _verificationBody() {
    final data = info ?? const <String, dynamic>{};
    final accountName = data['accountName']?.toString() ?? 'SyncChat account';
    final emailHint = data['emailHint']?.toString() ?? '';
    final shortCode = data['shortCode']?.toString() ?? '';

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 36),
      children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: context.panel,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: context.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.verified_user_rounded, color: SyncColors.sky, size: 34),
              const SizedBox(height: 12),
              Text(accountName, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
              if (emailHint.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text('Email code sent to $emailHint', style: TextStyle(color: context.muted)),
              ],
              const SizedBox(height: 4),
              Text('A second code is sent to SyncChat Support chat on your signed-in device.', style: TextStyle(color: context.muted, height: 1.4)),
              if (shortCode.isNotEmpty) ...[
                const SizedBox(height: 7),
                Text('Short code: $shortCode', style: const TextStyle(fontWeight: FontWeight.w800)),
              ],
            ],
          ),
        ),
        const SizedBox(height: 20),
        if (error != null) ...[
          Text(error!, style: const TextStyle(color: SyncColors.danger, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
        ],
        if (stage == _LinkStage.twoFactor) ...[
          TextField(
            controller: twoFactorCode,
            keyboardType: recoveryCode ? TextInputType.text : TextInputType.number,
            decoration: InputDecoration(
              labelText: recoveryCode ? 'Recovery code' : 'Authenticator code',
              prefixIcon: const Icon(Icons.security_rounded),
            ),
          ),
          const SizedBox(height: 8),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: recoveryCode,
            onChanged: busy ? null : (value) => setState(() {
              recoveryCode = value;
              twoFactorCode.clear();
            }),
            title: const Text('Use a recovery code'),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: busy ? null : _verifyTwoFactor,
            child: Text(busy ? 'Verifying…' : 'Verify and sign in'),
          ),
        ] else ...[
          TextField(
            controller: emailCode,
            keyboardType: TextInputType.number,
            maxLength: 6,
            decoration: const InputDecoration(
              labelText: 'Email verification code',
              prefixIcon: Icon(Icons.mail_outline_rounded),
              counterText: '',
            ),
          ),
          const SizedBox(height: 13),
          TextField(
            controller: supportCode,
            keyboardType: TextInputType.number,
            maxLength: 6,
            decoration: const InputDecoration(
              labelText: 'SyncChat Support chat code',
              prefixIcon: Icon(Icons.message_outlined),
              counterText: '',
            ),
          ),
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: busy ? null : _complete,
            icon: busy
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.login_rounded),
            label: Text(busy ? 'Linking…' : 'Verify and sign in'),
          ),
        ],
        const SizedBox(height: 10),
        TextButton.icon(
          onPressed: busy ? null : _scanAgain,
          icon: const Icon(Icons.qr_code_scanner_rounded),
          label: const Text('Scan another QR code'),
        ),
      ],
    );
  }
}
