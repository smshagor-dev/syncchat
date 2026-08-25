import 'package:flutter/material.dart';

import '../theme.dart';

class ParityAuthSurface extends StatefulWidget {
  const ParityAuthSurface({super.key, required this.mode});

  final String mode;

  @override
  State<ParityAuthSurface> createState() => _ParityAuthSurfaceState();
}

class _ParityAuthSurfaceState extends State<ParityAuthSurface> {
  bool signIn = true;
  bool obscure = true;

  @override
  Widget build(BuildContext context) {
    final title = switch (widget.mode) {
      'forgot' => 'Forgot password',
      'link' => 'Link device',
      'qr' => 'Scan QR code',
      'social' => 'Continue with',
      _ => signIn ? 'Sign in' : 'Sign up',
    };

    return Scaffold(
      backgroundColor: SyncColors.slate950,
      body: Stack(
        children: [
          const Positioned(
            left: -90,
            top: 70,
            child: _AuthGlow(size: 270, color: SyncColors.cyan),
          ),
          const Positioned(
            right: -110,
            top: -50,
            child: _AuthGlow(size: 320, color: SyncColors.sky),
          ),
          const Positioned(
            left: 80,
            bottom: -150,
            child: _AuthGlow(size: 320, color: SyncColors.teal),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(18),
                child: Container(
                  constraints: const BoxConstraints(maxWidth: 560),
                  padding: const EdgeInsets.all(22),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: .97),
                    borderRadius: BorderRadius.circular(28),
                    border: Border.all(color: Colors.white70),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x55020617),
                        blurRadius: 42,
                        offset: Offset(0, 18),
                      ),
                    ],
                  ),
                  child: Theme(
                    data: SyncChatTheme.light(),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'WELCOME TO',
                          style: TextStyle(
                            letterSpacing: 2.4,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: SyncColors.slate500,
                          ),
                        ),
                        const Text(
                          'SyncChat',
                          style: TextStyle(
                            fontSize: 30,
                            fontWeight: FontWeight.w900,
                            color: SyncColors.slate900,
                          ),
                        ),
                        const SizedBox(height: 22),
                        if (widget.mode == 'auth') ...[
                          _authTabs(),
                          const SizedBox(height: 20),
                        ],
                        Text(
                          title,
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w900,
                            color: SyncColors.slate900,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          _subtitle,
                          style: const TextStyle(
                            color: SyncColors.slate500,
                            height: 1.45,
                          ),
                        ),
                        const SizedBox(height: 18),
                        ..._body(),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _authTabs() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: SyncColors.slate100,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Expanded(
            child: _AuthTab(
              label: 'Sign in',
              active: signIn,
              onTap: () => setState(() => signIn = true),
            ),
          ),
          Expanded(
            child: _AuthTab(
              label: 'Sign up',
              active: !signIn,
              onTap: () => setState(() => signIn = false),
            ),
          ),
        ],
      ),
    );
  }

  String get _subtitle => switch (widget.mode) {
        'forgot' => 'Secure password recovery in three steps.',
        'link' => 'Scan a QR or enter a short code from your signed-in device.',
        'qr' => 'Point your camera at the QR shown on your signed-in device.',
        'social' => 'Use a connected account or continue with email.',
        _ => signIn
            ? 'Access your secure Space in seconds.'
            : 'Create your SyncChat account and start messaging.',
      };

  List<Widget> _body() {
    switch (widget.mode) {
      case 'qr':
        return [
          Container(
            height: 240,
            decoration: BoxDecoration(
              color: SyncColors.slate950,
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Stack(
              alignment: Alignment.center,
              children: [
                Icon(
                  Icons.qr_code_scanner_rounded,
                  color: Colors.white24,
                  size: 118,
                ),
                SizedBox(
                  width: 178,
                  height: 178,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      border: Border.fromBorderSide(
                        BorderSide(color: SyncColors.sky, width: 2),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.camera_alt_outlined),
            label: const Text('Open camera'),
          ),
        ];
      case 'link':
        return [
          const TextField(
            decoration: InputDecoration(
              labelText: 'Device code',
              prefixIcon: Icon(Icons.devices_other_rounded),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.link_rounded),
            label: const Text('Link device'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.qr_code_scanner_rounded),
            label: const Text('Scan QR instead'),
          ),
        ];
      case 'forgot':
        return [
          const TextField(
            decoration: InputDecoration(
              labelText: 'Email address',
              prefixIcon: Icon(Icons.email_outlined),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: () {},
            child: const Text('Send recovery code'),
          ),
          const SizedBox(height: 10),
          const Text(
            'Recovery uses the same three-step verification flow as the web client.',
            textAlign: TextAlign.center,
            style: TextStyle(color: SyncColors.slate500, fontSize: 12),
          ),
        ];
      case 'social':
        return [
          const _SocialButton(
            icon: Icons.g_mobiledata_rounded,
            label: 'Continue with Google',
          ),
          const SizedBox(height: 9),
          const _SocialButton(
            icon: Icons.facebook_rounded,
            label: 'Continue with Facebook',
          ),
          const SizedBox(height: 14),
          const Row(
            children: [
              Expanded(child: Divider()),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: 10),
                child: Text('OR'),
              ),
              Expanded(child: Divider()),
            ],
          ),
          const SizedBox(height: 14),
          const _SocialButton(
            icon: Icons.mail_outline_rounded,
            label: 'Continue with email',
          ),
        ];
      default:
        return [
          if (!signIn) ...[
            const TextField(
              decoration: InputDecoration(
                labelText: 'Full name',
                prefixIcon: Icon(Icons.person_outline_rounded),
              ),
            ),
            const SizedBox(height: 10),
            const TextField(
              decoration: InputDecoration(
                labelText: 'Username',
                prefixIcon: Icon(Icons.alternate_email_rounded),
              ),
            ),
            const SizedBox(height: 10),
          ],
          const TextField(
            decoration: InputDecoration(
              labelText: 'Email or username',
              prefixIcon: Icon(Icons.person_outline_rounded),
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            obscureText: obscure,
            decoration: InputDecoration(
              labelText: 'Password',
              prefixIcon: const Icon(Icons.lock_outline_rounded),
              suffixIcon: IconButton(
                onPressed: () => setState(() => obscure = !obscure),
                icon: Icon(
                  obscure
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: () {},
            child: Text(signIn ? 'Sign in' : 'Create account'),
          ),
          if (signIn)
            TextButton(
              onPressed: () {},
              child: const Text('Forgot password?'),
            ),
        ];
    }
  }
}

class ParityVerificationSurface extends StatelessWidget {
  const ParityVerificationSurface({super.key, required this.inactive});

  final bool inactive;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SyncColors.slate950,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 520),
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(28),
              ),
              child: Theme(
                data: SyncChatTheme.light(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Icon(
                      inactive
                          ? Icons.pause_circle_outline_rounded
                          : Icons.mark_email_read_outlined,
                      size: 60,
                      color: inactive ? SyncColors.warning : SyncColors.sky,
                    ),
                    const SizedBox(height: 14),
                    Text(
                      inactive ? 'Account inactive' : 'Verify your account',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w900,
                        color: SyncColors.slate900,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      inactive
                          ? 'Your account is currently inactive. Review the notice or contact support.'
                          : 'Enter the verification code sent to your email address.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: SyncColors.slate500,
                        height: 1.45,
                      ),
                    ),
                    const SizedBox(height: 18),
                    if (!inactive) ...[
                      const TextField(
                        decoration: InputDecoration(
                          labelText: 'Verification code',
                          prefixIcon: Icon(Icons.verified_user_outlined),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    FilledButton(
                      onPressed: () => Navigator.maybePop(context),
                      child: Text(inactive ? 'Back to sign in' : 'Verify account'),
                    ),
                    if (!inactive)
                      TextButton(
                        onPressed: () {},
                        child: const Text('Resend code'),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AuthTab extends StatelessWidget {
  const _AuthTab({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: active ? Colors.white : Colors.transparent,
      borderRadius: BorderRadius.circular(11),
      child: InkWell(
        borderRadius: BorderRadius.circular(11),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              color: active ? SyncColors.slate900 : SyncColors.slate500,
            ),
          ),
        ),
      ),
    );
  }
}

class _SocialButton extends StatelessWidget {
  const _SocialButton({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: () {},
      icon: Icon(icon),
      label: Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Text(label),
      ),
    );
  }
}

class _AuthGlow extends StatelessWidget {
  const _AuthGlow({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: color.withValues(alpha: .18),
          boxShadow: [
            BoxShadow(
              color: color.withValues(alpha: .22),
              blurRadius: 85,
              spreadRadius: 25,
            ),
          ],
        ),
      ),
    );
  }
}
