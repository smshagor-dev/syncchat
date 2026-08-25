import 'package:flutter/material.dart';

import '../parity_catalog.dart';
import '../theme.dart';
import '../widgets.dart';
import 'chat_room_screen.dart';
import 'core_screens.dart';

/// Every user-visible web surface registered in [parityCatalog] has an explicit
/// mobile design route here. Keep this set in sync with parity_catalog.dart.
const exactParityTitles = <String>{
  'Sign in / Sign up shell',
  'Forgot password',
  'Link device',
  'QR scanner',
  'Social auth',
  'Verify account',
  'Inactive account',
  'Chat application shell',
  'Chats',
  'Calls',
  'Status rail',
  'Archive',
  'Lists',
  'Starred messages',
  'Chat filters',
  'Mobile bottom navigation',
  'Mobile side rail',
  'Overflow mini menu',
  'Open contact',
  'Contacts',
  'Communities',
  'Channels',
  'Status',
  'Profile',
  'Settings',
  'Media',
  'Policy',
  'License',
  'New group',
  'Friend profile',
  'Group profile',
  'Channel profile',
  'Group participants',
  'Add participant',
  'Room header',
  'Pinned messages',
  'Pin history',
  'Search in chat',
  'Message monitor',
  'Message selection',
  'Reply / forward / reaction / edit',
  'Media / link / location / poll / event message cards',
  'Composer',
  'Emoji board',
  'Voice recorder',
  'Scheduled messages',
  'View-once text',
  'Slow mode / admin-only send state',
  'Search',
  'Message requests',
  'Mentions',
  'Topics',
  'Security / E2EE',
  'Outbox / retry',
  'Message details / receipts',
  'Account settings',
  'Devices',
  'Privacy',
  'Chat settings',
  'Notifications',
  'Voice & Video',
  'Google 2FA',
  'App lock',
  'Recovery codes',
  'Keyboard shortcuts',
  'Backup / restore',
  'Google Drive connection',
  'Status composer',
  'Status viewer',
  'Status activity',
  'Status reactions / replies / mentions',
  'Start call',
  '1:1 call panel',
  'Call runtime',
  'Group call / LiveKit',
  'Global incoming call layer',
  'Attach menu',
  'Attach contact',
  'Attach event',
  'Attach poll',
  'Attach sticker',
  'Avatar upload',
  'Image cropper',
  'Change password',
  'Delete account',
  'Confirm add participant',
  'Confirm delete chat',
  'Confirm delete chat + inbox',
  'Confirm delete contact',
  'Confirm exit group',
  'Confirm new group',
  'Edit group',
  'Feedback',
  'Group context menu',
  'Inbox context menu',
  'Media preview',
  'New contact',
  'Photo full screen',
  'QR profile / device',
  'Record voice',
  'Room appearance',
  'Room header menu',
  'Send file',
  'Share contact',
  'Sign out',
  'Webcam capture',
};

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
      // Auth and route surfaces.
      'Sign in / Sign up shell' => const _AuthSurface(mode: 'auth'),
      'Forgot password' => const _AuthSurface(mode: 'forgot'),
      'Link device' => const _AuthSurface(mode: 'link'),
      'QR scanner' => const _AuthSurface(mode: 'qr'),
      'Social auth' => const _AuthSurface(mode: 'social'),
      'Verify account' => const _VerificationSurface(inactive: false),
      'Inactive account' => const _VerificationSurface(inactive: true),

      // Foreground shell and navigation.
      'Chat application shell' => const _ForegroundSurface(mode: 'shell'),
      'Chats' => const _ForegroundSurface(mode: 'chats'),
      'Calls' => const CallsScreen(),
      'Status rail' => const _ForegroundSurface(mode: 'status'),
      'Archive' => const _CollectionSurface(mode: 'archive'),
      'Lists' => const _CollectionSurface(mode: 'lists'),
      'Starred messages' => const _CollectionSurface(mode: 'starred'),
      'Chat filters' => const _ForegroundSurface(mode: 'filters'),
      'Mobile bottom navigation' => const _ForegroundSurface(mode: 'dock'),
      'Mobile side rail' => const _ForegroundSurface(mode: 'rail'),
      'Overflow mini menu' => const _ForegroundSurface(mode: 'overflow'),
      'Open contact' => const _ForegroundSurface(mode: 'contact'),

      // Primary pages.
      'Contacts' => const ContactsScreen(),
      'Communities' => const CommunitiesScreen(),
      'Channels' => const ChannelsScreen(),
      'Status' => const StatusScreen(),
      'Profile' => const ProfileScreen(),
      'Settings' => SettingsScreen(onThemeChanged: (_) {}),
      'Media' => const CollectionScreen(
          title: 'Media',
          icon: Icons.perm_media_outlined,
          description: 'Photos, videos, links and files shared across SyncChat.',
        ),
      'Policy' || 'Terms & privacy policy' => const _DocumentSurface(type: 'policy'),
      'License' => const _DocumentSurface(type: 'license'),
      'New group' => _NewGroupSurface(subtitle: subtitle),
      'Friend profile' => const _ProfileInfoSurface(type: 'friend'),
      'Group profile' => const _ProfileInfoSurface(type: 'group'),
      'Channel profile' => const _ProfileInfoSurface(type: 'channel'),
      'Group participants' => const _ParticipantsSurface(addMode: false),
      'Add participant' => const _ParticipantsSurface(addMode: true),

      // Room states.
      'Room header' => const _RoomSurface(mode: 'header'),
      'Pinned messages' => const _RoomSurface(mode: 'pinned'),
      'Pin history' => const _RoomSurface(mode: 'pinHistory'),
      'Search in chat' => const _RoomSurface(mode: 'search'),
      'Message monitor' => const _RoomSurface(mode: 'monitor'),
      'Message selection' => const _RoomSurface(mode: 'selection'),
      'Reply / forward / reaction / edit' => const _RoomSurface(mode: 'messageActions'),
      'Media / link / location / poll / event message cards' => const _RoomSurface(mode: 'richCards'),
      'Composer' => const _RoomSurface(mode: 'composer'),
      'Emoji board' => const _RoomSurface(mode: 'emoji'),
      'Voice recorder' => const _RoomSurface(mode: 'voice'),
      'Scheduled messages' => const _RoomSurface(mode: 'scheduled'),
      'View-once text' => const _RoomSurface(mode: 'viewOnce'),
      'Slow mode / admin-only send state' => const _RoomSurface(mode: 'restricted'),

      // Chat Tools.
      'Search' => const _ChatToolsSurface(tab: 'search'),
      'Message requests' => const _ChatToolsSurface(tab: 'requests'),
      'Mentions' => const _ChatToolsSurface(tab: 'mentions'),
      'Topics' => const _ChatToolsSurface(tab: 'topics'),
      'Security / E2EE' => const _ChatToolsSurface(tab: 'security'),
      'Outbox / retry' => const _ChatToolsSurface(tab: 'outbox'),
      'Message details / receipts' => const _ChatToolsSurface(tab: 'receipts'),

      // Settings detail pages.
      'Account settings' => const SettingDetailScreen(title: 'Account settings'),
      'Devices' => const SettingDetailScreen(title: 'Devices'),
      'Privacy' => const SettingDetailScreen(title: 'Privacy'),
      'Chat settings' => const SettingDetailScreen(title: 'Chats'),
      'Notifications' => const SettingDetailScreen(title: 'Notifications'),
      'Voice & Video' => const SettingDetailScreen(title: 'Voice & Video'),
      'Google 2FA' => const SettingDetailScreen(title: 'Google 2FA'),
      'App lock' => const SettingDetailScreen(title: 'App lock'),
      'Recovery codes' => const SettingDetailScreen(title: 'Recovery codes'),
      'Keyboard shortcuts' => const SettingDetailScreen(title: 'Keyboard shortcuts'),
      'Backup / restore' => const _BackupSurface(),
      'Google Drive connection' => const _DriveSurface(),

      // Status states.
      'Status composer' => const StatusScreen(),
      'Status viewer' => const _StatusDetailSurface(mode: 'viewer'),
      'Status activity' => const _StatusDetailSurface(mode: 'activity'),
      'Status reactions / replies / mentions' => const _StatusDetailSurface(mode: 'reactions'),

      // Calls.
      'Start call' => const _CallSurface(mode: 'start'),
      '1:1 call panel' => const CallPanelScreen(name: 'Atia Rahman', video: false),
      'Call runtime' => const CallPanelScreen(name: 'Atia Rahman', video: true),
      'Group call / LiveKit' => const _CallSurface(mode: 'group'),
      'Global incoming call layer' => const _CallSurface(mode: 'incoming'),

      // Modals and mobile sheets.
      'Attach menu' => const _ModalSurface(type: 'attachMenu'),
      'Attach contact' => const _ModalSurface(type: 'attachContact'),
      'Attach event' => const _ModalSurface(type: 'attachEvent'),
      'Attach poll' => const _ModalSurface(type: 'attachPoll'),
      'Attach sticker' => const _ModalSurface(type: 'attachSticker'),
      'Avatar upload' => const _ModalSurface(type: 'avatarUpload'),
      'Image cropper' => const _ModalSurface(type: 'imageCropper'),
      'Change password' => const _ModalSurface(type: 'changePassword'),
      'Delete account' => const _ModalSurface(type: 'deleteAccount'),
      'Confirm add participant' => const _ModalSurface(type: 'confirmAdd'),
      'Confirm delete chat' => const _ModalSurface(type: 'deleteChat'),
      'Confirm delete chat + inbox' => const _ModalSurface(type: 'deleteChatInbox'),
      'Confirm delete contact' => const _ModalSurface(type: 'deleteContact'),
      'Confirm exit group' => const _ModalSurface(type: 'exitGroup'),
      'Confirm new group' => const _ModalSurface(type: 'confirmGroup'),
      'Edit group' => const _ModalSurface(type: 'editGroup'),
      'Feedback' => const _ModalSurface(type: 'feedback'),
      'Group context menu' => const _ModalSurface(type: 'groupMenu'),
      'Inbox context menu' => const _ModalSurface(type: 'inboxMenu'),
      'Media preview' => const _ModalSurface(type: 'mediaPreview'),
      'New contact' => const _ModalSurface(type: 'newContact'),
      'Photo full screen' => const _PhotoSurface(),
      'QR profile / device' => const _ModalSurface(type: 'qr'),
      'Record voice' => const _ModalSurface(type: 'recordVoice'),
      'Room appearance' => const RoomAppearanceScreen(),
      'Room header menu' => const _ModalSurface(type: 'roomMenu'),
      'Send file' => const _ModalSurface(type: 'sendFile'),
      'Share contact' => const _ModalSurface(type: 'shareContact'),
      'Sign out' => const _ModalSurface(type: 'signOut'),
      'Webcam capture' => const _ModalSurface(type: 'webcam'),
      _ => _UnknownSurface(title: title),
    };
  }
}

class _AuthSurface extends StatefulWidget {
  const _AuthSurface({required this.mode});
  final String mode;

  @override
  State<_AuthSurface> createState() => _AuthSurfaceState();
}

class _AuthSurfaceState extends State<_AuthSurface> {
  bool signIn = true;
  bool obscure = true;

  @override
  Widget build(BuildContext context) {
    final title = switch (widget.mode) {
      'forgot' => 'Forgot password',
      'link' => 'Link device',
      'qr' => 'Scan QR code',
      'social' => 'Continue with',
      _ => signIn ? 'Sign in' : 'Sign up',
    };
    return Scaffold(
      backgroundColor: SyncColors.slate950,
      body: Stack(
        children: [
          const Positioned(left: -90, top: 70, child: _Glow(size: 270, color: SyncColors.cyan)),
          const Positioned(right: -110, top: -50, child: _Glow(size: 320, color: SyncColors.sky)),
          const Positioned(left: 80, bottom: -150, child: _Glow(size: 320, color: SyncColors.teal)),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(18),
                child: Container(
                  constraints: const BoxConstraints(maxWidth: 560),
                  padding: const EdgeInsets.all(22),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(.97),
                    borderRadius: BorderRadius.circular(28),
                    border: Border.all(color: Colors.white70),
                    boxShadow: const [BoxShadow(color: Color(0x55020617), blurRadius: 42, offset: Offset(0, 18))],
                  ),
                  child: Theme(
                    data: SyncChatTheme.light(),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text('WELCOME TO', style: TextStyle(letterSpacing: 2.4, fontSize: 11, fontWeight: FontWeight.w800, color: SyncColors.slate500)),
                        const Text('SyncChat', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900, color: SyncColors.slate900)),
                        const SizedBox(height: 22),
                        if (widget.mode == 'auth') ...[
                          Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(color: SyncColors.slate100, borderRadius: BorderRadius.circular(14)),
                            child: Row(
                              children: [
                                Expanded(child: _AuthTab(label: 'Sign in', active: signIn, onTap: () => setState(() => signIn = true))),
                                Expanded(child: _AuthTab(label: 'Sign up', active: !signIn, onTap: () => setState(() => signIn = false))),
                              ],
                            ),
                          ),
                          const SizedBox(height: 20),
                        ],
                        Text(title, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: SyncColors.slate900)),
                        const SizedBox(height: 5),
                        Text(_authSubtitle(widget.mode, signIn), style: const TextStyle(color: SyncColors.slate500, height: 1.45)),
                        const SizedBox(height: 18),
                        ..._authBody(widget.mode, signIn),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _authBody(String mode, bool login) {
    if (mode == 'qr') {
      return [
        Container(
          height: 240,
          decoration: BoxDecoration(color: SyncColors.slate950, borderRadius: BorderRadius.circular(20)),
          child: const Stack(
            alignment: Alignment.center,
            children: [
              Icon(Icons.qr_code_scanner_rounded, color: Colors.white24, size: 118),
              SizedBox(width: 178, height: 178, child: DecoratedBox(decoration: BoxDecoration(border: Border.fromBorderSide(BorderSide(color: SyncColors.sky, width: 2))))),
            ],
          ),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(onPressed: null, icon: Icon(Icons.camera_alt_outlined), label: Text('Open camera')),
      ];
    }
    if (mode == 'link') {
      return const [
        TextField(decoration: InputDecoration(labelText: 'Device code', prefixIcon: Icon(Icons.devices_other_rounded))),
        SizedBox(height: 12),
        FilledButton.icon(onPressed: null, icon: Icon(Icons.link_rounded), label: Text('Link device')),
        SizedBox(height: 8),
        OutlinedButton.icon(onPressed: null, icon: Icon(Icons.qr_code_scanner_rounded), label: Text('Scan QR instead')),
      ];
    }
    if (mode == 'forgot') {
      return const [
        TextField(decoration: InputDecoration(labelText: 'Email address', prefixIcon: Icon(Icons.email_outlined))),
        SizedBox(height: 12),
        FilledButton(onPressed: null, child: Text('Send recovery code')),
        SizedBox(height: 10),
        Text('Recovery uses the same three-step verification flow as the web client.', textAlign: TextAlign.center, style: TextStyle(color: SyncColors.slate500, fontSize: 12)),
      ];
    }
    if (mode == 'social') {
      return const [
        _SocialButton(icon: Icons.g_mobiledata_rounded, label: 'Continue with Google'),
        SizedBox(height: 9),
        _SocialButton(icon: Icons.facebook_rounded, label: 'Continue with Facebook'),
        SizedBox(height: 14),
        Row(children: [Expanded(child: Divider()), Padding(padding: EdgeInsets.symmetric(horizontal: 10), child: Text('OR')), Expanded(child: Divider())]),
        SizedBox(height: 14),
        _SocialButton(icon: Icons.mail_outline_rounded, label: 'Continue with email'),
      ];
    }
    return [
      if (!login) ...[
        const TextField(decoration: InputDecoration(labelText: 'Full name', prefixIcon: Icon(Icons.person_outline_rounded))),
        const SizedBox(height: 10),
        const TextField(decoration: InputDecoration(labelText: 'Username', prefixIcon: Icon(Icons.alternate_email_rounded))),
        const SizedBox(height: 10),
      ],
      const TextField(decoration: InputDecoration(labelText: 'Email or username', prefixIcon: Icon(Icons.person_outline_rounded))),
      const SizedBox(height: 10),
      TextField(
        obscureText: obscure,
        decoration: InputDecoration(
          labelText: 'Password',
          prefixIcon: const Icon(Icons.lock_outline_rounded),
          suffixIcon: IconButton(onPressed: () => setState(() => obscure = !obscure), icon: Icon(obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined)),
        ),
      ),
      const SizedBox(height: 12),
      FilledButton(onPressed: () {}, child: Text(login ? 'Sign in' : 'Create account')),
      if (login) TextButton(onPressed: () {}, child: const Text('Forgot password?')),
    ];
  }
}

class _AuthTab extends StatelessWidget {
  const _AuthTab({required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: active ? Colors.white : Colors.transparent,
      borderRadius: BorderRadius.circular(11),
      child: InkWell(
        borderRadius: BorderRadius.circular(11),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Text(label, textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w800, color: active ? SyncColors.slate900 : SyncColors.slate500)),
        ),
      ),
    );
  }
}

class _SocialButton extends StatelessWidget {
  const _SocialButton({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(onPressed: () {}, icon: Icon(icon), label: Padding(padding: const EdgeInsets.symmetric(vertical: 5), child: Text(label)));
  }
}

class _Glow extends StatelessWidget {
  const _Glow({required this.size, required this.color});
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(shape: BoxShape.circle, color: color.withOpacity(.18), boxShadow: [BoxShadow(color: color.withOpacity(.22), blurRadius: 85, spreadRadius: 25)]),
      ),
    );
  }
}

String _authSubtitle(String mode, bool signIn) => switch (mode) {
      'forgot' => 'Secure password recovery in three steps.',
      'link' => 'Scan a QR or enter a short code from your signed-in device.',
      'qr' => 'Point your camera at the QR shown on your signed-in device.',
      'social' => 'Use a connected account or continue with email.',
      _ => signIn ? 'Access your secure Space in seconds.' : 'Create your SyncChat account and start messaging.',
    };

class _VerificationSurface extends StatelessWidget {
  const _VerificationSurface({required this.inactive});
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
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(28)),
              child: Theme(
                data: SyncChatTheme.light(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Icon(inactive ? Icons.pause_circle_outline_rounded : Icons.mark_email_read_outlined, size: 60, color: inactive ? SyncColors.warning : SyncColors.sky),
                    const SizedBox(height: 14),
                    Text(inactive ? 'Account inactive' : 'Verify your account', textAlign: TextAlign.center, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: SyncColors.slate900)),
                    const SizedBox(height: 8),
                    Text(inactive ? 'Your account is currently inactive. Review the notice or contact support.' : 'Enter the verification code sent to your email address.', textAlign: TextAlign.center, style: const TextStyle(color: SyncColors.slate500, height: 1.45)),
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

class _ForegroundSurface extends StatelessWidget {
  const _ForegroundSurface({required this.mode});
  final String mode;

  @override
  Widget build(BuildContext context) {
    if (mode == 'rail') return const _RailPreview();
    if (mode == 'overflow') return const _ModalSurface(type: 'inboxMenu');
    if (mode == 'contact') return const _OpenContactSurface();

    final bottom = MediaQuery.paddingOf(context).bottom;
    return Scaffold(
      backgroundColor: context.isDark ? SyncColors.spill950 : SyncColors.slate100,
      body: SafeArea(
        bottom: false,
        child: Stack(
          children: [
            Column(
              children: [
                Container(
                  color: context.panel,
                  padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
                  child: Row(
                    children: [
                      const CircleAvatar(radius: 17, backgroundColor: Color(0x170EA5E9), child: Icon(Icons.sync_rounded, color: SyncColors.sky)),
                      const SizedBox(width: 9),
                      const Expanded(child: Text('SyncChat', style: TextStyle(fontSize: 21, fontWeight: FontWeight.w900))),
                      IconButton(onPressed: () {}, icon: const Icon(Icons.qr_code_rounded)),
                      IconButton(onPressed: () {}, icon: const Icon(Icons.more_vert_rounded)),
                    ],
                  ),
                ),
                Container(
                  color: context.panel,
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                  child: Column(
                    children: [
                      const TextField(decoration: InputDecoration(hintText: 'Search or start new chat', prefixIcon: Icon(Icons.search_rounded))),
                      const SizedBox(height: 9),
                      SizedBox(
                        height: 34,
                        child: ListView(
                          scrollDirection: Axis.horizontal,
                          children: ['All', 'Unread 4', 'Favourite 3', 'Group 6'].asMap().entries.map((entry) {
                            final active = mode == 'filters' ? entry.key == 1 : entry.key == 0;
                            return Container(
                              margin: const EdgeInsets.only(right: 7),
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                              decoration: BoxDecoration(color: active ? SyncColors.sky600 : context.softPanel, borderRadius: BorderRadius.circular(99), border: Border.all(color: active ? SyncColors.sky600 : context.border)),
                              child: Text(entry.value, style: TextStyle(color: active ? Colors.white : context.ink, fontWeight: FontWeight.w800, fontSize: 12)),
                            );
                          }).toList(),
                        ),
                      ),
                    ],
                  ),
                ),
                Divider(height: 1, color: context.border),
                if (mode == 'status') _statusRail(context),
                Expanded(
                  child: ListView.separated(
                    padding: EdgeInsets.only(bottom: 112 + bottom),
                    itemCount: 8,
                    separatorBuilder: (_, __) => Divider(height: 1, indent: 76, color: context.border),
                    itemBuilder: (_, index) {
                      final names = ['Atia Rahman', 'Product Team', 'Nadia Karim', 'SyncChat News', 'Mahin Hasan', 'Design', 'Support', 'Family'];
                      return ListTile(
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
                        leading: SyncAvatar(name: names[index], online: index == 0 || index == 4, radius: 24),
                        title: Text(names[index], style: const TextStyle(fontWeight: FontWeight.w900)),
                        subtitle: Text(index == 0 ? 'Typing…' : index == 1 ? 'You: Release checklist is ready' : 'Latest conversation preview', maxLines: 1, overflow: TextOverflow.ellipsis),
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(index < 3 ? '10:${24 + index}' : 'Yesterday', style: TextStyle(fontSize: 10, color: index < 3 ? SyncColors.sky : context.muted)),
                            const SizedBox(height: 5),
                            if (index < 2) const CircleAvatar(radius: 9, backgroundColor: SyncColors.success, child: Text('2', style: TextStyle(fontSize: 9, color: Colors.white, fontWeight: FontWeight.w900))),
                          ],
                        ),
                        onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ChatRoomScreen(name: names[index], group: index == 1))),
                      );
                    },
                  ),
                ),
              ],
            ),
            if (mode == 'shell' || mode == 'chats' || mode == 'dock') Positioned(left: 12, right: 12, bottom: bottom + 8, child: const _DockPreview()),
          ],
        ),
      ),
    );
  }

  Widget _statusRail(BuildContext context) {
    return Container(
      height: 88,
      color: context.panel,
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        children: const [
          SyncStatusAvatar(name: 'You', add: true),
          SyncStatusAvatar(name: 'Atia'),
          SyncStatusAvatar(name: 'Nadia'),
          SyncStatusAvatar(name: 'Mahin'),
          SyncStatusAvatar(name: 'Product'),
        ],
      ),
    );
  }
}

class _DockPreview extends StatelessWidget {
  const _DockPreview();
  @override
  Widget build(BuildContext context) {
    const items = [('Chats', Icons.chat_bubble_outline_rounded), ('Status', Icons.donut_large_rounded), ('Communities', Icons.groups_2_outlined), ('Channels', Icons.podcasts_rounded), ('Calls', Icons.call_outlined)];
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(color: context.panel.withOpacity(.96), borderRadius: BorderRadius.circular(27), border: Border.all(color: context.border), boxShadow: const [BoxShadow(color: Color(0x440F172A), blurRadius: 28, offset: Offset(0, 12))]),
      child: Row(
        children: items.asMap().entries.map((entry) {
          final active = entry.key == 0;
          return Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 7),
              decoration: BoxDecoration(color: active ? SyncColors.sky.withOpacity(.12) : Colors.transparent, borderRadius: BorderRadius.circular(19)),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircleAvatar(radius: 14, backgroundColor: active ? SyncColors.sky : context.softPanel, child: Icon(entry.value.$2, size: 16, color: active ? Colors.white : context.muted)),
                  const SizedBox(height: 4),
                  Text(entry.value.$1, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: active ? SyncColors.sky : context.muted)),
                ],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _RailPreview extends StatelessWidget {
  const _RailPreview();
  @override
  Widget build(BuildContext context) {
    const items = [('Chats', Icons.chat_bubble_outline_rounded), ('Calls', Icons.call_outlined), ('Status', Icons.donut_large_rounded), ('Contacts', Icons.people_outline_rounded), ('Communities', Icons.groups_2_outlined), ('Channels', Icons.podcasts_rounded), ('Archive', Icons.archive_outlined), ('Lists', Icons.format_list_bulleted_rounded), ('Media', Icons.image_outlined), ('Settings', Icons.settings_outlined), ('Profile', Icons.person_outline_rounded)];
    return Scaffold(
      backgroundColor: Colors.black45,
      body: SafeArea(
        child: Align(
          alignment: Alignment.centerLeft,
          child: Container(
            width: 94,
            color: SyncColors.slate900,
            child: ListView(
              padding: EdgeInsets.fromLTRB(5, 10, 5, MediaQuery.paddingOf(context).bottom + 16),
              children: items.map((item) => Container(
                margin: const EdgeInsets.only(bottom: 4),
                padding: const EdgeInsets.symmetric(vertical: 9),
                decoration: BoxDecoration(color: item.$1 == 'Chats' ? SyncColors.sky.withOpacity(.24) : Colors.transparent, borderRadius: BorderRadius.circular(14)),
                child: Column(children: [Icon(item.$2, color: item.$1 == 'Chats' ? Colors.white : Colors.white70), const SizedBox(height: 3), Text(item.$1, style: const TextStyle(color: Colors.white70, fontSize: 9, fontWeight: FontWeight.w700))]),
              )).toList(),
            ),
          ),
        ),
      ),
    );
  }
}

class _OpenContactSurface extends StatelessWidget {
  const _OpenContactSurface();
  @override
  Widget build(BuildContext context) {
    return SyncStandardPage(
      title: 'Contact',
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const SizedBox(height: 12),
          const Center(child: SyncAvatar(name: 'Atia Rahman', online: true, radius: 54)),
          const SizedBox(height: 12),
          const Center(child: Text('Atia Rahman', style: TextStyle(fontSize: 23, fontWeight: FontWeight.w900))),
          const Center(child: Text('@atia · online')),
          const SizedBox(height: 18),
          Row(children: [Expanded(child: FilledButton.icon(onPressed: () {}, icon: const Icon(Icons.chat_bubble_outline_rounded), label: const Text('Message'))), const SizedBox(width: 8), Expanded(child: OutlinedButton.icon(onPressed: () {}, icon: const Icon(Icons.call_outlined), label: const Text('Call')))]),
          const SizedBox(height: 16),
          const SyncSoftCard(child: Column(children: [ListTile(leading: Icon(Icons.info_outline_rounded), title: Text('About'), subtitle: Text('Building secure realtime products.')), ListTile(leading: Icon(Icons.alternate_email_rounded), title: Text('Username'), subtitle: Text('@atia')), ListTile(leading: Icon(Icons.phone_outlined), title: Text('Phone'), subtitle: Text('+1 ••• ••• 0182'))])),
        ],
      ),
    );
  }
}

class _CollectionSurface extends StatelessWidget {
  const _CollectionSurface({required this.mode});
  final String mode;
  @override
  Widget build(BuildContext context) {
    final title = switch (mode) {'archive' => 'Archive', 'lists' => 'Lists', _ => 'Starred messages'};
    final icon = switch (mode) {'archive' => Icons.archive_outlined, 'lists' => Icons.format_list_bulleted_rounded, _ => Icons.star_rounded};
    return SyncStandardPage(
      title: title,
      actions: [IconButton(onPressed: () {}, icon: const Icon(Icons.search_rounded))],
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 28),
        children: [
          SyncFeatureCard(icon: icon, title: title, body: mode == 'lists' ? 'Create focused chat lists without moving conversations out of your inbox.' : mode == 'archive' ? 'Archived conversations stay quiet and remain searchable.' : 'Messages starred across private, group and channel conversations.'),
          const SizedBox(height: 14),
          ...List.generate(5, (index) => SyncEntityTile(icon: icon, title: mode == 'starred' ? 'Important message ${index + 1}' : mode == 'lists' ? ['Work', 'Family', 'Unread', 'Channels', 'Projects'][index] : ['Product Team', 'Nadia Karim', 'Launch Room', 'Support', 'Family'][index], subtitle: mode == 'starred' ? 'Atia Rahman · Today 10:${20 + index}' : '${index + 2} conversations', onTap: () {})),
        ],
      ),
    );
  }
}

class _NewGroupSurface extends StatefulWidget {
  const _NewGroupSurface({this.subtitle});
  final String? subtitle;
  @override
  State<_NewGroupSurface> createState() => _NewGroupSurfaceState();
}

class _NewGroupSurfaceState extends State<_NewGroupSurface> {
  final selected = <String>{'Atia Rahman', 'Mahin Hasan'};
  @override
  Widget build(BuildContext context) {
    const people = ['Atia Rahman', 'Nadia Karim', 'Mahin Hasan', 'Rafi Ahmed', 'Support'];
    return SyncStandardPage(
      title: 'New group',
      actions: [TextButton(onPressed: selected.isEmpty ? null : () {}, child: const Text('Create'))],
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          if (widget.subtitle != null) Padding(padding: const EdgeInsets.only(bottom: 10), child: Text(widget.subtitle!, style: TextStyle(color: context.muted))),
          const SyncSoftCard(child: Column(children: [CircleAvatar(radius: 40, backgroundColor: Color(0x170EA5E9), child: Icon(Icons.add_photo_alternate_outlined, color: SyncColors.sky, size: 34)), SizedBox(height: 12), TextField(decoration: InputDecoration(labelText: 'Group name')), SizedBox(height: 10), TextField(maxLines: 3, decoration: InputDecoration(labelText: 'Description (optional)'))])),
          const SizedBox(height: 14),
          const TextField(decoration: InputDecoration(hintText: 'Search contacts…', prefixIcon: Icon(Icons.search_rounded))),
          const SizedBox(height: 10),
          Wrap(spacing: 7, runSpacing: 7, children: selected.map((name) => InputChip(label: Text(name), avatar: SyncAvatar(name: name, radius: 10), onDeleted: () => setState(() => selected.remove(name)))).toList()),
          const SizedBox(height: 8),
          ...people.map((name) => CheckboxListTile(value: selected.contains(name), onChanged: (_) => setState(() => selected.contains(name) ? selected.remove(name) : selected.add(name)), secondary: SyncAvatar(name: name, radius: 22), title: Text(name, style: const TextStyle(fontWeight: FontWeight.w900)), subtitle: Text('@${name.split(' ').first.toLowerCase()}'))),
        ],
      ),
    );
  }
}

class _ProfileInfoSurface extends StatefulWidget {
  const _ProfileInfoSurface({required this.type});
  final String type;
  @override
  State<_ProfileInfoSurface> createState() => _ProfileInfoSurfaceState();
}

class _ProfileInfoSurfaceState extends State<_ProfileInfoSurface> {
  bool muted = false;
  bool favourite = false;
  @override
  Widget build(BuildContext context) {
    final isFriend = widget.type == 'friend';
    final isGroup = widget.type == 'group';
    final name = isFriend ? 'Atia Rahman' : isGroup ? 'Product Team' : 'SyncChat News';
    final subtitle = isFriend ? '@atia · online' : isGroup ? '8 participants · 3 admins' : 'Public channel · 4.2K subscribers';
    return SyncStandardPage(
      title: isFriend ? 'Contact info' : isGroup ? 'Group info' : 'Channel info',
      actions: [IconButton(onPressed: () {}, icon: const Icon(Icons.more_vert_rounded))],
      child: ListView(
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          const SizedBox(height: 18),
          Center(child: SyncAvatar(name: name, online: isFriend, radius: 55)),
          const SizedBox(height: 12),
          Center(child: Text(name, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w900))),
          Center(child: Text(subtitle, style: TextStyle(color: context.muted))),
          const SizedBox(height: 16),
          Padding(padding: const EdgeInsets.symmetric(horizontal: 14), child: Row(children: [Expanded(child: _ProfileAction(icon: Icons.chat_bubble_outline_rounded, label: 'Message')), const SizedBox(width: 8), Expanded(child: _ProfileAction(icon: Icons.call_outlined, label: 'Audio')), const SizedBox(width: 8), Expanded(child: _ProfileAction(icon: Icons.videocam_outlined, label: 'Video'))])),
          const SizedBox(height: 16),
          if (isFriend) ...[
            const ListTile(leading: Icon(Icons.info_outline_rounded), title: Text('About'), subtitle: Text('Building secure realtime products.')),
            const ListTile(leading: Icon(Icons.phone_outlined), title: Text('Phone'), subtitle: Text('+1 ••• ••• 0182')),
            const ListTile(leading: Icon(Icons.email_outlined), title: Text('Email'), subtitle: Text('atia@example.com')),
          ] else ...[
            ListTile(leading: const Icon(Icons.group_outlined), title: Text(isGroup ? 'Participants' : 'Subscribers'), subtitle: Text(isGroup ? '8 participants' : '4.2K subscribers'), trailing: const Icon(Icons.chevron_right_rounded)),
            if (isGroup) const ListTile(leading: Icon(Icons.person_add_alt_1_rounded), title: Text('Add participant'), trailing: Icon(Icons.chevron_right_rounded)),
            ListTile(leading: const Icon(Icons.edit_outlined), title: Text(isGroup ? 'Edit group' : 'Channel details'), trailing: const Icon(Icons.chevron_right_rounded)),
          ],
          SwitchListTile(secondary: const Icon(Icons.notifications_off_outlined), title: const Text('Mute notifications'), value: muted, onChanged: (value) => setState(() => muted = value)),
          SwitchListTile(secondary: const Icon(Icons.star_border_rounded), title: const Text('Favourite'), value: favourite, onChanged: (value) => setState(() => favourite = value)),
          const ListTile(leading: Icon(Icons.perm_media_outlined), title: Text('Media, links and files'), subtitle: Text('24 items'), trailing: Icon(Icons.chevron_right_rounded)),
          const ListTile(leading: Icon(Icons.search_rounded), title: Text('Search in conversation'), trailing: Icon(Icons.chevron_right_rounded)),
          ListTile(leading: const Icon(Icons.warning_amber_rounded, color: SyncColors.danger), title: Text(isFriend ? 'Block contact' : isGroup ? 'Exit group' : 'Leave channel', style: const TextStyle(color: SyncColors.danger, fontWeight: FontWeight.w800))),
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
    return Container(padding: const EdgeInsets.symmetric(vertical: 12), decoration: BoxDecoration(color: context.softPanel, borderRadius: BorderRadius.circular(16)), child: Column(children: [Icon(icon, color: SyncColors.sky), const SizedBox(height: 5), Text(label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12))]));
  }
}

class _ParticipantsSurface extends StatefulWidget {
  const _ParticipantsSurface({required this.addMode});
  final bool addMode;
  @override
  State<_ParticipantsSurface> createState() => _ParticipantsSurfaceState();
}

class _ParticipantsSurfaceState extends State<_ParticipantsSurface> {
  final selected = <String>{};
  @override
  Widget build(BuildContext context) {
    const people = [('Atia Rahman', true, true), ('Nadia Karim', false, false), ('Mahin Hasan', true, true), ('Rafi Ahmed', false, false), ('Support', true, false)];
    return SyncStandardPage(
      title: widget.addMode ? 'Add participant' : 'Participants',
      actions: [if (widget.addMode) TextButton(onPressed: selected.isEmpty ? null : () {}, child: Text('Add (${selected.length})'))],
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          const TextField(decoration: InputDecoration(hintText: 'Search people…', prefixIcon: Icon(Icons.search_rounded))),
          const SizedBox(height: 10),
          ...people.map((person) => widget.addMode
              ? CheckboxListTile(value: selected.contains(person.$1), onChanged: (_) => setState(() => selected.contains(person.$1) ? selected.remove(person.$1) : selected.add(person.$1)), secondary: SyncAvatar(name: person.$1, online: person.$2, radius: 22), title: Text(person.$1, style: const TextStyle(fontWeight: FontWeight.w900)), subtitle: Text('@${person.$1.split(' ').first.toLowerCase()}'))
              : ListTile(leading: SyncAvatar(name: person.$1, online: person.$2, radius: 22), title: Row(children: [Expanded(child: Text(person.$1, style: const TextStyle(fontWeight: FontWeight.w900))), if (person.$3) const Chip(label: Text('Admin'))]), subtitle: Text('@${person.$1.split(' ').first.toLowerCase()}'), trailing: const Icon(Icons.more_vert_rounded))),
        ],
      ),
    );
  }
}

class _DocumentSurface extends StatelessWidget {
  const _DocumentSurface({required this.type});
  final String type;
  @override
  Widget build(BuildContext context) {
    final policy = type == 'policy';
    return SyncStandardPage(
      title: policy ? 'Terms & privacy policy' : 'License',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 32),
        children: [
          Text(policy ? 'SyncChat Terms & Privacy' : 'SyncChat License', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
          const SizedBox(height: 12),
          Text(policy ? 'Your privacy, account security, messaging data and device controls are described here using the same mobile reading hierarchy as the web policy page.' : 'SyncChat and third-party attribution information is presented in the same clean document layout as the web client.', style: const TextStyle(height: 1.55)),
          const SizedBox(height: 20),
          _DocSection(title: policy ? 'Privacy' : 'Application', body: policy ? 'Profile, contact, chat, call and device information follows your account privacy settings and server policy.' : 'SyncChat mobile client — Flutter application.'),
          _DocSection(title: policy ? 'Security' : 'Third-party packages', body: policy ? 'Authentication, app lock, two-factor authentication and supported E2EE controls protect account and conversation access.' : 'Package notices and licenses remain available from this page before release.'),
          if (policy) const _DocSection(title: 'Data controls', body: 'Export, backup, restore, remote logout and account deletion controls are available from Settings.'),
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
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.only(bottom: 18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)), const SizedBox(height: 6), Text(body, style: const TextStyle(height: 1.55))]));
}

class _RoomSurface extends StatefulWidget {
  const _RoomSurface({required this.mode});
  final String mode;
  @override
  State<_RoomSurface> createState() => _RoomSurfaceState();
}

class _RoomSurfaceState extends State<_RoomSurface> {
  bool recording = false;
  bool selected = false;
  @override
  Widget build(BuildContext context) {
    final mode = widget.mode;
    return Scaffold(
      backgroundColor: context.isDark ? SyncColors.spill950 : SyncColors.slate200,
      body: SafeArea(
        child: Column(
          children: [
            Container(
              minHeight: 64,
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 7),
              color: context.panel,
              child: Row(
                children: [
                  IconButton(onPressed: () => Navigator.maybePop(context), icon: const Icon(Icons.arrow_back_rounded)),
                  const SyncAvatar(name: 'Atia Rahman', online: true, radius: 20),
                  const SizedBox(width: 10),
                  const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Atia Rahman', style: TextStyle(fontWeight: FontWeight.w900)), Text('online', style: TextStyle(fontSize: 12, color: SyncColors.slate500))])),
                  IconButton(onPressed: () {}, icon: const Icon(Icons.videocam_outlined)),
                  IconButton(onPressed: () {}, icon: const Icon(Icons.call_outlined)),
                  IconButton(onPressed: () {}, icon: const Icon(Icons.more_vert_rounded)),
                ],
              ),
            ),
            if (mode == 'search') Container(color: context.panel, padding: const EdgeInsets.fromLTRB(12, 0, 12, 10), child: const TextField(decoration: InputDecoration(hintText: 'Search in chat', prefixIcon: Icon(Icons.search_rounded), suffixIcon: Icon(Icons.close_rounded)))),
            if (mode == 'pinned' || mode == 'pinHistory') _pinned(context, history: mode == 'pinHistory'),
            Expanded(
              child: Container(
                width: double.infinity,
                decoration: BoxDecoration(color: context.isDark ? SyncColors.spill950 : SyncColors.slate200, image: null),
                child: Stack(
                  children: [
                    ListView(
                      padding: const EdgeInsets.fromLTRB(12, 18, 12, 110),
                      children: [
                        const Center(child: Chip(label: Text('TODAY'))),
                        const SizedBox(height: 12),
                        _bubble(context, 'Can you review the release checklist?', false, '10:21'),
                        _bubble(context, 'Yes — I am checking the mobile flows now.', true, '10:22'),
                        if (mode == 'richCards') ..._richCards(context),
                        if (mode == 'viewOnce') _specialBubble(context, Icons.visibility_once_outlined, 'View-once text', 'Tap to reveal this message once'),
                        if (mode == 'scheduled') _specialBubble(context, Icons.schedule_send_outlined, 'Scheduled message', 'Today · 11:30 PM'),
                        if (mode == 'restricted') _specialBubble(context, Icons.timer_outlined, 'Slow mode active', 'You can send again in 00:18'),
                      ],
                    ),
                    if (mode == 'selection') Positioned(top: 0, left: 0, right: 0, child: Container(color: context.panel, padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8), child: Row(children: [IconButton(onPressed: () => setState(() => selected = !selected), icon: const Icon(Icons.close_rounded)), const Expanded(child: Text('2 messages selected', style: TextStyle(fontWeight: FontWeight.w900))), IconButton(onPressed: () {}, icon: const Icon(Icons.reply_rounded)), IconButton(onPressed: () {}, icon: const Icon(Icons.delete_outline_rounded))]))),
                    if (mode == 'messageActions') Positioned(left: 14, right: 14, bottom: 90, child: _messageActions(context)),
                    if (mode == 'emoji') Positioned(left: 8, right: 8, bottom: 84, child: _emojiBoard(context)),
                  ],
                ),
              ),
            ),
            _composer(context, mode),
          ],
        ),
      ),
    );
  }

  Widget _pinned(BuildContext context, {required bool history}) {
    return Container(
      color: context.panel,
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 9),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: context.softPanel, borderRadius: BorderRadius.circular(12), border: Border.all(color: context.border)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Row(children: [const Icon(Icons.push_pin_rounded, color: SyncColors.sky, size: 18), const SizedBox(width: 7), Expanded(child: Text(history ? 'Pinned messages · 3' : 'Pinned message', style: const TextStyle(fontWeight: FontWeight.w900))), const Icon(Icons.expand_more_rounded)]), if (history) ...[const SizedBox(height: 7), const Text('Release checklist is ready'), const Divider(), const Text('Design handoff at 4 PM'), const Divider(), const Text('Production deploy checklist')]]),
      ),
    );
  }

  Widget _bubble(BuildContext context, String text, bool sent, String time) {
    final color = sent ? (context.isDark ? const Color(0xFF164E63) : SyncColors.sentBubble) : context.panel;
    return Align(
      alignment: sent ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * .78),
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.fromLTRB(12, 9, 9, 7),
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.only(topLeft: const Radius.circular(18), topRight: const Radius.circular(18), bottomLeft: Radius.circular(sent ? 18 : 5), bottomRight: Radius.circular(sent ? 5 : 18)), boxShadow: const [BoxShadow(color: Color(0x120F172A), blurRadius: 5, offset: Offset(0, 2))]),
        child: Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.end, children: [Flexible(child: Text(text)), const SizedBox(width: 8), Text(time, style: TextStyle(fontSize: 10, color: context.muted)), if (sent) const Padding(padding: EdgeInsets.only(left: 2), child: Icon(Icons.done_all_rounded, color: SyncColors.sky, size: 15))]),
      ),
    );
  }

  List<Widget> _richCards(BuildContext context) => [
        _specialBubble(context, Icons.image_outlined, 'Photo', 'IMG_2048.jpg · 2.4 MB'),
        _specialBubble(context, Icons.link_rounded, 'syncchat.live', 'Secure realtime communication'),
        _specialBubble(context, Icons.location_on_outlined, 'Shared location', 'Downtown · 1.2 km away'),
        _specialBubble(context, Icons.poll_outlined, 'Release time?', '4 votes · 2 options'),
        _specialBubble(context, Icons.event_outlined, 'Launch review', 'Tomorrow · 4:00 PM'),
      ];

  Widget _specialBubble(BuildContext context, IconData icon, String title, String subtitle) => Align(alignment: Alignment.centerLeft, child: Container(width: 260, margin: const EdgeInsets.only(bottom: 8), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: context.panel, borderRadius: BorderRadius.circular(18), border: Border.all(color: context.border)), child: Row(children: [CircleAvatar(backgroundColor: SyncColors.sky.withOpacity(.12), child: Icon(icon, color: SyncColors.sky)), const SizedBox(width: 10), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontWeight: FontWeight.w900)), Text(subtitle, style: TextStyle(fontSize: 12, color: context.muted))]))])));

  Widget _messageActions(BuildContext context) => Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: context.panel, borderRadius: BorderRadius.circular(20), border: Border.all(color: context.border), boxShadow: const [BoxShadow(color: Color(0x330F172A), blurRadius: 25)]), child: Column(children: [Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: ['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => Text(emoji, style: const TextStyle(fontSize: 24))).toList()), const Divider(), const Wrap(spacing: 4, children: [ActionChip(label: Text('Reply'), avatar: Icon(Icons.reply_rounded, size: 17)), ActionChip(label: Text('Forward'), avatar: Icon(Icons.forward_rounded, size: 17)), ActionChip(label: Text('Edit'), avatar: Icon(Icons.edit_outlined, size: 17)), ActionChip(label: Text('Info'), avatar: Icon(Icons.info_outline_rounded, size: 17)), ActionChip(label: Text('Delete'), avatar: Icon(Icons.delete_outline_rounded, size: 17))])]));

  Widget _emojiBoard(BuildContext context) => Container(height: 250, padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: context.panel, borderRadius: BorderRadius.circular(22), border: Border.all(color: context.border)), child: Column(children: [const TextField(decoration: InputDecoration(hintText: 'Search emoji', prefixIcon: Icon(Icons.search_rounded))), const SizedBox(height: 10), Expanded(child: GridView.count(crossAxisCount: 8, children: const ['😀','😁','😂','🤣','😊','😍','🥰','😘','😎','🤩','🥳','😢','😭','😡','👍','👎','👏','🙏','❤️','🔥','🎉','✅','💯','👀'].map((e) => Center(child: Text(e, style: TextStyle(fontSize: 24)))).toList()))]));

  Widget _composer(BuildContext context, String mode) {
    if (mode == 'voice') {
      return Container(color: context.panel, padding: const EdgeInsets.all(10), child: Row(children: [IconButton(onPressed: () => setState(() => recording = !recording), icon: Icon(recording ? Icons.stop_circle_rounded : Icons.delete_outline_rounded, color: recording ? SyncColors.danger : context.muted)), const Text('0:18', style: TextStyle(fontWeight: FontWeight.w900)), const SizedBox(width: 10), Expanded(child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [for (var i = 0; i < 24; i++) Container(width: 2, height: 8 + (i % 5) * 5, color: SyncColors.sky)])), IconButton(onPressed: () {}, icon: const Icon(Icons.pause_circle_outline_rounded)), CircleAvatar(backgroundColor: SyncColors.sky, child: IconButton(onPressed: () {}, icon: const Icon(Icons.send_rounded, color: Colors.white)))]));
    }
    return Container(
      color: context.panel,
      padding: EdgeInsets.fromLTRB(8, 8, 8, MediaQuery.paddingOf(context).bottom + 8),
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [IconButton(onPressed: () {}, icon: const Icon(Icons.add_circle_outline_rounded)), IconButton(onPressed: () {}, icon: const Icon(Icons.emoji_emotions_outlined)), const Expanded(child: TextField(minLines: 1, maxLines: 5, decoration: InputDecoration(hintText: 'Message'))), const SizedBox(width: 6), CircleAvatar(backgroundColor: SyncColors.sky, child: IconButton(onPressed: () {}, icon: Icon(Icons.send_rounded, color: Colors.white)))]),
    );
  }
}

class _ChatToolsSurface extends StatefulWidget {
  const _ChatToolsSurface({required this.tab});
  final String tab;
  @override
  State<_ChatToolsSurface> createState() => _ChatToolsSurfaceState();
}

class _ChatToolsSurfaceState extends State<_ChatToolsSurface> {
  bool e2ee = true;
  @override
  Widget build(BuildContext context) {
    const tabs = [('search','Search',Icons.search_rounded),('requests','Requests',Icons.mark_chat_unread_outlined),('mentions','Mentions',Icons.alternate_email_rounded),('topics','Topics',Icons.forum_outlined),('security','Security',Icons.shield_outlined),('outbox','Outbox',Icons.cloud_upload_outlined)];
    return Scaffold(
      backgroundColor: context.isDark ? SyncColors.spill950 : SyncColors.slate100,
      body: SafeArea(
        child: Column(
          children: [
            Container(color: context.panel, padding: const EdgeInsets.fromLTRB(16, 12, 8, 10), child: Row(children: [const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Chat Tools', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)), Text('Current chat · Atia Rahman', style: TextStyle(fontSize: 12, color: SyncColors.slate500))])), IconButton(onPressed: () => Navigator.maybePop(context), icon: const Icon(Icons.close_rounded))])),
            Divider(height: 1, color: context.border),
            SizedBox(height: 52, child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7), children: tabs.map((item) {final active = item.$1 == widget.tab || (widget.tab == 'receipts' && item.$1 == 'search'); return Padding(padding: const EdgeInsets.only(right: 6), child: FilledButton.tonalIcon(onPressed: () {}, icon: Icon(item.$3, size: 17), label: Text(item.$2), style: FilledButton.styleFrom(backgroundColor: active ? SyncColors.sky600 : context.softPanel, foregroundColor: active ? Colors.white : context.ink)));}).toList())),
            Divider(height: 1, color: context.border),
            Expanded(child: ListView(padding: const EdgeInsets.all(14), children: _toolBody(context))),
          ],
        ),
      ),
    );
  }

  List<Widget> _toolBody(BuildContext context) {
    return switch (widget.tab) {
      'search' => [const TextField(decoration: InputDecoration(hintText: 'Search messages', prefixIcon: Icon(Icons.search_rounded))), const SizedBox(height: 10), Row(children: [Expanded(child: DropdownButtonFormField<String>(value: 'all', items: const [DropdownMenuItem(value: 'all', child: Text('All types')), DropdownMenuItem(value: 'text', child: Text('Text')), DropdownMenuItem(value: 'media', child: Text('Media'))], onChanged: (_) {})), const SizedBox(width: 8), Expanded(child: DropdownButtonFormField<String>(value: 'current', items: const [DropdownMenuItem(value: 'current', child: Text('Current chat')), DropdownMenuItem(value: 'all', child: Text('All chats'))], onChanged: (_) {}))]), const SizedBox(height: 14), ...List.generate(4, (i) => ListTile(leading: const SyncAvatar(name: 'Atia Rahman', radius: 20), title: Text('Search result ${i + 1}', style: const TextStyle(fontWeight: FontWeight.w900)), subtitle: const Text('Matching message preview · Today'), trailing: const Icon(Icons.chevron_right_rounded)))],
      'requests' => [const SyncSectionLabel('Message requests'), const SizedBox(height: 8), ...['Nadia Karim','Rafi Ahmed'].map((name) => SyncSoftCard(margin: const EdgeInsets.only(bottom: 9), child: Column(children: [ListTile(contentPadding: EdgeInsets.zero, leading: SyncAvatar(name: name, radius: 22), title: Text(name, style: const TextStyle(fontWeight: FontWeight.w900)), subtitle: const Text('Would like to start a conversation')), Row(children: [Expanded(child: OutlinedButton(onPressed: () {}, child: const Text('Delete'))), const SizedBox(width: 8), Expanded(child: FilledButton(onPressed: () {}, child: const Text('Accept')))])])))],
      'mentions' => [const SyncSectionLabel('Recent mentions'), const SizedBox(height: 8), ...List.generate(5, (i) => ListTile(leading: const CircleAvatar(backgroundColor: Color(0x170EA5E9), child: Icon(Icons.alternate_email_rounded, color: SyncColors.sky)), title: Text('Product Team · mention ${i + 1}', style: const TextStyle(fontWeight: FontWeight.w900)), subtitle: const Text('@you please review the latest update'), trailing: const Text('10:24', style: TextStyle(fontSize: 10))))],
      'topics' => [const TextField(decoration: InputDecoration(labelText: 'New topic', prefixIcon: Icon(Icons.add_comment_outlined), suffixIcon: Icon(Icons.send_rounded))), const SizedBox(height: 12), ...['All messages','Release','Design','Backend','Mobile'].map((topic) => RadioListTile<String>(value: topic, groupValue: 'Release', onChanged: (_) {}, title: Text(topic, style: const TextStyle(fontWeight: FontWeight.w800)), subtitle: topic == 'All messages' ? const Text('No topic filter') : const Text('Group topic')))],
      'security' => [SyncSoftCard(padding: EdgeInsets.zero, child: SwitchListTile(value: e2ee, onChanged: (v) => setState(() => e2ee = v), secondary: const CircleAvatar(backgroundColor: Color(0x1722C55E), child: Icon(Icons.shield_outlined, color: SyncColors.success)), title: const Text('Device E2EE', style: TextStyle(fontWeight: FontWeight.w900)), subtitle: const Text('Encrypt new private text messages for registered devices.'))), const SizedBox(height: 10), const SyncSoftCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Security status', style: TextStyle(fontWeight: FontWeight.w900)), SizedBox(height: 8), ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.key_rounded, color: SyncColors.sky), title: Text('Device key registered'), subtitle: Text('Version 2')), ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.lock_rounded, color: SyncColors.success), title: Text('Current room protected'), subtitle: Text('Enabled by this device'))]))],
      'outbox' => [const SyncSectionLabel('Pending & failed'), const SizedBox(height: 8), ...List.generate(3, (i) => SyncSoftCard(margin: const EdgeInsets.only(bottom: 9), child: Row(children: [const CircleAvatar(backgroundColor: Color(0x17F43F5E), child: Icon(Icons.cloud_off_outlined, color: SyncColors.danger)), const SizedBox(width: 10), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Message failed', style: const TextStyle(fontWeight: FontWeight.w900)), Text('Retry ${i + 1} · client message ID preserved', style: TextStyle(fontSize: 12, color: context.muted))])), IconButton(onPressed: () {}, icon: const Icon(Icons.refresh_rounded))])))],
      'receipts' => [const SyncSectionLabel('Message details'), const SizedBox(height: 8), const SyncSoftCard(child: Column(children: [ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.done_rounded), title: Text('Sent'), trailing: Text('10:21 PM')), ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.done_all_rounded), title: Text('Delivered'), trailing: Text('10:21 PM')), ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.visibility_outlined), title: Text('Read'), trailing: Text('10:22 PM'))])), const SizedBox(height: 12), const SyncSectionLabel('Read by'), const ListTile(leading: SyncAvatar(name: 'Atia Rahman', radius: 20), title: Text('Atia Rahman'), subtitle: Text('Read 10:22 PM'))],
      _ => const [],
    };
  }
}

class _BackupSurface extends StatelessWidget {
  const _BackupSurface();
  @override
  Widget build(BuildContext context) => SyncStandardPage(title: 'Backup / restore', child: ListView(padding: const EdgeInsets.all(14), children: const [SyncFeatureCard(icon: Icons.backup_outlined, title: 'Encrypted backup', body: 'Create a password-protected archive of profile, settings, contacts and supported chat metadata.'), SizedBox(height: 14), SyncSoftCard(child: Column(children: [ListTile(leading: Icon(Icons.lock_outline_rounded), title: Text('Backup password'), subtitle: Text('Required before creating or restoring a backup')), ListTile(leading: Icon(Icons.backup_rounded), title: Text('Create backup'), trailing: Icon(Icons.chevron_right_rounded)), ListTile(leading: Icon(Icons.restore_rounded), title: Text('Restore backup'), trailing: Icon(Icons.chevron_right_rounded)), ListTile(leading: Icon(Icons.history_rounded), title: Text('Last backup'), subtitle: Text('Today · 120 MB'))]))]));
}

class _DriveSurface extends StatelessWidget {
  const _DriveSurface();
  @override
  Widget build(BuildContext context) => SyncStandardPage(title: 'Google Drive', child: ListView(padding: const EdgeInsets.all(14), children: const [SyncFeatureCard(icon: Icons.cloud_outlined, title: 'Google Drive', body: 'Connect Drive to upload encrypted backups and restore them on another device.'), SizedBox(height: 14), SyncSoftCard(child: Column(children: [ListTile(leading: CircleAvatar(backgroundColor: Color(0x170EA5E9), child: Icon(Icons.cloud_done_outlined, color: SyncColors.sky)), title: Text('Not connected'), subtitle: Text('Connect your Google account to continue')), SizedBox(height: 8), SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: null, icon: Icon(Icons.link_rounded), label: Text('Connect Google Drive')))]))]));
}

class _StatusDetailSurface extends StatelessWidget {
  const _StatusDetailSurface({required this.mode});
  final String mode;
  @override
  Widget build(BuildContext context) {
    if (mode == 'viewer') return const _StatusViewer();
    final reactions = mode == 'reactions';
    return _SheetPage(
      title: reactions ? 'Status interactions' : 'Status activity',
      child: ListView(
        padding: const EdgeInsets.all(14),
        children: reactions
            ? const [ListTile(leading: Text('❤️', style: TextStyle(fontSize: 24)), title: Text('Atia Rahman', style: TextStyle(fontWeight: FontWeight.w900)), subtitle: Text('Reacted to your status · 8 min')), ListTile(leading: Icon(Icons.reply_rounded, color: SyncColors.sky), title: Text('Nadia Karim', style: TextStyle(fontWeight: FontWeight.w900)), subtitle: Text('Looks great! · private reply')), ListTile(leading: Icon(Icons.alternate_email_rounded, color: SyncColors.sky), title: Text('Mahin Hasan', style: TextStyle(fontWeight: FontWeight.w900)), subtitle: Text('Mentioned you in a status'))]
            : const [ListTile(leading: Icon(Icons.visibility_outlined, color: SyncColors.sky), title: Text('34 views', style: TextStyle(fontWeight: FontWeight.w900)), subtitle: Text('People who viewed your latest status')), ListTile(leading: Icon(Icons.add_reaction_outlined, color: SyncColors.sky), title: Text('8 reactions', style: TextStyle(fontWeight: FontWeight.w900)), subtitle: Text('Emoji reactions')), ListTile(leading: Icon(Icons.reply_rounded, color: SyncColors.sky), title: Text('5 replies', style: TextStyle(fontWeight: FontWeight.w900)), subtitle: Text('Private status replies')), ListTile(leading: Icon(Icons.alternate_email_rounded, color: SyncColors.sky), title: Text('2 mentions', style: TextStyle(fontWeight: FontWeight.w900)), subtitle: Text('Mentions in status activity'))],
      ),
    );
  }
}

class _StatusViewer extends StatelessWidget {
  const _StatusViewer();
  @override
  Widget build(BuildContext context) => Scaffold(backgroundColor: SyncColors.slate950, body: SafeArea(child: Column(children: [Padding(padding: const EdgeInsets.all(10), child: Row(children: [IconButton(onPressed: () => Navigator.maybePop(context), icon: const Icon(Icons.arrow_back_rounded, color: Colors.white)), const SyncAvatar(name: 'Atia Rahman', radius: 18), const SizedBox(width: 9), const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Atia Rahman', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)), Text('18 min', style: TextStyle(color: Colors.white60, fontSize: 12))])), const Icon(Icons.more_vert_rounded, color: Colors.white)])), Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: Row(children: [for (var i = 0; i < 3; i++) Expanded(child: Container(height: 3, margin: const EdgeInsets.symmetric(horizontal: 2), color: i == 0 ? Colors.white : Colors.white24))])), Expanded(child: Center(child: Container(margin: const EdgeInsets.all(18), width: double.infinity, decoration: BoxDecoration(gradient: const LinearGradient(colors: [SyncColors.sky700, SyncColors.cyan, SyncColors.teal]), borderRadius: BorderRadius.circular(28)), child: const Center(child: Padding(padding: EdgeInsets.all(28), child: Text('Secure realtime communication, everywhere.', textAlign: TextAlign.center, style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)))))), Container(padding: EdgeInsets.fromLTRB(12, 8, 12, MediaQuery.paddingOf(context).bottom + 10), child: const Row(children: [Expanded(child: TextField(style: TextStyle(color: Colors.white), decoration: InputDecoration(hintText: 'Reply to status…', hintStyle: TextStyle(color: Colors.white60), fillColor: Colors.white12, prefixIcon: Icon(Icons.reply_rounded, color: Colors.white70), suffixIcon: Icon(Icons.send_rounded, color: Colors.white)))), Icon(Icons.favorite_border_rounded, color: Colors.white)]))])));
}

class _CallSurface extends StatefulWidget {
  const _CallSurface({required this.mode});
  final String mode;
  @override
  State<_CallSurface> createState() => _CallSurfaceState();
}

class _CallSurfaceState extends State<_CallSurface> {
  bool muted = false;
  bool camera = true;
  @override
  Widget build(BuildContext context) {
    if (widget.mode == 'start') return const _ModalSurface(type: 'startCall');
    if (widget.mode == 'incoming') return _incoming(context);
    return _group(context);
  }

  Widget _incoming(BuildContext context) => Scaffold(backgroundColor: SyncColors.slate950, body: SafeArea(child: Stack(children: [const Positioned.fill(child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(colors: [Color(0xFF0F172A), Color(0xFF020617)], begin: Alignment.topCenter, end: Alignment.bottomCenter)))), const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [SyncAvatar(name: 'Atia Rahman', radius: 72), SizedBox(height: 18), Text('Atia Rahman', style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)), SizedBox(height: 6), Text('Incoming video call…', style: TextStyle(color: Colors.white60))])), const Positioned(left: 0, right: 0, top: 18, child: Center(child: Chip(avatar: Icon(Icons.lock_rounded, size: 16, color: SyncColors.success), label: Text('Secure')))), Positioned(left: 24, right: 24, bottom: MediaQuery.paddingOf(context).bottom + 30, child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [CircleAvatar(radius: 31, backgroundColor: SyncColors.danger, child: IconButton(onPressed: () => Navigator.maybePop(context), icon: const Icon(Icons.call_end_rounded, color: Colors.white))), const CircleAvatar(radius: 31, backgroundColor: SyncColors.success, child: Icon(Icons.videocam_rounded, color: Colors.white))]))])));

  Widget _group(BuildContext context) {
    const people = ['You','Atia Rahman','Mahin Hasan','Nadia Karim'];
    return Scaffold(backgroundColor: SyncColors.slate950, body: SafeArea(child: Column(children: [Padding(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8), child: Row(children: [IconButton(onPressed: () => Navigator.maybePop(context), icon: const Icon(Icons.arrow_back_rounded, color: Colors.white)), const Expanded(child: Text('Product Team', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900))), const Icon(Icons.lock_rounded, color: SyncColors.success, size: 18), const SizedBox(width: 5), const Text('LiveKit', style: TextStyle(color: Colors.white60, fontSize: 12))])), Expanded(child: GridView.builder(padding: const EdgeInsets.all(10), itemCount: people.length, gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 8, crossAxisSpacing: 8, childAspectRatio: .78), itemBuilder: (_, i) => Container(decoration: BoxDecoration(gradient: const LinearGradient(colors: [SyncColors.spill800, SyncColors.slate900]), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white10)), child: Stack(children: [Center(child: SyncAvatar(name: people[i], radius: 46)), Positioned(left: 10, bottom: 10, child: Text(people[i], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800))), if (i == 2) const Positioned(right: 10, top: 10, child: Icon(Icons.mic_off_rounded, color: SyncColors.danger))])))), Container(padding: EdgeInsets.fromLTRB(12, 12, 12, MediaQuery.paddingOf(context).bottom + 12), child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [_CallButton(icon: muted ? Icons.mic_off_rounded : Icons.mic_rounded, onTap: () => setState(() => muted = !muted)), const SizedBox(width: 10), _CallButton(icon: camera ? Icons.videocam_rounded : Icons.videocam_off_rounded, onTap: () => setState(() => camera = !camera)), const SizedBox(width: 14), _CallButton(icon: Icons.call_end_rounded, background: SyncColors.danger, onTap: () => Navigator.maybePop(context))]))])));
  }
}

class _CallButton extends StatelessWidget {
  const _CallButton({required this.icon, required this.onTap, this.background = const Color(0x22FFFFFF)});
  final IconData icon;
  final VoidCallback onTap;
  final Color background;
  @override
  Widget build(BuildContext context) => Material(color: background, shape: const CircleBorder(), child: InkWell(onTap: onTap, customBorder: const CircleBorder(), child: SizedBox(width: 54, height: 54, child: Icon(icon, color: Colors.white))));
}

class _ModalSurface extends StatelessWidget {
  const _ModalSurface({required this.type});
  final String type;

  @override
  Widget build(BuildContext context) {
    final spec = _modalSpec(type);
    return Scaffold(
      backgroundColor: Colors.black54,
      body: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(child: GestureDetector(onTap: () => Navigator.maybePop(context), child: const ColoredBox(color: Colors.transparent))),
            Align(
              alignment: Alignment.bottomCenter,
              child: Container(
                constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * .84),
                decoration: BoxDecoration(color: context.panel, borderRadius: const BorderRadius.vertical(top: Radius.circular(28)), border: Border.all(color: context.border)),
                child: SafeArea(
                  top: false,
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(width: 42, height: 4, margin: const EdgeInsets.only(bottom: 15), decoration: BoxDecoration(color: context.border, borderRadius: BorderRadius.circular(99))),
                        Row(children: [Expanded(child: Text(spec.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900))), IconButton(onPressed: () => Navigator.maybePop(context), icon: const Icon(Icons.close_rounded))]),
                        if (spec.body != null) ...[const SizedBox(height: 8), spec.body!],
                        if (spec.actions.isNotEmpty) ...[const SizedBox(height: 10), ...spec.actions.map((action) => Padding(padding: const EdgeInsets.only(top: 7), child: Container(decoration: BoxDecoration(color: action.danger ? SyncColors.danger.withOpacity(.08) : context.softPanel, borderRadius: BorderRadius.circular(16)), child: ListTile(leading: CircleAvatar(backgroundColor: action.danger ? SyncColors.danger.withOpacity(.12) : SyncColors.sky.withOpacity(.12), child: Icon(action.icon, color: action.danger ? SyncColors.danger : SyncColors.sky)), title: Text(action.label, style: TextStyle(fontWeight: FontWeight.w800, color: action.danger ? SyncColors.danger : null)), subtitle: action.subtitle == null ? null : Text(action.subtitle!), trailing: const Icon(Icons.chevron_right_rounded), onTap: action.onTap)))],
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

_ModalSpec _modalSpec(String type) {
  switch (type) {
    case 'attachMenu':
      return _ModalSpec('Attach', null, const [_ModalAction('Photo & video', Icons.photo_library_outlined), _ModalAction('Camera', Icons.camera_alt_outlined), _ModalAction('File', Icons.insert_drive_file_outlined), _ModalAction('Contact', Icons.person_outline_rounded), _ModalAction('Poll', Icons.poll_outlined), _ModalAction('Event', Icons.event_outlined), _ModalAction('Sticker', Icons.emoji_emotions_outlined), _ModalAction('Location', Icons.location_on_outlined)]);
    case 'attachContact':
      return _ModalSpec('Share contact', const Column(children: [TextField(decoration: InputDecoration(hintText: 'Search contacts', prefixIcon: Icon(Icons.search_rounded))), SizedBox(height: 8), ListTile(leading: SyncAvatar(name: 'Atia Rahman', radius: 20), title: Text('Atia Rahman'), trailing: Checkbox(value: true, onChanged: null)), ListTile(leading: SyncAvatar(name: 'Nadia Karim', radius: 20), title: Text('Nadia Karim'), trailing: Checkbox(value: false, onChanged: null))]), const [_ModalAction('Share selected contact', Icons.send_rounded)]);
    case 'attachEvent':
      return _ModalSpec('Create event', const Column(children: [TextField(decoration: InputDecoration(labelText: 'Event title', prefixIcon: Icon(Icons.event_outlined))), SizedBox(height: 8), TextField(decoration: InputDecoration(labelText: 'Date & time', prefixIcon: Icon(Icons.calendar_today_outlined))), SizedBox(height: 8), TextField(maxLines: 3, decoration: InputDecoration(labelText: 'Description'))]), const [_ModalAction('Send event', Icons.send_rounded)]);
    case 'attachPoll':
      return _ModalSpec('Create poll', const Column(children: [TextField(decoration: InputDecoration(labelText: 'Question', prefixIcon: Icon(Icons.poll_outlined))), SizedBox(height: 8), TextField(decoration: InputDecoration(labelText: 'Option 1')), SizedBox(height: 8), TextField(decoration: InputDecoration(labelText: 'Option 2')), SizedBox(height: 8), SwitchListTile(contentPadding: EdgeInsets.zero, value: true, onChanged: null, title: Text('Allow multiple answers'))]), const [_ModalAction('Send poll', Icons.send_rounded)]);
    case 'attachSticker':
      return _ModalSpec('Stickers', SizedBox(height: 230, child: GridView.count(crossAxisCount: 5, children: const ['😀','🔥','❤️','👍','🎉','😂','😎','✅','💯','🙏','😍','🤩','🥳','👏','👀'].map((e) => Center(child: Text(e, style: TextStyle(fontSize: 34)))).toList())), const []);
    case 'avatarUpload':
      return _ModalSpec('Profile photo', const Column(children: [CircleAvatar(radius: 58, backgroundColor: Color(0x170EA5E9), child: Icon(Icons.person_outline_rounded, size: 58, color: SyncColors.sky)), SizedBox(height: 12), Text('Choose a clear square photo. You can crop it before saving.')]), const [_ModalAction('Choose from gallery', Icons.photo_library_outlined), _ModalAction('Take photo', Icons.camera_alt_outlined), _ModalAction('Remove photo', Icons.delete_outline_rounded, danger: true)]);
    case 'imageCropper':
      return _ModalSpec('Crop image', Container(height: 320, decoration: BoxDecoration(color: SyncColors.slate950, borderRadius: BorderRadius.circular(18)), child: const Stack(alignment: Alignment.center, children: [Icon(Icons.image_outlined, size: 130, color: Colors.white24), SizedBox(width: 230, height: 230, child: DecoratedBox(decoration: BoxDecoration(border: Border.fromBorderSide(BorderSide(color: Colors.white, width: 2)))))])), const [_ModalAction('Rotate', Icons.rotate_90_degrees_ccw_outlined), _ModalAction('Use photo', Icons.check_rounded)]);
    case 'changePassword':
      return _ModalSpec('Change password', const Column(children: [TextField(obscureText: true, decoration: InputDecoration(labelText: 'Current password')), SizedBox(height: 8), TextField(obscureText: true, decoration: InputDecoration(labelText: 'New password')), SizedBox(height: 8), TextField(obscureText: true, decoration: InputDecoration(labelText: 'Confirm new password'))]), const [_ModalAction('Save new password', Icons.check_rounded)]);
    case 'deleteAccount':
      return _ModalSpec('Delete account', const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('This permanently removes your SyncChat account and cannot be undone.', style: TextStyle(color: SyncColors.danger, fontWeight: FontWeight.w800)), SizedBox(height: 10), TextField(obscureText: true, decoration: InputDecoration(labelText: 'Current password'))]), const [_ModalAction('Delete account permanently', Icons.delete_forever_outlined, danger: true)]);
    case 'confirmAdd':
      return _confirmSpec('Add participants?', 'Add 2 selected people to Product Team.', 'Add participants', Icons.person_add_alt_1_rounded);
    case 'deleteChat':
      return _confirmSpec('Delete chat?', 'Messages will be removed from this device.', 'Delete chat', Icons.delete_outline_rounded, danger: true);
    case 'deleteChatInbox':
      return _confirmSpec('Delete chat and inbox?', 'The conversation and its inbox entry will be removed.', 'Delete chat and inbox', Icons.delete_forever_outlined, danger: true);
    case 'deleteContact':
      return _confirmSpec('Delete contact?', 'Atia Rahman will be removed from your saved contacts.', 'Delete contact', Icons.person_remove_outlined, danger: true);
    case 'exitGroup':
      return _confirmSpec('Exit group?', 'You will stop receiving messages from Product Team.', 'Exit group', Icons.exit_to_app_rounded, danger: true);
    case 'confirmGroup':
      return _confirmSpec('Create group?', 'Product Team · 4 selected participants', 'Create group', Icons.group_add_outlined);
    case 'editGroup':
      return _ModalSpec('Edit group', const Column(children: [CircleAvatar(radius: 42, backgroundColor: Color(0x170EA5E9), child: Icon(Icons.groups_2_outlined, color: SyncColors.sky)), SizedBox(height: 10), TextField(decoration: InputDecoration(labelText: 'Group name')), SizedBox(height: 8), TextField(maxLines: 3, decoration: InputDecoration(labelText: 'Description'))]), const [_ModalAction('Change avatar', Icons.photo_library_outlined), _ModalAction('Save changes', Icons.check_rounded)]);
    case 'feedback':
      return _ModalSpec('Feedback', const Column(children: [TextField(maxLines: 5, decoration: InputDecoration(hintText: 'Tell us what should improve…')), SizedBox(height: 8), DropdownButtonFormField<String>(value: 'General', items: [DropdownMenuItem(value: 'General', child: Text('General')), DropdownMenuItem(value: 'Bug', child: Text('Bug')), DropdownMenuItem(value: 'Feature', child: Text('Feature request'))], onChanged: null)]), const [_ModalAction('Send feedback', Icons.send_rounded)]);
    case 'groupMenu':
      return _ModalSpec('Group actions', null, const [_ModalAction('Group info', Icons.info_outline_rounded), _ModalAction('Search', Icons.search_rounded), _ModalAction('Mute notifications', Icons.notifications_off_outlined), _ModalAction('Clear chat', Icons.cleaning_services_outlined), _ModalAction('Exit group', Icons.exit_to_app_rounded, danger: true)]);
    case 'inboxMenu':
      return _ModalSpec('Chat actions', null, const [_ModalAction('Mark as unread', Icons.mark_chat_unread_outlined), _ModalAction('Favourite', Icons.star_border_rounded), _ModalAction('Pin chat', Icons.push_pin_outlined), _ModalAction('Archive', Icons.archive_outlined), _ModalAction('Mute notification', Icons.notifications_off_outlined), _ModalAction('Lock chat', Icons.lock_outline_rounded), _ModalAction('Clear chat', Icons.cleaning_services_outlined), _ModalAction('Delete chat', Icons.delete_outline_rounded, danger: true)]);
    case 'mediaPreview':
      return _ModalSpec('Media', Container(height: 310, decoration: BoxDecoration(color: SyncColors.slate950, borderRadius: BorderRadius.circular(18)), child: const Center(child: Icon(Icons.image_outlined, size: 120, color: Colors.white24))), const [_ModalAction('Download', Icons.download_rounded), _ModalAction('Forward', Icons.forward_rounded), _ModalAction('Delete', Icons.delete_outline_rounded, danger: true)]);
    case 'newContact':
      return _ModalSpec('New contact', const Column(children: [TextField(decoration: InputDecoration(labelText: 'Full name', prefixIcon: Icon(Icons.person_outline_rounded))), SizedBox(height: 8), TextField(decoration: InputDecoration(labelText: 'Username or email', prefixIcon: Icon(Icons.alternate_email_rounded))), SizedBox(height: 8), TextField(decoration: InputDecoration(labelText: 'Phone', prefixIcon: Icon(Icons.phone_outlined)))]), const [_ModalAction('Save contact', Icons.person_add_alt_1_rounded)]);
    case 'qr':
      return _ModalSpec('QR profile / device', const Column(children: [SizedBox(width: 220, height: 220, child: DecoratedBox(decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.all(Radius.circular(18))), child: Icon(Icons.qr_code_2_rounded, size: 190, color: Colors.black))), SizedBox(height: 12), Text('@atia', style: TextStyle(fontWeight: FontWeight.w900))]), const [_ModalAction('Share QR', Icons.share_outlined), _ModalAction('Scan a QR', Icons.qr_code_scanner_rounded)]);
    case 'recordVoice':
      return _ModalSpec('Record voice', const Column(children: [CircleAvatar(radius: 38, backgroundColor: Color(0x17F43F5E), child: Icon(Icons.mic_rounded, color: SyncColors.danger, size: 34)), SizedBox(height: 10), Text('00:18', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900)), SizedBox(height: 12), _Waveform()]), const [_ModalAction('Pause recording', Icons.pause_rounded), _ModalAction('Send voice note', Icons.send_rounded)]);
    case 'roomMenu':
      return _ModalSpec('Room menu', null, const [_ModalAction('Contact / group info', Icons.info_outline_rounded), _ModalAction('Search', Icons.search_rounded), _ModalAction('Pinned messages', Icons.push_pin_outlined), _ModalAction('Room appearance', Icons.palette_outlined), _ModalAction('Chat tools', Icons.tune_rounded), _ModalAction('Media, links and files', Icons.perm_media_outlined), _ModalAction('Mute notification', Icons.notifications_off_outlined), _ModalAction('Clear chat', Icons.cleaning_services_outlined, danger: true)]);
    case 'sendFile':
      return _ModalSpec('Send file', const Column(children: [ListTile(leading: CircleAvatar(backgroundColor: Color(0x170EA5E9), child: Icon(Icons.description_outlined, color: SyncColors.sky)), title: Text('Project-Spec.pdf', style: TextStyle(fontWeight: FontWeight.w900)), subtitle: Text('8.4 MB · PDF')), SizedBox(height: 8), TextField(maxLines: 3, decoration: InputDecoration(hintText: 'Add a caption…'))]), const [_ModalAction('Send file', Icons.send_rounded)]);
    case 'shareContact':
      return _ModalSpec('Share contact', const Column(children: [ListTile(leading: SyncAvatar(name: 'Atia Rahman', radius: 25), title: Text('Atia Rahman', style: TextStyle(fontWeight: FontWeight.w900)), subtitle: Text('@atia')), CheckboxListTile(value: true, onChanged: null, title: Text('Share phone number')), CheckboxListTile(value: true, onChanged: null, title: Text('Share email'))]), const [_ModalAction('Share contact', Icons.send_rounded)]);
    case 'signOut':
      return _confirmSpec('Sign out?', 'This device will return to the sign-in screen.', 'Sign out from this device', Icons.logout_rounded, danger: true);
    case 'webcam':
      return _ModalSpec('Camera', Container(height: 340, decoration: BoxDecoration(color: SyncColors.slate950, borderRadius: BorderRadius.circular(18)), child: const Center(child: Icon(Icons.person_rounded, color: Colors.white12, size: 150))), const [_ModalAction('Switch camera', Icons.cameraswitch_outlined), _ModalAction('Take photo', Icons.camera_alt_rounded)]);
    case 'startCall':
      return _ModalSpec('Start call', const ListTile(leading: SyncAvatar(name: 'Atia Rahman', online: true, radius: 24), title: Text('Atia Rahman', style: TextStyle(fontWeight: FontWeight.w900)), subtitle: Text('online')), const [_ModalAction('Audio call', Icons.call_outlined), _ModalAction('Video call', Icons.videocam_outlined)]);
    default:
      return _ModalSpec('SyncChat', null, const []);
  }
}

_ModalSpec _confirmSpec(String title, String message, String label, IconData icon, {bool danger = false}) => _ModalSpec(title, Text(message, textAlign: TextAlign.left), [_ModalAction(label, icon, danger: danger)]);

class _ModalSpec {
  const _ModalSpec(this.title, this.body, this.actions);
  final String title;
  final Widget? body;
  final List<_ModalAction> actions;
}

class _ModalAction {
  const _ModalAction(this.label, this.icon, {this.subtitle, this.danger = false, this.onTap});
  final String label;
  final IconData icon;
  final String? subtitle;
  final bool danger;
  final VoidCallback? onTap;
}

class _Waveform extends StatelessWidget {
  const _Waveform();
  @override
  Widget build(BuildContext context) => SizedBox(height: 50, child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [for (var i = 0; i < 24; i++) Container(width: 3, height: 10 + (i % 6) * 6, decoration: BoxDecoration(color: SyncColors.sky, borderRadius: BorderRadius.circular(99)))]));
}

class _PhotoSurface extends StatelessWidget {
  const _PhotoSurface();
  @override
  Widget build(BuildContext context) => Scaffold(backgroundColor: Colors.black, body: SafeArea(child: Stack(children: [const Positioned.fill(child: Center(child: Icon(Icons.image_outlined, color: Colors.white24, size: 160))), Positioned(left: 8, top: 8, child: IconButton(onPressed: () => Navigator.maybePop(context), icon: const Icon(Icons.close_rounded, color: Colors.white))), const Positioned(right: 12, top: 14, child: Icon(Icons.more_vert_rounded, color: Colors.white)), const Positioned(left: 16, bottom: 18, child: Text('Shared photo · Today 10:24 PM', style: TextStyle(color: Colors.white70)))])));
}

class _SheetPage extends StatelessWidget {
  const _SheetPage({required this.title, required this.child});
  final String title;
  final Widget child;
  @override
  Widget build(BuildContext context) => Scaffold(backgroundColor: Colors.black45, body: SafeArea(child: Align(alignment: Alignment.bottomCenter, child: Container(height: MediaQuery.sizeOf(context).height * .72, decoration: BoxDecoration(color: context.panel, borderRadius: const BorderRadius.vertical(top: Radius.circular(28)), border: Border.all(color: context.border)), child: Column(children: [Container(width: 42, height: 4, margin: const EdgeInsets.only(top: 12, bottom: 10), decoration: BoxDecoration(color: context.border, borderRadius: BorderRadius.circular(99))), Padding(padding: const EdgeInsets.symmetric(horizontal: 14), child: Row(children: [Expanded(child: Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900))), IconButton(onPressed: () => Navigator.maybePop(context), icon: const Icon(Icons.close_rounded))])), Expanded(child: child)])))));
}

class _UnknownSurface extends StatelessWidget {
  const _UnknownSurface({required this.title});
  final String title;
  @override
  Widget build(BuildContext context) => SyncStandardPage(title: title, child: Center(child: Text('Unregistered surface: $title')));
}
