import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:permission_handler/permission_handler.dart' as ph;

import 'feature_repositories.dart';
import 'native_call_push.dart';
import 'permission_manager.dart';

class DeviceIntegrationService {
  DeviceIntegrationService._();

  static final FlutterLocalNotificationsPlugin _notifications =
      FlutterLocalNotificationsPlugin();
  static final StreamController<String> _notificationTapController =
      StreamController<String>.broadcast(sync: true);
  static final List<String> _pendingNotificationTaps = <String>[];
  static StreamSubscription<RemoteMessage>? _foregroundSubscription;
  static StreamSubscription<RemoteMessage>? _openedSubscription;
  static Future<void>? _initializeFuture;
  static bool _initialized = false;
  static bool _initialMessageChecked = false;

  static Stream<String> get notificationTaps =>
      _notificationTapController.stream;

  static List<String> takePendingNotificationTaps() {
    final values = List<String>.from(_pendingNotificationTaps);
    _pendingNotificationTaps.clear();
    return values;
  }

  static Future<void> initialize() {
    if (_initialized) return Future<void>.value();
    final inFlight = _initializeFuture;
    if (inFlight != null) return inFlight;

    final future = _initializeOnce();
    _initializeFuture = future;
    return future;
  }

  static Future<void> _initializeOnce() async {
    try {
      const settings = InitializationSettings(
        android: AndroidInitializationSettings('ic_stat_syncchat'),
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      );

      await _notifications
          .initialize(
            settings: settings,
            onDidReceiveNotificationResponse: (response) {
              _queueNotificationTap(response.payload);
            },
          )
          .timeout(const Duration(seconds: 5));

      if (Platform.isAndroid) {
        final androidPlugin = _notifications
            .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin
            >();
        await androidPlugin
            ?.createNotificationChannel(
              const AndroidNotificationChannel(
                'syncchat_messages',
                'Messages and activity',
                description:
                    'Messages, message requests, mentions, and SyncChat activity.',
                importance: Importance.high,
              ),
            )
            .timeout(const Duration(seconds: 5));
      }

      _initialized = true;
    } finally {
      if (!_initialized) {
        _initializeFuture = null;
      }
    }
  }

  static Future<Map<ph.Permission, ph.PermissionStatus>>
  requestCommunicationPermissions() {
    return AppPermissionManager.requestInitialPermissions();
  }

  static Future<Map<String, dynamic>> syncAddressBook(
    ContactRepository repository,
  ) async {
    final permission = await FlutterContacts.permissions.request(
      PermissionType.read,
    );
    if (permission != PermissionStatus.granted) {
      throw StateError(
        'Contacts permission is required to find people who use SyncChat.',
      );
    }

    final contacts = await FlutterContacts.getAll(
      properties: const {ContactProperty.name, ContactProperty.phone},
    );
    final payload = contacts
        .map(
          (contact) => <String, dynamic>{
            'name': contact.displayName,
            'phones': contact.phones
                .map((phone) => phone.number.trim())
                .where((phone) => phone.isNotEmpty)
                .toList(growable: false),
          },
        )
        .where((contact) => (contact['phones'] as List).isNotEmpty)
        .toList(growable: false);

    return repository.syncMobile(payload);
  }

  static Future<String?> createPhoneContact({
    required String name,
    required String phone,
  }) async {
    final cleanedPhone = phone.trim();
    if (cleanedPhone.isEmpty) {
      throw StateError(
        'Phone number is required to save a phone contact.',
      );
    }
    final cleanedName = name.trim().isEmpty ? cleanedPhone : name.trim();
    final contact = Contact(
      name: Name(first: cleanedName),
      phones: [Phone(number: cleanedPhone)],
    );
    return FlutterContacts.native.showCreator(contact: contact);
  }

  static Future<void> startForegroundMessaging() async {
    await initialize();
    if (!await _ensureMessagingReady()) return;

    await _foregroundSubscription?.cancel();
    _foregroundSubscription = FirebaseMessaging.onMessage.listen((message) async {
      final data = message.data;
      if (data['type']?.toString() == 'incoming_call') {
        await NativeCallPushService.showIncomingCall(data);
        return;
      }

      final title = message.notification?.title ??
          data['title']?.toString() ??
          _fallbackTitle(data['type']?.toString());
      final body = message.notification?.body ??
          data['body']?.toString() ??
          data['message']?.toString() ??
          data['preview']?.toString() ??
          'You have new SyncChat activity.';
      final payload = _messagePayload(data);

      await showNotification(
        id: _notificationId(
          message.messageId ?? DateTime.now().toIso8601String(),
        ),
        title: title,
        body: body,
        payload: payload,
      );
    });

    await _openedSubscription?.cancel();
    _openedSubscription = FirebaseMessaging.onMessageOpenedApp.listen((message) {
      _queueNotificationTap(_messagePayload(message.data));
    });

    if (!_initialMessageChecked) {
      _initialMessageChecked = true;
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) {
        _queueNotificationTap(_messagePayload(initial.data));
      }
    }
  }

  static Future<bool> _ensureMessagingReady() async {
    try {
      if (Platform.isAndroid) {
        return await NativeCallPushService.ensureFirebaseForAndroid();
      }
      if (Platform.isIOS) {
        if (Firebase.apps.isEmpty) {
          await Firebase.initializeApp();
        }
        await FirebaseMessaging.instance.requestPermission(
          alert: true,
          badge: true,
          sound: true,
        );
        return Firebase.apps.isNotEmpty;
      }
    } on Object {
      return false;
    }
    return false;
  }

  static Future<void> requestNotificationPermission() async {
    await initialize();
    await ph.Permission.notification.request();
    if (Platform.isIOS) {
      await _notifications
          .resolvePlatformSpecificImplementation<
            IOSFlutterLocalNotificationsPlugin
          >()
          ?.requestPermissions(alert: true, badge: true, sound: true);
      if (await _ensureMessagingReady()) {
        await FirebaseMessaging.instance.requestPermission(
          alert: true,
          badge: true,
          sound: true,
        );
      }
    }
  }

  static Future<void> showNotification({
    required int id,
    required String title,
    required String body,
    String? payload,
  }) async {
    await initialize();
    final groupKey = payload?.trim().isNotEmpty == true
        ? 'syncchat_room_${payload!.trim()}'
        : 'syncchat_messages';
    final details = NotificationDetails(
      android: AndroidNotificationDetails(
        'syncchat_messages',
        'Messages and activity',
        channelDescription:
            'Messages, message requests, mentions, and SyncChat activity.',
        importance: Importance.high,
        priority: Priority.high,
        category: AndroidNotificationCategory.message,
        groupKey: groupKey,
        icon: 'ic_stat_syncchat',
      ),
      iOS: const DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
      ),
    );
    await _notifications.show(
      id: id,
      title: title,
      body: body,
      notificationDetails: details,
      payload: payload,
    );
  }

  static void _queueNotificationTap(String? payload) {
    final value = payload?.trim() ?? '';
    if (value.isEmpty) return;
    if (_notificationTapController.hasListener) {
      _notificationTapController.add(value);
      return;
    }
    if (!_pendingNotificationTaps.contains(value)) {
      _pendingNotificationTaps.add(value);
    }
  }

  static String? _messagePayload(Map<String, dynamic> data) {
    final roomId = data['roomId']?.toString().trim() ?? '';
    if (roomId.isNotEmpty) return roomId;
    final requestId = data['requestId']?.toString().trim() ?? '';
    return requestId.isEmpty ? null : requestId;
  }

  static Future<void> dispose() async {
    await _foregroundSubscription?.cancel();
    await _openedSubscription?.cancel();
    _foregroundSubscription = null;
    _openedSubscription = null;
  }

  static String _fallbackTitle(String? type) {
    switch (type) {
      case 'message_request':
        return 'New message request';
      case 'mention':
        return 'You were mentioned';
      case 'reaction':
        return 'New reaction';
      case 'message':
        return 'New message';
      default:
        return 'SyncChat';
    }
  }

  static int _notificationId(String seed) {
    var hash = 17;
    for (final code in seed.codeUnits) {
      hash = 37 * hash + code;
    }
    return hash.abs() & 0x7fffffff;
  }
}
