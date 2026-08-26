import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('background notification routing keeps room id and message channel', () {
    final background =
        File('lib/core/background_message_handler.dart').readAsStringSync();
    final navigation =
        File('lib/widgets/notification_navigation_layer.dart').readAsStringSync();

    expect(background, contains("'syncchat_messages'"));
    expect(background, contains("data['roomId']"));
    expect(background, contains("data['type']?.toString() == 'incoming_call'"));
    expect(navigation, contains('notificationTaps'));
  });
}
