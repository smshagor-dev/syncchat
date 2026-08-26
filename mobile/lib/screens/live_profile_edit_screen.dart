import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';

class LiveProfileEditScreen extends StatefulWidget {
  const LiveProfileEditScreen({super.key});

  @override
  State<LiveProfileEditScreen> createState() => _LiveProfileEditScreenState();
}

class _LiveProfileEditScreenState extends State<LiveProfileEditScreen> {
  final formKey = GlobalKey<FormState>();
  final username = TextEditingController();
  final fullname = TextEditingController();
  final bio = TextEditingController();
  final phone = TextEditingController();
  final dialCode = TextEditingController();
  bool loading = true;
  bool saving = false;
  String? error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => load());
  }

  @override
  void dispose() {
    username.dispose();
    fullname.dispose();
    bio.dispose();
    phone.dispose();
    dialCode.dispose();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final user = await context.services.auth.currentUser();
      final userId = user['_id']?.toString() ?? '';
      final profile = userId.isEmpty
          ? <String, dynamic>{}
          : await context.services.profile.getProfile(userId);
      if (!mounted) return;
      setState(() {
        username.text = (profile['username'] ?? user['username'] ?? '').toString();
        fullname.text = (profile['fullname'] ?? user['fullname'] ?? '').toString();
        bio.text = (profile['bio'] ?? '').toString();
        phone.text = (profile['phone'] ?? '').toString();
        dialCode.text = (profile['dialCode'] ?? '').toString();
        loading = false;
        error = null;
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = messageFor(failure);
      });
    }
  }

  Future<void> save() async {
    if (saving || !(formKey.currentState?.validate() ?? false)) return;
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await context.services.profile.update({
        'username': username.text.trim(),
        'fullname': fullname.text.trim(),
        'bio': bio.text.trim(),
        'phone': phone.text.trim(),
        'dialCode': dialCode.text.trim(),
      });
      if (!mounted) return;
      setState(() => saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Profile updated successfully.')),
      );
      await load();
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        saving = false;
        error = messageFor(failure);
      });
    }
  }

  String messageFor(Object failure) => failure is ApiException
      ? failure.message
      : failure.toString().replaceFirst('Exception: ', '');

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.page,
      appBar: AppBar(
        title: const Text('Edit profile'),
        backgroundColor: context.panel,
        surfaceTintColor: Colors.transparent,
        actions: [
          TextButton(
            onPressed: loading || saving ? null : save,
            child: saving
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Save', style: TextStyle(fontWeight: FontWeight.w900)),
          ),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(18, 20, 18, 32),
                children: [
                  if (error != null)
                    Container(
                      margin: const EdgeInsets.only(bottom: 16),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: SyncColors.danger.withValues(alpha: .09),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Text(error!, style: const TextStyle(color: SyncColors.danger, fontWeight: FontWeight.w700)),
                    ),
                  Center(
                    child: Container(
                      width: 88,
                      height: 88,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: SyncColors.sky.withValues(alpha: .14),
                      ),
                      child: const Icon(Icons.person_rounded, size: 46, color: SyncColors.sky),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Form(
                    key: formKey,
                    child: Column(
                      children: [
                        field(fullname, 'Full name', Icons.badge_outlined),
                        const SizedBox(height: 13),
                        field(username, 'Username', Icons.alternate_email_rounded),
                        const SizedBox(height: 13),
                        field(bio, 'Bio', Icons.info_outline_rounded, maxLines: 4, required: false),
                        const SizedBox(height: 13),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(width: 104, child: field(dialCode, 'Code', Icons.flag_outlined, required: false)),
                            const SizedBox(width: 10),
                            Expanded(child: field(phone, 'Phone', Icons.phone_outlined, keyboardType: TextInputType.phone, required: false)),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    'Changes are shared with the web client and follow the same profile privacy rules.',
                    style: TextStyle(color: context.muted, fontSize: 12, height: 1.45),
                  ),
                ],
              ),
            ),
    );
  }

  Widget field(
    TextEditingController controller,
    String label,
    IconData icon, {
    bool required = true,
    int maxLines = 1,
    TextInputType? keyboardType,
  }) => TextFormField(
    controller: controller,
    maxLines: maxLines,
    keyboardType: keyboardType,
    validator: required
        ? (value) => value?.trim().isEmpty == true ? '$label is required.' : null
        : null,
    decoration: InputDecoration(
      labelText: label,
      prefixIcon: Icon(icon),
      filled: true,
      fillColor: context.panel,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
    ),
  );
}
