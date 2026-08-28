import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'api_client.dart';

class StatusMediaUploader {
  const StatusMediaUploader(this._api);

  static const int _chunkBytes = 3 * 1024 * 1024;
  static const int _maxAttempts = 3;

  final ApiClient _api;

  Future<Map<String, dynamic>> postStatus({
    required String filePath,
    required String filename,
    required String mime,
    required Map<String, dynamic> status,
  }) async {
    final file = File(filePath);
    if (!await file.exists()) {
      throw const ApiException(
        statusCode: 400,
        message: 'The selected status media is no longer available.',
      );
    }

    final totalSize = await file.length();
    if (totalSize <= 0) {
      throw const ApiException(
        statusCode: 400,
        message: 'The selected status media is empty.',
      );
    }

    final created = await _api.post(
      '/chat-v2/uploads',
      body: {
        'filename': filename,
        'mime': mime,
        'totalSize': totalSize,
        'chunkSize': _chunkBytes,
      },
    );
    final session = _mapPayload(
      created.payload,
      error: 'Invalid status upload session response.',
    );
    final uploadId = session['uploadId']?.toString().trim() ?? '';
    if (uploadId.isEmpty) {
      throw const ApiException(
        statusCode: 500,
        message: 'Status upload session ID is missing.',
      );
    }

    final serverChunkSize =
        (session['chunkSize'] as num?)?.toInt() ?? _chunkBytes;
    final chunkSize = min(_chunkBytes, max(256 * 1024, serverChunkSize));
    var completed = false;

    try {
      final input = await file.open();
      try {
        var partNumber = 0;
        var remaining = totalSize;
        while (remaining > 0) {
          final count = min(chunkSize, remaining);
          final bytes = await input.read(count);
          if (bytes.isEmpty) {
            throw const ApiException(
              statusCode: 400,
              message: 'Status media ended before upload completed.',
            );
          }
          await _sendPart(
            uploadId: uploadId,
            partNumber: partNumber,
            bytes: bytes,
          );
          remaining -= bytes.length;
          partNumber += 1;
        }
      } finally {
        await input.close();
      }

      final completion = await _api.post(
        '/chat-v2/uploads/$uploadId/complete',
      );
      final uploaded = _mapPayload(
        completion.payload,
        error: 'Invalid completed status upload response.',
      );
      final url = uploaded['url']?.toString().trim() ?? '';
      if (url.isEmpty) {
        throw const ApiException(
          statusCode: 500,
          message: 'Status upload completed without a media URL.',
        );
      }
      completed = true;

      final response = await _postCreatedStatusWithRetry(
        uploadId: uploadId,
        status: status,
      );
      return _mapPayload(response.payload, error: 'Invalid status response.');
    } on Object {
      if (!completed) {
        try {
          await _api.delete('/chat-v2/uploads/$uploadId');
        } on Object {
          // Best-effort cleanup; the server also expires abandoned sessions.
        }
      }
      rethrow;
    }
  }

  Future<ApiEnvelope> _postCreatedStatusWithRetry({
    required String uploadId,
    required Map<String, dynamic> status,
  }) async {
    Object? lastFailure;
    for (var attempt = 1; attempt <= _maxAttempts; attempt++) {
      try {
        return await _api.post(
          '/statuses/from-upload',
          body: {...status, 'mediaUploadId': uploadId},
        );
      } on ApiException catch (failure) {
        lastFailure = failure;
        final retryable = failure.statusCode == 0 ||
            failure.statusCode == 408 ||
            failure.statusCode == 429 ||
            failure.statusCode >= 500;
        if (!retryable || attempt == _maxAttempts) rethrow;
        await Future<void>.delayed(Duration(milliseconds: 250 * attempt));
      }
    }
    throw lastFailure ??
        const ApiException(statusCode: 500, message: 'Status post failed.');
  }

  Future<void> _sendPart({
    required String uploadId,
    required int partNumber,
    required Uint8List bytes,
  }) async {
    Object? lastFailure;
    for (var attempt = 1; attempt <= _maxAttempts; attempt++) {
      try {
        await _api.sendBytes(
          'PUT',
          '/chat-v2/uploads/$uploadId/parts/$partNumber',
          body: bytes,
        );
        return;
      } on ApiException catch (failure) {
        lastFailure = failure;
        final retryable = failure.statusCode == 0 ||
            failure.statusCode == 408 ||
            failure.statusCode == 429 ||
            failure.statusCode >= 500;
        if (!retryable || attempt == _maxAttempts) rethrow;
        await Future<void>.delayed(Duration(milliseconds: 250 * attempt));
      }
    }
    throw lastFailure ??
        const ApiException(statusCode: 500, message: 'Status chunk upload failed.');
  }

  Map<String, dynamic> _mapPayload(dynamic payload, {required String error}) {
    if (payload is Map) return Map<String, dynamic>.from(payload);
    throw ApiException(statusCode: 500, message: error);
  }
}
