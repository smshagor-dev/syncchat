import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists the currently selected group topic per room, matching the Web
/// `syncchat:topic:<roomId>` contract while keeping the value local to the
/// signed-in device.
class TopicSelectionStore {
  const TopicSelectionStore._();

  static const FlutterSecureStorage _storage = FlutterSecureStorage();
  static const String _prefix = 'syncchat.topic.v1.';
  static final Map<String, String> _memory = <String, String>{};

  static Future<String?> read(String roomId) async {
    final id = roomId.trim();
    if (id.isEmpty) return null;
    final cached = _memory[id];
    if (cached != null) return cached.isEmpty ? null : cached;
    try {
      final value = (await _storage.read(key: '$_prefix$id'))?.trim() ?? '';
      _memory[id] = value;
      return value.isEmpty ? null : value;
    } on Object {
      return null;
    }
  }

  static Future<void> write(String roomId, String? topicId) async {
    final id = roomId.trim();
    if (id.isEmpty) return;
    final topic = topicId?.trim() ?? '';
    _memory[id] = topic;
    try {
      if (topic.isEmpty) {
        await _storage.delete(key: '$_prefix$id');
      } else {
        await _storage.write(key: '$_prefix$id', value: topic);
      }
    } on Object {
      // The in-memory value keeps the active session working even on devices
      // where secure-storage persistence is temporarily unavailable.
    }
  }

  static Future<void> clear(String roomId) => write(roomId, null);
}
