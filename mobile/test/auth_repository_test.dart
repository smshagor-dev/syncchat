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

  test('login stores persistent access and refresh tokens', () async {
    final store = MemorySessionStore();
    final requests = <String>[];
    final client = MockClient((request) async {
      requests.add(request.url.path);
      if (request.url.path == '/api/users/login') {
        expect(request.method, 'POST');
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
      }
      if (request.url.path == '/api/users/session/persist') {
        expect(request.method, 'POST');
        expect(request.headers['authorization'], 'Bearer access-token');
        return http.Response(
          jsonEncode({
            'code': 200,
            'success': true,
            'payload': {
              'token': 'access-token-rotated',
              'refreshToken': 'refresh-token',
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      fail('Unexpected request: ${request.method} ${request.url}');
    });
    final api = ApiClient(config: config, sessionStore: store, httpClient: client);
    final auth = AuthRepository(api: api, sessionStore: store);

    final result = await auth.login(
      username: 'atia',
      password: 'secret123',
      rememberUsername: true,
    );

    expect(result.requiresTwoFactor, isFalse);
    expect(await store.readAccessToken(), 'access-token-rotated');
    expect(await store.readRefreshToken(), 'refresh-token');
    expect(await store.readRememberedUsername(), 'atia');
    expect(requests, ['/api/users/login', '/api/users/session/persist']);
  });

  test('expired access token refreshes once and retries request', () async {
    final store = MemorySessionStore()
      ..accessToken = 'expired-access'
      ..refreshToken = 'refresh-token';
    var userRequests = 0;
    var refreshRequests = 0;
    final client = MockClient((request) async {
      if (request.url.path == '/api/users') {
        userRequests += 1;
        if (userRequests == 1) {
          expect(request.headers['authorization'], 'Bearer expired-access');
          return http.Response(
            jsonEncode({
              'code': 401,
              'success': false,
              'message': 'jwt expired',
            }),
            401,
            headers: {'content-type': 'application/json'},
          );
        }
        expect(request.headers['authorization'], 'Bearer fresh-access');
        return http.Response(
          jsonEncode({
            'code': 200,
            'success': true,
            'payload': {'_id': 'user-1'},
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (request.url.path == '/api/users/session/refresh') {
        refreshRequests += 1;
        expect(request.headers['authorization'], isNull);
        expect(jsonDecode(request.body), {'refreshToken': 'refresh-token'});
        return http.Response(
          jsonEncode({
            'code': 200,
            'success': true,
            'payload': {
              'token': 'fresh-access',
              'refreshToken': 'fresh-refresh',
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      fail('Unexpected request: ${request.method} ${request.url}');
    });
    final api = ApiClient(config: config, sessionStore: store, httpClient: client);
    final auth = AuthRepository(api: api, sessionStore: store);

    final user = await auth.currentUser();

    expect(user['_id'], 'user-1');
    expect(userRequests, 2);
    expect(refreshRequests, 1);
    expect(await store.readAccessToken(), 'fresh-access');
    expect(await store.readRefreshToken(), 'fresh-refresh');
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
    expect(await store.readRefreshToken(), isNull);
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
