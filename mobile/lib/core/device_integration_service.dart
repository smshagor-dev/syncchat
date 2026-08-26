import 'dart:async';
import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:permission_handler/permission_handler.dart' as ph;

import 'feature_repositories.dart';
import 'native_call_push.dart';

class DeviceIntegrationService {
  DeviceIntegrationService._();

  static final FlutterLocalNotificationsPlugin _notifications =
      FlutterLocalNotificationsPlugin();
  static StreamSubscription<RemoteMessage>? _foregroundSubscription;
  static bool _initialized = false;

  static Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    const settings = InitializationSettings(
      android: AndroidInitializationSettings('ic_stat_syncchat'),
      iOS: DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      ),
    );
    await _notifications.initialize(settings: settings);

    if (Platform.isAndroid) {
      final androidPlugin = _notifications
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      await androidPlugin?.createNotificationChannel(
        const AndroidNotificationChannel(
          'syncchat_messages',
          'Messages and activity',
          description: 'Messages, message requests, mentions, and SyncChat activity.',
          importance: Importance.high,
        ),
      );
    }
  }

  static Future<Map<ph.Permission, ph.PermissionStatus>> requestCommunicationPermissions() async {
    final permissions = <ph.Permission>[
      ph.Permission.notification,
      ph.Permission.camera,
      ph.Permission.microphone,
      ph.Permission.contacts,
      ph.Permission.photos,
      if (Platform.isAndroid) ph.Permission.videos,
    ];
    return permissions.request();
  }

  static Future<Map<String, dynamic>> syncAddressBook(ContactRepository repository) async {
    final permission = await FlutterContacts.permissions.request(PermissionType.read);
    if (permission != PermissionStatus.granted) {
      throw StateError('Contacts permission is required to find people who use SyncChat.');
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

  static Future<void> startForegroundMessaging() async {
    await initialize();
    if (!Platform.isAndroid) return;
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

      await showNotification(
        id: _notificationId(message.messageId ?? DateTime.now().toIso8601String()),
        title: title,
        body: body,
        payload: data['roomId']?.toString() ?? data['requestId']?.toString(),
      );
    });
  }

  static Future<void> requestNotificationPermission() async {
    await initialize();
    await ph.Permission.notification.request();
    if (Platform.isIOS) {
      await _notifications
          .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()
          ?.requestPermissions(alert: true, badge: true, sound: true);
    }
  }

  static Future<void> showNotification({
    required int id,
    required String title,
    required String body,
    String? payload,
  }) async {
    await initialize();
    const details = NotificationDetails(
      android: AndroidNotificationDetails(
        'syncchat_messages',
        'Messages and activity',
        channelDescription: 'Messages, message requests, mentions, and SyncChat activity.',
        importance: Importance.high,
        priority: Priority.high,
        icon: 'ic_stat_syncchat',
      ),
      iOS: DarwinNotificationDetails(
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

  static Future<void> dispose() async {
    await _foregroundSubscription?.cancel();
    _foregroundSubscription = null;
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
