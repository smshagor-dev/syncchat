import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/auth_repository.dart';
import '../theme.dart';

enum _AuthMode { signIn, signUp, forgot }
enum _ResetStage { email, code, password }

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
  final _formKey = GlobalKey<FormState>();
  final _username = TextEditingController();
  final _fullName = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirmPassword = TextEditingController();
  final _otp = TextEditingController();

  _AuthMode mode = _AuthMode.signIn;
  _ResetStage resetStage = _ResetStage.email;
  bool busy = false;
  bool obscurePassword = true;
  bool obscureConfirmPassword = true;
  bool rememberUsername = true;
  bool recoveryCode = false;
  String? error;
  String? notice;
  String? tempToken;
  String? resetToken;

  @override
  void dispose() {
    _username.dispose();
    _fullName.dispose();
    _email.dispose();
    _password.dispose();
    _confirmPassword.dispose();
    _otp.dispose();
    super.dispose();
  }

  void _setMode(_AuthMode next) {
    setState(() {
      mode = next;
      error = null;
      notice = null;
      tempToken = null;
      resetToken = null;
      resetStage = _ResetStage.email;
      _otp.clear();
      _password.clear();
      _confirmPassword.clear();
    });
  }

  Future<void> _submit() async {
    if (busy) return;
    if (tempToken != null) {
      await _verifyTwoFactor();
      return;
    }
    if (mode == _AuthMode.forgot) {
      await _submitForgot();
      return;
    }
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() {
      busy = true;
      error = null;
      notice = null;
    });
    try {
      final AuthResult result;
      if (mode == _AuthMode.signUp) {
        if (_password.text != _confirmPassword.text) {
          throw const ApiException(statusCode: 400, message: 'Passwords do not match.');
        }
        result = await widget.authRepository.register(
          fullName: _fullName.text,
          username: _username.text,
          email: _email.text,
          password: _password.text,
        );
      } else {
        result = await widget.authRepository.login(
          username: _username.text,
          password: _password.text,
          rememberUsername: rememberUsername,
        );
      }

      if (!mounted) return;
      if (result.requiresTwoFactor) {
        setState(() {
          busy = false;
          tempToken = result.tempToken;
          notice = result.message;
          _otp.clear();
        });
        return;
      }
      setState(() => busy = false);
      await widget.onAuthenticated(context);
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        busy = false;
        error = _errorText(failure);
      });
    }
  }

  Future<void> _verifyTwoFactor() async {
    final challenge = tempToken;
    if (challenge == null || _otp.text.trim().isEmpty || busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.authRepository.verifyTwoFactor(
        tempToken: challenge,
        code: _otp.text,
        recoveryCode: recoveryCode,
        rememberedUsername: rememberUsername ? _username.text.trim() : null,
      );
      if (!mounted) return;
      setState(() => busy = false);
      await widget.onAuthenticated(context);
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        busy = false;
        error = _errorText(failure);
      });
    }
  }

  Future<void> _submitForgot() async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
      notice = null;
    });
    try {
      if (resetStage == _ResetStage.email) {
        if (_email.text.trim().isEmpty) {
          throw const ApiException(statusCode: 400, message: 'Email is required.');
        }
        final message = await widget.authRepository.requestPasswordReset(_email.text);
        if (!mounted) return;
        setState(() {
          resetStage = _ResetStage.code;
          notice = message;
        });
      } else if (resetStage == _ResetStage.code) {
        final challenge = await widget.authRepository.verifyPasswordResetCode(
          email: _email.text,
          otp: _otp.text,
        );
        if (!mounted) return;
        setState(() {
          resetToken = challenge.resetToken;
          resetStage = _ResetStage.password;
          notice = challenge.message;
          _password.clear();
          _confirmPassword.clear();
        });
      } else {
        if (_password.text.length < 8) {
          throw const ApiException(statusCode: 400, message: 'Use at least 8 characters.');
        }
        if (_password.text != _confirmPassword.text) {
          throw const ApiException(statusCode: 400, message: 'Passwords do not match.');
        }
        final message = await widget.authRepository.resetPassword(
          email: _email.text,
          resetToken: resetToken ?? '',
          newPassword: _password.text,
          confirmNewPassword: _confirmPassword.text,
        );
        if (!mounted) return;
        setState(() {
          busy = false;
          mode = _AuthMode.signIn;
          resetStage = _ResetStage.email;
          resetToken = null;
          _otp.clear();
          _password.clear();
          _confirmPassword.clear();
          notice = message;
        });
        return;
      }
      if (mounted) setState(() => busy = false);
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        busy = false;
        error = _errorText(failure);
      });
    }
  }

  String _errorText(Object failure) {
    if (failure is ApiException) return failure.message;
    return failure.toString().replaceFirst('Exception: ', '');
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final background = dark ? const Color(0xFF071018) : const Color(0xFFF7FAFC);
    final foreground = dark ? Colors.white : const Color(0xFF0F172A);
    final muted = dark ? const Color(0xFF94A3B8) : const Color(0xFF64748B);

    return Scaffold(
      resizeToAvoidBottomInset: true,
      backgroundColor: background,
      body: DecoratedBox(
        decoration: BoxDecoration(
          color: background,
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: dark
                ? const [Color(0xFF071018), Color(0xFF0A2430), Color(0xFF071018)]
                : const [Color(0xFFF7FAFC), Color(0xFFEAF8FD), Color(0xFFF7FAFC)],
          ),
        ),
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) => SingleChildScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: EdgeInsets.only(
                left: 24,
                right: 24,
                top: constraints.maxHeight < 720 ? 28 : 54,
                bottom: 28,
              ),
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight - 82),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 50,
                            height: 50,
                            decoration: BoxDecoration(
                              color: SyncColors.sky,
                              borderRadius: BorderRadius.circular(15),
                            ),
                            child: const Icon(Icons.forum_rounded, color: Colors.white, size: 29),
                          ),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('SyncChat', style: TextStyle(color: foreground, fontSize: 27, fontWeight: FontWeight.w900, letterSpacing: -.6)),
                              Text('Private. Fast. Connected.', style: TextStyle(color: muted, fontSize: 12, fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ],
                      ),
                      SizedBox(height: constraints.maxHeight < 720 ? 32 : 56),
                      Text(_title(), style: TextStyle(color: foreground, fontSize: 32, height: 1.08, fontWeight: FontWeight.w900, letterSpacing: -1)),
                      const SizedBox(height: 9),
                      Text(_subtitle(), style: TextStyle(color: muted, fontSize: 15, height: 1.45)),
                      const SizedBox(height: 28),
                      if (mode != _AuthMode.forgot && tempToken == null) _modeSelector(foreground, muted),
                      if (mode != _AuthMode.forgot && tempToken == null) const SizedBox(height: 24),
                      if (error != null) _messageBox(error!, danger: true),
                      if (notice != null) _messageBox(notice!, danger: false),
                      if (tempToken != null) ..._twoFactorFields(),
                      if (tempToken == null && mode == _AuthMode.signIn) ..._signInFields(),
                      if (tempToken == null && mode == _AuthMode.signUp) ..._signUpFields(),
                      if (tempToken == null && mode == _AuthMode.forgot) ..._forgotFields(),
                      const SizedBox(height: 20),
                      SizedBox(
                        height: 54,
                        child: FilledButton(
                          onPressed: busy ? null : _submit,
                          style: FilledButton.styleFrom(
                            backgroundColor: SyncColors.sky,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
                          ),
                          child: busy
                              ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                              : Text(_buttonLabel(), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
                        ),
                      ),
                      const SizedBox(height: 16),
                      if (mode == _AuthMode.signIn && tempToken == null)
                        TextButton(onPressed: () => _setMode(_AuthMode.forgot), child: const Text('Forgot your password?')),
                      if (mode == _AuthMode.forgot)
                        TextButton(onPressed: () => _setMode(_AuthMode.signIn), child: const Text('Back to sign in')),
                      if (tempToken != null)
                        TextButton(
                          onPressed: () => setState(() {
                            tempToken = null;
                            _otp.clear();
                            recoveryCode = false;
                          }),
                          child: const Text('Back to sign in'),
                        ),
                      const Spacer(),
                      const SizedBox(height: 24),
                      Text('By continuing, you agree to SyncChat Terms and Privacy Policy.', textAlign: TextAlign.center, style: TextStyle(color: muted, fontSize: 11.5, height: 1.4)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _modeSelector(Color foreground, Color muted) {
    return Container(
      height: 48,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Theme.of(context).brightness == Brightness.dark ? Colors.white.withValues(alpha: .06) : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Theme.of(context).brightness == Brightness.dark ? Colors.white.withValues(alpha: .08) : const Color(0xFFE2E8F0)),
      ),
      child: Row(
        children: [
          Expanded(child: _modeButton('Sign in', _AuthMode.signIn, foreground, muted)),
          Expanded(child: _modeButton('Create account', _AuthMode.signUp, foreground, muted)),
        ],
      ),
    );
  }

  Widget _modeButton(String label, _AuthMode value, Color foreground, Color muted) {
    final selected = mode == value;
    return InkWell(
      borderRadius: BorderRadius.circular(11),
      onTap: busy ? null : () => _setMode(value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? SyncColors.sky : Colors.transparent,
          borderRadius: BorderRadius.circular(11),
        ),
        child: Text(label, style: TextStyle(color: selected ? Colors.white : muted, fontWeight: FontWeight.w800, fontSize: 13)),
      ),
    );
  }

  List<Widget> _signInFields() => [
    _field(_username, 'Username or email', Icons.person_outline_rounded, validator: _required),
    const SizedBox(height: 14),
    _field(_password, 'Password', Icons.lock_outline_rounded, obscure: obscurePassword, trailing: IconButton(onPressed: () => setState(() => obscurePassword = !obscurePassword), icon: Icon(obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined)), validator: _required),
    const SizedBox(height: 9),
    CheckboxListTile(
      contentPadding: EdgeInsets.zero,
      controlAffinity: ListTileControlAffinity.leading,
      dense: true,
      value: rememberUsername,
      onChanged: (value) => setState(() => rememberUsername = value == true),
      title: const Text('Remember me', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
    ),
  ];

  List<Widget> _signUpFields() => [
    _field(_fullName, 'Full name', Icons.badge_outlined, validator: _required),
    const SizedBox(height: 13),
    _field(_username, 'Username', Icons.alternate_email_rounded, validator: _required),
    const SizedBox(height: 13),
    _field(_email, 'Email address', Icons.mail_outline_rounded, keyboardType: TextInputType.emailAddress, validator: _emailValidator),
    const SizedBox(height: 13),
    _field(_password, 'Password', Icons.lock_outline_rounded, obscure: obscurePassword, trailing: IconButton(onPressed: () => setState(() => obscurePassword = !obscurePassword), icon: Icon(obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined)), validator: _passwordValidator),
    const SizedBox(height: 13),
    _field(_confirmPassword, 'Confirm password', Icons.lock_reset_rounded, obscure: obscureConfirmPassword, trailing: IconButton(onPressed: () => setState(() => obscureConfirmPassword = !obscureConfirmPassword), icon: Icon(obscureConfirmPassword ? Icons.visibility_outlined : Icons.visibility_off_outlined)), validator: _required),
  ];

  List<Widget> _twoFactorFields() => [
    _field(_otp, recoveryCode ? 'Recovery code' : '6-digit authenticator code', Icons.verified_user_outlined, keyboardType: recoveryCode ? TextInputType.text : TextInputType.number, validator: _required),
    const SizedBox(height: 8),
    SwitchListTile(
      contentPadding: EdgeInsets.zero,
      value: recoveryCode,
      onChanged: (value) => setState(() {
        recoveryCode = value;
        _otp.clear();
      }),
      title: const Text('Use a recovery code', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
    ),
  ];

  List<Widget> _forgotFields() {
    if (resetStage == _ResetStage.email) {
      return [_field(_email, 'Email address', Icons.mail_outline_rounded, keyboardType: TextInputType.emailAddress, validator: _emailValidator)];
    }
    if (resetStage == _ResetStage.code) {
      return [
        _field(_otp, 'Verification code', Icons.pin_outlined, keyboardType: TextInputType.number, validator: _required),
        const SizedBox(height: 10),
        Text('Code sent to ${_email.text.trim()}', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 12)),
      ];
    }
    return [
      _field(_password, 'New password', Icons.lock_outline_rounded, obscure: obscurePassword, trailing: IconButton(onPressed: () => setState(() => obscurePassword = !obscurePassword), icon: Icon(obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined)), validator: _passwordValidator),
      const SizedBox(height: 13),
      _field(_confirmPassword, 'Confirm new password', Icons.lock_reset_rounded, obscure: obscureConfirmPassword, trailing: IconButton(onPressed: () => setState(() => obscureConfirmPassword = !obscureConfirmPassword), icon: Icon(obscureConfirmPassword ? Icons.visibility_outlined : Icons.visibility_off_outlined)), validator: _required),
    ];
  }

  Widget _field(
    TextEditingController controller,
    String label,
    IconData icon, {
    bool obscure = false,
    TextInputType? keyboardType,
    Widget? trailing,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboardType,
      textInputAction: TextInputAction.next,
      validator: validator,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
        suffixIcon: trailing,
        filled: true,
        fillColor: Theme.of(context).brightness == Brightness.dark ? Colors.white.withValues(alpha: .055) : Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(15), borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(15), borderSide: BorderSide(color: Theme.of(context).brightness == Brightness.dark ? Colors.white.withValues(alpha: .08) : const Color(0xFFDDE5ED))),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(15), borderSide: const BorderSide(color: SyncColors.sky, width: 1.6)),
      ),
    );
  }

  Widget _messageBox(String message, {required bool danger}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: (danger ? Colors.red : Colors.green).withValues(alpha: .09),
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: (danger ? Colors.red : Colors.green).withValues(alpha: .22)),
      ),
      child: Text(message, style: TextStyle(color: danger ? Colors.red.shade400 : Colors.green.shade600, fontWeight: FontWeight.w700, fontSize: 13)),
    );
  }

  String _title() {
    if (tempToken != null) return 'Two-step verification';
    if (mode == _AuthMode.signUp) return 'Create your account';
    if (mode == _AuthMode.forgot) {
      if (resetStage == _ResetStage.code) return 'Check your email';
      if (resetStage == _ResetStage.password) return 'Set a new password';
      return 'Reset your password';
    }
    return 'Welcome back';
  }

  String _subtitle() {
    if (tempToken != null) return 'Enter your authenticator code or use one of your saved recovery codes.';
    if (mode == _AuthMode.signUp) return 'Create your SyncChat account and start secure conversations.';
    if (mode == _AuthMode.forgot) return 'We will verify your account before allowing a password change.';
    return 'Sign in to continue to your chats, calls, communities, and channels.';
  }

  String _buttonLabel() {
    if (tempToken != null) return 'Verify and continue';
    if (mode == _AuthMode.signUp) return 'Create account';
    if (mode == _AuthMode.forgot) {
      if (resetStage == _ResetStage.email) return 'Send verification code';
      if (resetStage == _ResetStage.code) return 'Verify code';
      return 'Reset password';
    }
    return 'Sign in';
  }

  String? _required(String? value) => (value?.trim().isEmpty ?? true) ? 'This field is required.' : null;

  String? _emailValidator(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return 'Email is required.';
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(text)) return 'Enter a valid email address.';
    return null;
  }

  String? _passwordValidator(String? value) {
    if ((value ?? '').length < 8) return 'Use at least 8 characters.';
    return null;
  }
}
