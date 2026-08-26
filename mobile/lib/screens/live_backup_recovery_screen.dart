import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';
import '../widgets.dart';

class LiveBackupRecoveryScreen extends StatefulWidget {
  const LiveBackupRecoveryScreen({
    super.key,
    this.initialSection = 'backup',
  });

  final String initialSection;

  @override
  State<LiveBackupRecoveryScreen> createState() =>
      _LiveBackupRecoveryScreenState();
}

class _LiveBackupRecoveryScreenState extends State<LiveBackupRecoveryScreen> {
  Map<String, dynamic> recovery = const {};
  Map<String, dynamic> export = const {};
  bool loading = true;
  bool busy = false;
  String? lastBackupPath;
  String? error;

  static const restoreSections = ['profile', 'settings', 'contacts', 'statuses'];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }
    try {
      final result = await Future.wait<dynamic>([
        context.services.accountStorage.recoveryStatus(),
        context.services.accountStorage.exportStatus(),
      ]);
      if (!mounted) return;
      setState(() {
        recovery = Map<String, dynamic>.from(result[0] as Map);
        export = Map<String, dynamic>.from(result[1] as Map);
        loading = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = _errorText(failure);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final twoFactorEnabled = recovery['enabled'] == true;
    final remaining = (recovery['remaining'] as num?)?.toInt() ?? 0;
    return SyncStandardPage(
      title: 'Backup & recovery',
      actions: [IconButton(onPressed: busy ? null : _load, icon: const Icon(Icons.refresh_rounded))],
      child: loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 36),
              children: [
                if (error != null) ...[
                  SyncSoftCard(
                    child: Row(
                      children: [
                        const Icon(Icons.error_outline_rounded, color: SyncColors.danger),
                        const SizedBox(width: 10),
                        Expanded(child: Text(error!)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                ],
                SyncFeatureCard(
                  icon: Icons.backup_outlined,
                  title: 'Encrypted account backup',
                  body:
                      'Create an AES-256-GCM encrypted archive protected by your own password. Restore only the sections you choose.',
                ),
                const SizedBox(height: 14),
                SyncSoftCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      ListTile(
                        leading: const Icon(Icons.download_for_offline_outlined, color: SyncColors.sky),
                        title: const Text('Create encrypted backup'),
                        subtitle: const Text('Profile, settings, contacts and statuses'),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: busy ? null : _createBackup,
                      ),
                      Divider(height: 1, color: context.border),
                      ListTile(
                        leading: const Icon(Icons.restore_rounded, color: SyncColors.sky),
                        title: const Text('Restore from backup'),
                        subtitle: const Text('Choose an encrypted SyncChat archive'),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: busy ? null : _restoreBackup,
                      ),
                      if (lastBackupPath != null) ...[
                        Divider(height: 1, color: context.border),
                        ListTile(
                          leading: const Icon(Icons.folder_outlined, color: SyncColors.success),
                          title: const Text('Latest backup saved'),
                          subtitle: Text(lastBackupPath!, maxLines: 3, overflow: TextOverflow.ellipsis),
                          trailing: IconButton(
                            tooltip: 'Copy path',
                            onPressed: () => Clipboard.setData(ClipboardData(text: lastBackupPath!)),
                            icon: const Icon(Icons.copy_rounded),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                _section(context, 'Account information export'),
                SyncSoftCard(
                  padding: EdgeInsets.zero,
                  child: ListTile(
                    leading: const Icon(Icons.inventory_2_outlined, color: SyncColors.sky),
                    title: const Text('Request account export'),
                    subtitle: Text(_exportSubtitle(export)),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: busy ? null : _requestExport,
                  ),
                ),
                const SizedBox(height: 20),
                _section(context, 'Two-factor recovery codes'),
                SyncSoftCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      ListTile(
                        leading: Icon(
                          twoFactorEnabled ? Icons.verified_user_outlined : Icons.shield_outlined,
                          color: twoFactorEnabled ? SyncColors.success : context.muted,
                        ),
                        title: Text(twoFactorEnabled ? '2FA enabled' : '2FA is not enabled'),
                        subtitle: Text(
                          twoFactorEnabled
                              ? '$remaining recovery code${remaining == 1 ? '' : 's'} remaining'
                              : 'Enable Google 2FA before generating recovery codes.',
                        ),
                      ),
                      if (twoFactorEnabled) ...[
                        Divider(height: 1, color: context.border),
                        ListTile(
                          leading: const Icon(Icons.key_rounded, color: SyncColors.sky),
                          title: Text(remaining > 0 ? 'Regenerate recovery codes' : 'Generate recovery codes'),
                          subtitle: const Text('Requires your password and current authenticator code'),
                          onTap: busy ? null : _generateRecoveryCodes,
                        ),
                        if (remaining > 0) ...[
                          Divider(height: 1, color: context.border),
                          ListTile(
                            leading: const Icon(Icons.key_off_outlined, color: SyncColors.danger),
                            title: const Text('Revoke recovery codes'),
                            subtitle: const Text('All existing unused codes will stop working'),
                            onTap: busy ? null : _revokeRecoveryCodes,
                          ),
                        ],
                      ],
                    ],
                  ),
                ),
                if (busy) ...[
                  const SizedBox(height: 20),
                  const Center(child: CircularProgressIndicator()),
                ],
              ],
            ),
    );
  }

  Future<void> _createBackup() async {
    final passphrase = await _passwordPrompt(
      title: 'Backup password',
      label: 'Password (minimum 8 characters)',
      confirm: true,
    );
    if (passphrase == null || !mounted) return;
    setState(() => busy = true);
    try {
      final archive = await context.services.accountStorage.createBackup(passphrase);
      final base = await getApplicationDocumentsDirectory();
      final directory = Directory('${base.path}${Platform.pathSeparator}SyncChat Backups');
      await directory.create(recursive: true);
      final safeName = archive.filename.replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '-');
      final file = File('${directory.path}${Platform.pathSeparator}$safeName');
      await file.writeAsBytes(archive.bytes, flush: true);
      if (!mounted) return;
      setState(() {
        lastBackupPath = file.path;
        busy = false;
      });
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Backup created'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Encrypted backup saved locally:'),
              const SizedBox(height: 8),
              SelectableText(file.path),
              if (archive.sections.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text('Sections: ${archive.sections.join(', ')}'),
              ],
              const SizedBox(height: 12),
              const Text('Keep the backup password separately. SyncChat cannot recover it.'),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: file.path));
                Navigator.pop(dialogContext);
              },
              child: const Text('Copy path'),
            ),
            FilledButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Done')),
          ],
        ),
      );
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busy = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _restoreBackup() async {
    final picked = await FilePicker.platform.pickFiles(
      allowMultiple: false,
      withData: false,
    );
    if (picked == null || picked.files.isEmpty || !mounted) return;
    final path = picked.files.single.path;
    if (path == null || path.isEmpty) {
      _snack('The selected backup file is not available on this device.');
      return;
    }
    final draft = await showDialog<_RestoreDraft>(
      context: context,
      builder: (_) => const _RestoreDialog(sections: restoreSections),
    );
    if (draft == null || !mounted) return;

    setState(() => busy = true);
    try {
      final result = await context.services.accountStorage.restoreBackup(
        filePath: path,
        passphrase: draft.passphrase,
        selections: draft.sections,
      );
      if (!mounted) return;
      setState(() => busy = false);
      final restored = result['restored'] is List
          ? (result['restored'] as List).map((item) => item.toString()).toList()
          : <String>[];
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Restore complete'),
          content: Text(
            restored.isEmpty
                ? 'No matching sections were restored.'
                : 'Restored: ${restored.join(', ')}',
          ),
          actions: [
            FilledButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Done')),
          ],
        ),
      );
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busy = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _requestExport() async {
    setState(() => busy = true);
    try {
      final result = await context.services.accountStorage.requestExport();
      if (!mounted) return;
      setState(() {
        export = result;
        busy = false;
      });
      _snack('Account export is ready and the configured email delivery was triggered.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busy = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _generateRecoveryCodes() async {
    final credentials = await showDialog<_RecoveryCredentials>(
      context: context,
      builder: (_) => const _RecoveryCredentialsDialog(
        title: 'Generate recovery codes',
      ),
    );
    if (credentials == null || !mounted) return;
    setState(() => busy = true);
    try {
      final result = await context.services.accountStorage.generateRecoveryCodes(
        password: credentials.password,
        code: credentials.code,
      );
      final codes = result['codes'] is List
          ? (result['codes'] as List).map((item) => item.toString()).toList(growable: false)
          : const <String>[];
      if (!mounted) return;
      setState(() {
        busy = false;
        recovery = {
          ...recovery,
          'remaining': (result['remaining'] as num?)?.toInt() ?? codes.length,
          'generatedAt': result['generatedAt'],
          'revokedAt': null,
        };
      });
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Save these recovery codes'),
          content: SizedBox(
            width: 440,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Each code can be used once. They will not be shown again.'),
                const SizedBox(height: 14),
                SelectableText(
                  codes.join('\n'),
                  style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Clipboard.setData(ClipboardData(text: codes.join('\n'))),
              child: const Text('Copy all'),
            ),
            FilledButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('I saved them')),
          ],
        ),
      );
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busy = false);
      _snack(_errorText(failure));
    }
  }

  Future<void> _revokeRecoveryCodes() async {
    final credentials = await showDialog<_RecoveryCredentials>(
      context: context,
      builder: (_) => const _RecoveryCredentialsDialog(
        title: 'Revoke recovery codes',
      ),
    );
    if (credentials == null || !mounted) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Revoke all codes?'),
        content: const Text('All unused recovery codes will immediately stop working.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Revoke')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => busy = true);
    try {
      await context.services.accountStorage.revokeRecoveryCodes(
        password: credentials.password,
        code: credentials.code,
      );
      final status = await context.services.accountStorage.recoveryStatus();
      if (!mounted) return;
      setState(() {
        recovery = status;
        busy = false;
      });
      _snack('Recovery codes revoked.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() => busy = false);
      _snack(_errorText(failure));
    }
  }

  Future<String?> _passwordPrompt({
    required String title,
    required String label,
    bool confirm = false,
  }) async {
    final first = TextEditingController();
    final second = TextEditingController();
    String? error;
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (_, setDialogState) => AlertDialog(
          title: Text(title),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: first,
                obscureText: true,
                autofocus: true,
                decoration: InputDecoration(labelText: label),
              ),
              if (confirm) ...[
                const SizedBox(height: 10),
                TextField(
                  controller: second,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Confirm password'),
                ),
              ],
              if (error != null) ...[
                const SizedBox(height: 8),
                Text(error!, style: const TextStyle(color: SyncColors.danger)),
              ],
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                if (first.text.length < 8) {
                  setDialogState(() => error = 'Password must be at least 8 characters.');
                  return;
                }
                if (confirm && first.text != second.text) {
                  setDialogState(() => error = 'Passwords do not match.');
                  return;
                }
                Navigator.pop(dialogContext, first.text);
              },
              child: const Text('Continue'),
            ),
          ],
        ),
      ),
    );
    first.dispose();
    second.dispose();
    return result;
  }

  void _snack(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }
}

class _RestoreDraft {
  const _RestoreDraft({required this.passphrase, required this.sections});
  final String passphrase;
  final List<String> sections;
}

class _RestoreDialog extends StatefulWidget {
  const _RestoreDialog({required this.sections});
  final List<String> sections;

  @override
  State<_RestoreDialog> createState() => _RestoreDialogState();
}

class _RestoreDialogState extends State<_RestoreDialog> {
  final passphrase = TextEditingController();
  late final Set<String> selected = widget.sections.toSet();
  String? error;

  @override
  void dispose() {
    passphrase.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Restore backup'),
        content: SizedBox(
          width: 440,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: passphrase,
                  obscureText: true,
                  autofocus: true,
                  decoration: const InputDecoration(labelText: 'Backup password'),
                ),
                const SizedBox(height: 12),
                const Align(
                  alignment: Alignment.centerLeft,
                  child: Text('Restore sections', style: TextStyle(fontWeight: FontWeight.w900)),
                ),
                ...widget.sections.map(
                  (section) => CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: selected.contains(section),
                    title: Text(section[0].toUpperCase() + section.substring(1)),
                    onChanged: (value) => setState(() {
                      if (value == true) {
                        selected.add(section);
                      } else {
                        selected.remove(section);
                      }
                    }),
                  ),
                ),
                if (error != null) Text(error!, style: const TextStyle(color: SyncColors.danger)),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (passphrase.text.length < 8) {
                setState(() => error = 'Backup password must be at least 8 characters.');
                return;
              }
              if (selected.isEmpty) {
                setState(() => error = 'Choose at least one section.');
                return;
              }
              Navigator.pop(
                context,
                _RestoreDraft(
                  passphrase: passphrase.text,
                  sections: selected.toList(growable: false),
                ),
              );
            },
            child: const Text('Restore'),
          ),
        ],
      );
}

class _RecoveryCredentials {
  const _RecoveryCredentials({required this.password, required this.code});
  final String password;
  final String code;
}

class _RecoveryCredentialsDialog extends StatefulWidget {
  const _RecoveryCredentialsDialog({required this.title});
  final String title;

  @override
  State<_RecoveryCredentialsDialog> createState() =>
      _RecoveryCredentialsDialogState();
}

class _RecoveryCredentialsDialogState
    extends State<_RecoveryCredentialsDialog> {
  final password = TextEditingController();
  final code = TextEditingController();
  String? error;

  @override
  void dispose() {
    password.dispose();
    code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text(widget.title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: password,
              obscureText: true,
              autofocus: true,
              decoration: const InputDecoration(labelText: 'Account password'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: code,
              keyboardType: TextInputType.number,
              maxLength: 8,
              decoration: const InputDecoration(labelText: 'Authenticator code'),
            ),
            if (error != null) Text(error!, style: const TextStyle(color: SyncColors.danger)),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (password.text.isEmpty || code.text.trim().isEmpty) {
                setState(() => error = 'Password and authenticator code are required.');
                return;
              }
              Navigator.pop(
                context,
                _RecoveryCredentials(password: password.text, code: code.text.trim()),
              );
            },
            child: const Text('Continue'),
          ),
        ],
      );
}

Widget _section(BuildContext context, String text) => Padding(
      padding: const EdgeInsets.fromLTRB(6, 0, 6, 8),
      child: Text(
        text.toUpperCase(),
        style: TextStyle(
          color: context.muted,
          fontSize: 11,
          fontWeight: FontWeight.w900,
          letterSpacing: .7,
        ),
      ),
    );

String _exportSubtitle(Map<String, dynamic> value) {
  if (value.isEmpty) return 'Generate an export and send the link to your configured email';
  final expiresAt = DateTime.tryParse(value['expiresAt']?.toString() ?? '')?.toLocal();
  if (expiresAt == null) return 'An account export has been requested';
  return 'Latest export expires ${expiresAt.day}/${expiresAt.month}/${expiresAt.year}';
}

String _errorText(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
