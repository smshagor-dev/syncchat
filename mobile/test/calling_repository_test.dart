import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:syncchat_mobile/core/api_client.dart';
import 'package:syncchat_mobile/core/app_config.dart';
import 'package:syncchat_mobile/core/auth_repository.dart';
import 'package:syncchat_mobile/core/calling_repository.dart';
import 'package:syncchat_mobile/core/realtime_client.dart';
import 'package:syncchat_mobile/core/session_store.dart';

void main() {
  const config = SyncChatConfig(
    apiBaseUrl: 'https://api.example.test/api',
    socketUrl: 'https://api.example.test',
  );

  test('calling repository matches config, session, SFU and history contracts', () async {
    final store = MemorySessionStore()..accessToken = 'access-token';
    final requests = <String>[];
    final client = MockClient((request) async {
      expect(request.headers['authorization'], 'Bearer access-token');
      requests.add('${request.method} ${request.url.path}');

      dynamic payload;
      if (request.method == 'GET' && request.url.path.endsWith('/calling/config')) {
        payload = {
          'enabled': true,
          'audioEnabled': true,
          'videoEnabled': true,
          'groupEnabled': true,
          'maxGroupParticipants': 12,
          'ringingTimeoutSec': 45,
          'reconnectGraceSec': 12,
          'iceTransportPolicy': 'all',
          'iceServers': [
            {'urls': ['stun:stun.example.test:3478']},
          ],
          'audioProfile': {'echoCancellation': true},
          'videoProfile': {'width': 1280, 'height': 720},
          'groupSfu': {
            'enabled': true,
            'provider': 'livekit',
            'minParticipants': 3,
          },
        };
      } else if (request.method == 'GET' &&
          request.url.path.endsWith('/calling/session/call-1')) {
        payload = {
          'callId': 'call-1',
          'roomId': 'room-1',
          'roomType': 'group',
          'participantCount': 4,
          'mediaMode': 'sfu',
          'provider': 'livekit',
        };
      } else if (request.method == 'POST' &&
          request.url.path.endsWith('/calling/sfu-token')) {
        expect(jsonDecode(request.body), {'callId': 'call-1'});
        payload = {
          'url': 'wss://livekit.example.test',
          'token': 'livekit-token',
          'adaptiveStream': true,
          'dynacast': true,
        };
      } else if (request.method == 'GET' &&
          request.url.path.endsWith('/chats/calls')) {
        payload = [
          {
            '_id': 'chat-call-1',
            'roomId': 'room-1',
            'roomType': 'group',
            'text': 'Video call started',
          },
        ];
      } else {
        return http.Response('not found', 404);
      }

      return http.Response(
        jsonEncode({
          'code': 200,
          'success': true,
          'message': null,
          'payload': payload,
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    final api = ApiClient(config: config, sessionStore: store, httpClient: client);
    final auth = AuthRepository(api: api, sessionStore: store);
    final realtime = RealtimeClient(config: config, sessionStore: store);
    final repository = CallingRepository(api: api, auth: auth, realtime: realtime);

    final runtime = await repository.runtimeConfig(refresh: true);
    expect(runtime.enabled, isTrue);
    expect(runtime.maxGroupParticipants, 12);
    expect(runtime.iceServers, hasLength(1));
    expect(runtime.groupSfu['provider'], 'livekit');
    expect(runtime.allows(video: true, group: true, participants: 4), isTrue);

    final session = await repository.sessionMedia('call-1');
    expect(session['mediaMode'], 'sfu');

    final credentials = await repository.sfuCredentials('call-1');
    expect(credentials['url'], 'wss://livekit.example.test');
    expect(credentials['token'], 'livekit-token');

    final history = await repository.history();
    expect(history.single['text'], 'Video call started');

    expect(
      requests,
      containsAll(<String>[
        'GET /api/calling/config',
        'GET /api/calling/session/call-1',
        'POST /api/calling/sfu-token',
        'GET /api/chats/calls',
      ]),
    );

    await realtime.dispose();
  });
}
