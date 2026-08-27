import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:syncchat_mobile/core/api_client.dart';
import 'package:syncchat_mobile/core/public_app_config.dart';
import 'package:syncchat_mobile/core/runtime_upload_policy.dart';

void main() {
  test('runtime upload policy applies feature flags, limits, and allowed types', () {
    final policy = RuntimeUploadPolicy();

    policy.apply(
      const PublicAppConfig(
        featureFlags: {
          'uploads': false,
          'status': true,
          'calls': true,
          'groups': true,
          'channels': true,
          'communities': true,
        },
        chatUploadLimitMb: 24,
        allowedUploadTypes: ['image', 'audio'],
      ),
    );

    expect(policy.chatUploadLimitMb, 24);
    expect(policy.uploadsEnabled, isFalse);
    expect(policy.allowedTypes, {'image', 'audio'});
    expect(policy.allows('image'), isFalse);
  });

  test('runtime upload policy preserves an explicit empty allowed type list', () {
    final policy = RuntimeUploadPolicy();

    policy.apply(
      const PublicAppConfig(
        allowedUploadTypes: [],
      ),
    );

    expect(policy.uploadsEnabled, isTrue);
    expect(policy.allowedTypes, isEmpty);
    expect(policy.allows('document'), isFalse);
  });

  test('runtime upload policy classifies common attachment extensions', () {
    expect(RuntimeUploadPolicy.classifyFilename('photo.JPG'), 'image');
    expect(RuntimeUploadPolicy.classifyFilename('clip.webm'), 'video');
    expect(RuntimeUploadPolicy.classifyFilename('note.opus'), 'audio');
    expect(RuntimeUploadPolicy.classifyFilename('report.pdf'), 'document');
    expect(RuntimeUploadPolicy.classifyFilename('README'), 'document');
  });

  test('runtime upload policy rejects a disabled attachment category', () async {
    final directory = await Directory.systemTemp.createTemp('syncchat-policy-');
    addTearDown(() => directory.delete(recursive: true));
    final file = File('${directory.path}/voice.mp3');
    await file.writeAsBytes([1, 2, 3]);

    final policy = RuntimeUploadPolicy(
      allowedTypes: const ['image', 'document'],
    );

    await expectLater(
      policy.validateFile(filePath: file.path, filename: 'voice.mp3'),
      throwsA(
        isA<ApiException>()
            .having((error) => error.statusCode, 'statusCode', 415)
            .having(
              (error) => error.message,
              'message',
              contains('Audio uploads are disabled'),
            ),
      ),
    );
  });

  test('runtime upload policy rejects files above the runtime max size', () async {
    final directory = await Directory.systemTemp.createTemp('syncchat-size-');
    addTearDown(() => directory.delete(recursive: true));
    final file = File('${directory.path}/large.pdf');
    await file.writeAsBytes(List<int>.filled(1024 * 1024 + 1, 7));

    final policy = RuntimeUploadPolicy(chatUploadLimitMb: 1);

    await expectLater(
      policy.validateFile(filePath: file.path, filename: 'large.pdf'),
      throwsA(
        isA<ApiException>()
            .having((error) => error.statusCode, 'statusCode', 413)
            .having((error) => error.message, 'message', contains('Max 1 MB')),
      ),
    );
  });
}
