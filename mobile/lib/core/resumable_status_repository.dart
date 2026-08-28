import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import 'api_client.dart';
import 'feature_repositories.dart';
import 'status_media_uploader.dart';

class ResumableStatusRepository extends StatusRepository {
  ResumableStatusRepository(this._api) : super(_api);

  final ApiClient _api;

  @override
  Future<Map<String, dynamic>> create(Map<String, dynamic> status) async {
    final type = status['type']?.toString().trim().toLowerCase() ?? 'text';
    final dataUrl = status['mediaDataUrl']?.toString() ?? '';
    if (!['photo', 'video'].contains(type) || dataUrl.isEmpty) {
      return super.create(status);
    }

    final comma = dataUrl.indexOf(',');
    if (comma <= 5 || !dataUrl.startsWith('data:')) {
      throw const ApiException(
        statusCode: 400,
        message: 'The selected status media could not be prepared.',
      );
    }

    final header = dataUrl.substring(5, comma);
    final mime = header.split(';').first.trim().toLowerCase();
    if (!header.toLowerCase().contains(';base64') || mime.isEmpty) {
      throw const ApiException(
        statusCode: 400,
        message: 'Unsupported status media encoding.',
      );
    }

    final originalName = status['originalname']?.toString().trim() ?? '';
    final filename = originalName.isNotEmpty
        ? originalName
        : 'status-${DateTime.now().millisecondsSinceEpoch}.${_extensionFor(mime)}';

    final tempRoot = await getTemporaryDirectory();
    final temp = File(
      '${tempRoot.path}${Platform.pathSeparator}syncchat-status-${DateTime.now().microsecondsSinceEpoch}.${_extensionFor(mime)}',
    );

    try {
      final bytes = base64Decode(dataUrl.substring(comma + 1));
      await temp.writeAsBytes(bytes, flush: true);

      final cleanStatus = Map<String, dynamic>.from(status)
        ..remove('mediaDataUrl')
        ..remove('originalname');

      return StatusMediaUploader(_api).postStatus(
        filePath: temp.path,
        filename: filename,
        mime: mime,
        status: cleanStatus,
      );
    } on FormatException {
      throw const ApiException(
        statusCode: 400,
        message: 'The selected status media is invalid.',
      );
    } finally {
      try {
        if (await temp.exists()) await temp.delete();
      } on Object {
        // OS temp cleanup is a fallback if immediate cleanup is unavailable.
      }
    }
  }

  String _extensionFor(String mime) {
    switch (mime) {
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      case 'image/gif':
        return 'gif';
      case 'image/heic':
        return 'heic';
      case 'image/heif':
        return 'heif';
      case 'video/webm':
        return 'webm';
      case 'video/quicktime':
        return 'mov';
      case 'video/mp4':
        return 'mp4';
      default:
        return mime.startsWith('video/') ? 'mp4' : 'jpg';
    }
  }
}
