import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../theme.dart';
import '../widgets.dart';

class LiveFeedbackScreen extends StatefulWidget {
  const LiveFeedbackScreen({super.key});

  @override
  State<LiveFeedbackScreen> createState() => _LiveFeedbackScreenState();
}

class _LiveFeedbackScreenState extends State<LiveFeedbackScreen> {
  final message = TextEditingController();
  bool sending = false;
  String? response;
  bool success = false;

  @override
  void dispose() {
    message.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = message.text.trim();
    if (text.length < 10 || sending) return;
    setState(() {
      sending = true;
      response = null;
    });
    try {
      final result = await context.services.api.post('/users/feedback', body: {'message': text});
      if (!mounted) return;
      setState(() {
        sending = false;
        success = true;
        response = result.message ?? 'Thank you for your feedback.';
        message.clear();
      });
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        sending = false;
        success = false;
        response = failure is ApiException ? failure.message : failure.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) => SyncStandardPage(
        title: 'Send feedback',
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 36),
          children: [
            const SyncFeatureCard(
              icon: Icons.feedback_outlined,
              title: 'Help us improve SyncChat',
              body: 'Share bugs, ideas, or any issue you faced. Your feedback is sent through the same endpoint used by SyncChat Web.',
            ),
            const SizedBox(height: 18),
            TextField(
              controller: message,
              minLines: 6,
              maxLines: 10,
              maxLength: 2000,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                labelText: 'Feedback',
                hintText: 'Write your feedback here...',
                alignLabelWithHint: true,
              ),
            ),
            if (response != null) ...[
              const SizedBox(height: 8),
              Text(response!, style: TextStyle(color: success ? SyncColors.success : SyncColors.danger, fontWeight: FontWeight.w700)),
            ],
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: sending || message.text.trim().length < 10 ? null : _submit,
              icon: sending
                  ? const SizedBox.square(dimension: 17, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send_rounded),
              label: Text(sending ? 'Sending…' : 'Submit'),
            ),
          ],
        ),
      );
}

class LivePolicyScreen extends StatefulWidget {
  const LivePolicyScreen({super.key, this.initialTab = 'privacy'});
  final String initialTab;

  @override
  State<LivePolicyScreen> createState() => _LivePolicyScreenState();
}

class _LivePolicyScreenState extends State<LivePolicyScreen> {
  late String tab;

  static const privacy = [
    'We use your account information to provide chat, call, and security features.',
    'Messages and calls are protected with end-to-end encryption in supported chats.',
    'We store limited metadata (time, delivery status, device/session info) to operate the service.',
    'You can manage profile visibility, blocked users, notification, and privacy settings from the app.',
    'Reported content may be reviewed for safety, abuse prevention, and legal compliance.',
    'You can request account deletion and your personal data is removed according to retention policy.',
  ];

  static const terms = [
    'You must use the app lawfully and must not abuse, harass, scam, or impersonate others.',
    'You are responsible for content you send, upload, or share in chats, groups, and status.',
    'Do not attempt unauthorized access, reverse engineering, or disruption of services.',
    'Accounts violating policy can be limited, suspended, or removed without prior notice.',
    'Features can change over time and service availability is not guaranteed in all regions/devices.',
    'Continued use of the app means you agree to the latest Terms and Privacy Policy.',
  ];

  @override
  void initState() {
    super.initState();
    tab = widget.initialTab == 'terms' ? 'terms' : 'privacy';
  }

  @override
  Widget build(BuildContext context) {
    final points = tab == 'terms' ? terms : privacy;
    return SyncStandardPage(
      title: tab == 'terms' ? 'Terms & Conditions' : 'Privacy Policy',
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
            child: SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'privacy', label: Text('Privacy Policy'), icon: Icon(Icons.privacy_tip_outlined)),
                ButtonSegment(value: 'terms', label: Text('Terms'), icon: Icon(Icons.gavel_outlined)),
              ],
              selected: {tab},
              onSelectionChanged: (value) => setState(() => tab = value.first),
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 36),
              children: [
                SyncSoftCard(
                  child: Text('Last updated: March 5, 2026. Please review this information carefully before continuing to use SyncChat.', style: TextStyle(color: context.muted, height: 1.45)),
                ),
                const SizedBox(height: 12),
                ...points.map((point) => Padding(
                      padding: const EdgeInsets.only(bottom: 9),
                      child: SyncSoftCard(
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(Icons.verified_user_outlined, color: SyncColors.sky, size: 21),
                            const SizedBox(width: 10),
                            Expanded(child: Text(point, style: const TextStyle(height: 1.5))),
                          ],
                        ),
                      ),
                    )),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class LiveLicenseScreen extends StatelessWidget {
  const LiveLicenseScreen({super.key});

  static const points = [
    'SyncChat is distributed under the GPL-3.0 license.',
    'You may run, study, modify, and share the software under the GPL-3.0 terms.',
    'If you distribute modified versions, you must also provide source code under the same license.',
    'Third-party libraries used by SyncChat remain under their own respective licenses.',
    'License notices for bundled dependencies may appear in generated build artifacts.',
    'See the project root LICENSE file for the full legal text.',
  ];

  @override
  Widget build(BuildContext context) => SyncStandardPage(
        title: 'License',
        child: ListView(
          padding: const EdgeInsets.fromLTRB(14, 16, 14, 36),
          children: [
            SyncSoftCard(
              child: Text('SyncChat licensing summary. For the full license text, see the root project LICENSE file.', style: TextStyle(color: context.muted, height: 1.45)),
            ),
            const SizedBox(height: 12),
            ...points.map((point) => Padding(
                  padding: const EdgeInsets.only(bottom: 9),
                  child: SyncSoftCard(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.info_outline_rounded, color: SyncColors.sky, size: 21),
                        const SizedBox(width: 10),
                        Expanded(child: Text(point, style: const TextStyle(height: 1.5))),
                      ],
                    ),
                  ),
                )),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () => showLicensePage(
                context: context,
                applicationName: 'SyncChat',
                applicationLegalese: 'GPL-3.0 · third-party components retain their respective licenses.',
              ),
              icon: const Icon(Icons.inventory_2_outlined),
              label: const Text('Open bundled dependency licenses'),
            ),
          ],
        ),
      );
}
