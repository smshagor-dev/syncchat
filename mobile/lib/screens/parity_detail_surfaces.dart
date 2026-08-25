import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets.dart';

class ParityNewGroupSurface extends StatefulWidget {
  const ParityNewGroupSurface({super.key, this.subtitle});

  final String? subtitle;

  @override
  State<ParityNewGroupSurface> createState() => _ParityNewGroupSurfaceState();
}

class _ParityNewGroupSurfaceState extends State<ParityNewGroupSurface> {
  final selected = <String>{'Atia Rahman', 'Mahin Hasan'};

  @override
  Widget build(BuildContext context) {
    const people = [
      'Atia Rahman',
      'Nadia Karim',
      'Mahin Hasan',
      'Rafi Ahmed',
      'Support',
    ];
    return SyncStandardPage(
      title: 'New group',
      actions: [
        TextButton(
          onPressed: selected.isEmpty ? null : () {},
          child: const Text('Create'),
        ),
      ],
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          if (widget.subtitle != null) ...[
            Text(widget.subtitle!, style: TextStyle(color: context.muted)),
            const SizedBox(height: 10),
          ],
          const SyncSoftCard(
            child: Column(
              children: [
                CircleAvatar(
                  radius: 40,
                  backgroundColor: Color(0x170EA5E9),
                  child: Icon(
                    Icons.add_photo_alternate_outlined,
                    color: SyncColors.sky,
                    size: 34,
                  ),
                ),
                SizedBox(height: 12),
                TextField(decoration: InputDecoration(labelText: 'Group name')),
                SizedBox(height: 10),
                TextField(
                  maxLines: 3,
                  decoration: InputDecoration(labelText: 'Description (optional)'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          const TextField(
            decoration: InputDecoration(
              hintText: 'Search contacts…',
              prefixIcon: Icon(Icons.search_rounded),
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 7,
            runSpacing: 7,
            children: selected
                .map(
                  (name) => InputChip(
                    label: Text(name),
                    avatar: SyncAvatar(name: name, radius: 10),
                    onDeleted: () => setState(() => selected.remove(name)),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 8),
          ...people.map(
            (name) => CheckboxListTile(
              value: selected.contains(name),
              onChanged: (_) => setState(() {
                if (selected.contains(name)) {
                  selected.remove(name);
                } else {
                  selected.add(name);
                }
              }),
              secondary: SyncAvatar(name: name, radius: 22),
              title: Text(name, style: const TextStyle(fontWeight: FontWeight.w900)),
              subtitle: Text('@${name.split(' ').first.toLowerCase()}'),
            ),
          ),
        ],
      ),
    );
  }
}

class ParityProfileInfoSurface extends StatefulWidget {
  const ParityProfileInfoSurface({super.key, required this.type});

  final String type;

  @override
  State<ParityProfileInfoSurface> createState() => _ParityProfileInfoSurfaceState();
}

class _ParityProfileInfoSurfaceState extends State<ParityProfileInfoSurface> {
  bool muted = false;
  bool favourite = false;

  @override
  Widget build(BuildContext context) {
    final isFriend = widget.type == 'friend';
    final isGroup = widget.type == 'group';
    final name = isFriend
        ? 'Atia Rahman'
        : isGroup
            ? 'Product Team'
            : 'SyncChat News';
    final subtitle = isFriend
        ? '@atia · online'
        : isGroup
            ? '8 participants · 3 admins'
            : 'Public channel · 4.2K subscribers';

    return SyncStandardPage(
      title: isFriend
          ? 'Contact info'
          : isGroup
              ? 'Group info'
              : 'Channel info',
      actions: [
        IconButton(onPressed: () {}, icon: const Icon(Icons.more_vert_rounded)),
      ],
      child: ListView(
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          const SizedBox(height: 18),
          Center(child: SyncAvatar(name: name, online: isFriend, radius: 55)),
          const SizedBox(height: 12),
          Center(
            child: Text(
              name,
              style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w900),
            ),
          ),
          Center(child: Text(subtitle, style: TextStyle(color: context.muted))),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              children: const [
                Expanded(
                  child: _ProfileAction(
                    icon: Icons.chat_bubble_outline_rounded,
                    label: 'Message',
                  ),
                ),
                SizedBox(width: 8),
                Expanded(
                  child: _ProfileAction(icon: Icons.call_outlined, label: 'Audio'),
                ),
                SizedBox(width: 8),
                Expanded(
                  child: _ProfileAction(
                    icon: Icons.videocam_outlined,
                    label: 'Video',
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (isFriend) ...[
            const ListTile(
              leading: Icon(Icons.info_outline_rounded),
              title: Text('About'),
              subtitle: Text('Building secure realtime products.'),
            ),
            const ListTile(
              leading: Icon(Icons.phone_outlined),
              title: Text('Phone'),
              subtitle: Text('+1 ••• ••• 0182'),
            ),
            const ListTile(
              leading: Icon(Icons.email_outlined),
              title: Text('Email'),
              subtitle: Text('atia@example.com'),
            ),
          ] else ...[
            ListTile(
              leading: const Icon(Icons.group_outlined),
              title: Text(isGroup ? 'Participants' : 'Subscribers'),
              subtitle: Text(isGroup ? '8 participants' : '4.2K subscribers'),
              trailing: const Icon(Icons.chevron_right_rounded),
            ),
            if (isGroup)
              const ListTile(
                leading: Icon(Icons.person_add_alt_1_rounded),
                title: Text('Add participant'),
                trailing: Icon(Icons.chevron_right_rounded),
              ),
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: Text(isGroup ? 'Edit group' : 'Channel details'),
              trailing: const Icon(Icons.chevron_right_rounded),
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
          const ListTile(
            leading: Icon(Icons.perm_media_outlined),
            title: Text('Media, links and files'),
            subtitle: Text('24 items'),
            trailing: Icon(Icons.chevron_right_rounded),
          ),
          const ListTile(
            leading: Icon(Icons.search_rounded),
            title: Text('Search in conversation'),
            trailing: Icon(Icons.chevron_right_rounded),
          ),
          ListTile(
            leading: const Icon(Icons.warning_amber_rounded, color: SyncColors.danger),
            title: Text(
              isFriend
                  ? 'Block contact'
                  : isGroup
                      ? 'Exit group'
                      : 'Leave channel',
              style: const TextStyle(
                color: SyncColors.danger,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileAction extends StatelessWidget {
  const _ProfileAction({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        color: context.softPanel,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Icon(icon, color: SyncColors.sky),
          const SizedBox(height: 5),
          Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class ParityParticipantsSurface extends StatefulWidget {
  const ParityParticipantsSurface({super.key, required this.addMode});

  final bool addMode;

  @override
  State<ParityParticipantsSurface> createState() => _ParityParticipantsSurfaceState();
}

class _ParityParticipantsSurfaceState extends State<ParityParticipantsSurface> {
  final selected = <String>{};

  @override
  Widget build(BuildContext context) {
    const people = [
      ('Atia Rahman', true, true),
      ('Nadia Karim', false, false),
      ('Mahin Hasan', true, true),
      ('Rafi Ahmed', false, false),
      ('Support', true, false),
    ];
    return SyncStandardPage(
      title: widget.addMode ? 'Add participant' : 'Participants',
      actions: [
        if (widget.addMode)
          TextButton(
            onPressed: selected.isEmpty ? null : () {},
            child: Text('Add (${selected.length})'),
          ),
      ],
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          const TextField(
            decoration: InputDecoration(
              hintText: 'Search people…',
              prefixIcon: Icon(Icons.search_rounded),
            ),
          ),
          const SizedBox(height: 10),
          ...people.map((person) {
            if (widget.addMode) {
              return CheckboxListTile(
                value: selected.contains(person.$1),
                onChanged: (_) => setState(() {
                  if (selected.contains(person.$1)) {
                    selected.remove(person.$1);
                  } else {
                    selected.add(person.$1);
                  }
                }),
                secondary: SyncAvatar(
                  name: person.$1,
                  online: person.$2,
                  radius: 22,
                ),
                title: Text(
                  person.$1,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                subtitle: Text('@${person.$1.split(' ').first.toLowerCase()}'),
              );
            }
            return ListTile(
              leading: SyncAvatar(
                name: person.$1,
                online: person.$2,
                radius: 22,
              ),
              title: Row(
                children: [
                  Expanded(
                    child: Text(
                      person.$1,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ),
                  if (person.$3) const Chip(label: Text('Admin')),
                ],
              ),
              subtitle: Text('@${person.$1.split(' ').first.toLowerCase()}'),
              trailing: const Icon(Icons.more_vert_rounded),
            );
          }),
        ],
      ),
    );
  }
}

class ParityDocumentSurface extends StatelessWidget {
  const ParityDocumentSurface({super.key, required this.type});

  final String type;

  @override
  Widget build(BuildContext context) {
    final policy = type == 'policy';
    return SyncStandardPage(
      title: policy ? 'Terms & privacy policy' : 'License',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 32),
        children: [
          Text(
            policy ? 'SyncChat Terms & Privacy' : 'SyncChat License',
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 12),
          Text(
            policy
                ? 'Your privacy, account security, messaging data and device controls are presented in the same mobile reading hierarchy as the web policy page.'
                : 'SyncChat and third-party attribution information is presented in the same clean document layout as the web client.',
            style: const TextStyle(height: 1.55),
          ),
          const SizedBox(height: 20),
          _DocSection(
            title: policy ? 'Privacy' : 'Application',
            body: policy
                ? 'Profile, contact, chat, call and device information follows your account privacy settings and server policy.'
                : 'SyncChat mobile client — Flutter application.',
          ),
          _DocSection(
            title: policy ? 'Security' : 'Third-party packages',
            body: policy
                ? 'Authentication, app lock, two-factor authentication and supported E2EE controls protect account and conversation access.'
                : 'Package notices and licenses remain available from this page before release.',
          ),
          if (policy)
            const _DocSection(
              title: 'Data controls',
              body: 'Export, backup, restore, remote logout and account deletion controls are available from Settings.',
            ),
        ],
      ),
    );
  }
}

class _DocSection extends StatelessWidget {
  const _DocSection({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 6),
          Text(body, style: const TextStyle(height: 1.55)),
        ],
      ),
    );
  }
}

class ParityBackupSurface extends StatelessWidget {
  const ParityBackupSurface({super.key});

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'Backup / restore',
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: const [
          SyncFeatureCard(
            icon: Icons.backup_outlined,
            title: 'Encrypted backup',
            body: 'Create a password-protected archive of profile, settings, contacts and supported chat metadata.',
          ),
          SizedBox(height: 14),
          SyncSoftCard(
            child: Column(
              children: [
                ListTile(
                  leading: Icon(Icons.lock_outline_rounded),
                  title: Text('Backup password'),
                  subtitle: Text('Required before creating or restoring a backup'),
                ),
                ListTile(
                  leading: Icon(Icons.backup_rounded),
                  title: Text('Create backup'),
                  trailing: Icon(Icons.chevron_right_rounded),
                ),
                ListTile(
                  leading: Icon(Icons.restore_rounded),
                  title: Text('Restore backup'),
                  trailing: Icon(Icons.chevron_right_rounded),
                ),
                ListTile(
                  leading: Icon(Icons.history_rounded),
                  title: Text('Last backup'),
                  subtitle: Text('Today · 120 MB'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class ParityDriveSurface extends StatelessWidget {
  const ParityDriveSurface({super.key});

  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'Google Drive',
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          const SyncFeatureCard(
            icon: Icons.cloud_outlined,
            title: 'Google Drive',
            body: 'Connect Drive to upload encrypted backups and restore them on another device.',
          ),
          const SizedBox(height: 14),
          SyncSoftCard(
            child: Column(
              children: [
                const ListTile(
                  leading: CircleAvatar(
                    backgroundColor: Color(0x170EA5E9),
                    child: Icon(Icons.cloud_done_outlined, color: SyncColors.sky),
                  ),
                  title: Text('Not connected'),
                  subtitle: Text('Connect your Google account to continue'),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () {},
                    icon: const Icon(Icons.link_rounded),
                    label: const Text('Connect Google Drive'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class ParityStatusDetailSurface extends StatelessWidget {
  const ParityStatusDetailSurface({super.key, required this.mode});

  final String mode;

  @override
  Widget build(BuildContext context) {
    if (mode == 'viewer') return const _StatusViewer();
    final reactions = mode == 'reactions';
    return _BottomSheetPage(
      title: reactions ? 'Status interactions' : 'Status activity',
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: reactions ? _reactionRows : _activityRows,
      ),
    );
  }

  static const _reactionRows = <Widget>[
    ListTile(
      leading: Text('❤️', style: TextStyle(fontSize: 24)),
      title: Text('Atia Rahman', style: TextStyle(fontWeight: FontWeight.w900)),
      subtitle: Text('Reacted to your status · 8 min'),
    ),
    ListTile(
      leading: Icon(Icons.reply_rounded, color: SyncColors.sky),
      title: Text('Nadia Karim', style: TextStyle(fontWeight: FontWeight.w900)),
      subtitle: Text('Looks great! · private reply'),
    ),
    ListTile(
      leading: Icon(Icons.alternate_email_rounded, color: SyncColors.sky),
      title: Text('Mahin Hasan', style: TextStyle(fontWeight: FontWeight.w900)),
      subtitle: Text('Mentioned you in a status'),
    ),
  ];

  static const _activityRows = <Widget>[
    ListTile(
      leading: Icon(Icons.visibility_outlined, color: SyncColors.sky),
      title: Text('34 views', style: TextStyle(fontWeight: FontWeight.w900)),
      subtitle: Text('People who viewed your latest status'),
    ),
    ListTile(
      leading: Icon(Icons.add_reaction_outlined, color: SyncColors.sky),
      title: Text('8 reactions', style: TextStyle(fontWeight: FontWeight.w900)),
      subtitle: Text('Emoji reactions'),
    ),
    ListTile(
      leading: Icon(Icons.reply_rounded, color: SyncColors.sky),
      title: Text('5 replies', style: TextStyle(fontWeight: FontWeight.w900)),
      subtitle: Text('Private status replies'),
    ),
    ListTile(
      leading: Icon(Icons.alternate_email_rounded, color: SyncColors.sky),
      title: Text('2 mentions', style: TextStyle(fontWeight: FontWeight.w900)),
      subtitle: Text('Mentions in status activity'),
    ),
  ];
}

class _StatusViewer extends StatelessWidget {
  const _StatusViewer();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SyncColors.slate950,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(10),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.maybePop(context),
                    icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                  ),
                  const SyncAvatar(name: 'Atia Rahman', radius: 18),
                  const SizedBox(width: 9),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Atia Rahman',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        Text(
                          '18 min',
                          style: TextStyle(color: Colors.white60, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.more_vert_rounded, color: Colors.white),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: List.generate(
                  3,
                  (index) => Expanded(
                    child: Container(
                      height: 3,
                      margin: const EdgeInsets.symmetric(horizontal: 2),
                      color: index == 0 ? Colors.white : Colors.white24,
                    ),
                  ),
                ),
              ),
            ),
            Expanded(
              child: Center(
                child: Container(
                  margin: const EdgeInsets.all(18),
                  width: double.infinity,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [SyncColors.sky700, SyncColors.cyan, SyncColors.teal],
                    ),
                    borderRadius: BorderRadius.circular(28),
                  ),
                  child: const Center(
                    child: Padding(
                      padding: EdgeInsets.all(28),
                      child: Text(
                        'Secure realtime communication, everywhere.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 28,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(
                12,
                8,
                12,
                MediaQuery.paddingOf(context).bottom + 10,
              ),
              child: Row(
                children: [
                  const Expanded(
                    child: TextField(
                      style: TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        hintText: 'Reply to status…',
                        hintStyle: TextStyle(color: Colors.white60),
                        fillColor: Colors.white12,
                        prefixIcon: Icon(Icons.reply_rounded, color: Colors.white70),
                        suffixIcon: Icon(Icons.send_rounded, color: Colors.white),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Icon(Icons.favorite_border_rounded, color: Colors.white),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ParityCallSurface extends StatefulWidget {
  const ParityCallSurface({super.key, required this.mode});

  final String mode;

  @override
  State<ParityCallSurface> createState() => _ParityCallSurfaceState();
}

class _ParityCallSurfaceState extends State<ParityCallSurface> {
  bool muted = false;
  bool camera = true;

  @override
  Widget build(BuildContext context) {
    if (widget.mode == 'incoming') return _incoming(context);
    if (widget.mode == 'start') return const _StartCallSheet();
    return _group(context);
  }

  Widget _incoming(BuildContext context) {
    return Scaffold(
      backgroundColor: SyncColors.slate950,
      body: SafeArea(
        child: Stack(
          children: [
            const Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0xFF0F172A), Color(0xFF020617)],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                ),
              ),
            ),
            const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SyncAvatar(name: 'Atia Rahman', radius: 72),
                  SizedBox(height: 18),
                  Text(
                    'Atia Rahman',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  SizedBox(height: 6),
                  Text('Incoming video call…', style: TextStyle(color: Colors.white60)),
                ],
              ),
            ),
            const Positioned(
              left: 0,
              right: 0,
              top: 18,
              child: Center(
                child: Chip(
                  avatar: Icon(Icons.lock_rounded, size: 16, color: SyncColors.success),
                  label: Text('Secure'),
                ),
              ),
            ),
            Positioned(
              left: 24,
              right: 24,
              bottom: MediaQuery.paddingOf(context).bottom + 30,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  CircleAvatar(
                    radius: 31,
                    backgroundColor: SyncColors.danger,
                    child: IconButton(
                      onPressed: () => Navigator.maybePop(context),
                      icon: const Icon(Icons.call_end_rounded, color: Colors.white),
                    ),
                  ),
                  const CircleAvatar(
                    radius: 31,
                    backgroundColor: SyncColors.success,
                    child: Icon(Icons.videocam_rounded, color: Colors.white),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _group(BuildContext context) {
    const people = ['You', 'Atia Rahman', 'Mahin Hasan', 'Nadia Karim'];
    return Scaffold(
      backgroundColor: SyncColors.slate950,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.maybePop(context),
                    icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                  ),
                  const Expanded(
                    child: Text(
                      'Product Team',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
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
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  childAspectRatio: .78,
                ),
                itemBuilder: (_, index) => Container(
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [SyncColors.spill800, SyncColors.slate900],
                    ),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.white10),
                  ),
                  child: Stack(
                    children: [
                      Center(child: SyncAvatar(name: people[index], radius: 46)),
                      Positioned(
                        left: 10,
                        bottom: 10,
                        child: Text(
                          people[index],
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      if (index == 2)
                        const Positioned(
                          right: 10,
                          top: 10,
                          child: Icon(Icons.mic_off_rounded, color: SyncColors.danger),
                        ),
                    ],
                  ),
                ),
              ),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(
                12,
                12,
                12,
                MediaQuery.paddingOf(context).bottom + 12,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _CallButton(
                    icon: muted ? Icons.mic_off_rounded : Icons.mic_rounded,
                    onTap: () => setState(() => muted = !muted),
                  ),
                  const SizedBox(width: 10),
                  _CallButton(
                    icon: camera ? Icons.videocam_rounded : Icons.videocam_off_rounded,
                    onTap: () => setState(() => camera = !camera),
                  ),
                  const SizedBox(width: 14),
                  _CallButton(
                    icon: Icons.call_end_rounded,
                    background: SyncColors.danger,
                    onTap: () => Navigator.maybePop(context),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CallButton extends StatelessWidget {
  const _CallButton({
    required this.icon,
    required this.onTap,
    this.background = const Color(0x22FFFFFF),
  });

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
        child: SizedBox(
          width: 54,
          height: 54,
          child: Icon(icon, color: Colors.white),
        ),
      ),
    );
  }
}

class _StartCallSheet extends StatelessWidget {
  const _StartCallSheet();

  @override
  Widget build(BuildContext context) {
    return _BottomSheetPage(
      title: 'Start call',
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          const ListTile(
            leading: SyncAvatar(name: 'Atia Rahman', online: true, radius: 24),
            title: Text('Atia Rahman', style: TextStyle(fontWeight: FontWeight.w900)),
            subtitle: Text('online'),
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.call_outlined),
            label: const Text('Audio call'),
          ),
          const SizedBox(height: 8),
          FilledButton.tonalIcon(
            onPressed: () {},
            icon: const Icon(Icons.videocam_outlined),
            label: const Text('Video call'),
          ),
        ],
      ),
    );
  }
}

class ParityPhotoSurface extends StatelessWidget {
  const ParityPhotoSurface({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            const Positioned.fill(
              child: Center(
                child: Icon(Icons.image_outlined, color: Colors.white24, size: 160),
              ),
            ),
            Positioned(
              left: 8,
              top: 8,
              child: IconButton(
                onPressed: () => Navigator.maybePop(context),
                icon: const Icon(Icons.close_rounded, color: Colors.white),
              ),
            ),
            const Positioned(
              right: 12,
              top: 14,
              child: Icon(Icons.more_vert_rounded, color: Colors.white),
            ),
            const Positioned(
              left: 16,
              bottom: 18,
              child: Text(
                'Shared photo · Today 10:24 PM',
                style: TextStyle(color: Colors.white70),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomSheetPage extends StatelessWidget {
  const _BottomSheetPage({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black45,
      body: SafeArea(
        child: Align(
          alignment: Alignment.bottomCenter,
          child: Container(
            height: MediaQuery.sizeOf(context).height * .72,
            decoration: BoxDecoration(
              color: context.panel,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
              border: Border.all(color: context.border),
            ),
            child: Column(
              children: [
                Container(
                  width: 42,
                  height: 4,
                  margin: const EdgeInsets.only(top: 12, bottom: 10),
                  decoration: BoxDecoration(
                    color: context.border,
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.maybePop(context),
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ],
                  ),
                ),
                Expanded(child: child),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
