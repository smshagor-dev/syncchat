import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'native_call_push.dart';

const _messageChannel = AndroidNotificationChannel(
  'syncchat_messages',
  'Messages and activity',
  description: 'Messages, message requests, mentions, and SyncChat activity.',
  importance: Importance.high,
);

Future<void> registerSyncChatBackgroundMessaging() async {
  if (!Platform.isAndroid) return;
  if (!await NativeCallPushService.ensureFirebaseForAndroid()) return;
  FirebaseMessaging.onBackgroundMessage(syncChatBackgroundMessage);
}

@pragma('vm:entry-point')
Future<void> syncChatBackgroundMessage(RemoteMessage message) async {
  if (!Platform.isAndroid) return;
  await NativeCallPushService.ensureFirebaseForAndroid();
  final data = Map<String, dynamic>.from(message.data);

  if (data['type']?.toString() == 'incoming_call') {
    await NativeCallPushService.showIncomingCall(data);
    return;
  }

  // Android already renders FCM notification payloads while the app is in the
  // background. Only synthesize a local notification for data-only messages to
  // avoid duplicate WhatsApp-style alerts.
  if (message.notification != null) return;

  final plugin = FlutterLocalNotificationsPlugin();
  const initialization = InitializationSettings(
    android: AndroidInitializationSettings('ic_stat_syncchat'),
  );
  await plugin.initialize(settings: initialization);
  final android = plugin.resolvePlatformSpecificImplementation<
      AndroidFlutterLocalNotificationsPlugin>();
  await android?.createNotificationChannel(_messageChannel);

  final roomId = data['roomId']?.toString().trim() ?? '';
  final title = data['title']?.toString().trim().isNotEmpty == true
      ? data['title'].toString().trim()
      : _fallbackTitle(data['type']?.toString());
  final body = data['body']?.toString().trim().isNotEmpty == true
      ? data['body'].toString().trim()
      : data['message']?.toString().trim().isNotEmpty == true
          ? data['message'].toString().trim()
          : data['preview']?.toString().trim().isNotEmpty == true
              ? data['preview'].toString().trim()
              : 'You have new SyncChat activity.';

  final details = NotificationDetails(
    android: AndroidNotificationDetails(
      _messageChannel.id,
      _messageChannel.name,
      channelDescription: _messageChannel.description,
      importance: Importance.high,
      priority: Priority.high,
      category: AndroidNotificationCategory.message,
      groupKey: roomId.isEmpty ? 'syncchat_messages' : 'syncchat_room_$roomId',
      icon: 'ic_stat_syncchat',
    ),
  );
  await plugin.show(
    id: _notificationId(
      message.messageId ?? '${DateTime.now().microsecondsSinceEpoch}',
    ),
    title: title,
    body: body,
    notificationDetails: details,
    payload: roomId.isEmpty ? data['requestId']?.toString() : roomId,
  );
}

String _fallbackTitle(String? type) {
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

int _notificationId(String seed) {
  var hash = 17;
  for (final code in seed.codeUnits) {
    hash = 37 * hash + code;
  }
  return hash.abs() & 0x7fffffff;
}
