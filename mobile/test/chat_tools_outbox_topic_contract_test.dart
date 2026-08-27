import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('chat tools exposes real offline queue actions and resumable upload', () {
    final source = File('lib/screens/live_chat_tools_screen.dart').readAsStringSync();

    expect(source, contains('chatCache.readOutbox()'));
    expect(source, contains('repository.drainOutbox()'));
    expect(source, contains("const Text('Flush now')"));
    expect(source, contains("const Text('Retry')"));
    expect(source, contains('LiveResumableUploadScreen'));
    expect(source, contains('Offline send queue'));
  });

  test('chat tools persists and selects group topics like web', () {
    final tools = File('lib/screens/live_chat_tools_screen.dart').readAsStringSync();
    final store = File('lib/core/topic_selection_store.dart').readAsStringSync();

    expect(tools, contains('TopicSelectionStore.read(roomId)'));
    expect(tools, contains('TopicSelectionStore.write(roomId'));
    expect(tools, contains("name: 'All messages'"));
    expect(tools, contains("'topicId': selectedTopicId"));
    expect(store, contains('syncchat.topic.v1.'));
  });

  test('chat repository applies selected topics to transport and history', () {
    final source = File('lib/core/chat_repository.dart').readAsStringSync();

    expect(source, contains('_effectiveTopicId(roomId, topicId)'));
    expect(source, contains("'topicId': effectiveTopicId"));
    expect(source, contains('_filterSelectedTopic(roomId, decrypted)'));
    expect(source, contains("event != 'chat/insert' && event != 'chat/sync-result'"));
    expect(source, contains("item['topicId']?.toString() == selected"));
  });
}
