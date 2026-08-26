import 'dart:convert';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:syncchat_mobile/core/e2ee_service.dart';

void main() {
  group('E2eeCrypto', () {
    test('generates a valid P-256 device key and stable fingerprint', () {
      final crypto = E2eeCrypto(random: Random(11));
      final record = crypto.generateDeviceKey(
        userId: '11111111-1111-4111-8111-111111111111',
        sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );

      expect(crypto.validates(record), isTrue);
      expect(record.publicJwk['kty'], 'EC');
      expect(record.publicJwk['crv'], 'P-256');
      expect(record.x, isNotEmpty);
      expect(record.y, isNotEmpty);
      expect(record.fingerprint, hasLength(64));
      expect(crypto.fingerprint(record.publicJwk), record.fingerprint);
    });

    test('encrypts once and decrypts on every target device', () {
      final crypto = E2eeCrypto(random: Random(23));
      final first = crypto.generateDeviceKey(
        userId: '11111111-1111-4111-8111-111111111111',
        sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
      final second = crypto.generateDeviceKey(
        userId: '22222222-2222-4222-8222-222222222222',
        sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      );
      const roomId = 'private-room-e2ee';
      const plaintext = 'hello encrypted world';
      final peers = [first, second]
          .map(
            (record) => <String, dynamic>{
              'userId': record.userId,
              'sessionId': record.sessionId,
              'fingerprint': record.fingerprint,
              'publicJwk': record.publicJwk,
            },
          )
          .toList(growable: false);

      final envelope = crypto.encryptText(
        text: plaintext,
        roomId: roomId,
        current: first,
        peerKeys: peers,
      );

      expect(envelope['version'], 1);
      expect(envelope['algorithm'], 'ECDH-P256+HKDF-SHA256+AES-256-GCM');
      expect(envelope['roomId'], roomId);
      expect((envelope['devices'] as List), hasLength(2));
      expect(envelope['ciphertext'].toString(), isNot(contains(plaintext)));

      // Web e2eeV2.js uses btoa/atob for envelope bytes, so these must be
      // standard Base64 rather than JWK-style Base64URL.
      expect(base64.decode(envelope['messageIv'].toString()), hasLength(12));
      expect(
        base64.decode(envelope['ciphertext'].toString()).length,
        greaterThan(16),
      );
      for (final raw in (envelope['devices'] as List).whereType<Map>()) {
        expect(base64.decode(raw['salt'].toString()), hasLength(16));
        expect(base64.decode(raw['wrapIv'].toString()), hasLength(12));
        expect(base64.decode(raw['wrappedKey'].toString()), hasLength(48));
      }

      expect(
        crypto.decryptText(envelope: envelope, roomId: roomId, current: first),
        plaintext,
      );
      expect(
        crypto.decryptText(envelope: envelope, roomId: roomId, current: second),
        plaintext,
      );
    });

    test('a session not targeted by the envelope cannot decrypt', () {
      final crypto = E2eeCrypto(random: Random(31));
      final first = crypto.generateDeviceKey(
        userId: '11111111-1111-4111-8111-111111111111',
        sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
      final second = crypto.generateDeviceKey(
        userId: '22222222-2222-4222-8222-222222222222',
        sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      );
      final newSession = crypto.generateDeviceKey(
        userId: second.userId,
        sessionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      );
      const roomId = 'private-room-e2ee';
      final envelope = crypto.encryptText(
        text: 'secret',
        roomId: roomId,
        current: first,
        peerKeys: [
          {
            'userId': first.userId,
            'sessionId': first.sessionId,
            'fingerprint': first.fingerprint,
            'publicJwk': first.publicJwk,
          },
          {
            'userId': second.userId,
            'sessionId': second.sessionId,
            'fingerprint': second.fingerprint,
            'publicJwk': second.publicJwk,
          },
        ],
      );

      expect(
        crypto.decryptText(
          envelope: envelope,
          roomId: roomId,
          current: newSession,
        ),
        isNull,
      );
    });
  });
}
