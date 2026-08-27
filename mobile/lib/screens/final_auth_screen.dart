import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/auth_repository.dart';
import '../core/public_app_config.dart';
import '../theme.dart';
import '../widgets/runtime_brand.dart';
import 'device_link_qr_screen.dart';

enum _Mode { signIn, signUp, forgot }

enum _Reset { email, code, password }

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
  final formKey = GlobalKey<FormState>();
  final username = TextEditingController();
  final fullName = TextEditingController();
  final email = TextEditingController();
  final password = TextEditingController();
  final confirm = TextEditingController();
  final otp = TextEditingController();

  _Mode mode = _Mode.signIn;
  _Reset reset = _Reset.email;
  bool busy = false;
  bool showPassword = false;
  bool showConfirm = false;
  bool remember = true;
  bool recovery = false;
  String? tempToken;
  String? resetToken;
  String? error;
  String? notice;

  @override
  void dispose() {
    username.dispose();
    fullName.dispose();
    email.dispose();
    password.dispose();
    confirm.dispose();
    otp.dispose();
    super.dispose();
  }

  void switchMode(_Mode value) {
    setState(() {
      mode = value;
      reset = _Reset.email;
      tempToken = null;
      resetToken = null;
      error = null;
      notice = null;
      otp.clear();
      password.clear();
      confirm.clear();
    });
  }

  Future<void> openQrLogin() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => DeviceLinkQrScreen(
          authRepository: widget.authRepository,
          onAuthenticated: widget.onAuthenticated,
        ),
      ),
    );
  }

  Future<void> submit() async {
    if (busy) return;
    if (tempToken != null) return verifyTwoFactor();
    if (mode == _Mode.forgot) return submitReset();
    if (!(formKey.currentState?.validate() ?? false)) return;

    setState(() {
      busy = true;
      error = null;
      notice = null;
    });
    try {
      AuthResult result;
      if (mode == _Mode.signUp) {
        if (password.text != confirm.text) {
          throw const ApiException(
            statusCode: 400,
            message: 'Passwords do not match.',
          );
        }
        result = await widget.authRepository.register(
          fullName: fullName.text,
          username: username.text,
          email: email.text,
          password: password.text,
        );
      } else {
        result = await widget.authRepository.login(
          username: username.text,
          password: password.text,
          rememberUsername: remember,
        );
      }

      if (!mounted) return;
      if (result.requiresTwoFactor) {
        setState(() {
          busy = false;
          tempToken = result.tempToken;
          notice = result.message;
          otp.clear();
        });
        return;
      }
      setState(() => busy = false);
      await widget.onAuthenticated(context);
    } on Object catch (failure) {
      fail(failure);
    }
  }

  Future<void> verifyTwoFactor() async {
    if (tempToken == null || otp.text.trim().isEmpty || busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.authRepository.verifyTwoFactor(
        tempToken: tempToken!,
        code: otp.text,
        recoveryCode: recovery,
        rememberedUsername: remember ? username.text.trim() : null,
      );
      if (!mounted) return;
      setState(() => busy = false);
      await widget.onAuthenticated(context);
    } on Object catch (failure) {
      fail(failure);
    }
  }

  Future<void> submitReset() async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
      notice = null;
    });
    try {
      if (reset == _Reset.email) {
        if (email.text.trim().isEmpty) {
          throw const ApiException(
            statusCode: 400,
            message: 'Email is required.',
          );
        }
        final message = await widget.authRepository.requestPasswordReset(
          email.text,
        );
        if (!mounted) return;
        setState(() {
          busy = false;
          reset = _Reset.code;
          notice = message;
        });
        return;
      }
      if (reset == _Reset.code) {
        final challenge = await widget.authRepository.verifyPasswordResetCode(
          email: email.text,
          otp: otp.text,
        );
        if (!mounted) return;
        setState(() {
          busy = false;
          reset = _Reset.password;
          resetToken = challenge.resetToken;
          notice = challenge.message;
          password.clear();
          confirm.clear();
        });
        return;
      }
      if (password.text.length < 8) {
        throw const ApiException(
          statusCode: 400,
          message: 'Use at least 8 characters.',
        );
      }
      if (password.text != confirm.text) {
        throw const ApiException(
          statusCode: 400,
          message: 'Passwords do not match.',
        );
      }
      final message = await widget.authRepository.resetPassword(
        email: email.text,
        resetToken: resetToken ?? '',
        newPassword: password.text,
        confirmNewPassword: confirm.text,
      );
      if (!mounted) return;
      setState(() {
        busy = false;
        mode = _Mode.signIn;
        reset = _Reset.email;
        resetToken = null;
        notice = message;
        otp.clear();
        password.clear();
        confirm.clear();
      });
    } on Object catch (failure) {
      fail(failure);
    }
  }

  void fail(Object failure) {
    if (!mounted) return;
    setState(() {
      busy = false;
      error = failure is ApiException
          ? failure.message
          : failure.toString().replaceFirst('Exception: ', '');
    });
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final ink = dark ? Colors.white : const Color(0xFF0F172A);
    final muted = dark ? const Color(0xFF94A3B8) : const Color(0xFF64748B);

    return Scaffold(
      resizeToAvoidBottomInset: true,
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: dark
                ? const [
                    Color(0xFF071018),
                    Color(0xFF0A2430),
                    Color(0xFF071018),
                  ]
                : const [
                    Color(0xFFF8FAFC),
                    Color(0xFFE8F7FD),
                    Color(0xFFF8FAFC),
                  ],
          ),
        ),
        child: SafeArea(
          child: SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(24, 34, 24, 32),
            child: Form(
              key: formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _brand(ink, muted),
                  const SizedBox(height: 46),
                  Text(
                    title,
                    style: TextStyle(
                      color: ink,
                      fontSize: 32,
                      height: 1.08,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -1,
                    ),
                  ),
                  const SizedBox(height: 9),
                  Text(
                    subtitle,
                    style: TextStyle(color: muted, fontSize: 15, height: 1.45),
                  ),
                  const SizedBox(height: 26),
                  if (mode != _Mode.forgot && tempToken == null) ...[
                    _tabs(muted),
                    const SizedBox(height: 22),
                  ],
                  if (error != null) _message(error!, true),
                  if (notice != null) _message(notice!, false),
                  ...fields,
                  const SizedBox(height: 20),
                  if (mode == _Mode.signIn && tempToken == null) ...[
                    SizedBox(
                      height: 52,
                      child: OutlinedButton.icon(
                        onPressed: busy ? null : openQrLogin,
                        icon: const Icon(Icons.qr_code_scanner_rounded),
                        label: const Text(
                          'Scan QR code to sign in',
                          style: TextStyle(fontWeight: FontWeight.w900),
                        ),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: SyncColors.sky600,
                          side: const BorderSide(
                            color: SyncColors.sky,
                            width: 1.4,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(15),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  SizedBox(
                    height: 54,
                    child: FilledButton(
                      onPressed: busy ? null : submit,
                      style: FilledButton.styleFrom(
                        backgroundColor: SyncColors.sky,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(15),
                        ),
                      ),
                      child: busy
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.3,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              buttonLabel,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (mode == _Mode.signIn && tempToken == null)
                    TextButton(
                      onPressed: () => switchMode(_Mode.forgot),
                      child: const Text('Forgot your password?'),
                    ),
                  if (mode == _Mode.forgot)
                    TextButton(
                      onPressed: () => switchMode(_Mode.signIn),
                      child: const Text('Back to sign in'),
                    ),
                  if (tempToken != null)
                    TextButton(
                      onPressed: () => setState(() {
                        tempToken = null;
                        recovery = false;
                        otp.clear();
                      }),
                      child: const Text('Back to sign in'),
                    ),
                  const SizedBox(height: 36),
                  Text(
                    'By continuing, you agree to ${context.publicAppConfig.appName} Terms and Privacy Policy.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: muted, fontSize: 11.5, height: 1.4),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _brand(Color ink, Color muted) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const RuntimeBrandLogo(size: 58, borderRadius: 15),
        const SizedBox(height: 10),
        Text(
          context.publicAppConfig.appName,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: ink,
            fontSize: 29,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          'Private. Fast. Connected.',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: muted,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    ),
  );

  Widget _tabs(Color muted) => Container(
    height: 48,
    padding: const EdgeInsets.all(4),
    decoration: BoxDecoration(
      color: Theme.of(context).brightness == Brightness.dark
          ? Colors.white.withValues(alpha: .055)
          : Colors.white,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(
        color: Theme.of(context).brightness == Brightness.dark
            ? Colors.white.withValues(alpha: .08)
            : const Color(0xFFE2E8F0),
      ),
    ),
    child: Row(
      children: [
        Expanded(child: _tab('Sign in', _Mode.signIn, muted)),
        Expanded(child: _tab('Create account', _Mode.signUp, muted)),
      ],
    ),
  );

  Widget _tab(String label, _Mode value, Color muted) {
    final selected = mode == value;
    return InkWell(
      borderRadius: BorderRadius.circular(11),
      onTap: busy ? null : () => switchMode(value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? SyncColors.sky : Colors.transparent,
          borderRadius: BorderRadius.circular(11),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? Colors.white : muted,
            fontSize: 13,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }

  List<Widget> get fields {
    if (tempToken != null) {
      return [
        field(
          otp,
          recovery ? 'Recovery code' : '6-digit authenticator code',
          Icons.verified_user_outlined,
          keyboardType: recovery ? TextInputType.text : TextInputType.number,
        ),
        const SizedBox(height: 8),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: recovery,
          onChanged: (value) => setState(() {
            recovery = value;
            otp.clear();
          }),
          title: const Text(
            'Use a recovery code',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
          ),
        ),
      ];
    }
    if (mode == _Mode.signUp) {
      return [
        field(fullName, 'Full name', Icons.badge_outlined),
        gap,
        field(username, 'Username', Icons.alternate_email_rounded),
        gap,
        field(
          email,
          'Email address',
          Icons.mail_outline_rounded,
          keyboardType: TextInputType.emailAddress,
          validator: emailValidator,
        ),
        gap,
        passwordField(password, 'Password', false),
        gap,
        passwordField(confirm, 'Confirm password', true),
      ];
    }
    if (mode == _Mode.forgot) {
      if (reset == _Reset.email) {
        return [
          field(
            email,
            'Email address',
            Icons.mail_outline_rounded,
            keyboardType: TextInputType.emailAddress,
            validator: emailValidator,
          ),
        ];
      }
      if (reset == _Reset.code) {
        return [
          field(
            otp,
            'Verification code',
            Icons.pin_outlined,
            keyboardType: TextInputType.number,
          ),
          const SizedBox(height: 10),
          Text(
            'Code sent to ${email.text.trim()}',
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              fontSize: 12,
            ),
          ),
        ];
      }
      return [
        passwordField(password, 'New password', false),
        gap,
        passwordField(confirm, 'Confirm new password', true),
      ];
    }
    return [
      field(username, 'Username or email', Icons.person_outline_rounded),
      gap,
      passwordField(password, 'Password', false),
      const SizedBox(height: 8),
      CheckboxListTile(
        contentPadding: EdgeInsets.zero,
        controlAffinity: ListTileControlAffinity.leading,
        dense: true,
        value: remember,
        onChanged: (value) => setState(() => remember = value == true),
        title: const Text(
          'Remember me',
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
        ),
      ),
    ];
  }

  Widget get gap => const SizedBox(height: 13);

  Widget passwordField(
    TextEditingController controller,
    String label,
    bool confirmation,
  ) {
    final visible = confirmation ? showConfirm : showPassword;
    return field(
      controller,
      label,
      confirmation ? Icons.lock_reset_rounded : Icons.lock_outline_rounded,
      obscure: !visible,
      validator: (value) =>
          (value ?? '').length < 8 ? 'Use at least 8 characters.' : null,
      suffix: IconButton(
        onPressed: () => setState(() {
          if (confirmation) {
            showConfirm = !showConfirm;
          } else {
            showPassword = !showPassword;
          }
        }),
        icon: Icon(
          visible ? Icons.visibility_off_outlined : Icons.visibility_outlined,
        ),
      ),
    );
  }

  Widget field(
    TextEditingController controller,
    String label,
    IconData icon, {
    bool obscure = false,
    TextInputType? keyboardType,
    Widget? suffix,
    String? Function(String?)? validator,
  }) => TextFormField(
    controller: controller,
    obscureText: obscure,
    keyboardType: keyboardType,
    validator: validator ?? requiredValidator,
    decoration: InputDecoration(
      labelText: label,
      prefixIcon: Icon(icon),
      suffixIcon: suffix,
      filled: true,
      fillColor: Theme.of(context).brightness == Brightness.dark
          ? Colors.white.withValues(alpha: .055)
          : Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(15),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(15),
        borderSide: BorderSide(
          color: Theme.of(context).brightness == Brightness.dark
              ? Colors.white.withValues(alpha: .08)
              : const Color(0xFFDDE5ED),
        ),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(15),
        borderSide: const BorderSide(color: SyncColors.sky, width: 1.6),
      ),
    ),
  );

  Widget _message(String text, bool danger) => Container(
    margin: const EdgeInsets.only(bottom: 15),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: (danger ? Colors.red : Colors.green).withValues(alpha: .09),
      borderRadius: BorderRadius.circular(13),
    ),
    child: Text(
      text,
      style: TextStyle(
        color: danger ? Colors.red.shade400 : Colors.green.shade600,
        fontWeight: FontWeight.w700,
        fontSize: 13,
      ),
    ),
  );

  String? requiredValidator(String? value) =>
      (value?.trim().isEmpty ?? true) ? 'This field is required.' : null;

  String? emailValidator(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return 'Email is required.';
    return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(text)
        ? null
        : 'Enter a valid email address.';
  }

  String get title {
    if (tempToken != null) return 'Two-step verification';
    if (mode == _Mode.signUp) return 'Create your account';
    if (mode == _Mode.forgot) {
      if (reset == _Reset.code) return 'Check your email';
      if (reset == _Reset.password) return 'Set a new password';
      return 'Reset your password';
    }
    return 'Welcome back';
  }

  String get subtitle {
    if (tempToken != null) {
      return 'Enter your authenticator code or a saved recovery code.';
    }
    if (mode == _Mode.signUp) {
      return 'Create your account and start secure conversations.';
    }
    if (mode == _Mode.forgot) {
      return 'Verify your account before changing your password.';
    }
    return 'Sign in with your password or securely link this device with a QR code.';
  }

  String get buttonLabel {
    if (tempToken != null) return 'Verify and continue';
    if (mode == _Mode.signUp) return 'Create account';
    if (mode == _Mode.forgot) {
      if (reset == _Reset.email) return 'Send verification code';
      if (reset == _Reset.code) return 'Verify code';
      return 'Reset password';
    }
    return 'Sign in';
  }
}
