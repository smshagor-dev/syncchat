import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:pointycastle/export.dart';

import 'api_client.dart';
import 'session_store.dart';

class E2eeIdentity {
  const E2eeIdentity({required this.userId, required this.sessionId});

  final String userId;
  final String sessionId;
}

class E2eeDeviceKeyRecord {
  const E2eeDeviceKeyRecord({
    required this.userId,
    required this.sessionId,
    required this.privateD,
    required this.x,
    required this.y,
    required this.fingerprint,
    this.registeredAt,
  });

  final String userId;
  final String sessionId;
  final String privateD;
  final String x;
  final String y;
  final String fingerprint;
  final DateTime? registeredAt;

  Map<String, dynamic> get publicJwk => {
    'key_ops': const <String>[],
    'ext': true,
    'kty': 'EC',
    'x': x,
    'y': y,
    'crv': 'P-256',
  };

  E2eeDeviceKeyRecord copyWith({DateTime? registeredAt}) => E2eeDeviceKeyRecord(
    userId: userId,
    sessionId: sessionId,
    privateD: privateD,
    x: x,
    y: y,
    fingerprint: fingerprint,
    registeredAt: registeredAt ?? this.registeredAt,
  );

  Map<String, dynamic> toJson() => {
    'userId': userId,
    'sessionId': sessionId,
    'privateD': privateD,
    'x': x,
    'y': y,
    'fingerprint': fingerprint,
    'registeredAt': registeredAt?.toUtc().toIso8601String(),
  };

  static E2eeDeviceKeyRecord fromJson(Map<String, dynamic> json) {
    final registeredAt = DateTime.tryParse(
      json['registeredAt']?.toString() ?? '',
    );
    return E2eeDeviceKeyRecord(
      userId: json['userId']?.toString() ?? '',
      sessionId: json['sessionId']?.toString() ?? '',
      privateD: json['privateD']?.toString() ?? '',
      x: json['x']?.toString() ?? '',
      y: json['y']?.toString() ?? '',
      fingerprint: json['fingerprint']?.toString() ?? '',
      registeredAt: registeredAt,
    );
  }
}

abstract interface class E2eeKeyStore {
  Future<E2eeDeviceKeyRecord?> read(String sessionId);
  Future<void> write(E2eeDeviceKeyRecord record);
  Future<void> delete(String sessionId);
}

class SecureE2eeKeyStore implements E2eeKeyStore {
  SecureE2eeKeyStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _prefix = 'syncchat.e2ee.p256.';
  final FlutterSecureStorage _storage;

  @override
  Future<E2eeDeviceKeyRecord?> read(String sessionId) async {
    final raw = await _storage.read(key: '$_prefix$sessionId');
    if (raw == null || raw.trim().isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return null;
      return E2eeDeviceKeyRecord.fromJson(Map<String, dynamic>.from(decoded));
    } on FormatException {
      return null;
    }
  }

  @override
  Future<void> write(E2eeDeviceKeyRecord record) => _storage.write(
    key: '$_prefix${record.sessionId}',
    value: jsonEncode(record.toJson()),
  );

  @override
  Future<void> delete(String sessionId) =>
      _storage.delete(key: '$_prefix$sessionId');
}

class MemoryE2eeKeyStore implements E2eeKeyStore {
  final Map<String, E2eeDeviceKeyRecord> records = {};

  @override
  Future<void> delete(String sessionId) async {
    records.remove(sessionId);
  }

  @override
  Future<E2eeDeviceKeyRecord?> read(String sessionId) async =>
      records[sessionId];

  @override
  Future<void> write(E2eeDeviceKeyRecord record) async {
    records[record.sessionId] = record;
  }
}

class E2eeCrypto {
  E2eeCrypto({Random? random}) : _random = random ?? Random.secure();

  static const algorithm = 'ECDH-P256+HKDF-SHA256+AES-256-GCM';
  static const version = 1;

  final Random _random;
  final ECDomainParameters _domain = ECDomainParameters('prime256v1');

  E2eeDeviceKeyRecord generateDeviceKey({
    required String userId,
    required String sessionId,
  }) {
    final pair = _generatePair();
    final publicJwk = _publicJwk(pair.publicKey);
    return E2eeDeviceKeyRecord(
      userId: userId,
      sessionId: sessionId,
      privateD: _base64Url(_bigIntBytes(pair.privateKey.d!, 32)),
      x: publicJwk['x']!.toString(),
      y: publicJwk['y']!.toString(),
      fingerprint: fingerprint(publicJwk),
    );
  }

  bool validates(E2eeDeviceKeyRecord record) {
    try {
      if (record.privateD.isEmpty || record.x.isEmpty || record.y.isEmpty) {
        return false;
      }
      final privateKey = _privateKey(record);
      final publicKey = _domain.G * privateKey.d;
      if (publicKey == null || publicKey.isInfinity) return false;
      final jwk = _publicJwk(ECPublicKey(publicKey, _domain));
      return jwk['x'] == record.x &&
          jwk['y'] == record.y &&
          fingerprint(jwk) == record.fingerprint;
    } on Object {
      return false;
    }
  }

  String fingerprint(Map<String, dynamic> publicJwk) {
    final stable = jsonEncode({
      'crv': publicJwk['crv']?.toString() ?? '',
      'kty': publicJwk['kty']?.toString() ?? '',
      'x': publicJwk['x']?.toString() ?? '',
      'y': publicJwk['y']?.toString() ?? '',
    });
    final digest = SHA256Digest().process(
      Uint8List.fromList(utf8.encode(stable)),
    );
    return digest.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
  }

  Map<String, dynamic> encryptText({
    required String text,
    required String roomId,
    required E2eeDeviceKeyRecord current,
    required List<Map<String, dynamic>> peerKeys,
  }) {
    final plaintext = text;
    if (plaintext.isEmpty) {
      throw const ApiException(
        statusCode: 400,
        message: 'Message cannot be empty.',
      );
    }

    final contentKey = _randomBytes(32);
    final messageIv = _randomBytes(12);
    final ciphertext = _gcm(
      encrypting: true,
      key: contentKey,
      nonce: messageIv,
      input: Uint8List.fromList(utf8.encode(plaintext)),
    );

    final devices = <Map<String, dynamic>>[];
    for (final peer in peerKeys) {
      final userId = peer['userId']?.toString() ?? '';
      final sessionId = peer['sessionId']?.toString() ?? '';
      final publicJwk = peer['publicJwk'];
      if (userId.isEmpty || sessionId.isEmpty || publicJwk is! Map) continue;

      final ephemeral = _generatePair();
      final peerPublic = _publicKey(Map<String, dynamic>.from(publicJwk));
      final shared = _sharedSecret(ephemeral.privateKey, peerPublic);
      final salt = _randomBytes(16);
      final wrapIv = _randomBytes(12);
      final info = 'syncchat-e2ee-v1:$roomId:$userId:$sessionId';
      final wrapKey = _hkdf(
        shared,
        salt: salt,
        info: Uint8List.fromList(utf8.encode(info)),
      );
      final wrappedKey = _gcm(
        encrypting: true,
        key: wrapKey,
        nonce: wrapIv,
        input: contentKey,
      );

      devices.add({
        'userId': userId,
        'sessionId': sessionId,
        'fingerprint': peer['fingerprint']?.toString() ?? '',
        'ephemeralPublicJwk': _publicJwk(ephemeral.publicKey),
        'salt': _base64(salt),
        'wrapIv': _base64(wrapIv),
        'wrappedKey': _base64(wrappedKey),
      });
    }

    if (devices.isEmpty) {
      throw const ApiException(
        statusCode: 409,
        message: 'No active E2EE device keys are available for this chat.',
      );
    }

    return {
      'version': version,
      'algorithm': algorithm,
      'roomId': roomId,
      'messageIv': _base64(messageIv),
      'ciphertext': _base64(ciphertext),
      'devices': devices,
    };
  }

  String? decryptText({
    required Map<String, dynamic> envelope,
    required String roomId,
    required E2eeDeviceKeyRecord current,
  }) {
    if ((envelope['version'] as num?)?.toInt() != version) return null;
    if (envelope['roomId']?.toString() != roomId) return null;
    final rawDevices = envelope['devices'];
    if (rawDevices is! List) return null;

    Map<String, dynamic>? target;
    for (final raw in rawDevices.whereType<Map>()) {
      final device = Map<String, dynamic>.from(raw);
      if (device['userId']?.toString() == current.userId &&
          device['sessionId']?.toString() == current.sessionId) {
        target = device;
        break;
      }
    }
    if (target == null) return null;

    final ephemeralJwk = target['ephemeralPublicJwk'];
    if (ephemeralJwk is! Map) return null;
    final ephemeralPublic = _publicKey(Map<String, dynamic>.from(ephemeralJwk));
    final shared = _sharedSecret(_privateKey(current), ephemeralPublic);
    final salt = _base64Decode(target['salt']?.toString() ?? '');
    final wrapIv = _base64Decode(target['wrapIv']?.toString() ?? '');
    final info =
        'syncchat-e2ee-v1:$roomId:${current.userId}:${current.sessionId}';
    final wrapKey = _hkdf(
      shared,
      salt: salt,
      info: Uint8List.fromList(utf8.encode(info)),
    );
    final rawContentKey = _gcm(
      encrypting: false,
      key: wrapKey,
      nonce: wrapIv,
      input: _base64Decode(target['wrappedKey']?.toString() ?? ''),
    );
    final plaintext = _gcm(
      encrypting: false,
      key: rawContentKey,
      nonce: _base64Decode(envelope['messageIv']?.toString() ?? ''),
      input: _base64Decode(envelope['ciphertext']?.toString() ?? ''),
    );
    return utf8.decode(plaintext);
  }

  AsymmetricKeyPair<ECPublicKey, ECPrivateKey> _generatePair() {
    final secureRandom = FortunaRandom()..seed(KeyParameter(_randomBytes(32)));
    final generator = ECKeyGenerator()
      ..init(
        ParametersWithRandom(ECKeyGeneratorParameters(_domain), secureRandom),
      );
    return generator.generateKeyPair();
  }

  ECPrivateKey _privateKey(E2eeDeviceKeyRecord record) {
    final d = _bigInt(_base64UrlDecode(record.privateD));
    if (d <= BigInt.zero || d >= _domain.n) {
      throw const FormatException('Invalid E2EE private key.');
    }
    return ECPrivateKey(d, _domain);
  }

  ECPublicKey _publicKey(Map<String, dynamic> jwk) {
    if (jwk['kty']?.toString() != 'EC' || jwk['crv']?.toString() != 'P-256') {
      throw const FormatException('Unsupported E2EE public key.');
    }
    final x = _bigInt(_base64UrlDecode(jwk['x']?.toString() ?? ''));
    final y = _bigInt(_base64UrlDecode(jwk['y']?.toString() ?? ''));
    final point = _domain.curve.createPoint(x, y, false);
    if (point.isInfinity) {
      throw const FormatException('Invalid E2EE public key point.');
    }
    return ECPublicKey(point, _domain);
  }

  Map<String, dynamic> _publicJwk(ECPublicKey key) {
    final point = key.Q;
    if (point == null || point.isInfinity) {
      throw const FormatException('Invalid E2EE public key.');
    }
    final x = point.x?.toBigInteger();
    final y = point.y?.toBigInteger();
    if (x == null || y == null) {
      throw const FormatException('Invalid E2EE public key coordinates.');
    }
    return {
      'key_ops': const <String>[],
      'ext': true,
      'kty': 'EC',
      'x': _base64Url(_bigIntBytes(x, 32)),
      'y': _base64Url(_bigIntBytes(y, 32)),
      'crv': 'P-256',
    };
  }

  Uint8List _sharedSecret(ECPrivateKey privateKey, ECPublicKey publicKey) {
    final agreement = ECDHBasicAgreement()..init(privateKey);
    return _bigIntBytes(
      agreement.calculateAgreement(publicKey),
      agreement.getFieldSize(),
    );
  }

  Uint8List _hkdf(
    Uint8List ikm, {
    required Uint8List salt,
    required Uint8List info,
  }) {
    final derivator = HKDFKeyDerivator(SHA256Digest())
      ..init(HkdfParameters(ikm, 32, salt, info));
    final output = Uint8List(32);
    derivator.deriveKey(null, 0, output, 0);
    return output;
  }

  Uint8List _gcm({
    required bool encrypting,
    required Uint8List key,
    required Uint8List nonce,
    required Uint8List input,
  }) {
    if (key.length != 32 || nonce.length != 12) {
      throw const FormatException('Invalid AES-GCM key or nonce length.');
    }
    final cipher = GCMBlockCipher(AESEngine())
      ..init(
        encrypting,
        AEADParameters(KeyParameter(key), 128, nonce, Uint8List(0)),
      );
    return cipher.process(input);
  }

  Uint8List _randomBytes(int length) => Uint8List.fromList(
    List<int>.generate(length, (_) => _random.nextInt(256)),
  );

  String _base64Url(Uint8List bytes) =>
      base64UrlEncode(bytes).replaceAll('=', '');

  Uint8List _base64UrlDecode(String value) {
    if (value.isEmpty) return Uint8List(0);
    return Uint8List.fromList(base64Url.decode(base64Url.normalize(value)));
  }

  String _base64(Uint8List bytes) => base64Encode(bytes);

  Uint8List _base64Decode(String value) {
    if (value.isEmpty) return Uint8List(0);
    return Uint8List.fromList(base64.decode(value));
  }

  BigInt _bigInt(Uint8List bytes) {
    var result = BigInt.zero;
    for (final byte in bytes) {
      result = (result << 8) | BigInt.from(byte);
    }
    return result;
  }

  Uint8List _bigIntBytes(BigInt value, int length) {
    if (value < BigInt.zero) {
      throw const FormatException('Negative E2EE key material is invalid.');
    }
    final output = Uint8List(length);
    var remaining = value;
    for (var index = length - 1; index >= 0; index -= 1) {
      output[index] = (remaining & BigInt.from(0xff)).toInt();
      remaining >>= 8;
    }
    if (remaining != BigInt.zero) {
      throw const FormatException('E2EE key material exceeds curve size.');
    }
    return output;
  }
}

class E2eeService {
  E2eeService({
    required ApiClient api,
    required SessionStore sessionStore,
    E2eeKeyStore? keyStore,
    E2eeCrypto? crypto,
  }) : _api = api,
       _sessionStore = sessionStore,
       _keyStore = keyStore ?? SecureE2eeKeyStore(),
       _crypto = crypto ?? E2eeCrypto();

  final ApiClient _api;
  final SessionStore _sessionStore;
  final E2eeKeyStore _keyStore;
  final E2eeCrypto _crypto;

  Future<E2eeIdentity> currentIdentity() async {
    final token = await _sessionStore.readAccessToken();
    if (token == null || token.isEmpty) {
      throw const ApiException(
        statusCode: 401,
        message: 'Authentication required.',
      );
    }
    final parts = token.split('.');
    if (parts.length < 2) {
      throw const ApiException(
        statusCode: 401,
        message: 'Invalid access token.',
      );
    }
    try {
      final payload = jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
      );
      if (payload is! Map) throw const FormatException('Invalid JWT payload.');
      final data = Map<String, dynamic>.from(payload);
      final userId =
          (data['_id'] ?? data['id'] ?? data['userId'])?.toString() ?? '';
      final sessionId = data['sid']?.toString() ?? '';
      if (userId.isEmpty || sessionId.isEmpty) {
        throw const FormatException('Missing user or session ID.');
      }
      return E2eeIdentity(userId: userId, sessionId: sessionId);
    } on FormatException {
      throw const ApiException(
        statusCode: 401,
        message: 'Invalid access token.',
      );
    }
  }

  Future<E2eeDeviceKeyRecord> ensureDeviceKey({
    bool forceRegister = false,
  }) async {
    final identity = await currentIdentity();
    var record = await _keyStore.read(identity.sessionId);
    final valid =
        record != null &&
        record.userId == identity.userId &&
        record.sessionId == identity.sessionId &&
        _crypto.validates(record);
    if (!valid) {
      if (record != null) await _keyStore.delete(identity.sessionId);
      record = _crypto.generateDeviceKey(
        userId: identity.userId,
        sessionId: identity.sessionId,
      );
      await _keyStore.write(record);
    }

    if (forceRegister || record.registeredAt == null) {
      await _api.put(
        '/chat-v2/e2ee/device-key',
        body: {
          'publicJwk': record.publicJwk,
          'fingerprint': record.fingerprint,
        },
      );
      record = record.copyWith(registeredAt: DateTime.now().toUtc());
      await _keyStore.write(record);
    }
    return record;
  }

  Future<Map<String, dynamic>> roomState(String roomId) async {
    final response = await _api.get('/chat-v2/e2ee/rooms/$roomId');
    return _map(response.payload);
  }

  Future<Map<String, dynamic>> setRoomEnabled(
    String roomId, {
    required bool enabled,
  }) async {
    if (enabled) await ensureDeviceKey(forceRegister: true);
    final response = await _api.post(
      '/chat-v2/e2ee/rooms/$roomId',
      body: {'enabled': enabled},
    );
    return _map(response.payload);
  }

  Future<List<Map<String, dynamic>>> listDeviceKeys(
    List<String> userIds,
  ) async {
    final ids = userIds
        .map((id) => id.trim())
        .where((id) => id.isNotEmpty)
        .toSet()
        .toList(growable: false);
    if (ids.isEmpty) return const [];
    final response = await _api.get(
      '/chat-v2/e2ee/keys',
      query: {'userIds': ids.join(',')},
    );
    final payload = response.payload;
    if (payload is! List) return const [];
    return payload
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
  }

  Future<Map<String, dynamic>> encryptText({
    required String text,
    required String roomId,
    required List<String> userIds,
  }) async {
    final current = await ensureDeviceKey();
    final owners = userIds
        .map((id) => id.trim())
        .where((id) => id.isNotEmpty)
        .toSet();
    owners.add(current.userId);
    final keys = await listDeviceKeys(owners.toList(growable: false));
    final usersWithKeys = keys
        .map((item) => item['userId']?.toString() ?? '')
        .where((id) => id.isNotEmpty)
        .toSet();
    final missing = owners.where((id) => !usersWithKeys.contains(id)).toList();
    if (missing.isNotEmpty) {
      throw ApiException(
        statusCode: 409,
        message:
            'Every participant must register an E2EE device before this message can be sent.',
        payload: {'missingUserIds': missing},
      );
    }
    return _crypto.encryptText(
      text: text,
      roomId: roomId,
      current: current,
      peerKeys: keys,
    );
  }

  Future<String?> decryptEnvelope({
    required Map<String, dynamic> envelope,
    required String roomId,
  }) async {
    final current = await ensureDeviceKey();
    return _crypto.decryptText(
      envelope: envelope,
      roomId: roomId,
      current: current,
    );
  }

  Future<Map<String, dynamic>> decryptMessage(
    Map<String, dynamic> message,
  ) async {
    return Map<String, dynamic>.from(await _decryptValue(message) as Map);
  }

  Future<List<Map<String, dynamic>>> decryptMessages(
    List<Map<String, dynamic>> messages,
  ) async {
    final output = <Map<String, dynamic>>[];
    for (final message in messages) {
      output.add(await decryptMessage(message));
    }
    return output;
  }

  Future<dynamic> _decryptValue(dynamic value) async {
    if (value is List) {
      final output = <dynamic>[];
      for (final item in value) {
        output.add(await _decryptValue(item));
      }
      return output;
    }
    if (value is! Map) return value;

    final source = Map<String, dynamic>.from(value);
    final envelope = source['e2eeEnvelope'];
    final roomId = source['roomId']?.toString() ?? '';
    if (envelope is Map && roomId.isNotEmpty) {
      try {
        final text = await decryptEnvelope(
          envelope: Map<String, dynamic>.from(envelope),
          roomId: roomId,
        );
        if (text != null) {
          source['text'] = text;
          source['e2eeDecrypted'] = true;
          source.remove('e2eeDecryptionError');
        } else {
          source['text'] = 'Encrypted message';
          source['e2eeUnavailableOnDevice'] = true;
        }
      } on Object {
        source['text'] = 'Encrypted message';
        source['e2eeDecryptionError'] = true;
      }
    }

    final keys = source.keys.toList(growable: false);
    for (final key in keys) {
      if (key == 'e2eeEnvelope') continue;
      final item = source[key];
      if (item is Map || item is List) {
        source[key] = await _decryptValue(item);
      }
    }
    return source;
  }

  Map<String, dynamic> _map(dynamic payload) {
    if (payload is Map) return Map<String, dynamic>.from(payload);
    throw const ApiException(
      statusCode: 500,
      message: 'Invalid E2EE response.',
    );
  }
}
