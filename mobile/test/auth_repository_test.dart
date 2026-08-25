import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:syncchat_mobile/core/api_client.dart';
import 'package:syncchat_mobile/core/app_config.dart';
import 'package:syncchat_mobile/core/auth_repository.dart';
import 'package:syncchat_mobile/core/session_store.dart';

void main() {
  const config = SyncChatConfig(
    apiBaseUrl: 'https://api.example.test/api',
    socketUrl: 'https://api.example.test',
  );

  test('login stores access token and matches web request shape', () async {
    final store = MemorySessionStore();
    final client = MockClient((request) async {
      expect(request.method, 'POST');
      expect(request.url.toString(), 'https://api.example.test/api/users/login');
      expect(request.headers['authorization'], isNull);
      expect(
        jsonDecode(request.body),
        <String, dynamic>{
          'username': 'atia',
          'password': 'secret123',
          'me': true,
        },
      );
      return http.Response(
        jsonEncode({
          'code': 200,
          'success': true,
          'message': 'Signed in',
          'payload': {'token': 'access-token'},
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = ApiClient(config: config, sessionStore: store, httpClient: client);
    final auth = AuthRepository(api: api, sessionStore: store);

    final result = await auth.login(
      username: 'atia',
      password: 'secret123',
      rememberUsername: true,
    );

    expect(result.requiresTwoFactor, isFalse);
    expect(await store.readAccessToken(), 'access-token');
    expect(await store.readRememberedUsername(), 'atia');
  });

  test('login preserves two-factor challenge without storing access token', () async {
    final store = MemorySessionStore();
    final client = MockClient((request) async {
      return http.Response(
        jsonEncode({
          'code': 200,
          'success': true,
          'message': 'Enter your Google Authenticator code to continue.',
          'payload': {
            'requiresTwoFactor': true,
            'tempToken': 'temporary-2fa-token',
          },
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = ApiClient(config: config, sessionStore: store, httpClient: client);
    final auth = AuthRepository(api: api, sessionStore: store);

    final result = await auth.login(username: 'atia', password: 'secret123');

    expect(result.requiresTwoFactor, isTrue);
    expect(result.tempToken, 'temporary-2fa-token');
    expect(await store.readAccessToken(), isNull);
  });

  test('authenticated API request sends bearer token', () async {
    final store = MemorySessionStore()..accessToken = 'access-token';
    final client = MockClient((request) async {
      expect(request.headers['authorization'], 'Bearer access-token');
      return http.Response(
        jsonEncode({
          'code': 200,
          'success': true,
          'message': null,
          'payload': {'_id': 'user-1'},
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = ApiClient(config: config, sessionStore: store, httpClient: client);
    final auth = AuthRepository(api: api, sessionStore: store);

    final user = await auth.currentUser();
    expect(user['_id'], 'user-1');
  });

  test('API surfaces backend error message', () async {
    final store = MemorySessionStore();
    final client = MockClient((request) async {
      return http.Response(
        jsonEncode({
          'code': 401,
          'success': false,
          'message': 'Invalid credentials',
          'payload': null,
        }),
        401,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = ApiClient(config: config, sessionStore: store, httpClient: client);
    final auth = AuthRepository(api: api, sessionStore: store);

    expect(
      () => auth.login(username: 'atia', password: 'wrong-pass'),
      throwsA(
        isA<ApiException>()
            .having((error) => error.statusCode, 'statusCode', 401)
            .having((error) => error.message, 'message', 'Invalid credentials'),
      ),
    );
  });
}
