import 'api_client.dart';
import 'session_store.dart';

class AuthResult {
  const AuthResult._({
    required this.message,
    this.token,
    this.tempToken,
    this.requiresTwoFactor = false,
  });

  final String message;
  final String? token;
  final String? tempToken;
  final bool requiresTwoFactor;

  factory AuthResult.authenticated({
    required String token,
    required String message,
  }) =>
      AuthResult._(token: token, message: message);

  factory AuthResult.twoFactor({
    required String tempToken,
    required String message,
  }) =>
      AuthResult._(
        tempToken: tempToken,
        message: message,
        requiresTwoFactor: true,
      );
}

class PasswordResetChallenge {
  const PasswordResetChallenge({
    required this.resetToken,
    required this.message,
  });

  final String resetToken;
  final String message;
}

class AuthRepository {
  AuthRepository({
    required ApiClient api,
    required SessionStore sessionStore,
  })  : _api = api,
        _sessionStore = sessionStore;

  final ApiClient _api;
  final SessionStore _sessionStore;

  Future<AuthResult> login({
    required String username,
    required String password,
    bool rememberUsername = false,
  }) async {
    final normalizedUsername = username.trim();
    if (normalizedUsername.isEmpty || password.isEmpty) {
      throw const ApiException(
        statusCode: 400,
        message: 'Username and password are required.',
      );
    }

    final response = await _api.post(
      '/users/login',
      authenticated: false,
      body: {
        'username': normalizedUsername,
        'password': password,
        'me': rememberUsername,
      },
    );

    final payload = response.payload;
    if (payload is Map) {
      final map = Map<String, dynamic>.from(payload);
      if (map['requiresTwoFactor'] == true) {
        final tempToken = map['tempToken']?.toString().trim() ?? '';
        if (tempToken.isEmpty) {
          throw const ApiException(
            statusCode: 500,
            message: 'Two-factor login did not return a secure challenge token.',
          );
        }
        return AuthResult.twoFactor(
          tempToken: tempToken,
          message: response.message ?? 'Two-factor verification required.',
        );
      }
    }

    final token = _extractToken(payload);
    await _completeLogin(
      token: token,
      rememberedUsername: rememberUsername ? normalizedUsername : null,
    );
    return AuthResult.authenticated(
      token: token,
      message: response.message ?? 'Signed in.',
    );
  }

  Future<AuthResult> verifyTwoFactor({
    required String tempToken,
    required String code,
    bool recoveryCode = false,
    String? rememberedUsername,
  }) async {
    final response = await _api.post(
      '/users/login/2fa-verify',
      authenticated: false,
      body: {
        'tempToken': tempToken,
        if (recoveryCode) 'recoveryCode': code.trim() else 'code': code.trim(),
      },
    );

    final token = _extractToken(response.payload);
    await _completeLogin(
      token: token,
      rememberedUsername: rememberedUsername,
    );
    return AuthResult.authenticated(
      token: token,
      message: response.message ?? 'Signed in.',
    );
  }

  Future<AuthResult> register({
    required String fullName,
    required String username,
    required String email,
    required String password,
  }) async {
    final response = await _api.post(
      '/users/register',
      authenticated: false,
      body: {
        'fullname': fullName.trim(),
        'username': username.trim().toLowerCase(),
        'email': email.trim(),
        'password': password,
      },
    );

    final token = _extractToken(response.payload);
    await _completeLogin(token: token, rememberedUsername: username.trim());
    return AuthResult.authenticated(
      token: token,
      message: response.message ?? 'Account created.',
    );
  }

  Future<String> requestPasswordReset(String email) async {
    final response = await _api.post(
      '/users/forgot-pass/request',
      authenticated: false,
      body: {'email': email.trim()},
    );
    return response.message ?? 'Verification code sent.';
  }

  Future<PasswordResetChallenge> verifyPasswordResetCode({
    required String email,
    required String otp,
  }) async {
    final response = await _api.post(
      '/users/forgot-pass/verify',
      authenticated: false,
      body: {'email': email.trim(), 'otp': otp.trim()},
    );
    final payload = response.payload;
    final resetToken = payload is Map
        ? payload['resetToken']?.toString().trim() ?? ''
        : '';
    if (resetToken.isEmpty) {
      throw const ApiException(
        statusCode: 500,
        message: 'Secure reset session was not created.',
      );
    }
    return PasswordResetChallenge(
      resetToken: resetToken,
      message: response.message ?? 'Verification code accepted.',
    );
  }

  Future<String> resetPassword({
    required String email,
    required String resetToken,
    required String newPassword,
    required String confirmNewPassword,
  }) async {
    final response = await _api.post(
      '/users/forgot-pass/reset',
      authenticated: false,
      body: {
        'email': email.trim(),
        'resetToken': resetToken,
        'newPass': newPassword,
        'confirmNewPass': confirmNewPassword,
      },
    );
    return response.message ?? 'Password reset complete.';
  }

  Future<Map<String, dynamic>> currentUser() async {
    final response = await _api.get('/users');
    final payload = response.payload;
    if (payload is Map) return Map<String, dynamic>.from(payload);
    throw const ApiException(
      statusCode: 500,
      message: 'SyncChat user profile response was invalid.',
    );
  }

  Future<String> resendVerification() async {
    final response = await _api.post('/users/verify/resend');
    return response.message ?? 'Verification code sent.';
  }

  Future<String> verifyAccount(String otp) async {
    final response = await _api.post(
      '/users/verify',
      body: {'otp': otp.trim()},
    );
    return response.message ?? 'Account verified.';
  }

  Future<bool> hasSession() async =>
      (await _sessionStore.readAccessToken())?.isNotEmpty == true;

  Future<void> logoutLocal() => _sessionStore.clearSession();

  Future<void> _completeLogin({
    required String token,
    String? rememberedUsername,
  }) async {
    await _sessionStore.writeAccessToken(token);
    await _sessionStore.writeRememberedUsername(rememberedUsername);
  }

  String _extractToken(dynamic payload) {
    if (payload is String && payload.trim().isNotEmpty) return payload.trim();
    if (payload is Map) {
      final token = payload['token']?.toString().trim() ?? '';
      if (token.isNotEmpty) return token;
    }
    throw const ApiException(
      statusCode: 500,
      message: 'SyncChat did not return a valid access token.',
    );
  }
}
