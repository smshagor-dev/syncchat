import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/auth_repository.dart';
import '../theme.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({
    super.key,
    required this.authRepository,
    required this.onAuthenticated,
  });

  final AuthRepository authRepository;
  final Future<void> Function(BuildContext context) onAuthenticated;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool signIn = true;
  bool loading = false;
  bool rememberUsername = false;
  bool showPassword = false;
  bool showConfirmPassword = false;
  String mode = 'auth';
  String? error;
  String? notice;

  bool twoFactorRequired = false;
  bool useRecoveryCode = false;
  String twoFactorTempToken = '';

  int recoveryStep = 1;
  String passwordResetToken = '';

  final fullNameController = TextEditingController();
  final usernameController = TextEditingController();
  final emailController = TextEditingController();
  final passwordController = TextEditingController();
  final confirmPasswordController = TextEditingController();
  final twoFactorController = TextEditingController();
  final recoveryEmailController = TextEditingController();
  final recoveryOtpController = TextEditingController();
  final recoveryPasswordController = TextEditingController();
  final recoveryConfirmController = TextEditingController();
  final deviceCodeController = TextEditingController();

  @override
  void dispose() {
    fullNameController.dispose();
    usernameController.dispose();
    emailController.dispose();
    passwordController.dispose();
    confirmPasswordController.dispose();
    twoFactorController.dispose();
    recoveryEmailController.dispose();
    recoveryOtpController.dispose();
    recoveryPasswordController.dispose();
    recoveryConfirmController.dispose();
    deviceCodeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SyncColors.slate950,
      body: Stack(
        children: [
          const Positioned(
            left: -80,
            top: 40,
            child: _Glow(size: 280, color: SyncColors.cyan),
          ),
          const Positioned(
            right: -90,
            top: -40,
            child: _Glow(size: 320, color: SyncColors.sky),
          ),
          const Positioned(
            left: 70,
            right: 70,
            bottom: -140,
            child: _Glow(size: 320, color: SyncColors.teal),
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
                    border: Border.all(
                      color: Colors.white.withValues(alpha: .72),
                    ),
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
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _header(),
                        const SizedBox(height: 22),
                        if (mode == 'auth' && !twoFactorRequired) ...[
                          _authTabs(),
                          const SizedBox(height: 20),
                        ],
                        Text(
                          _title,
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
                        if (error != null) ...[
                          const SizedBox(height: 12),
                          _StatusBanner(message: error!, error: true),
                        ],
                        if (notice != null) ...[
                          const SizedBox(height: 12),
                          _StatusBanner(message: notice!),
                        ],
                        const SizedBox(height: 18),
                        _buildForm(context),
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

  Widget _header() {
    return Row(
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
              onTap: loading
                  ? null
                  : () => setState(() {
                        signIn = true;
                        _clearStatus();
                      }),
            ),
          ),
          Expanded(
            child: _AuthTab(
              label: 'Sign up',
              active: !signIn,
              onTap: loading
                  ? null
                  : () => setState(() {
                        signIn = false;
                        _clearStatus();
                      }),
            ),
          ),
        ],
      ),
    );
  }

  String get _title => switch (mode) {
        'forgot' => 'Forgot password',
        'link' => 'Link device',
        'scan' => 'Scan QR code',
        _ when twoFactorRequired => 'Two-factor verification',
        _ => signIn ? 'Sign in' : 'Sign up',
      };

  String get _badgeLabel {
    if (twoFactorRequired) return '2FA';
    if (mode == 'forgot') return 'Recovery';
    if (mode == 'link' || mode == 'scan') return 'Companion';
    return signIn ? 'Sign in' : 'Create account';
  }

  String get _subtitle {
    if (twoFactorRequired) {
      return useRecoveryCode
          ? 'Enter one of your recovery codes to continue.'
          : 'Google Authenticator code is required after password verification.';
    }
    if (mode == 'forgot') return 'Secure password recovery in three steps.';
    if (mode == 'link') {
      return 'Scan a QR or enter a short code from your signed-in device.';
    }
    if (mode == 'scan') {
      return 'Point your camera at the QR shown on your signed-in device.';
    }
    return 'Access your secure Space in seconds.';
  }

  Widget _buildForm(BuildContext context) {
    if (twoFactorRequired) return _buildTwoFactorForm();
    if (mode == 'forgot') return _buildRecoveryForm();
    if (mode == 'link') return _buildDeviceLinkForm();
    if (mode == 'scan') return _buildQrScannerMock();
    return _buildAuthForm();
  }

  Widget _buildTwoFactorForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: twoFactorController,
          enabled: !loading,
          keyboardType:
              useRecoveryCode ? TextInputType.text : TextInputType.number,
          textCapitalization: useRecoveryCode
              ? TextCapitalization.characters
              : TextCapitalization.none,
          maxLength: useRecoveryCode ? 9 : 6,
          decoration: InputDecoration(
            labelText: useRecoveryCode
                ? 'Recovery code (ABCD-EFGH)'
                : '6-digit code',
            prefixIcon: const Icon(Icons.shield_outlined),
            counterText: '',
          ),
          onChanged: (value) {
            final formatted = useRecoveryCode
                ? _formatRecoveryCode(value)
                : _formatSixDigits(value);
            if (formatted != value) {
              twoFactorController.value = TextEditingValue(
                text: formatted,
                selection: TextSelection.collapsed(offset: formatted.length),
              );
            }
          },
        ),
        const SizedBox(height: 12),
        _PrimaryButton(
          label: loading ? 'Verifying…' : 'Verify and continue',
          icon: Icons.verified_user_outlined,
          onPressed: loading ? null : _submitTwoFactor,
        ),
        TextButton(
          onPressed: loading
              ? null
              : () => setState(() {
                    useRecoveryCode = !useRecoveryCode;
                    twoFactorController.clear();
                    _clearStatus();
                  }),
          child: Text(
            useRecoveryCode
                ? 'Use authenticator code'
                : 'Use recovery code',
          ),
        ),
        TextButton(
          onPressed: loading
              ? null
              : () => setState(() {
                    twoFactorRequired = false;
                    twoFactorTempToken = '';
                    twoFactorController.clear();
                    useRecoveryCode = false;
                    _clearStatus();
                  }),
          child: const Text('Back'),
        ),
      ],
    );
  }

  Widget _buildRecoveryForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            for (var step = 1; step <= 3; step++) ...[
              _RecoveryStep(number: step, active: recoveryStep >= step),
              if (step < 3)
                Expanded(
                  child: Container(
                    height: 2,
                    color: recoveryStep > step
                        ? SyncColors.sky
                        : SyncColors.slate200,
                  ),
                ),
            ],
          ],
        ),
        const SizedBox(height: 18),
        if (recoveryStep == 1)
          TextField(
            controller: recoveryEmailController,
            enabled: !loading,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(
              labelText: 'Email address',
              prefixIcon: Icon(Icons.email_outlined),
            ),
          ),
        if (recoveryStep == 2)
          TextField(
            controller: recoveryOtpController,
            enabled: !loading,
            keyboardType: TextInputType.number,
            maxLength: 6,
            decoration: const InputDecoration(
              labelText: '6-digit code',
              prefixIcon: Icon(Icons.shield_outlined),
              counterText: '',
            ),
            onChanged: (value) {
              final formatted = _formatSixDigits(value);
              if (formatted != value) {
                recoveryOtpController.value = TextEditingValue(
                  text: formatted,
                  selection: TextSelection.collapsed(offset: formatted.length),
                );
              }
            },
          ),
        if (recoveryStep == 3) ...[
          TextField(
            controller: recoveryPasswordController,
            enabled: !loading,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'New password',
              prefixIcon: Icon(Icons.lock_open_outlined),
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: recoveryConfirmController,
            enabled: !loading,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'Confirm new password',
              prefixIcon: Icon(Icons.lock_reset_rounded),
            ),
          ),
          const SizedBox(height: 7),
          const Text(
            'Use at least 8 characters with at least one letter and one number.',
            style: TextStyle(color: SyncColors.slate500, fontSize: 12),
          ),
        ],
        const SizedBox(height: 14),
        _PrimaryButton(
          label: loading
              ? 'Please wait…'
              : switch (recoveryStep) {
                  1 => 'Send code',
                  2 => 'Verify code',
                  _ => 'Reset password',
                },
          icon: recoveryStep == 3
              ? Icons.lock_reset_rounded
              : Icons.arrow_forward_rounded,
          onPressed: loading ? null : _submitRecovery,
        ),
        TextButton(
          onPressed: loading ? null : _backToLogin,
          child: const Text('Back to sign in'),
        ),
      ],
    );
  }

  Widget _buildDeviceLinkForm() {
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
            child: Icon(
              Icons.qr_code_2_rounded,
              size: 104,
              color: SyncColors.slate700,
            ),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: deviceCodeController,
          textAlign: TextAlign.center,
          enabled: !loading,
          decoration: const InputDecoration(
            hintText: 'Enter short code',
            prefixIcon: Icon(Icons.link_rounded),
          ),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: loading ? null : () => setState(() => mode = 'scan'),
          icon: const Icon(Icons.qr_code_scanner_rounded),
          label: const Padding(
            padding: EdgeInsets.symmetric(vertical: 13),
            child: Text(
              'Scan QR code',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ),
        TextButton(
          onPressed: loading ? null : _backToLogin,
          child: const Text('Back'),
        ),
      ],
    );
  }

  Widget _buildQrScannerMock() {
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
              const Icon(
                Icons.qr_code_scanner_rounded,
                size: 164,
                color: Colors.white70,
              ),
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

  Widget _buildAuthForm() {
    return AutofillGroup(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (!signIn) ...[
            TextField(
              controller: fullNameController,
              enabled: !loading,
              autofillHints: const [AutofillHints.name],
              maxLength: 32,
              decoration: const InputDecoration(
                labelText: 'Full name',
                prefixIcon: Icon(Icons.badge_outlined),
                counterText: '',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: usernameController,
              enabled: !loading,
              autofillHints: const [AutofillHints.newUsername],
              maxLength: 24,
              textCapitalization: TextCapitalization.none,
              decoration: const InputDecoration(
                labelText: 'Username',
                prefixIcon: Icon(Icons.alternate_email_rounded),
                counterText: '',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: emailController,
              enabled: !loading,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              decoration: const InputDecoration(
                labelText: 'Email address',
                prefixIcon: Icon(Icons.email_outlined),
              ),
            ),
            const SizedBox(height: 12),
          ] else
            TextField(
              controller: usernameController,
              enabled: !loading,
              autofillHints: const [AutofillHints.username],
              decoration: const InputDecoration(
                labelText: 'Email or username',
                prefixIcon: Icon(Icons.person_outline_rounded),
              ),
            ),
          if (signIn) const SizedBox(height: 12),
          TextField(
            controller: passwordController,
            enabled: !loading,
            obscureText: !showPassword,
            autofillHints: [
              signIn ? AutofillHints.password : AutofillHints.newPassword,
            ],
            decoration: InputDecoration(
              labelText: 'Password',
              prefixIcon: const Icon(Icons.lock_outline_rounded),
              suffixIcon: IconButton(
                onPressed: loading
                    ? null
                    : () => setState(() => showPassword = !showPassword),
                icon: Icon(
                  showPassword
                      ? Icons.visibility_off_outlined
                      : Icons.visibility_outlined,
                ),
              ),
            ),
          ),
          if (!signIn) ...[
            const SizedBox(height: 12),
            TextField(
              controller: confirmPasswordController,
              enabled: !loading,
              obscureText: !showConfirmPassword,
              autofillHints: const [AutofillHints.newPassword],
              decoration: InputDecoration(
                labelText: 'Confirm password',
                prefixIcon: const Icon(Icons.lock_reset_rounded),
                suffixIcon: IconButton(
                  onPressed: loading
                      ? null
                      : () => setState(
                            () => showConfirmPassword = !showConfirmPassword,
                          ),
                  icon: Icon(
                    showConfirmPassword
                        ? Icons.visibility_off_outlined
                        : Icons.visibility_outlined,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 7),
            const Text(
              'Passwords require at least 8 characters with at least one letter and one number.',
              style: TextStyle(color: SyncColors.slate500, fontSize: 12),
            ),
          ],
          if (signIn) ...[
            const SizedBox(height: 4),
            InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: loading
                  ? null
                  : () => setState(
                        () => rememberUsername = !rememberUsername,
                      ),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    Checkbox(
                      value: rememberUsername,
                      onChanged: loading
                          ? null
                          : (value) => setState(
                                () => rememberUsername = value ?? false,
                              ),
                    ),
                    const SizedBox(width: 2),
                    const Expanded(
                      child: Text(
                        'Remember username',
                        style: TextStyle(fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: loading
                    ? null
                    : () => setState(() {
                          mode = 'forgot';
                          _clearStatus();
                        }),
                child: const Text('Forgot password?'),
              ),
            ),
          ] else
            const SizedBox(height: 14),
          _PrimaryButton(
            label: loading
                ? 'Please wait…'
                : signIn
                    ? 'Sign in'
                    : 'Create account',
            icon: signIn ? Icons.login_rounded : Icons.person_add_alt_1_rounded,
            onPressed: loading ? null : _submitAuth,
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: loading
                ? null
                : () => _setNotice(
                      'Google sign-in will use the server social-auth configuration.',
                    ),
            icon: const Icon(Icons.g_mobiledata_rounded, size: 30),
            label: const Text('Continue with Google'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: loading
                ? null
                : () => _setNotice(
                      'Facebook sign-in will use the server social-auth configuration.',
                    ),
            icon: const Icon(Icons.facebook_rounded),
            label: const Text('Continue with Facebook'),
          ),
          const SizedBox(height: 10),
          TextButton.icon(
            onPressed: loading
                ? null
                : () => setState(() {
                      mode = 'link';
                      _clearStatus();
                    }),
            icon: const Icon(Icons.devices_other_rounded),
            label: const Text('Link a device with QR or code'),
          ),
        ],
      ),
    );
  }

  Future<void> _submitAuth() async {
    _clearStatus();
    if (!signIn) {
      final fullName = fullNameController.text.trim();
      final username = usernameController.text.trim().toLowerCase();
      final email = emailController.text.trim();
      final password = passwordController.text;
      final confirm = confirmPasswordController.text;

      if (fullName.length < 3 || fullName.length > 32) {
        _setError('Full name must be between 3 and 32 characters.');
        return;
      }
      if (!RegExp(r'^[a-z0-9_]{3,24}$').hasMatch(username)) {
        _setError(
          'Username must use 3-24 lowercase letters, numbers or underscore.',
        );
        return;
      }
      if (email.isEmpty || !email.contains('@')) {
        _setError('Enter a valid email address.');
        return;
      }
      if (!_validPassword(password)) {
        _setError(
          'Password must be at least 8 characters with a letter and a number.',
        );
        return;
      }
      if (password != confirm) {
        _setError("Password and confirm password don't match.");
        return;
      }

      await _guarded(() async {
        final result = await widget.authRepository.register(
          fullName: fullName,
          username: username,
          email: email,
          password: password,
        );
        _setNotice(result.message);
        await widget.onAuthenticated(context);
      });
      return;
    }

    final username = usernameController.text.trim();
    final password = passwordController.text;
    if (username.isEmpty || password.isEmpty) {
      _setError('Username and password are required.');
      return;
    }

    await _guarded(() async {
      final result = await widget.authRepository.login(
        username: username,
        password: password,
        rememberUsername: rememberUsername,
      );
      if (result.requiresTwoFactor) {
        if (!mounted) return;
        setState(() {
          twoFactorRequired = true;
          twoFactorTempToken = result.tempToken ?? '';
          notice = result.message;
          error = null;
        });
        return;
      }
      _setNotice(result.message);
      await widget.onAuthenticated(context);
    });
  }

  Future<void> _submitTwoFactor() async {
    final code = twoFactorController.text.trim();
    if (useRecoveryCode) {
      if (!RegExp(r'^[A-Z0-9]{4}-[A-Z0-9]{4}$')
          .hasMatch(code.toUpperCase())) {
        _setError('Enter a recovery code in ABCD-EFGH format.');
        return;
      }
    } else if (!RegExp(r'^\d{6}$').hasMatch(code)) {
      _setError('Enter the 6-digit authenticator code.');
      return;
    }

    await _guarded(() async {
      final result = await widget.authRepository.verifyTwoFactor(
        tempToken: twoFactorTempToken,
        code: code,
        recoveryCode: useRecoveryCode,
        rememberedUsername:
            rememberUsername ? usernameController.text.trim() : null,
      );
      _setNotice(result.message);
      await widget.onAuthenticated(context);
    });
  }

  Future<void> _submitRecovery() async {
    if (recoveryStep == 1) {
      final email = recoveryEmailController.text.trim();
      if (email.isEmpty || !email.contains('@')) {
        _setError('Enter the account email address.');
        return;
      }
      await _guarded(() async {
        final message =
            await widget.authRepository.requestPasswordReset(email);
        if (!mounted) return;
        setState(() {
          recoveryStep = 2;
          notice = message;
          error = null;
        });
      });
      return;
    }

    if (recoveryStep == 2) {
      final otp = _formatSixDigits(recoveryOtpController.text);
      if (!RegExp(r'^\d{6}$').hasMatch(otp)) {
        _setError('Enter the 6-digit verification code.');
        return;
      }
      await _guarded(() async {
        final challenge =
            await widget.authRepository.verifyPasswordResetCode(
          email: recoveryEmailController.text.trim(),
          otp: otp,
        );
        if (!mounted) return;
        setState(() {
          passwordResetToken = challenge.resetToken;
          recoveryStep = 3;
          notice = challenge.message;
          error = null;
        });
      });
      return;
    }

    final password = recoveryPasswordController.text;
    final confirm = recoveryConfirmController.text;
    if (!_validPassword(password)) {
      _setError(
        'Password must be at least 8 characters with a letter and a number.',
      );
      return;
    }
    if (password != confirm) {
      _setError("Password and confirm password don't match.");
      return;
    }

    await _guarded(() async {
      final message = await widget.authRepository.resetPassword(
        email: recoveryEmailController.text.trim(),
        resetToken: passwordResetToken,
        newPassword: password,
        confirmNewPassword: confirm,
      );
      if (!mounted) return;
      _resetRecovery();
      setState(() {
        mode = 'auth';
        signIn = true;
        notice = message;
        error = null;
      });
    });
  }

  Future<void> _guarded(Future<void> Function() action) async {
    if (loading) return;
    setState(() => loading = true);
    try {
      await action();
    } on ApiException catch (apiError) {
      _setError(apiError.message);
    } on Exception catch (_) {
      _setError('Unable to connect to server. Please try again.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  bool _validPassword(String value) =>
      value.length >= 8 &&
      value.length <= 128 &&
      RegExp(r'[A-Za-z]').hasMatch(value) &&
      RegExp(r'\d').hasMatch(value);

  String _formatSixDigits(String value) {
    final digits = value.replaceAll(RegExp(r'\D'), '');
    return digits.length > 6 ? digits.substring(0, 6) : digits;
  }

  String _formatRecoveryCode(String value) {
    final raw = value.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
    final clipped = raw.length > 8 ? raw.substring(0, 8) : raw;
    if (clipped.length <= 4) return clipped;
    return '${clipped.substring(0, 4)}-${clipped.substring(4)}';
  }

  void _backToLogin() {
    setState(() {
      mode = 'auth';
      signIn = true;
      twoFactorRequired = false;
      twoFactorTempToken = '';
      useRecoveryCode = false;
      _resetRecovery();
      _clearStatus();
    });
  }

  void _resetRecovery() {
    recoveryStep = 1;
    passwordResetToken = '';
    recoveryOtpController.clear();
    recoveryPasswordController.clear();
    recoveryConfirmController.clear();
  }

  void _clearStatus() {
    error = null;
    notice = null;
  }

  void _setError(String message) {
    if (!mounted) return;
    setState(() {
      error = message;
      notice = null;
    });
  }

  void _setNotice(String message) {
    if (!mounted) return;
    setState(() {
      notice = message;
      error = null;
    });
  }
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton({
    required this.label,
    this.icon,
    this.onPressed,
  });

  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return FilledButton.icon(
      onPressed: onPressed,
      icon: Icon(icon ?? Icons.arrow_forward_rounded),
      label: Padding(
        padding: const EdgeInsets.symmetric(vertical: 13),
        child: Text(
          label,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
    );
  }
}

class _RecoveryStep extends StatelessWidget {
  const _RecoveryStep({required this.number, required this.active});

  final int number;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 24,
      height: 24,
      decoration: BoxDecoration(
        color: active ? SyncColors.sky600 : SyncColors.slate200,
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Text(
        '$number',
        style: TextStyle(
          color: active ? Colors.white : SyncColors.slate500,
          fontSize: 11,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.message, this.error = false});

  final String message;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final tone = error ? SyncColors.danger : SyncColors.success;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: .1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: tone.withValues(alpha: .22)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            error
                ? Icons.error_outline_rounded
                : Icons.check_circle_outline_rounded,
            color: tone,
            size: 19,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: error
                    ? const Color(0xFF991B1B)
                    : const Color(0xFF166534),
                fontSize: 13,
                height: 1.35,
              ),
            ),
          ),
        ],
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
              color: color.withValues(alpha: .28),
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
  const _AuthTab({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback? onTap;

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
