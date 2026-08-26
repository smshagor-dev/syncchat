import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:pointycastle/export.dart';
import 'package:sqflite/sqflite.dart';

class ChatCache {
  ChatCache({FlutterSecureStorage? secureStorage})
    : _secureStorage = secureStorage ?? const FlutterSecureStorage();

  static const _cacheKeyName = 'syncchat.chat_cache_key.v1';
  static const _inboxesKey = 'inboxes';
  static const _maxRoomMessages = 500;

  final FlutterSecureStorage _secureStorage;
  Database? _database;
  Future<Database>? _opening;
  Uint8List? _key;

  Future<List<Map<String, dynamic>>> readInboxes() => _readList(_inboxesKey);

  Future<void> writeInboxes(List<Map<String, dynamic>> inboxes) =>
      _write(_inboxesKey, inboxes);

  Future<List<Map<String, dynamic>>> readRoomMessages(String roomId) =>
      _readList('room:$roomId');

  Future<void> writeRoomMessages(
    String roomId,
    List<Map<String, dynamic>> messages,
  ) async {
    final trimmed = messages.length <= _maxRoomMessages
        ? messages
        : messages.sublist(messages.length - _maxRoomMessages);
    await _write('room:$roomId', trimmed);
  }

  Future<void> mergeRoomMessages(
    String roomId,
    List<Map<String, dynamic>> incoming,
  ) async {
    if (incoming.isEmpty) return;
    final current = await readRoomMessages(roomId);
    final merged = <String, Map<String, dynamic>>{};
    var fallback = 0;
    for (final item in [...current, ...incoming]) {
      final id = item['_id']?.toString().trim().isNotEmpty == true
          ? item['_id'].toString()
          : item['clientMessageId']?.toString().trim().isNotEmpty == true
              ? 'client:${item['clientMessageId']}'
              : 'fallback:${fallback++}:${item['createdAt'] ?? ''}';
      merged[id] = item;
    }
    await writeRoomMessages(roomId, merged.values.toList(growable: false));
  }

  Future<void> clear() async {
    final db = await _db();
    await db.delete('cache_entries');
  }

  Future<List<Map<String, dynamic>>> _readList(String key) async {
    try {
      final db = await _db();
      final rows = await db.query(
        'cache_entries',
        columns: ['payload'],
        where: 'cache_key = ?',
        whereArgs: [key],
        limit: 1,
      );
      if (rows.isEmpty) return const [];
      final encrypted = rows.first['payload']?.toString() ?? '';
      if (encrypted.isEmpty) return const [];
      final decoded = jsonDecode(await _decrypt(encrypted));
      if (decoded is! List) return const [];
      return decoded
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
    } on Object catch (error) {
      debugPrint('SyncChat cache read skipped: $error');
      return const [];
    }
  }

  Future<void> _write(String key, Object value) async {
    try {
      final db = await _db();
      final payload = await _encrypt(jsonEncode(value));
      await db.insert(
        'cache_entries',
        {
          'cache_key': key,
          'payload': payload,
          'updated_at': DateTime.now().millisecondsSinceEpoch,
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    } on Object catch (error) {
      debugPrint('SyncChat cache write skipped: $error');
    }
  }

  Future<Database> _db() {
    final ready = _database;
    if (ready != null) return Future.value(ready);
    final opening = _opening;
    if (opening != null) return opening;
    final future = _open();
    _opening = future;
    return future.whenComplete(() => _opening = null);
  }

  Future<Database> _open() async {
    final root = await getDatabasesPath();
    final path = '$root${Platform.pathSeparator}syncchat_cache_v1.db';
    final db = await openDatabase(
      path,
      version: 1,
      onCreate: (database, _) async {
        await database.execute('''
          CREATE TABLE cache_entries (
            cache_key TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
      },
    );
    _database = db;
    return db;
  }

  Future<Uint8List> _cacheKey() async {
    final existing = _key;
    if (existing != null) return existing;
    final stored = (await _secureStorage.read(key: _cacheKeyName))?.trim();
    if (stored != null && stored.isNotEmpty) {
      final key = Uint8List.fromList(base64Decode(stored));
      if (key.length == 32) {
        _key = key;
        return key;
      }
    }
    final random = Random.secure();
    final key = Uint8List.fromList(
      List<int>.generate(32, (_) => random.nextInt(256)),
    );
    await _secureStorage.write(key: _cacheKeyName, value: base64Encode(key));
    _key = key;
    return key;
  }

  Future<String> _encrypt(String plaintext) async {
    final nonce = Uint8List.fromList(
      List<int>.generate(12, (_) => Random.secure().nextInt(256)),
    );
    final cipher = GCMBlockCipher(AESEngine())
      ..init(
        true,
        AEADParameters(
          KeyParameter(await _cacheKey()),
          128,
          nonce,
          Uint8List(0),
        ),
      );
    final encrypted = cipher.process(Uint8List.fromList(utf8.encode(plaintext)));
    return base64Encode(Uint8List.fromList([...nonce, ...encrypted]));
  }

  Future<String> _decrypt(String encoded) async {
    final bytes = Uint8List.fromList(base64Decode(encoded));
    if (bytes.length <= 12) throw const FormatException('Invalid cache payload');
    final nonce = Uint8List.sublistView(bytes, 0, 12);
    final encrypted = Uint8List.sublistView(bytes, 12);
    final cipher = GCMBlockCipher(AESEngine())
      ..init(
        false,
        AEADParameters(
          KeyParameter(await _cacheKey()),
          128,
          nonce,
          Uint8List(0),
        ),
      );
    return utf8.decode(cipher.process(encrypted));
  }
}
