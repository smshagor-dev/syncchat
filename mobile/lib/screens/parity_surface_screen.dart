import 'package:flutter/material.dart';

import '../parity_catalog.dart';
import '../sheets.dart';
import '../theme.dart';
import '../widgets.dart';
import 'chat_room_screen.dart';
import 'core_screens.dart';

class ParitySurfaceScreen extends StatelessWidget {
  const ParitySurfaceScreen({
    super.key,
    required this.title,
    this.subtitle,
  });

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return switch (title) {
      'New group' => _NewGroupScreen(subtitle: subtitle),
      'Friend profile' => const _EntityProfileScreen(type: 'friend'),
      'Group profile' => const _EntityProfileScreen(type: 'group'),
      'Channel profile' => const _EntityProfileScreen(type: 'channel'),
      'Group participants' => const _ParticipantsScreen(addMode: false),
      'Add participant' => const _ParticipantsScreen(addMode: true),
      'Policy' || 'Terms & privacy policy' => const _PolicyScreen(),
      'License' => const _LicenseScreen(),
      'Group call / LiveKit' => const _GroupCallScreen(),
      'Verify account' => const _VerificationScreen(inactive: false),
      'Inactive account' => const _VerificationScreen(inactive: true),
      'Photo full screen' => const _PhotoFullScreen(),
      _ => _GenericParityScreen(title: title, subtitle: subtitle),
    };
  }
}

class _NewGroupScreen extends StatefulWidget {
  const _NewGroupScreen({this.subtitle});

  final String? subtitle;

  @override
  State<_NewGroupScreen> createState() => _NewGroupScreenState();
}

class _NewGroupScreenState extends State<_NewGroupScreen> {
  final selected = <String>{'Atia Rahman', 'Mahin Hasan'};
  final nameController = TextEditingController();
  final descController = TextEditingController();
  String query = '';

  static const people = <(String, String, bool)>[
    ('Atia Rahman', '@atia', true),
    ('Nadia Karim', '@nadia', false),
    ('Mahin Hasan', '@mahin', true),
    ('Rafi Ahmed', '@rafi', false),
    ('Support', '@support', true),
  ];

  @override
  void dispose() {
    nameController.dispose();
    descController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final needle = query.trim().toLowerCase();
    final visible = people.where((person) => needle.isEmpty || person.$1.toLowerCase().contains(needle) || person.$2.toLowerCase().contains(needle)).toList();

    return SyncStandardPage(
      title: 'New group',
      actions: [
        TextButton(
          onPressed: selected.isEmpty ? null : () => _confirm(context),
          child: const Text('Create'),
        ),
      ],
      child: ListView(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 28),
        children: [
          if (widget.subtitle != null) ...[
            Text(widget.subtitle!, style: TextStyle(color: context.muted, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
          ],
          SyncSoftCard(
            child: Column(
              children: [
                const CircleAvatar(
                  radius: 42,
                  backgroundColor: Color(0x170EA5E9),
                  child: Icon(Icons.add_photo_alternate_outlined, size: 34, color: SyncColors.sky),
                ),
                const SizedBox(height: 12),
                TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Group name')),
                const SizedBox(height: 10),
                TextField(controller: descController, maxLines: 3, decoration: const InputDecoration(labelText: 'Description (optional)')),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              const Expanded(child: SyncSectionLabel('Participants')),
              Text('${selected.length} selected', style: TextStyle(color: context.muted, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            onChanged: (value) => setState(() => query = value),
            decoration: const InputDecoration(hintText: 'Search contacts…', prefixIcon: Icon(Icons.search_rounded)),
          ),
          const SizedBox(height: 8),
          if (selected.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Wrap(
                spacing: 7,
                runSpacing: 7,
                children: selected
                    .map(
                      (name) => InputChip(
                        avatar: SyncAvatar(name: name, radius: 11),
                        label: Text(name),
                        onDeleted: () => setState(() => selected.remove(name)),
                      ),
                    )
                    .toList(),
              ),
            ),
          ...visible.map(
            (person) => CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: selected.contains(person.$1),
              onChanged: (_) => setState(() {
                if (selected.contains(person.$1)) {
                  selected.remove(person.$1);
                } else {
                  selected.add(person.$1);
                }
              }),
              secondary: SyncAvatar(name: person.$1, online: person.$3, radius: 22),
              title: Text(person.$1, style: const TextStyle(fontWeight: FontWeight.w900)),
              subtitle: Text(person.$2),
            ),
          ),
        ],
      ),
    );
  }

  void _confirm(BuildContext context) {
    final groupName = nameController.text.trim().isEmpty ? 'New SyncChat Group' : nameController.text.trim();
    showSyncSheet(
      context,
      title: 'Create group?',
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(groupName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
          const SizedBox(height: 4),
          Text('${selected.length} participant${selected.length == 1 ? '' : 's'} selected', style: TextStyle(color: context.muted)),
        ],
      ),
      actions: [
        SyncSheetAction(
          label: 'Create and open group',
          icon: Icons.group_add_outlined,
          onTap: () => Navigator.of(context).pushReplacement(
            MaterialPageRoute<void>(builder: (_) => ChatRoomScreen(name: groupName, group: true)),
          ),
        ),
      ],
    );
  }
}

class _EntityProfileScreen extends StatefulWidget {
  const _EntityProfileScreen({required this.type});

  final String type;

  @override
  State<_EntityProfileScreen> createState() => _EntityProfileScreenState();
}

class _EntityProfileScreenState extends State<_EntityProfileScreen> {
  bool muted = false;
  bool favourite = false;

  bool get isFriend => widget.type == 'friend';
  bool get isGroup => widget.type == 'group';

  String get name => switch (widget.type) {
        'friend' => 'Atia Rahman',
        'channel' => 'SyncChat News',
        _ => 'Product Team',
      };

  String get subtitle => switch (widget.type) {
        'friend' => '@atia · online',
        'channel' => 'Public channel · 4.2K subscribers',
        _ => '8 participants · 3 admins',
      };

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: switch (widget.type) {
        'friend' => 'Contact info',
        'channel' => 'Channel info',
        _ => 'Group info',
      },
      actions: [
        IconButton(onPressed: () => _more(context), icon: const Icon(Icons.more_vert_rounded)),
      ],
      child: ListView(
        padding: const EdgeInsets.only(bottom: 30),
        children: [
          const SizedBox(height: 18),
          Center(child: SyncAvatar(name: name, online: isFriend, radius: 55)),
          const SizedBox(height: 12),
          Center(child: Text(name, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w900))),
          const SizedBox(height: 4),
          Center(child: Text(subtitle, style: TextStyle(color: context.muted))),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              children: [
                Expanded(child: _ProfileAction(icon: Icons.chat_bubble_outline_rounded, label: 'Message', onTap: () => _message(context))),
                const SizedBox(width: 8),
                Expanded(child: _ProfileAction(icon: Icons.call_outlined, label: 'Audio', onTap: () => _call(context, false))),
                const SizedBox(width: 8),
                Expanded(child: _ProfileAction(icon: Icons.videocam_outlined, label: 'Video', onTap: () => _call(context, true))),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Divider(height: 1, color: context.border),
          if (isFriend) ...[
            const ListTile(leading: Icon(Icons.info_outline_rounded), title: Text('About'), subtitle: Text('Building secure realtime products.')),
            const ListTile(leading: Icon(Icons.phone_outlined), title: Text('Phone'), subtitle: Text('+1 ••• ••• 0182')),
            const ListTile(leading: Icon(Icons.email_outlined), title: Text('Email'), subtitle: Text('atia@example.com')),
          ] else ...[
            ListTile(
              leading: const Icon(Icons.group_outlined),
              title: Text(isGroup ? 'Participants' : 'Subscribers'),
              subtitle: Text(isGroup ? '8 participants' : '4.2K subscribers'),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: isGroup
                  ? () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const _ParticipantsScreen(addMode: false)))
                  : null,
            ),
            if (isGroup)
              ListTile(
                leading: const Icon(Icons.person_add_alt_1_rounded),
                title: const Text('Add participant'),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const _ParticipantsScreen(addMode: true))),
              ),
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: Text(isGroup ? 'Edit group' : 'Channel details'),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => _edit(context),
            ),
          ],
          SwitchListTile(
            secondary: const Icon(Icons.notifications_off_outlined),
            title: const Text('Mute notifications'),
            value: muted,
            onChanged: (value) => setState(() => muted = value),
          ),
          SwitchListTile(
            secondary: const Icon(Icons.star_border_rounded),
            title: const Text('Favourite'),
            value: favourite,
            onChanged: (value) => setState(() => favourite = value),
          ),
          ListTile(
            leading: const Icon(Icons.perm_media_outlined),
            title: const Text('Media, links and files'),
            subtitle: const Text('24 items'),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => const CollectionScreen(title: 'Media', icon: Icons.image_outlined, description: 'Shared media in this conversation.'),
              ),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.search_rounded),
            title: const Text('Search in conversation'),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () {},
          ),
          Divider(height: 1, color: context.border),
          if (isFriend)
            ListTile(
              leading: const Icon(Icons.block_rounded, color: SyncColors.danger),
              title: const Text('Block contact', style: TextStyle(color: SyncColors.danger, fontWeight: FontWeight.w800)),
              onTap: () => _danger(context, 'Block contact'),
            )
          else
            ListTile(
              leading: const Icon(Icons.exit_to_app_rounded, color: SyncColors.danger),
              title: Text(isGroup ? 'Exit group' : 'Leave channel', style: const TextStyle(color: SyncColors.danger, fontWeight: FontWeight.w800)),
              onTap: () => _danger(context, isGroup ? 'Exit group' : 'Leave channel'),
            ),
        ],
      ),
    );
  }

  void _message(BuildContext context) {
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ChatRoomScreen(name: name, group: !isFriend)));
  }

  void _call(BuildContext context, bool video) {
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CallPanelScreen(name: name, video: video)));
  }

  void _edit(BuildContext context) {
    showSyncSheet(
      context,
      title: isGroup ? 'Edit group' : 'Channel details',
      body: Column(
        children: [
          TextField(controller: TextEditingController(text: name), decoration: const InputDecoration(labelText: 'Name')),
          const SizedBox(height: 8),
          const TextField(maxLines: 3, decoration: InputDecoration(labelText: 'Description')),
        ],
      ),
      actions: const [
        SyncSheetAction(label: 'Change avatar', icon: Icons.photo_library_outlined),
        SyncSheetAction(label: 'Save changes', icon: Icons.check_rounded),
      ],
    );
  }

  void _more(BuildContext context) {
    showSyncSheet(
      context,
      title: 'More actions',
      actions: [
        const SyncSheetAction(label: 'Share', icon: Icons.share_outlined),
        const SyncSheetAction(label: 'QR code', icon: Icons.qr_code_rounded),
        const SyncSheetAction(label: 'Report', icon: Icons.flag_outlined),
        SyncSheetAction(label: isFriend ? 'Delete contact' : 'Delete conversation', icon: Icons.delete_outline_rounded, danger: true),
      ],
    );
  }

  void _danger(BuildContext context, String action) {
    showSyncSheet(
      context,
      title: '$action?',
      actions: [SyncSheetAction(label: action, icon: Icons.warning_amber_rounded, danger: true)],
    );
  }
}

class _ProfileAction extends StatelessWidget {
  const _ProfileAction({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.softPanel,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Column(
            children: [
              Icon(icon, color: SyncColors.sky),
              const SizedBox(height: 5),
              Text(label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
            ],
          ),
        ),
      ),
    );
  }
}

class _ParticipantsScreen extends StatefulWidget {
  const _ParticipantsScreen({required this.addMode});

  final bool addMode;

  @override
  State<_ParticipantsScreen> createState() => _ParticipantsScreenState();
}

class _ParticipantsScreenState extends State<_ParticipantsScreen> {
  final selected = <String>{};
  String query = '';

  static const people = <(String, String, bool, bool)>[
    ('Atia Rahman', '@atia', true, true),
    ('Nadia Karim', '@nadia', false, false),
    ('Mahin Hasan', '@mahin', true, true),
    ('Rafi Ahmed', '@rafi', false, false),
    ('Support', '@support', true, false),
  ];

  @override
  Widget build(BuildContext context) {
    final needle = query.trim().toLowerCase();
    final visible = people.where((person) => needle.isEmpty || person.$1.toLowerCase().contains(needle) || person.$2.toLowerCase().contains(needle)).toList();
    return SyncStandardPage(
      title: widget.addMode ? 'Add participant' : 'Participants',
      actions: [
        if (widget.addMode)
          TextButton(
            onPressed: selected.isEmpty ? null : () => _confirmAdd(context),
            child: Text('Add (${selected.length})'),
          ),
      ],
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          TextField(
            onChanged: (value) => setState(() => query = value),
            decoration: const InputDecoration(hintText: 'Search people…', prefixIcon: Icon(Icons.search_rounded)),
          ),
          const SizedBox(height: 10),
          ...visible.map((person) {
            if (widget.addMode) {
              return CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: selected.contains(person.$1),
                onChanged: (_) => setState(() {
                  if (selected.contains(person.$1)) {
                    selected.remove(person.$1);
                  } else {
                    selected.add(person.$1);
                  }
                }),
                secondary: SyncAvatar(name: person.$1, online: person.$3, radius: 22),
                title: Text(person.$1, style: const TextStyle(fontWeight: FontWeight.w900)),
                subtitle: Text(person.$2),
              );
            }
            return ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 2, vertical: 3),
              leading: SyncAvatar(name: person.$1, online: person.$3, radius: 22),
              title: Row(
                children: [
                  Expanded(child: Text(person.$1, style: const TextStyle(fontWeight: FontWeight.w900))),
                  if (person.$4)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(color: SyncColors.sky.withOpacity(.12), borderRadius: BorderRadius.circular(99)),
                      child: const Text('Admin', style: TextStyle(color: SyncColors.sky, fontSize: 10, fontWeight: FontWeight.w900)),
                    ),
                ],
              ),
              subtitle: Text(person.$2),
              trailing: PopupMenuButton<String>(
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'message', child: Text('Message')),
                  PopupMenuItem(value: 'admin', child: Text('Make admin')),
                  PopupMenuItem(value: 'remove', child: Text('Remove')),
                ],
                onSelected: (value) {
                  if (value == 'message') {
                    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ChatRoomScreen(name: person.$1)));
                  }
                },
              ),
            );
          }),
        ],
      ),
    );
  }

  void _confirmAdd(BuildContext context) {
    showSyncSheet(
      context,
      title: 'Add participants?',
      body: Text('${selected.length} selected', style: const TextStyle(fontWeight: FontWeight.w900)),
      actions: const [SyncSheetAction(label: 'Confirm add participant', icon: Icons.person_add_alt_1_rounded)],
    );
  }
}

class _PolicyScreen extends StatelessWidget {
  const _PolicyScreen();

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'Terms & privacy policy',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 32),
        children: const [
          Text('SyncChat Terms & Privacy', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
          SizedBox(height: 10),
          Text('This mobile surface mirrors the policy page available in the web client. Production builds should render the exact approved legal text from the same policy source used by the web application.', style: TextStyle(height: 1.55)),
          SizedBox(height: 18),
          _DocumentSection(title: 'Privacy', body: 'Account, profile, contact, chat, call and device information should be handled according to the server policy and user privacy settings.'),
          _DocumentSection(title: 'Security', body: 'Authentication, session controls, app lock, two-factor authentication and supported E2EE controls remain part of the mobile parity scope.'),
          _DocumentSection(title: 'Data controls', body: 'Account export, backup, restore, device logout and account deletion controls are surfaced from Settings.'),
        ],
      ),
    );
  }
}

class _LicenseScreen extends StatelessWidget {
  const _LicenseScreen();

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'License',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 32),
        children: const [
          Text('SyncChat License', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
          SizedBox(height: 10),
          Text('The Flutter client should ship with the same project and third-party attribution requirements as the repository. This screen preserves the web license page in a mobile-native reading layout.', style: TextStyle(height: 1.55)),
          SizedBox(height: 18),
          _DocumentSection(title: 'Application', body: 'SyncChat mobile client — Flutter parity implementation.'),
          _DocumentSection(title: 'Third-party packages', body: 'Package notices will be generated from the final Flutter dependency set before release.'),
        ],
      ),
    );
  }
}

class _DocumentSection extends StatelessWidget {
  const _DocumentSection({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          Text(body, style: const TextStyle(height: 1.55)),
        ],
      ),
    );
  }
}

class _GroupCallScreen extends StatefulWidget {
  const _GroupCallScreen();

  @override
  State<_GroupCallScreen> createState() => _GroupCallScreenState();
}

class _GroupCallScreenState extends State<_GroupCallScreen> {
  bool muted = false;
  bool camera = true;
  bool speaker = true;

  static const people = ['You', 'Atia Rahman', 'Mahin Hasan', 'Nadia Karim'];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SyncColors.slate950,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              child: Row(
                children: [
                  IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.arrow_back_rounded, color: Colors.white)),
                  const Expanded(child: Text('Product Team', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900))),
                  const Icon(Icons.lock_rounded, color: SyncColors.success, size: 18),
                  const SizedBox(width: 5),
                  const Text('LiveKit', style: TextStyle(color: Colors.white60, fontSize: 12)),
                ],
              ),
            ),
            Expanded(
              child: GridView.builder(
                padding: const EdgeInsets.all(10),
                itemCount: people.length,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 8, crossAxisSpacing: 8, childAspectRatio: .78),
                itemBuilder: (_, index) => Container(
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [Color(0xFF1D2935), Color(0xFF0F172A)], begin: Alignment.topLeft, end: Alignment.bottomRight),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.white10),
                  ),
                  child: Stack(
                    children: [
                      Center(child: SyncAvatar(name: people[index], radius: 48)),
                      Positioned(left: 10, right: 10, bottom: 10, child: Text(people[index], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800))),
                      if (index == 2) const Positioned(right: 10, top: 10, child: Icon(Icons.mic_off_rounded, color: SyncColors.danger, size: 18)),
                    ],
                  ),
                ),
              ),
            ),
            Container(
              padding: EdgeInsets.fromLTRB(12, 12, 12, MediaQuery.paddingOf(context).bottom + 12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _CallControl(icon: muted ? Icons.mic_off_rounded : Icons.mic_rounded, onTap: () => setState(() => muted = !muted)),
                  const SizedBox(width: 10),
                  _CallControl(icon: camera ? Icons.videocam_rounded : Icons.videocam_off_rounded, onTap: () => setState(() => camera = !camera)),
                  const SizedBox(width: 10),
                  _CallControl(icon: speaker ? Icons.volume_up_rounded : Icons.volume_off_rounded, onTap: () => setState(() => speaker = !speaker)),
                  const SizedBox(width: 14),
                  _CallControl(icon: Icons.call_end_rounded, background: SyncColors.danger, onTap: () => Navigator.pop(context)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CallControl extends StatelessWidget {
  const _CallControl({required this.icon, required this.onTap, this.background = const Color(0x22FFFFFF)});

  final IconData icon;
  final VoidCallback onTap;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: background,
      shape: const CircleBorder(),
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: SizedBox(width: 54, height: 54, child: Icon(icon, color: Colors.white)),
      ),
    );
  }
}

class _VerificationScreen extends StatelessWidget {
  const _VerificationScreen({required this.inactive});

  final bool inactive;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SyncColors.slate950,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 520),
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(26)),
              child: Theme(
                data: Theme.of(context).copyWith(brightness: Brightness.light),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Icon(inactive ? Icons.pause_circle_outline_rounded : Icons.mark_email_read_outlined, size: 58, color: inactive ? SyncColors.warning : SyncColors.sky),
                    const SizedBox(height: 14),
                    Text(inactive ? 'Account inactive' : 'Verify your account', textAlign: TextAlign.center, style: const TextStyle(color: SyncColors.slate900, fontSize: 24, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 8),
                    Text(
                      inactive ? 'Your account is currently inactive. Review the notice or contact support.' : 'Enter the verification code sent to your email address.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: SyncColors.slate500, height: 1.45),
                    ),
                    const SizedBox(height: 18),
                    if (!inactive) const TextField(decoration: InputDecoration(labelText: 'Verification code', prefixIcon: Icon(Icons.verified_user_outlined))),
                    if (!inactive) const SizedBox(height: 12),
                    FilledButton(onPressed: () => Navigator.maybePop(context), child: Text(inactive ? 'Back to sign in' : 'Verify account')),
                    if (!inactive) TextButton(onPressed: () {}, child: const Text('Resend code')),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PhotoFullScreen extends StatelessWidget {
  const _PhotoFullScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            const Positioned.fill(child: Center(child: Icon(Icons.image_outlined, color: Colors.white24, size: 160))),
            Positioned(
              left: 8,
              top: 8,
              child: IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded, color: Colors.white)),
            ),
            Positioned(
              right: 8,
              top: 8,
              child: IconButton(onPressed: () {}, icon: const Icon(Icons.more_vert_rounded, color: Colors.white)),
            ),
            const Positioned(
              left: 16,
              bottom: 18,
              child: Text('Shared photo · Today 10:24 PM', style: TextStyle(color: Colors.white70)),
            ),
          ],
        ),
      ),
    );
  }
}

class _GenericParityScreen extends StatefulWidget {
  const _GenericParityScreen({required this.title, this.subtitle});

  final String title;
  final String? subtitle;

  @override
  State<_GenericParityScreen> createState() => _GenericParityScreenState();
}

class _GenericParityScreenState extends State<_GenericParityScreen> {
  bool enabled = true;

  ParitySurface? get surface {
    for (final item in parityCatalog) {
      if (item.name.toLowerCase() == widget.title.toLowerCase()) return item;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final current = surface;
    final actions = _actions(widget.title);
    return SyncStandardPage(
      title: widget.title,
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          SyncFeatureCard(
            icon: _icon(widget.title),
            title: widget.title,
            body: widget.subtitle ?? _description(widget.title, current),
          ),
          if (current != null) ...[
            const SizedBox(height: 10),
            SyncSoftCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.code_rounded, color: SyncColors.sky),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(current.group, style: const TextStyle(fontWeight: FontWeight.w900)),
                        const SizedBox(height: 3),
                        Text(current.webSource, style: TextStyle(color: context.muted, fontSize: 12)),
                      ],
                    ),
                  ),
                  Chip(label: Text(current.kind)),
                ],
              ),
            ),
          ],
          const SizedBox(height: 14),
          if (_isToggleSurface(widget.title))
            SyncSoftCard(
              padding: EdgeInsets.zero,
              child: SwitchListTile(
                title: Text(widget.title, style: const TextStyle(fontWeight: FontWeight.w900)),
                subtitle: const Text('Mobile parity control'),
                value: enabled,
                onChanged: (value) => setState(() => enabled = value),
              ),
            ),
          if (_needsInput(widget.title)) ...[
            const TextField(decoration: InputDecoration(hintText: 'Enter details…', prefixIcon: Icon(Icons.edit_outlined))),
            const SizedBox(height: 10),
          ],
          ...actions.map(
            (action) => SyncEntityTile(
              icon: action.$2,
              title: action.$1,
              subtitle: action.$3,
              danger: action.$4,
              onTap: () => _runAction(context, action.$1),
            ),
          ),
          if (actions.isEmpty)
            SyncSoftCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Mobile behaviour', style: TextStyle(fontWeight: FontWeight.w900)),
                  const SizedBox(height: 6),
                  Text('This state is registered in the web-to-Flutter parity catalog and is reachable from the mobile navigation or the relevant room/context flow.', style: TextStyle(color: context.muted, height: 1.45)),
                ],
              ),
            ),
        ],
      ),
    );
  }

  IconData _icon(String title) {
    final value = title.toLowerCase();
    if (value.contains('qr')) return Icons.qr_code_rounded;
    if (value.contains('media') || value.contains('photo')) return Icons.image_outlined;
    if (value.contains('call')) return Icons.call_outlined;
    if (value.contains('delete')) return Icons.delete_outline_rounded;
    if (value.contains('participant') || value.contains('contact')) return Icons.people_outline_rounded;
    if (value.contains('security') || value.contains('e2ee')) return Icons.shield_outlined;
    if (value.contains('message') || value.contains('chat')) return Icons.chat_bubble_outline_rounded;
    if (value.contains('file') || value.contains('attach')) return Icons.attach_file_rounded;
    if (value.contains('status')) return Icons.donut_large_rounded;
    return Icons.phone_android_rounded;
  }

  String _description(String title, ParitySurface? current) {
    if (current != null) {
      return 'Flutter mobile counterpart for ${current.name}. The source-of-truth web surface is ${current.webSource}.';
    }
    return 'SyncChat mobile parity surface for $title.';
  }

  bool _isToggleSurface(String title) {
    final value = title.toLowerCase();
    return value.contains('security') || value.contains('e2ee') || value.contains('lock') || value.contains('notification');
  }

  bool _needsInput(String title) {
    final value = title.toLowerCase();
    return value.contains('password') || value.contains('feedback') || value.contains('search') || value.contains('poll') || value.contains('event');
  }

  List<(String, IconData, String, bool)> _actions(String title) {
    final value = title.toLowerCase();
    if (value.contains('attach')) {
      return const [
        ('Photo & video', Icons.photo_library_outlined, 'Choose media from the device.', false),
        ('Camera', Icons.camera_alt_outlined, 'Capture a new photo or video.', false),
        ('File', Icons.insert_drive_file_outlined, 'Attach a document or file.', false),
        ('Contact', Icons.person_outline_rounded, 'Share a saved contact.', false),
        ('Poll', Icons.poll_outlined, 'Create a poll in the room.', false),
        ('Event', Icons.event_outlined, 'Create an event card.', false),
      ];
    }
    if (value.contains('delete')) {
      return const [('Confirm delete', Icons.delete_forever_outlined, 'This destructive action requires explicit confirmation.', true)];
    }
    if (value.contains('qr')) {
      return const [
        ('Show my QR', Icons.qr_code_2_rounded, 'Share profile or device QR.', false),
        ('Scan QR', Icons.qr_code_scanner_rounded, 'Open the native camera scanner.', false),
      ];
    }
    if (value.contains('media')) {
      return const [
        ('Open media', Icons.image_outlined, 'Photos and videos.', false),
        ('Open links', Icons.link_rounded, 'Shared links.', false),
        ('Open files', Icons.insert_drive_file_outlined, 'Shared files.', false),
      ];
    }
    if (value.contains('message request')) {
      return const [
        ('Accept request', Icons.check_rounded, 'Move the conversation into the inbox.', false),
        ('Delete request', Icons.delete_outline_rounded, 'Remove the request.', true),
        ('Block sender', Icons.block_rounded, 'Block the sender and remove the request.', true),
      ];
    }
    if (value.contains('outbox')) {
      return const [
        ('Retry failed message', Icons.refresh_rounded, 'Retry delivery using the same client message ID.', false),
        ('Clear failed item', Icons.delete_outline_rounded, 'Remove the failed local outbox item.', true),
      ];
    }
    if (value.contains('sign out')) {
      return const [('Sign out from device', Icons.logout_rounded, 'End the current session.', true)];
    }
    if (value.contains('change password')) {
      return const [('Save new password', Icons.check_rounded, 'Validate current password and update it.', false)];
    }
    if (value.contains('feedback')) {
      return const [('Send feedback', Icons.send_rounded, 'Submit feedback to the configured endpoint.', false)];
    }
    if (value.contains('webcam')) {
      return const [
        ('Take photo', Icons.camera_alt_outlined, 'Capture using the native camera.', false),
        ('Switch camera', Icons.cameraswitch_outlined, 'Toggle front or rear camera.', false),
      ];
    }
    if (value.contains('room appearance')) {
      return const [('Open room appearance', Icons.palette_outlined, 'Choose wallpaper and bubble theme.', false)];
    }
    if (value.contains('search')) {
      return const [('Run search', Icons.search_rounded, 'Search the current room or all chats.', false)];
    }
    return const [];
  }

  void _runAction(BuildContext context, String action) {
    if (action == 'Open room appearance') {
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const RoomAppearanceScreen()));
      return;
    }
    if (action == 'Open media') {
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const CollectionScreen(title: 'Media', icon: Icons.image_outlined, description: 'Shared media.')));
      return;
    }
    if (action == 'Take photo') {
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const _PhotoFullScreen()));
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$action · mobile parity action')));
  }
}
