import 'dart:io';

import 'api_client.dart';
import 'auth_repository.dart';
import 'cached_repositories.dart';
import 'chat_cache.dart';
import 'e2ee_service.dart';
import 'public_app_config.dart';
import 'realtime_client.dart';

class RuntimeUploadPolicy {
  RuntimeUploadPolicy({
    int chatUploadLimitMb = 100,
    bool uploadsEnabled = true,
    Iterable<String> allowedTypes = const [
      'image',
      'video',
      'audio',
      'document',
    ],
  })  : chatUploadLimitMb = chatUploadLimitMb,
        uploadsEnabled = uploadsEnabled,
        allowedTypes = allowedTypes
            .map((value) => value.trim().toLowerCase())
            .where((value) => value.isNotEmpty)
            .toSet();

  int chatUploadLimitMb;
  bool uploadsEnabled;
  Set<String> allowedTypes;

  int get maxBytes => chatUploadLimitMb * 1024 * 1024;

  void apply(PublicAppConfig runtime) {
    chatUploadLimitMb = runtime.chatUploadLimitMb;
    uploadsEnabled = runtime.featureEnabled('uploads');
    allowedTypes = runtime.allowedUploadTypes
        .map((value) => value.trim().toLowerCase())
        .where((value) => value.isNotEmpty)
        .toSet();
  }

  bool allows(String type) =>
      uploadsEnabled && allowedTypes.contains(type.trim().toLowerCase());

  Future<void> validateFile({
    required String filePath,
    String? filename,
  }) async {
    if (!uploadsEnabled) {
      throw const ApiException(
        statusCode: 403,
        message: 'File uploads are disabled by the administrator.',
      );
    }

    final type = classifyFilename(filename ?? filePath);
    if (!allowedTypes.contains(type)) {
      throw ApiException(
        statusCode: 415,
        message: '${_label(type)} uploads are disabled by the administrator.',
      );
    }

    final file = File(filePath);
    final size = await file.length();
    if (size > maxBytes) {
      throw ApiException(
        statusCode: 413,
        message: 'File is too large. Max $chatUploadLimitMb MB.',
      );
    }
  }

  static String classifyFilename(String value) {
    final name = value.toLowerCase().split('?').first;
    final dot = name.lastIndexOf('.');
    final extension = dot >= 0 ? name.substring(dot + 1) : '';

    if (const {
      'jpg',
      'jpeg',
      'png',
      'gif',
      'webp',
      'bmp',
      'heic',
      'heif',
      'avif',
    }.contains(extension)) {
      return 'image';
    }
    if (const {
      'mp4',
      'm4v',
      'mov',
      'avi',
      'mkv',
      'webm',
      '3gp',
      'mpeg',
      'mpg',
    }.contains(extension)) {
      return 'video';
    }
    if (const {
      'mp3',
      'm4a',
      'aac',
      'wav',
      'ogg',
      'opus',
      'flac',
      'amr',
    }.contains(extension)) {
      return 'audio';
    }
    return 'document';
  }

  static String _label(String type) {
    switch (type) {
      case 'image':
        return 'Image';
      case 'video':
        return 'Video';
      case 'audio':
        return 'Audio';
      default:
        return 'Document';
    }
  }
}

class RuntimePolicyChatRepository extends CachedChatRepository {
  RuntimePolicyChatRepository({
    required ApiClient api,
    required AuthRepository auth,
    required RealtimeClient realtime,
    required E2eeService e2ee,
    required ChatCache cache,
    required RuntimeUploadPolicy runtimeUploadPolicy,
  })  : _runtimeUploadPolicy = runtimeUploadPolicy,
        super(
          api: api,
          auth: auth,
          realtime: realtime,
          e2ee: e2ee,
          cache: cache,
        );

  final RuntimeUploadPolicy _runtimeUploadPolicy;

  @override
  Future<Map<String, dynamic>> uploadAttachment({
    required String filePath,
    String? filename,
  }) async {
    await _runtimeUploadPolicy.validateFile(
      filePath: filePath,
      filename: filename,
    );
    return super.uploadAttachment(filePath: filePath, filename: filename);
  }
}
