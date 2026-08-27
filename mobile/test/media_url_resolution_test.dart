import 'package:flutter_test/flutter_test.dart';
import 'package:syncchat_mobile/core/app_config.dart';

void main() {
  const config = SyncChatConfig(
    apiBaseUrl: 'https://api.syncchat.live/api',
    socketUrl: 'https://api.syncchat.live',
  );

  test('public absolute image and media URLs stay direct', () {
    expect(
      config.resolveMediaUrl('https://cdn.example.com/avatar.jpg'),
      'https://cdn.example.com/avatar.jpg',
    );
    expect(
      config.resolveMediaUrl('https://storage.example.com/uploads/chat/photo.webp'),
      'https://storage.example.com/uploads/chat/photo.webp',
    );
    expect(
      config.resolveMediaUrl('https://example.com/file.pdf?download=1'),
      'https://example.com/file.pdf?download=1',
    );
  });

  test('legacy relative and localhost uploads resolve to production origin', () {
    expect(
      config.resolveMediaUrl('/uploads/chat/photo.jpg'),
      'https://api.syncchat.live/uploads/chat/photo.jpg',
    );
    expect(
      config.resolveMediaUrl('uploads/avatar/user.png'),
      'https://api.syncchat.live/uploads/avatar/user.png',
    );
    expect(
      config.resolveMediaUrl(
        'http://127.0.0.1:5599/uploads/chat/photo.jpg?size=large#preview',
      ),
      'https://api.syncchat.live/uploads/chat/photo.jpg?size=large#preview',
    );
  });

  test('explicit backend media proxy URL remains untouched', () {
    const proxy =
        'https://api.syncchat.live/api/media/proxy?url=https%3A%2F%2Fstorage.example.com%2Fuploads%2Fphoto.jpg';
    expect(config.resolveMediaUrl(proxy), proxy);
  });

  test('protocol-relative media inherits configured scheme', () {
    expect(
      config.resolveMediaUrl('//cdn.example.com/avatar.png'),
      'https://cdn.example.com/avatar.png',
    );
  });

  test('ordinary non-URL text and filenames are never rewritten', () {
    expect(config.resolveMediaUrl('photo.jpg'), 'photo.jpg');
    expect(config.resolveMediaUrl('Please check photo.jpg'), 'Please check photo.jpg');
    expect(config.resolveMediaUrl('hello world'), 'hello world');
  });
}
