import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_callkit_incoming/entities/android_params.dart';
import 'package:flutter_callkit_incoming/entities/call_event.dart';
import 'package:flutter_callkit_incoming/entities/call_kit_params.dart';
import 'package:flutter_callkit_incoming/entities/ios_params.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_client.dart';
import 'app_config.dart';
import 'calling_repository.dart';
import 'session_store.dart';

const _pendingNativeCallActionKey = 'syncchat.native_call_pending_action';
const _nativePushDeviceIdKey = 'syncchat.native_push_device_id';

@pragma('vm:entry-point')
Future<void> syncChatFirebaseBackgroundMessage(RemoteMessage message) async {
  await NativeCallPushService.ensureFirebaseForAndroid();
  final payload = Map<String, dynamic>.from(message.data);
  if (payload['type']?.toString() != 'incoming_call') return;
  await NativeCallPushService.showIncomingCall(payload);
}

@pragma('vm:entry-point')
Future<void> syncChatCallkitBackgroundHandler(CallEvent event) async {
  String? action;
  Map<String, dynamic>? payload;

  if (event is CallEventActionCallAccept) {
    action = 'accept';
    payload = NativeCallPushService.payloadFromParams(event.callKitParams);
  } else if (event is CallEventActionCallDecline) {
    action = 'decline';
    payload = NativeCallPushService.payloadFromParams(event.callKitParams);
  } else if (event is CallEventActionCallEnded) {
    action = 'end';
    payload = NativeCallPushService.payloadFromParams(event.callKitParams);
  }

  if (action == null || payload == null || payload['callId'] == null) return;
  const storage = FlutterSecureStorage();
  await storage.write(
    key: _pendingNativeCallActionKey,
    value: jsonEncode({'action': action, 'payload': payload}),
  );
}

class NativeCallPushService {
  NativeCallPushService({
    required ApiClient api,
    required CallingRepository calling,
    required SessionStore sessionStore,
    required SyncChatConfig config,
    FlutterSecureStorage? storage,
  }) : _api = api,
       _calling = calling,
       _sessionStore = sessionStore,
       _config = config,
       _storage = storage ?? const FlutterSecureStorage();

  final ApiClient _api;
  final CallingRepository _calling;
  final SessionStore _sessionStore;
  final SyncChatConfig _config;
  final FlutterSecureStorage _storage;
  final StreamController<Map<String, dynamic>> _acceptedCalls =
      StreamController<Map<String, dynamic>>.broadcast();

  StreamSubscription<CallEvent?>? _callkitSubscription;
  StreamSubscription<String>? _tokenRefreshSubscription;
  final Set<String> _locallyEndingCalls = <String>{};
  bool _started = false;
  bool _disposed = false;

  Stream<Map<String, dynamic>> get acceptedCalls => _acceptedCalls.stream;

  static Future<void> bootstrapBeforeRunApp() async {
    await FlutterCallkitIncoming.onBackgroundMessage(
      syncChatCallkitBackgroundHandler,
    );
    if (!Platform.isAndroid) return;
    final initialized = await ensureFirebaseForAndroid();
    if (initialized) {
      FirebaseMessaging.onBackgroundMessage(syncChatFirebaseBackgroundMessage);
    }
  }

  static Future<bool> ensureFirebaseForAndroid() async {
    if (!Platform.isAndroid) return false;
    final config = SyncChatConfig.fromEnvironment();
    if (!config.hasAndroidFirebaseConfig) return false;
    if (Firebase.apps.isNotEmpty) return true;
    await Firebase.initializeApp(
      options: FirebaseOptions(
        apiKey: config.firebaseApiKey,
        appId: config.firebaseAppId,
        messagingSenderId: config.firebaseMessagingSenderId,
        projectId: config.firebaseProjectId,
      ),
    );
    return true;
  }

  Future<void> startAuthenticated() async {
    if (_disposed || _started) return;
    if ((await _sessionStore.readAccessToken())?.isNotEmpty != true) return;
    _started = true;

    _callkitSubscription = FlutterCallkitIncoming.onEvent.listen(
      _onCallkitEvent,
    );

    if (Platform.isAndroid && await ensureFirebaseForAndroid()) {
      await FirebaseMessaging.instance.requestPermission();
      await FlutterCallkitIncoming.requestNotificationPermission({
        'title': 'Incoming call notifications',
        'rationaleMessagePermission':
            'Notification permission is required to show incoming calls.',
        'postNotificationMessageRequired':
            'Allow notifications so SyncChat can ring for incoming calls.',
      });
      if (!await FlutterCallkitIncoming.canUseFullScreenIntent()) {
        await FlutterCallkitIncoming.requestFullIntentPermission();
      }
      _tokenRefreshSubscription = FirebaseMessaging.instance.onTokenRefresh
          .listen(
            (token) => _registerToken(
              token: token,
              platform: 'android',
              provider: 'fcm',
              tokenType: 'standard',
            ),
          );
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null && token.trim().isNotEmpty) {
        await _registerToken(
          token: token,
          platform: 'android',
          provider: 'fcm',
          tokenType: 'standard',
        );
      }
    }

    if (Platform.isIOS) {
      await _registerCurrentVoipToken();
    }

    await _consumePendingBackgroundAction();
  }

  Future<void> _onCallkitEvent(CallEvent? event) async {
    if (event == null || _disposed) return;
    if (event is CallEventActionCallAccept) {
      final payload = payloadFromParams(event.callKitParams);
      if (payload['callId']?.toString().isNotEmpty == true) {
        _acceptedCalls.add(payload);
      }
      return;
    }
    if (event is CallEventActionCallDecline) {
      await _reject(payloadFromParams(event.callKitParams));
      return;
    }
    if (event is CallEventActionCallEnded) {
      final payload = payloadFromParams(event.callKitParams);
      final id = payload['callId']?.toString() ?? '';
      if (id.isNotEmpty && _locallyEndingCalls.remove(id)) return;
      await _end(payload);
      return;
    }
    if (event is CallEventActionDidUpdateDevicePushTokenVoip) {
      await _registerCurrentVoipToken();
    }
  }

  Future<void> _consumePendingBackgroundAction() async {
    final raw = await _storage.read(key: _pendingNativeCallActionKey);
    if (raw == null || raw.trim().isEmpty) return;
    await _storage.delete(key: _pendingNativeCallActionKey);
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return;
      final action = decoded['action']?.toString();
      final value = decoded['payload'];
      if (value is! Map) return;
      final payload = Map<String, dynamic>.from(value);
      if (action == 'accept') {
        _acceptedCalls.add(payload);
      } else if (action == 'decline') {
        await _reject(payload);
      } else if (action == 'end') {
        await _end(payload);
      }
    } on FormatException {
      // Ignore an invalid stale pending action.
    }
  }

  Future<void> _registerCurrentVoipToken() async {
    if (!Platform.isIOS) return;
    final token = (await FlutterCallkitIncoming.getDevicePushTokenVoIP())
        ?.trim();
    if (token == null || token.isEmpty) return;
    await _registerToken(
      token: token,
      platform: 'ios',
      provider: 'apns',
      tokenType: 'voip',
    );
  }

  Future<void> _registerToken({
    required String token,
    required String platform,
    required String provider,
    required String tokenType,
  }) async {
    if ((await _sessionStore.readAccessToken())?.isNotEmpty != true) return;
    await _api.post(
      '/settings/push/native/register',
      body: {
        'platform': platform,
        'provider': provider,
        'token': token,
        'tokenType': tokenType,
        'deviceId': await _deviceId(),
        'deviceLabel': platform == 'ios' ? 'iOS device' : 'Android device',
        'appVersion': _config.appVersion,
      },
    );
  }

  Future<void> unregisterCurrentDevice() async {
    if ((await _sessionStore.readAccessToken())?.isNotEmpty != true) return;
    await _api.delete(
      '/settings/push/native/unregister',
      body: {'deviceId': await _deviceId()},
    );
  }

  Future<String> _deviceId() async {
    final existing = (await _storage.read(key: _nativePushDeviceIdKey))?.trim();
    if (existing != null && existing.isNotEmpty) return existing;
    final random = Random.secure();
    final id = List<int>.generate(
      20,
      (_) => random.nextInt(256),
    ).map((value) => value.toRadixString(16).padLeft(2, '0')).join();
    await _storage.write(key: _nativePushDeviceIdKey, value: id);
    return id;
  }

  Future<void> _reject(Map<String, dynamic> payload) async {
    final callId = payload['callId']?.toString() ?? '';
    final roomId = payload['roomId']?.toString() ?? '';
    final callerId = payload['fromUserId']?.toString() ?? '';
    if (callId.isEmpty || roomId.isEmpty) return;
    try {
      final user = await _calling.currentUser();
      final userId = user['_id']?.toString() ?? '';
      if (userId.isEmpty) return;
      await _calling.ensureRealtime();
      await _calling.emit('call/reject', {
        'callId': callId,
        'roomId': roomId,
        'fromUserId': userId,
        'toUserId': callerId,
      });
    } on Object {
      // The durable server ring timeout remains the fallback if the network is down.
    }
  }

  Future<void> _end(Map<String, dynamic> payload) async {
    final callId = payload['callId']?.toString() ?? '';
    final roomId = payload['roomId']?.toString() ?? '';
    if (callId.isEmpty || roomId.isEmpty) return;
    try {
      final user = await _calling.currentUser();
      final userId = user['_id']?.toString() ?? '';
      if (userId.isEmpty) return;
      await _calling.ensureRealtime();
      await _calling.emit('call/end', {
        'callId': callId,
        'roomId': roomId,
        'userId': userId,
        'reason': 'ended',
      });
    } on Object {
      // Socket lifecycle catches up when the app reconnects.
    }
  }

  Future<void> markConnected(String callId) async {
    if (callId.trim().isEmpty) return;
    await FlutterCallkitIncoming.setCallConnected(callId);
  }

  Future<void> endNativeUi(String callId) async {
    final id = callId.trim();
    if (id.isEmpty) return;
    _locallyEndingCalls.add(id);
    try {
      await FlutterCallkitIncoming.endCall(id);
    } on Object {
      _locallyEndingCalls.remove(id);
      rethrow;
    }
  }

  static Map<String, dynamic> payloadFromParams(CallKitParams params) {
    final payload = <String, dynamic>{...?params.extra};
    payload['callId'] = payload['callId']?.toString().isNotEmpty == true
        ? payload['callId'].toString()
        : params.id;
    payload.putIfAbsent(
      'mediaType',
      () => params.type == 1 ? 'video' : 'audio',
    );
    payload.putIfAbsent('fromName', () => params.nameCaller ?? '');
    payload.putIfAbsent('fromUsername', () => params.handle ?? '');
    return payload;
  }

  static Future<void> showIncomingCall(Map<String, dynamic> raw) async {
    final payload = raw.map(
      (key, value) => MapEntry(key, value?.toString() ?? ''),
    );
    final callId = payload['callId']?.trim() ?? '';
    final roomId = payload['roomId']?.trim() ?? '';
    if (callId.isEmpty || roomId.isEmpty) return;
    final video = payload['mediaType'] == 'video';
    final fromName = payload['fromName']?.trim() ?? '';
    final fromUsername = payload['fromUsername']?.trim() ?? '';
    final caller = fromName.isNotEmpty
        ? fromName
        : fromUsername.isNotEmpty
        ? '@$fromUsername'
        : 'SyncChat caller';
    final timeout = int.tryParse(payload['ringingTimeoutSec'] ?? '') ?? 45;

    await FlutterCallkitIncoming.showCallkitIncoming(
      CallKitParams(
        id: callId,
        nameCaller: caller,
        appName: 'SyncChat',
        handle: fromUsername.isNotEmpty ? '@$fromUsername' : caller,
        type: video ? 1 : 0,
        duration: timeout.clamp(10, 120).toInt() * 1000,
        extra: payload,
        android: const AndroidParams(
          isCustomNotification: true,
          isShowCallID: false,
          isShowFullLockedScreen: true,
          isImportant: true,
          isFullScreen: true,
          incomingCallNotificationChannelName: 'SyncChat incoming calls',
          missedCallNotificationChannelName: 'SyncChat missed calls',
          actionColor: '#24B4E6',
          backgroundColor: '#071018',
          textAccept: 'Answer',
          textDecline: 'Decline',
        ),
        ios: IOSParams(
          handleType: 'generic',
          supportsVideo: video,
          maximumCallGroups: 1,
          maximumCallsPerCallGroup: 1,
          supportsDTMF: false,
          supportsHolding: true,
          supportsGrouping: false,
          supportsUngrouping: false,
          includesCallsInRecents: true,
          ringtonePath: 'system_ringtone_default',
          configureAudioSession: true,
          audioSessionMode: 'voiceChat',
          audioSessionActive: true,
        ),
      ),
    );
  }

  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    await _callkitSubscription?.cancel();
    await _tokenRefreshSubscription?.cancel();
    await _acceptedCalls.close();
  }
}
