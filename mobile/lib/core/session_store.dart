import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class SessionStore {
  Future<String?> readAccessToken();
  Future<void> writeAccessToken(String token);
  Future<String?> readRefreshToken();
  Future<void> writeRefreshToken(String? token);
  Future<String?> readRememberedUsername();
  Future<void> writeRememberedUsername(String? username);
  Future<void> clearSession();
}

class SecureSessionStore implements SessionStore {
  SecureSessionStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _tokenKey = 'syncchat.access_token';
  static const _refreshTokenKey = 'syncchat.refresh_token';
  static const _rememberedUsernameKey = 'syncchat.remembered_username';

  final FlutterSecureStorage _storage;

  @override
  Future<String?> readAccessToken() async {
    final value = await _storage.read(key: _tokenKey);
    final token = value?.trim() ?? '';
    return token.isEmpty ? null : token;
  }

  @override
  Future<void> writeAccessToken(String token) async {
    final normalized = token.trim();
    if (normalized.isEmpty) {
      throw ArgumentError.value(
        token,
        'token',
        'Access token cannot be empty.',
      );
    }
    await _storage.write(key: _tokenKey, value: normalized);
  }

  @override
  Future<String?> readRefreshToken() async {
    final value = await _storage.read(key: _refreshTokenKey);
    final token = value?.trim() ?? '';
    return token.isEmpty ? null : token;
  }

  @override
  Future<void> writeRefreshToken(String? token) async {
    final normalized = token?.trim() ?? '';
    if (normalized.isEmpty) {
      await _storage.delete(key: _refreshTokenKey);
      return;
    }
    await _storage.write(key: _refreshTokenKey, value: normalized);
  }

  @override
  Future<String?> readRememberedUsername() async {
    final value = await _storage.read(key: _rememberedUsernameKey);
    final username = value?.trim() ?? '';
    return username.isEmpty ? null : username;
  }

  @override
  Future<void> writeRememberedUsername(String? username) async {
    final value = username?.trim() ?? '';
    if (value.isEmpty) {
      await _storage.delete(key: _rememberedUsernameKey);
      return;
    }
    await _storage.write(key: _rememberedUsernameKey, value: value);
  }

  @override
  Future<void> clearSession() async {
    await Future.wait<void>([
      _storage.delete(key: _tokenKey),
      _storage.delete(key: _refreshTokenKey),
    ]);
  }
}

class MemorySessionStore implements SessionStore {
  String? accessToken;
  String? refreshToken;
  String? rememberedUsername;

  @override
  Future<void> clearSession() async {
    accessToken = null;
    refreshToken = null;
  }

  @override
  Future<String?> readAccessToken() async => accessToken;

  @override
  Future<String?> readRefreshToken() async => refreshToken;

  @override
  Future<String?> readRememberedUsername() async => rememberedUsername;

  @override
  Future<void> writeAccessToken(String token) async {
    accessToken = token.trim();
  }

  @override
  Future<void> writeRefreshToken(String? token) async {
    refreshToken = token?.trim();
  }

  @override
  Future<void> writeRememberedUsername(String? username) async {
    rememberedUsername = username?.trim();
  }
}
