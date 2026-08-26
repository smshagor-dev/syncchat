import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'package:qr_flutter/qr_flutter.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';
import '../widgets.dart';

class LiveDeviceLinkSettingsScreen extends StatefulWidget {
  const LiveDeviceLinkSettingsScreen({super.key});

  @override
  State<LiveDeviceLinkSettingsScreen> createState() => _LiveDeviceLinkSettingsScreenState();
}

class _LiveDeviceLinkSettingsScreenState extends State<LiveDeviceLinkSettingsScreen> {
  Map<String, dynamic> request = const {};
  bool loading = false;
  String? error;

  Future<void> _generate() async {
    if (loading) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = await context.services.settings.createDeviceLinkRequest();
      if (!mounted) return;
      setState(() {
        request = result;
        loading = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = _message(failure);
      });
    }
  }

  String get token => (request['token'] ?? '').toString();
  String get linkUrl {
    final value = (request['linkUrl'] ?? request['url'] ?? '').toString();
    if (value.isNotEmpty) return value;
    return token.isEmpty ? '' : 'syncchat://device-link?link=${Uri.encodeQueryComponent(token)}';
  }

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'Link a device',
      actions: [
        IconButton(
          tooltip: 'Create new link',
          onPressed: loading ? null : _generate,
          icon: const Icon(Icons.refresh_rounded),
        ),
      ],
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 36),
        children: [
          const SyncFeatureCard(
            icon: Icons.phonelink_lock_outlined,
            title: 'Link another SyncChat device',
            body: 'Generate the same secure device-link request used by SyncChat Web. Scan its QR from the sign-in screen on the other device.',
          ),
          const SizedBox(height: 18),
          if (request.isEmpty)
            FilledButton.icon(
              onPressed: loading ? null : _generate,
              icon: const Icon(Icons.qr_code_2_rounded),
              label: Text(loading ? 'Generating…' : 'Generate device link'),
            )
          else ...[
            Center(
              child: Container(
                color: Colors.white,
                padding: const EdgeInsets.all(12),
                child: QrImageView(data: linkUrl, size: 230),
              ),
            ),
            const SizedBox(height: 14),
            if ((request['emailHint']?.toString() ?? '').isNotEmpty)
              Center(child: Text('Account: ${request['emailHint']}', style: TextStyle(color: context.muted))),
            if ((request['shortCode']?.toString() ?? '').isNotEmpty) ...[
              const SizedBox(height: 12),
              Center(child: Text(request['shortCode'].toString(), style: const TextStyle(fontSize: 28, letterSpacing: 5, fontWeight: FontWeight.w900))),
              const Center(child: Text('Short code')),
            ],
            if ((request['expiresAt']?.toString() ?? '').isNotEmpty) ...[
              const SizedBox(height: 8),
              Center(child: Text('Expires: ${request['expiresAt']}', style: TextStyle(color: context.muted, fontSize: 12))),
            ],
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: token.isEmpty
                  ? null
                  : () async {
                      await Clipboard.setData(ClipboardData(text: token));
                      if (mounted) _toast('Device-link token copied.');
                    },
              icon: const Icon(Icons.copy_rounded),
              label: const Text('Copy token'),
            ),
          ],
          if (loading) ...[
            const SizedBox(height: 18),
            const LinearProgressIndicator(),
          ],
          if (error != null) ...[
            const SizedBox(height: 14),
            Text(error!, style: const TextStyle(color: SyncColors.danger)),
          ],
        ],
      ),
    );
  }

  void _toast(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
}

class LiveTwoFactorQrScreen extends StatefulWidget {
  const LiveTwoFactorQrScreen({super.key});

  @override
  State<LiveTwoFactorQrScreen> createState() => _LiveTwoFactorQrScreenState();
}

class _LiveTwoFactorQrScreenState extends State<LiveTwoFactorQrScreen> {
  Map<String, dynamic> settings = const {};
  Map<String, dynamic> setup = const {};
  bool loading = true;
  bool busy = false;
  String? error;
  final code = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    code.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final value = await context.services.settings.get();
      if (!mounted) return;
      setState(() {
        settings = value;
        loading = false;
        error = null;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = _message(failure);
      });
    }
  }

  Future<void> _setup() async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final value = await context.services.settings.setupTwoFactor();
      if (!mounted) return;
      setState(() {
        setup = value;
        busy = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        busy = false;
        error = _message(failure);
      });
    }
  }

  String get secret => (setup['secret'] ?? '').toString();

  String get otpAuthUrl {
    final direct = (setup['otpauthUrl'] ?? setup['otpAuthUrl'] ?? setup['uri'] ?? '').toString();
    if (direct.isNotEmpty) return direct;
    if (secret.isEmpty) return '';
    final account = (setup['account'] ?? setup['email'] ?? 'SyncChat').toString();
    final label = Uri.encodeComponent('SyncChat:$account');
    return 'otpauth://totp/$label?secret=${Uri.encodeQueryComponent(secret)}&issuer=SyncChat&algorithm=SHA1&digits=6&period=30';
  }

  Future<void> _enable() async {
    final value = code.text.trim();
    if (value.length != 6 || busy) {
      setState(() => error = 'Enter the current 6-digit authenticator code.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await context.services.settings.enableTwoFactor(value);
      code.clear();
      setup = const {};
      await _load();
      if (mounted) _toast('Google 2FA enabled.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        busy = false;
        error = _message(failure);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final enabled = settings['twoFactorEnabled'] == true;
    return SyncStandardPage(
      title: 'Google 2FA',
      actions: [IconButton(onPressed: busy ? null : _load, icon: const Icon(Icons.refresh_rounded))],
      child: loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 36),
              children: [
                SyncFeatureCard(
                  icon: enabled ? Icons.verified_user_rounded : Icons.security_rounded,
                  title: enabled ? 'Two-factor authentication is on' : 'Protect your account',
                  body: enabled
                      ? 'Authenticator verification is required after password sign-in.'
                      : 'Scan a real otpauth QR with Google Authenticator, then enter its current 6-digit code.',
                ),
                const SizedBox(height: 18),
                if (!enabled && setup.isEmpty)
                  FilledButton.icon(
                    onPressed: busy ? null : _setup,
                    icon: const Icon(Icons.qr_code_2_rounded),
                    label: Text(busy ? 'Preparing…' : 'Set up authenticator'),
                  ),
                if (!enabled && setup.isNotEmpty) ...[
                  Center(
                    child: Container(
                      color: Colors.white,
                      padding: const EdgeInsets.all(12),
                      child: QrImageView(data: otpAuthUrl, size: 230),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Center(child: Text('Scan with Google Authenticator')),
                  if (secret.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    SelectableText(secret, textAlign: TextAlign.center, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800)),
                  ],
                  const SizedBox(height: 16),
                  TextField(
                    controller: code,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    decoration: const InputDecoration(labelText: '6-digit code', prefixIcon: Icon(Icons.password_rounded)),
                  ),
                  FilledButton.icon(onPressed: busy ? null : _enable, icon: const Icon(Icons.check_rounded), label: const Text('Verify and enable')),
                ],
                if (enabled) ...[
                  SyncSoftCard(
                    child: const Text('Disable 2FA or manage recovery codes from the main Security & account settings page.'),
                  ),
                ],
                if (busy) ...[
                  const SizedBox(height: 16),
                  const LinearProgressIndicator(),
                ],
                if (error != null) ...[
                  const SizedBox(height: 14),
                  Text(error!, style: const TextStyle(color: SyncColors.danger)),
                ],
              ],
            ),
    );
  }

  void _toast(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
}

class LiveGoogleDriveBackupScreen extends StatefulWidget {
  const LiveGoogleDriveBackupScreen({super.key});

  @override
  State<LiveGoogleDriveBackupScreen> createState() => _LiveGoogleDriveBackupScreenState();
}

class _LiveGoogleDriveBackupScreenState extends State<LiveGoogleDriveBackupScreen> {
  late final GoogleSignIn google;
  GoogleSignInAccount? account;
  bool configured = false;
  bool loading = true;
  bool busy = false;
  String? error;
  String? lastFileName;
  String? lastFileId;

  @override
  void initState() {
    super.initState();
    google = GoogleSignIn(scopes: const [
      'email',
      'https://www.googleapis.com/auth/drive.file',
    ]);
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final response = await context.services.api.get('/users/social-config');
      final payload = response.payload is Map ? Map<String, dynamic>.from(response.payload as Map) : const <String, dynamic>{};
      GoogleSignInAccount? signed;
      try {
        signed = await google.signInSilently();
      } on Object {
        signed = null;
      }
      if (!mounted) return;
      setState(() {
        configured = (payload['googleClientId']?.toString() ?? '').isNotEmpty;
        account = signed;
        loading = false;
        error = null;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = _message(failure);
      });
    }
  }

  Future<void> _connect() async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final signed = await google.signIn();
      if (!mounted) return;
      setState(() {
        account = signed;
        busy = false;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        busy = false;
        error = 'Google Drive connect failed: $failure';
      });
    }
  }

  Future<void> _disconnect() async {
    await google.signOut();
    if (mounted) setState(() => account = null);
  }

  Future<String?> _askPassphrase() async {
    final first = TextEditingController();
    final second = TextEditingController();
    String? localError;
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (_, setDialogState) => AlertDialog(
          title: const Text('Encrypted backup password'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('SyncChat encrypts the archive before uploading it to Google Drive.'),
            const SizedBox(height: 12),
            TextField(controller: first, obscureText: true, decoration: const InputDecoration(labelText: 'Password (8+ characters)')),
            const SizedBox(height: 10),
            TextField(controller: second, obscureText: true, decoration: const InputDecoration(labelText: 'Confirm password')),
            if (localError != null) ...[
              const SizedBox(height: 8),
              Text(localError!, style: const TextStyle(color: SyncColors.danger)),
            ],
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                if (first.text.length < 8) {
                  setDialogState(() => localError = 'Password must be at least 8 characters.');
                  return;
                }
                if (first.text != second.text) {
                  setDialogState(() => localError = 'Passwords do not match.');
                  return;
                }
                Navigator.pop(dialogContext, first.text);
              },
              child: const Text('Create backup'),
            ),
          ],
        ),
      ),
    );
    first.dispose();
    second.dispose();
    return result;
  }

  Future<void> _backupToDrive() async {
    if (account == null || busy) return;
    final passphrase = await _askPassphrase();
    if (passphrase == null || !mounted) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final archive = await context.services.accountStorage.createBackup(passphrase);
      final auth = await account!.authentication;
      final token = auth.accessToken;
      if (token == null || token.isEmpty) throw StateError('Google Drive access token is unavailable.');
      final uploaded = await _uploadDriveFile(
        accessToken: token,
        filename: archive.filename,
        bytes: archive.bytes,
      );
      if (!mounted) return;
      setState(() {
        busy = false;
        lastFileName = uploaded['name']?.toString() ?? archive.filename;
        lastFileId = uploaded['id']?.toString();
      });
      _toast('Encrypted backup uploaded to Google Drive.');
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        busy = false;
        error = _message(failure);
      });
    }
  }

  Future<Map<String, dynamic>> _uploadDriveFile({
    required String accessToken,
    required String filename,
    required List<int> bytes,
  }) async {
    final boundary = 'syncchat-${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(999999)}';
    final metadata = jsonEncode({'name': filename, 'mimeType': 'application/octet-stream'});
    final prefix = utf8.encode(
      '--$boundary\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n$metadata\r\n'
      '--$boundary\r\nContent-Type: application/octet-stream\r\n\r\n',
    );
    final suffix = utf8.encode('\r\n--$boundary--\r\n');
    final body = <int>[...prefix, ...bytes, ...suffix];
    final response = await http.post(
      Uri.parse('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink'),
      headers: {
        'Authorization': 'Bearer $accessToken',
        'Content-Type': 'multipart/related; boundary=$boundary',
      },
      body: body,
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Google Drive upload failed (${response.statusCode}): ${response.body}');
    }
    final decoded = jsonDecode(response.body);
    return decoded is Map ? Map<String, dynamic>.from(decoded) : const {};
  }

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'Google Drive backup',
      actions: [IconButton(onPressed: busy ? null : _load, icon: const Icon(Icons.refresh_rounded))],
      child: loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 36),
              children: [
                const SyncFeatureCard(
                  icon: Icons.add_to_drive_outlined,
                  title: 'Encrypted cloud backup',
                  body: 'Connect Google Drive and upload the same encrypted SyncChat backup archive supported by the web client. SyncChat never sends your backup password to Google.',
                ),
                const SizedBox(height: 18),
                if (!configured)
                  const SyncSoftCard(
                    child: Text('Google OAuth is not configured on this SyncChat server. Configure the Google client before connecting Drive.'),
                  )
                else if (account == null)
                  FilledButton.icon(
                    onPressed: busy ? null : _connect,
                    icon: const Icon(Icons.login_rounded),
                    label: Text(busy ? 'Connecting…' : 'Connect Google Drive'),
                  )
                else ...[
                  SyncSoftCard(
                    padding: EdgeInsets.zero,
                    child: Column(children: [
                      ListTile(
                        leading: const Icon(Icons.check_circle_rounded, color: SyncColors.success),
                        title: const Text('Google Drive connected'),
                        subtitle: Text(account!.email),
                      ),
                      Divider(height: 1, color: context.border),
                      ListTile(
                        leading: const Icon(Icons.cloud_upload_outlined, color: SyncColors.sky),
                        title: const Text('Create encrypted backup'),
                        subtitle: const Text('Encrypt locally on SyncChat server, then upload to your Drive'),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: busy ? null : _backupToDrive,
                      ),
                      Divider(height: 1, color: context.border),
                      ListTile(
                        leading: const Icon(Icons.link_off_rounded),
                        title: const Text('Disconnect Google Drive'),
                        onTap: busy ? null : _disconnect,
                      ),
                    ]),
                  ),
                ],
                if (lastFileName != null) ...[
                  const SizedBox(height: 16),
                  SyncFeatureCard(
                    icon: Icons.cloud_done_outlined,
                    title: 'Backup uploaded',
                    body: '$lastFileName${lastFileId == null ? '' : '\nDrive file ID: $lastFileId'}',
                  ),
                ],
                if (busy) ...[
                  const SizedBox(height: 18),
                  const LinearProgressIndicator(),
                ],
                if (error != null) ...[
                  const SizedBox(height: 14),
                  Text(error!, style: const TextStyle(color: SyncColors.danger)),
                ],
              ],
            ),
    );
  }

  void _toast(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
}

String _message(Object failure) {
  if (failure is ApiException) return failure.message;
  return failure.toString().replaceFirst('Exception: ', '');
}
