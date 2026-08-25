import 'package:flutter/material.dart';

import '../theme.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key, required this.onAuthenticated});

  final void Function(BuildContext context) onAuthenticated;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool signIn = true;
  String mode = 'auth';

  @override
  Widget build(BuildContext context) {
    final title = switch (mode) {
      'forgot' => 'Forgot password',
      'link' => 'Link device',
      'scan' => 'Scan QR code',
      _ => signIn ? 'Sign in' : 'Sign up',
    };

    return Scaffold(
      backgroundColor: SyncColors.slate950,
      body: Stack(
        children: [
          const Positioned(left: -80, top: 40, child: _Glow(size: 280, color: SyncColors.cyan)),
          const Positioned(right: -90, top: -40, child: _Glow(size: 320, color: SyncColors.sky)),
          const Positioned(left: 70, right: 70, bottom: -140, child: _Glow(size: 320, color: SyncColors.teal)),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(18),
                child: Container(
                  constraints: const BoxConstraints(maxWidth: 560),
                  padding: const EdgeInsets.all(22),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(.97),
                    borderRadius: BorderRadius.circular(28),
                    border: Border.all(color: Colors.white.withOpacity(.72)),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x44020617),
                        blurRadius: 40,
                        offset: Offset(0, 18),
                      ),
                    ],
                  ),
                  child: Theme(
                    data: SyncChatTheme.light(),
                    child: Builder(
                      builder: (context) => Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              const Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'WELCOME TO',
                                      style: TextStyle(
                                        letterSpacing: 2.4,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w800,
                                        color: SyncColors.slate500,
                                      ),
                                    ),
                                    SizedBox(height: 3),
                                    Text(
                                      'SyncChat',
                                      style: TextStyle(
                                        fontSize: 30,
                                        fontWeight: FontWeight.w900,
                                        color: SyncColors.slate900,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              _AuthBadge(label: _badgeLabel),
                            ],
                          ),
                          const SizedBox(height: 22),
                          if (mode == 'auth') ...[
                            Container(
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
                            ),
                            const SizedBox(height: 20),
                          ],
                          Text(
                            title,
                            style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.w800,
                              color: SyncColors.slate900,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _subtitle,
                            style: const TextStyle(
                              fontSize: 14,
                              height: 1.45,
                              color: SyncColors.slate500,
                            ),
                          ),
                          const SizedBox(height: 18),
                          _buildForm(context),
                        ],
                      ),
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

  String get _badgeLabel {
    if (mode == 'forgot') return 'Recovery';
    if (mode == 'link' || mode == 'scan') return 'Companion';
    return signIn ? 'Sign in' : 'Create account';
  }

  String get _subtitle {
    if (mode == 'forgot') return 'Verify your identity and set a new password.';
    if (mode == 'link') return 'Scan a QR or enter a short code from your signed-in device.';
    if (mode == 'scan') return 'Point your camera at the QR shown on your signed-in device.';
    return 'Access your secure Space in seconds.';
  }

  Widget _buildForm(BuildContext context) {
    if (mode == 'forgot') {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const TextField(
            decoration: InputDecoration(
              labelText: 'Email or username',
              prefixIcon: Icon(Icons.person_outline_rounded),
            ),
          ),
          const SizedBox(height: 12),
          const TextField(
            decoration: InputDecoration(
              labelText: 'Verification code',
              prefixIcon: Icon(Icons.verified_user_outlined),
            ),
          ),
          const SizedBox(height: 14),
          const _PrimaryButton(label: 'Continue recovery'),
          TextButton(
            onPressed: () => setState(() => mode = 'auth'),
            child: const Text('Back to sign in'),
          ),
        ],
      );
    }

    if (mode == 'link') {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            height: 150,
            decoration: BoxDecoration(
              color: SyncColors.slate100,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: SyncColors.slate200),
            ),
            child: const Center(
              child: Icon(Icons.qr_code_2_rounded, size: 104, color: SyncColors.slate700),
            ),
          ),
          const SizedBox(height: 12),
          const TextField(
            textAlign: TextAlign.center,
            decoration: InputDecoration(
              hintText: 'Enter short code',
              prefixIcon: Icon(Icons.link_rounded),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () => setState(() => mode = 'scan'),
            icon: const Icon(Icons.qr_code_scanner_rounded),
            label: const Padding(
              padding: EdgeInsets.symmetric(vertical: 13),
              child: Text('Scan QR code', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ),
          TextButton(
            onPressed: () => setState(() => mode = 'auth'),
            child: const Text('Back'),
          ),
        ],
      );
    }

    if (mode == 'scan') {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            height: 270,
            decoration: BoxDecoration(
              color: SyncColors.slate900,
              borderRadius: BorderRadius.circular(24),
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                const Icon(Icons.qr_code_scanner_rounded, size: 164, color: Colors.white70),
                Positioned(
                  left: 32,
                  right: 32,
                  top: 72,
                  child: Container(height: 2, color: SyncColors.sky),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: () => setState(() => mode = 'link'),
            child: const Padding(
              padding: EdgeInsets.symmetric(vertical: 13),
              child: Text('Use short code instead'),
            ),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!signIn) ...[
          const TextField(
            decoration: InputDecoration(
              labelText: 'Full name',
              prefixIcon: Icon(Icons.badge_outlined),
            ),
          ),
          const SizedBox(height: 12),
          const TextField(
            decoration: InputDecoration(
              labelText: 'Username',
              prefixIcon: Icon(Icons.alternate_email_rounded),
            ),
          ),
          const SizedBox(height: 12),
        ],
        const TextField(
          decoration: InputDecoration(
            labelText: 'Email or username',
            prefixIcon: Icon(Icons.person_outline_rounded),
          ),
        ),
        const SizedBox(height: 12),
        const TextField(
          obscureText: true,
          decoration: InputDecoration(
            labelText: 'Password',
            prefixIcon: Icon(Icons.lock_outline_rounded),
            suffixIcon: Icon(Icons.visibility_outlined),
          ),
        ),
        if (!signIn) ...[
          const SizedBox(height: 12),
          const TextField(
            obscureText: true,
            decoration: InputDecoration(
              labelText: 'Confirm password',
              prefixIcon: Icon(Icons.lock_reset_rounded),
            ),
          ),
        ],
        if (signIn)
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: () => setState(() => mode = 'forgot'),
              child: const Text('Forgot password?'),
            ),
          )
        else
          const SizedBox(height: 14),
        FilledButton.icon(
          onPressed: () => widget.onAuthenticated(context),
          icon: Icon(signIn ? Icons.login_rounded : Icons.person_add_alt_1_rounded),
          label: Padding(
            padding: const EdgeInsets.symmetric(vertical: 13),
            child: Text(
              signIn ? 'Sign in' : 'Create account',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () {},
          icon: const Icon(Icons.g_mobiledata_rounded, size: 30),
          label: const Text('Continue with Google'),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () {},
          icon: const Icon(Icons.facebook_rounded),
          label: const Text('Continue with Facebook'),
        ),
        const SizedBox(height: 10),
        TextButton.icon(
          onPressed: () => setState(() => mode = 'link'),
          icon: const Icon(Icons.devices_other_rounded),
          label: const Text('Link a device with QR or code'),
        ),
      ],
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: () {},
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 13),
        child: Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
      ),
    );
  }
}

class _Glow extends StatelessWidget {
  const _Glow({required this.size, required this.color});

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
          boxShadow: [
            BoxShadow(
              color: color.withOpacity(.28),
              blurRadius: 90,
              spreadRadius: 36,
            ),
          ],
        ),
      ),
    );
  }
}

class _AuthBadge extends StatelessWidget {
  const _AuthBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFE0F2FE), Color(0xFFCFFAFE)],
        ),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: SyncColors.slate700,
          fontSize: 12,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _AuthTab extends StatelessWidget {
  const _AuthTab({required this.label, required this.active, required this.onTap});

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
              color: active ? SyncColors.slate900 : SyncColors.slate500,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ),
    );
  }
}
