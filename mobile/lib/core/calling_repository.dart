import 'api_client.dart';
import 'auth_repository.dart';
import 'realtime_client.dart';

class CallRuntimeConfig {
  const CallRuntimeConfig({
    required this.enabled,
    required this.audioEnabled,
    required this.videoEnabled,
    required this.groupEnabled,
    required this.maxGroupParticipants,
    required this.ringingTimeoutSec,
    required this.reconnectGraceSec,
    required this.iceTransportPolicy,
    required this.iceServers,
    required this.audioProfile,
    required this.videoProfile,
    required this.groupSfu,
  });

  factory CallRuntimeConfig.fromMap(Map<String, dynamic> source) {
    List<Map<String, dynamic>> mapList(dynamic value) {
      if (value is! List) return const [];
      return value
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
    }

    Map<String, dynamic> map(dynamic value) =>
        value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

    return CallRuntimeConfig(
      enabled: source['enabled'] != false,
      audioEnabled: source['audioEnabled'] != false,
      videoEnabled: source['videoEnabled'] != false,
      groupEnabled: source['groupEnabled'] != false,
      maxGroupParticipants:
          (source['maxGroupParticipants'] as num?)?.toInt() ?? 4,
      ringingTimeoutSec:
          (source['ringingTimeoutSec'] as num?)?.toInt() ?? 45,
      reconnectGraceSec:
          (source['reconnectGraceSec'] as num?)?.toInt() ?? 12,
      iceTransportPolicy:
          source['iceTransportPolicy']?.toString() == 'relay' ? 'relay' : 'all',
      iceServers: mapList(source['iceServers']),
      audioProfile: map(source['audioProfile']),
      videoProfile: map(source['videoProfile']),
      groupSfu: map(source['groupSfu']),
    );
  }

  final bool enabled;
  final bool audioEnabled;
  final bool videoEnabled;
  final bool groupEnabled;
  final int maxGroupParticipants;
  final int ringingTimeoutSec;
  final int reconnectGraceSec;
  final String iceTransportPolicy;
  final List<Map<String, dynamic>> iceServers;
  final Map<String, dynamic> audioProfile;
  final Map<String, dynamic> videoProfile;
  final Map<String, dynamic> groupSfu;

  bool allows({required bool video, required bool group, int participants = 2}) {
    if (!enabled) return false;
    if (video && !videoEnabled) return false;
    if (!video && !audioEnabled) return false;
    if (group && !groupEnabled) return false;
    if (group && participants > maxGroupParticipants) return false;
    return true;
  }
}

class CallingRepository {
  CallingRepository({
    required ApiClient api,
    required AuthRepository auth,
    required RealtimeClient realtime,
  })  : _api = api,
        _auth = auth,
        _realtime = realtime;

  final ApiClient _api;
  final AuthRepository _auth;
  final RealtimeClient _realtime;

  CallRuntimeConfig? _cachedConfig;
  Map<String, dynamic>? _currentUser;

  Future<CallRuntimeConfig> runtimeConfig({bool refresh = false}) async {
    if (!refresh && _cachedConfig != null) return _cachedConfig!;
    final response = await _api.get('/calling/config');
    final payload = _mapPayload(
      response.payload,
      error: 'Invalid calling configuration response.',
    );
    _cachedConfig = CallRuntimeConfig.fromMap(payload);
    return _cachedConfig!;
  }

  Future<Map<String, dynamic>> currentUser({bool refresh = false}) async {
    if (!refresh && _currentUser != null) return _currentUser!;
    _currentUser = await _auth.currentUser();
    return _currentUser!;
  }

  Future<List<Map<String, dynamic>>> history() async {
    final response = await _api.get('/chats/calls');
    return _mapList(response.payload);
  }

  Future<Map<String, dynamic>> sessionMedia(String callId) async {
    final response = await _api.get('/calling/session/$callId');
    return _mapPayload(response.payload, error: 'Invalid call session response.');
  }

  Future<Map<String, dynamic>> sfuCredentials(String callId) async {
    final response = await _api.post(
      '/calling/sfu-token',
      body: {'callId': callId},
    );
    return _mapPayload(
      response.payload,
      error: 'Invalid group media credentials response.',
    );
  }

  Future<void> ensureRealtime() async {
    if (_realtime.isConnected) return;
    await _realtime.connect();
    if (!_realtime.isConnected) {
      throw const ApiException(
        statusCode: 0,
        message: 'Realtime connection is unavailable.',
      );
    }
  }

  Future<void> emit(String event, [dynamic payload]) async {
    await ensureRealtime();
    _realtime.emit(event, payload);
  }

  void on(String event, void Function(dynamic data) handler) =>
      _realtime.on(event, handler);

  void off(String event, [void Function(dynamic data)? handler]) =>
      _realtime.off(event, handler);

  List<Map<String, dynamic>> _mapList(dynamic payload) {
    if (payload is! List) return const [];
    return payload
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
  }

  Map<String, dynamic> _mapPayload(
    dynamic payload, {
    required String error,
  }) {
    if (payload is Map) return Map<String, dynamic>.from(payload);
    throw ApiException(statusCode: 500, message: error);
  }
}
