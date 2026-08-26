import 'dart:typed_data';

import 'api_client.dart';

class AccountBackupArchive {
  const AccountBackupArchive({
    required this.bytes,
    required this.filename,
    required this.sections,
  });

  final Uint8List bytes;
  final String filename;
  final List<String> sections;
}

class AccountStorageRepository {
  const AccountStorageRepository(this._api);

  final ApiClient _api;

  Future<Map<String, dynamic>> exportStatus() async =>
      _map((await _api.get('/settings/account-export')).payload);

  Future<Map<String, dynamic>> requestExport() async =>
      _map((await _api.post('/settings/account-export')).payload);

  Future<AccountBackupArchive> createBackup(String passphrase) async {
    if (passphrase.length < 8) {
      throw const ApiException(
        statusCode: 400,
        message: 'Backup password must be at least 8 characters.',
      );
    }
    final response = await _api.download(
      '/settings/account-backup',
      method: 'POST',
      body: {'passphrase': passphrase},
    );
    final sections = (response.headers['x-syncchat-backup-sections'] ?? '')
        .split(',')
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toList(growable: false);
    return AccountBackupArchive(
      bytes: response.bytes,
      filename: response.filename ??
          'syncchat-backup-${DateTime.now().millisecondsSinceEpoch}.scbackup',
      sections: sections,
    );
  }

  Future<Map<String, dynamic>> restoreBackup({
    required String filePath,
    required String passphrase,
    required List<String> selections,
  }) async {
    if (passphrase.length < 8) {
      throw const ApiException(
        statusCode: 400,
        message: 'Backup password must be at least 8 characters.',
      );
    }
    final response = await _api.multipart(
      '/settings/account-restore',
      fieldName: 'archive',
      filePath: filePath,
      fields: {
        'passphrase': passphrase,
        'selections': selections.join(','),
      },
    );
    return _map(response.payload);
  }

  Future<Map<String, dynamic>> recoveryStatus() async => _map(
        (await _api.get('/settings/two-factor/recovery-codes')).payload,
      );

  Future<Map<String, dynamic>> generateRecoveryCodes({
    required String password,
    required String code,
  }) async => _map(
        (await _api.post(
          '/settings/two-factor/recovery-codes',
          body: {'password': password, 'code': code},
        )).payload,
      );

  Future<Map<String, dynamic>> revokeRecoveryCodes({
    required String password,
    required String code,
  }) async => _map(
        (await _api.delete(
          '/settings/two-factor/recovery-codes',
          body: {'password': password, 'code': code},
        )).payload,
      );

  Map<String, dynamic> _map(dynamic payload) {
    if (payload is Map) return Map<String, dynamic>.from(payload);
    return const {};
  }
}
