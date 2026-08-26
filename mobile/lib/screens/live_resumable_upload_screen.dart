import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';

class LiveResumableUploadScreen extends StatefulWidget {
  const LiveResumableUploadScreen({super.key});

  @override
  State<LiveResumableUploadScreen> createState() =>
      _LiveResumableUploadScreenState();
}

class _LiveResumableUploadScreenState
    extends State<LiveResumableUploadScreen> {
  static const _storage = FlutterSecureStorage();
  static const _draftKey = 'syncchat.resumable-upload.v1';
  static const _defaultChunkSize = 4 * 1024 * 1024;

  List<Map<String, dynamic>> rooms = const [];
  String? selectedRoomId;
  String? filePath;
  String? filename;
  int fileSize = 0;
  String? uploadId;
  int offset = 0;
  int chunkSize = _defaultChunkSize;

  bool loading = true;
  bool uploading = false;
  bool paused = false;
  bool cancelling = false;
  bool completed = false;
  bool cancelRequested = false;
  String? error;
  double bytesPerSecond = 0;
  Duration? eta;
  http.Client? activeClient;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  @override
  void dispose() {
    activeClient?.close();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    try {
      final inboxes = await context.services.inbox.list();
      final available = inboxes
          .where(
            (item) => item['roomId']?.toString().trim().isNotEmpty == true,
          )
          .toList(growable: false);

      Map<String, dynamic>? draft = await _readDraft();
      String? restoredPath = draft == null
          ? null
          : draft['filePath']?.toString();

      if (restoredPath != null && !await File(restoredPath).exists()) {
        restoredPath = null;
        draft = null;
        await _deleteDraft();
      }

      final restoredRoomId = draft == null
          ? null
          : draft['roomId']?.toString();
      final restoredFilename = draft == null
          ? null
          : draft['filename']?.toString();
      final restoredFileSize = draft == null
          ? 0
          : (draft['fileSize'] as num?)?.toInt() ?? 0;
      final restoredUploadId = draft == null
          ? null
          : draft['uploadId']?.toString();
      final restoredOffset = draft == null
          ? 0
          : (draft['offset'] as num?)?.toInt() ?? 0;
      final restoredChunkSize = draft == null
          ? _defaultChunkSize
          : (draft['chunkSize'] as num?)?.toInt() ?? _defaultChunkSize;
      final roomStillExists = restoredRoomId != null &&
          available.any(
            (item) => item['roomId']?.toString() == restoredRoomId,
          );

      if (!mounted) return;
      setState(() {
        rooms = available;
        selectedRoomId = roomStillExists
            ? restoredRoomId
            : (available.isEmpty ? null : available.first['roomId']?.toString());
        filePath = restoredPath;
        filename = restoredFilename;
        fileSize = restoredFileSize;
        uploadId = restoredUploadId;
        offset = restoredOffset;
        chunkSize = restoredChunkSize;
        paused = restoredUploadId != null && restoredPath != null;
        loading = false;
      });

      if (restoredUploadId != null && restoredPath != null) {
        try {
          await _syncServerStatus(silent: true);
        } on ApiException catch (failure) {
          if (failure.statusCode == 404 || failure.statusCode == 410) {
            if (!mounted) return;
            setState(() {
              uploadId = null;
              offset = 0;
              paused = false;
            });
            await _persistDraft();
          } else {
            rethrow;
          }
        }
      }
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = _message(failure);
      });
    }
  }

  Future<Map<String, dynamic>?> _readDraft() async {
    try {
      final raw = await _storage.read(key: _draftKey);
      if (raw == null || raw.trim().isEmpty) return null;
      final decoded = jsonDecode(raw);
      return decoded is Map ? Map<String, dynamic>.from(decoded) : null;
    } on Object {
      return null;
    }
  }

  Future<void> _deleteDraft() async {
    try {
      await _storage.delete(key: _draftKey);
    } on Object {
      // Resume metadata is best-effort and must not block uploads.
    }
  }

  Future<void> _pickFile() async {
    if (uploading || cancelling) return;
    final picked = await FilePicker.platform.pickFiles(
      allowMultiple: false,
      withData: false,
    );
    if (picked == null || picked.files.isEmpty || !mounted) return;

    final selected = picked.files.single;
    final path = selected.path;
    if (path == null || path.isEmpty) {
      setState(() {
        error = 'The selected file is not accessible on this device.';
      });
      return;
    }

    final size = await File(path).length();
    await _cancelServerSession(clearFile: false);
    if (!mounted) return;
    setState(() {
      filePath = path;
      filename = selected.name;
      fileSize = size;
      uploadId = null;
      offset = 0;
      completed = false;
      paused = false;
      error = null;
      bytesPerSecond = 0;
      eta = null;
      cancelRequested = false;
    });
    await _persistDraft();
  }

  Future<void> _startOrResume() async {
    if (uploading || cancelling) return;
    if (filePath == null || filename == null || fileSize <= 0) {
      setState(() => error = 'Choose a file first.');
      return;
    }
    if (selectedRoomId == null) {
      setState(() => error = 'Choose a destination chat.');
      return;
    }

    cancelRequested = false;
    setState(() {
      uploading = true;
      paused = false;
      completed = false;
      error = null;
    });

    try {
      if (uploadId == null) {
        await _createSession();
      } else {
        try {
          await _syncServerStatus(silent: true);
        } on ApiException catch (failure) {
          if (failure.statusCode == 404 || failure.statusCode == 410) {
            if (!mounted) return;
            setState(() {
              uploadId = null;
              offset = 0;
            });
            await _createSession();
          } else {
            rethrow;
          }
        }
      }

      if (!mounted || paused || cancelRequested) return;
      await _pump();
    } on Object catch (failure) {
      if (!mounted || paused || cancelRequested) return;
      setState(() {
        uploading = false;
        paused = true;
        error = '${_message(failure)} Upload is paused and can be resumed.';
      });
      await _persistDraft();
    }
  }

  Future<void> _createSession() async {
    final localFile = File(filePath!);
    final actualSize = await localFile.length();
    if (actualSize != fileSize) {
      fileSize = actualSize;
    }

    final response = await context.services.api.post(
      '/chats/uploads/resumable',
      body: {
        'filename': filename,
        'mime': _mimeHint(filename!),
        'size': actualSize,
        'chunkSize': _defaultChunkSize,
      },
    );
    final payload = _map(response.payload);
    final id = payload['uploadId']?.toString() ?? '';
    if (id.isEmpty) {
      throw const ApiException(
        statusCode: 500,
        message: 'Upload session ID is missing.',
      );
    }

    if (!mounted) return;
    setState(() {
      uploadId = id;
      offset = (payload['offset'] as num?)?.toInt() ?? 0;
      chunkSize =
          (payload['chunkSize'] as num?)?.toInt() ?? _defaultChunkSize;
    });
    await _persistDraft();
  }

  Future<void> _syncServerStatus({bool silent = false}) async {
    final id = uploadId;
    if (id == null || id.isEmpty) return;
    final response = await context.services.api.get(
      '/chats/uploads/resumable/$id',
    );
    final payload = _map(response.payload);
    if (!mounted) return;
    setState(() {
      offset = (payload['offset'] as num?)?.toInt() ?? offset;
      chunkSize = (payload['chunkSize'] as num?)?.toInt() ?? chunkSize;
      if (!silent) error = null;
    });
    await _persistDraft();
  }

  Future<void> _pump() async {
    final localPath = filePath!;
    final id = uploadId!;
    final localFile = File(localPath);
    final actualSize = await localFile.length();
    if (actualSize != fileSize) {
      throw const ApiException(
        statusCode: 409,
        message:
            'The local file changed after this upload started. Choose it again.',
      );
    }

    final handle = await localFile.open(mode: FileMode.read);
    final startedAt = DateTime.now();
    final startOffset = offset;

    try {
      await handle.setPosition(offset);
      while (offset < fileSize && !paused && !cancelRequested) {
        final remaining = fileSize - offset;
        final nextSize = math.min(chunkSize, remaining);
        final chunk = await handle.read(nextSize);
        if (chunk.isEmpty) {
          throw const ApiException(
            statusCode: 500,
            message: 'Unexpected end of local file.',
          );
        }

        final before = offset;
        final payload = await _sendChunk(id, before, chunk);
        final nextOffset =
            (payload['offset'] as num?)?.toInt() ?? (before + chunk.length);
        if (nextOffset <= before) {
          throw const ApiException(
            statusCode: 409,
            message: 'Server did not advance the upload offset.',
          );
        }
        if (!mounted) return;

        final elapsedSeconds =
            DateTime.now().difference(startedAt).inMilliseconds / 1000;
        final transferred = nextOffset - startOffset;
        final speed = elapsedSeconds > 0
            ? transferred / elapsedSeconds
            : 0.0;

        setState(() {
          offset = nextOffset;
          bytesPerSecond = speed;
          eta = speed > 0
              ? Duration(
                  seconds: ((fileSize - nextOffset) / speed).ceil(),
                )
              : null;
        });
        await _persistDraft();
      }
    } finally {
      await handle.close();
    }

    if (!mounted || paused || cancelRequested) {
      if (mounted) setState(() => uploading = false);
      return;
    }

    final completedResponse = await context.services.api.post(
      '/chats/uploads/resumable/$id/complete',
    );
    final uploadedFile = _map(completedResponse.payload);
    final room = rooms.firstWhere(
      (item) => item['roomId']?.toString() == selectedRoomId,
      orElse: () => <String, dynamic>{},
    );
    if (room.isEmpty) {
      throw const ApiException(
        statusCode: 404,
        message: 'Destination chat is no longer available.',
      );
    }

    await context.services.chat.sendAttachment(
      inbox: room,
      file: uploadedFile,
    );
    await _deleteDraft();
    if (!mounted) return;
    setState(() {
      uploading = false;
      paused = false;
      completed = true;
      uploadId = null;
      offset = fileSize;
      error = null;
      eta = Duration.zero;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('${filename ?? 'File'} uploaded and sent.')),
    );
  }

  Future<Map<String, dynamic>> _sendChunk(
    String id,
    int chunkOffset,
    List<int> bytes,
  ) async {
    Object? lastFailure;

    for (var attempt = 0; attempt < 3; attempt += 1) {
      if (paused || cancelRequested) {
        throw const ApiException(statusCode: 499, message: 'Upload paused.');
      }

      try {
        final token = await context.services.sessionStore.readAccessToken();
        if (token == null || token.isEmpty) {
          throw const ApiException(
            statusCode: 401,
            message: 'Authentication required.',
          );
        }

        final client = http.Client();
        activeClient = client;
        final request = http.Request(
          'PUT',
          context.services.config.apiUri(
            '/chats/uploads/resumable/$id/chunk',
          ),
        )
          ..headers.addAll({
            'accept': 'application/json',
            'content-type': 'application/octet-stream',
            'authorization': 'Bearer $token',
            'upload-offset': chunkOffset.toString(),
          })
          ..bodyBytes = bytes;

        final streamed = await client.send(request);
        final body = await streamed.stream.bytesToString();
        client.close();
        if (identical(activeClient, client)) activeClient = null;

        final dynamic decoded = body.trim().isEmpty
            ? <String, dynamic>{}
            : jsonDecode(body);
        final envelope = decoded is Map
            ? Map<String, dynamic>.from(decoded)
            : <String, dynamic>{};

        if (streamed.statusCode < 200 ||
            streamed.statusCode >= 300 ||
            envelope['success'] != true) {
          throw ApiException(
            statusCode: streamed.statusCode,
            message:
                envelope['message']?.toString() ?? 'Upload chunk failed.',
            payload: envelope['payload'],
          );
        }

        return _map(envelope['payload']);
      } on Object catch (failure) {
        activeClient?.close();
        activeClient = null;
        if (paused || cancelRequested) rethrow;
        lastFailure = failure;

        if (failure is ApiException && failure.statusCode == 409) {
          await _syncServerStatus(silent: true);
          if (offset != chunkOffset) return {'offset': offset};
        }

        if (attempt < 2) {
          await Future<void>.delayed(
            Duration(milliseconds: 400 * (attempt + 1)),
          );
        }
      }
    }

    if (lastFailure is ApiException) throw lastFailure;
    throw ApiException(
      statusCode: 0,
      message: _message(lastFailure ?? Exception('Chunk upload failed.')),
    );
  }

  void _pause() {
    if (!uploading) return;
    setState(() {
      paused = true;
      uploading = false;
    });
    activeClient?.close();
    activeClient = null;
    _persistDraft();
  }

  Future<void> _cancel() async {
    if (cancelling) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancel upload?'),
        content: const Text(
          'Uploaded temporary chunks will be deleted from the server.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Keep upload'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Cancel upload'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => cancelling = true);
    cancelRequested = true;
    activeClient?.close();
    activeClient = null;
    await _cancelServerSession(clearFile: false);

    if (!mounted) return;
    setState(() {
      cancelling = false;
      uploading = false;
      paused = false;
      completed = false;
      uploadId = null;
      offset = 0;
      bytesPerSecond = 0;
      eta = null;
      error = null;
    });
  }

  Future<void> _cancelServerSession({required bool clearFile}) async {
    final id = uploadId;
    if (id != null && id.isNotEmpty) {
      try {
        await context.services.api.delete('/chats/uploads/resumable/$id');
      } on Object {
        // Session may already have expired or completed.
      }
    }
    await _deleteDraft();

    if (clearFile && mounted) {
      setState(() {
        filePath = null;
        filename = null;
        fileSize = 0;
      });
    }
  }

  Future<void> _persistDraft() async {
    if (filePath == null || filename == null || selectedRoomId == null) return;
    try {
      await _storage.write(
        key: _draftKey,
        value: jsonEncode({
          'roomId': selectedRoomId,
          'filePath': filePath,
          'filename': filename,
          'fileSize': fileSize,
          'uploadId': uploadId,
          'offset': offset,
          'chunkSize': chunkSize,
        }),
      );
    } on Object {
      // Upload can continue even if local resume metadata cannot be persisted.
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Large file upload'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 34),
              children: [
                _intro(),
                const SizedBox(height: 16),
                _destination(),
                const SizedBox(height: 12),
                _fileCard(),
                if (error != null) ...[
                  const SizedBox(height: 12),
                  _errorCard(error!),
                ],
                if (filePath != null) ...[
                  const SizedBox(height: 16),
                  _progressCard(),
                  const SizedBox(height: 14),
                  _actions(),
                ],
              ],
            ),
    );
  }

  Widget _intro() => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: SyncColors.sky.withValues(alpha: .08),
          borderRadius: BorderRadius.circular(17),
          border: Border.all(
            color: SyncColors.sky.withValues(alpha: .2),
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(
              Icons.cloud_upload_outlined,
              color: SyncColors.sky,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Large files upload in verified chunks. Pause, resume, retry after network loss, or reopen this screen after an app restart and continue from the server-confirmed byte offset.',
                style: TextStyle(
                  color: context.muted,
                  height: 1.4,
                  fontSize: 12,
                ),
              ),
            ),
          ],
        ),
      );

  Widget _destination() => Card(
        color: context.panel,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(17),
          side: BorderSide(color: context.border),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
          child: DropdownButtonFormField<String>(
            initialValue: rooms.any(
              (item) => item['roomId']?.toString() == selectedRoomId,
            )
                ? selectedRoomId
                : null,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Send to',
              prefixIcon: Icon(Icons.forum_outlined),
              border: InputBorder.none,
            ),
            items: rooms
                .map(
                  (room) => DropdownMenuItem(
                    value: room['roomId']?.toString(),
                    child: Text(
                      _roomName(room),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                )
                .toList(growable: false),
            onChanged: uploading || uploadId != null
                ? null
                : (value) {
                    setState(() => selectedRoomId = value);
                    _persistDraft();
                  },
          ),
        ),
      );

  Widget _fileCard() => Card(
        color: context.panel,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(17),
          side: BorderSide(color: context.border),
        ),
        child: ListTile(
          contentPadding: const EdgeInsets.fromLTRB(14, 8, 10, 8),
          leading: const Icon(
            Icons.insert_drive_file_outlined,
            color: SyncColors.sky,
            size: 30,
          ),
          title: Text(
            filename ?? 'Choose a file',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
          subtitle: Text(
            filePath == null
                ? 'Resumable upload supports the server-configured chat limit.'
                : _bytes(fileSize),
          ),
          trailing: IconButton(
            tooltip: filePath == null ? 'Choose file' : 'Choose another file',
            onPressed: uploading || cancelling ? null : _pickFile,
            icon: const Icon(Icons.folder_open_rounded),
          ),
          onTap: uploading || cancelling ? null : _pickFile,
        ),
      );

  Widget _progressCard() {
    final progress = fileSize > 0
        ? (offset / fileSize).clamp(0.0, 1.0)
        : 0.0;
    final state = completed
        ? 'Sent'
        : uploading
            ? 'Uploading'
            : paused
                ? 'Paused'
                : uploadId != null
                    ? 'Ready to resume'
                    : 'Ready';

    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: context.panel,
        borderRadius: BorderRadius.circular(17),
        border: Border.all(color: context.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  state,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
              Text(
                '${(progress * 100).toStringAsFixed(1)}%',
                style: const TextStyle(
                  fontWeight: FontWeight.w900,
                  color: SyncColors.sky,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          LinearProgressIndicator(
            value: progress,
            minHeight: 8,
            borderRadius: BorderRadius.circular(8),
          ),
          const SizedBox(height: 10),
          Text(
            '${_bytes(offset)} of ${_bytes(fileSize)}',
            style: TextStyle(color: context.muted, fontSize: 12),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _stat(
                Icons.speed_rounded,
                bytesPerSecond > 0
                    ? '${_bytes(bytesPerSecond.round())}/s'
                    : '—',
              ),
              _stat(
                Icons.timer_outlined,
                eta == null ? 'ETA —' : 'ETA ${_duration(eta!)}',
              ),
              _stat(
                Icons.layers_outlined,
                '${_bytes(chunkSize)} chunks',
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _actions() => Row(
        children: [
          Expanded(
            child: FilledButton.icon(
              onPressed: completed || cancelling
                  ? null
                  : uploading
                      ? _pause
                      : _startOrResume,
              icon: Icon(
                uploading
                    ? Icons.pause_rounded
                    : uploadId != null
                        ? Icons.play_arrow_rounded
                        : Icons.cloud_upload_outlined,
              ),
              label: Text(
                uploading
                    ? 'Pause'
                    : uploadId != null
                        ? 'Resume'
                        : 'Upload & send',
              ),
            ),
          ),
          const SizedBox(width: 10),
          OutlinedButton.icon(
            onPressed:
                uploadId == null || cancelling || completed ? null : _cancel,
            icon: cancelling
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.close_rounded),
            label: const Text('Cancel'),
          ),
        ],
      );

  Widget _stat(IconData icon, String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
        decoration: BoxDecoration(
          color: context.softPanel,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: context.muted),
            const SizedBox(width: 5),
            Text(
              text,
              style: TextStyle(
                color: context.muted,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      );

  Widget _errorCard(String message) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: SyncColors.danger.withValues(alpha: .08),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Text(
          message,
          style: const TextStyle(
            color: SyncColors.danger,
            fontWeight: FontWeight.w700,
          ),
        ),
      );

  Map<String, dynamic> _map(dynamic value) => value is Map
      ? Map<String, dynamic>.from(value)
      : <String, dynamic>{};

  String _roomName(Map<String, dynamic> room) {
    final group = _map(room['group']);
    final channel = _map(room['channel']);
    final profile = _map(room['profile']);
    final candidates = [
      channel['name'],
      group['name'],
      profile['fullname'],
      profile['username'],
      room['name'],
    ];
    for (final value in candidates) {
      final text = value?.toString().trim() ?? '';
      if (text.isNotEmpty) return text;
    }
    return 'Chat';
  }

  String _mimeHint(String name) {
    final lower = name.toLowerCase();
    if (RegExp(r'\.(jpg|jpeg|png|gif|webp|avif|heic)$').hasMatch(lower)) {
      return 'image/*';
    }
    if (RegExp(r'\.(mp4|mov|mkv|webm|m4v)$').hasMatch(lower)) {
      return 'video/*';
    }
    if (RegExp(r'\.(mp3|m4a|aac|wav|ogg|flac)$').hasMatch(lower)) {
      return 'audio/*';
    }
    return 'application/octet-stream';
  }

  String _bytes(int value) {
    const units = ['B', 'KB', 'MB', 'GB'];
    var size = value.toDouble();
    var index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }
    return '${size.toStringAsFixed(index == 0 ? 0 : 1)} ${units[index]}';
  }

  String _duration(Duration value) {
    if (value.inHours > 0) {
      return '${value.inHours}h ${value.inMinutes.remainder(60)}m';
    }
    if (value.inMinutes > 0) {
      return '${value.inMinutes}m ${value.inSeconds.remainder(60)}s';
    }
    return '${math.max(0, value.inSeconds)}s';
  }

  String _message(Object error) => error is ApiException
      ? error.message
      : error.toString().replaceFirst('Exception: ', '');
}
