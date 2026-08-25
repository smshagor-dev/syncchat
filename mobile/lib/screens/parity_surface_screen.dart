import 'package:flutter/material.dart';

import 'core_screens.dart';
import 'parity_auth_surfaces.dart';
import 'parity_chat_surfaces.dart';
import 'parity_detail_surfaces.dart';
import 'parity_modal_surfaces.dart';

/// Every user-visible web surface registered in parity_catalog.dart must appear
/// here. The coverage test prevents a new web surface from silently falling
/// back to a generic Flutter placeholder.
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
      // Auth / route states.
      'Sign in / Sign up shell' => const ParityAuthSurface(mode: 'auth'),
      'Forgot password' => const ParityAuthSurface(mode: 'forgot'),
      'Link device' => const ParityAuthSurface(mode: 'link'),
      'QR scanner' => const ParityAuthSurface(mode: 'qr'),
      'Social auth' => const ParityAuthSurface(mode: 'social'),
      'Verify account' => const ParityVerificationSurface(inactive: false),
      'Inactive account' => const ParityVerificationSurface(inactive: true),

      // Foreground / navigation states.
      'Chat application shell' => const ParityForegroundSurface(mode: 'shell'),
      'Chats' => const ParityForegroundSurface(mode: 'chats'),
      'Calls' => const CallsScreen(),
      'Status rail' => const ParityForegroundSurface(mode: 'status'),
      'Archive' => const ParityCollectionSurface(mode: 'archive'),
      'Lists' => const ParityCollectionSurface(mode: 'lists'),
      'Starred messages' => const ParityCollectionSurface(mode: 'starred'),
      'Chat filters' => const ParityForegroundSurface(mode: 'filters'),
      'Mobile bottom navigation' => const ParityForegroundSurface(mode: 'dock'),
      'Mobile side rail' => const ParityForegroundSurface(mode: 'rail'),
      'Overflow mini menu' => const ParityInboxMenuSurface(),
      'Open contact' => const ParityOpenContactSurface(),

      // Full pages.
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
      'Policy' => const ParityDocumentSurface(type: 'policy'),
      'License' => const ParityDocumentSurface(type: 'license'),
      'New group' => ParityNewGroupSurface(subtitle: subtitle),
      'Friend profile' => const ParityProfileInfoSurface(type: 'friend'),
      'Group profile' => const ParityProfileInfoSurface(type: 'group'),
      'Channel profile' => const ParityProfileInfoSurface(type: 'channel'),
      'Group participants' => const ParityParticipantsSurface(addMode: false),
      'Add participant' => const ParityParticipantsSurface(addMode: true),

      // Room states.
      'Room header' => const ParityRoomSurface(mode: 'header'),
      'Pinned messages' => const ParityRoomSurface(mode: 'pinned'),
      'Pin history' => const ParityRoomSurface(mode: 'pinHistory'),
      'Search in chat' => const ParityRoomSurface(mode: 'search'),
      'Message monitor' => const ParityRoomSurface(mode: 'monitor'),
      'Message selection' => const ParityRoomSurface(mode: 'selection'),
      'Reply / forward / reaction / edit' => const ParityRoomSurface(mode: 'messageActions'),
      'Media / link / location / poll / event message cards' => const ParityRoomSurface(mode: 'richCards'),
      'Composer' => const ParityRoomSurface(mode: 'composer'),
      'Emoji board' => const ParityRoomSurface(mode: 'emoji'),
      'Voice recorder' => const ParityRoomSurface(mode: 'voice'),
      'Scheduled messages' => const ParityRoomSurface(mode: 'scheduled'),
      'View-once text' => const ParityRoomSurface(mode: 'viewOnce'),
      'Slow mode / admin-only send state' => const ParityRoomSurface(mode: 'restricted'),

      // Chat Tools tabs/states.
      'Search' => const ParityChatToolsSurface(tab: 'search'),
      'Message requests' => const ParityChatToolsSurface(tab: 'requests'),
      'Mentions' => const ParityChatToolsSurface(tab: 'mentions'),
      'Topics' => const ParityChatToolsSurface(tab: 'topics'),
      'Security / E2EE' => const ParityChatToolsSurface(tab: 'security'),
      'Outbox / retry' => const ParityChatToolsSurface(tab: 'outbox'),
      'Message details / receipts' => const ParityChatToolsSurface(tab: 'receipts'),

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
      'Backup / restore' => const ParityBackupSurface(),
      'Google Drive connection' => const ParityDriveSurface(),

      // Status states.
      'Status composer' => const StatusScreen(),
      'Status viewer' => const ParityStatusDetailSurface(mode: 'viewer'),
      'Status activity' => const ParityStatusDetailSurface(mode: 'activity'),
      'Status reactions / replies / mentions' => const ParityStatusDetailSurface(mode: 'reactions'),

      // Call states.
      'Start call' => const ParityCallSurface(mode: 'start'),
      '1:1 call panel' => CallPanelScreen(name: 'Atia Rahman', video: false),
      'Call runtime' => CallPanelScreen(name: 'Atia Rahman', video: true),
      'Group call / LiveKit' => const ParityCallSurface(mode: 'group'),
      'Global incoming call layer' => const ParityCallSurface(mode: 'incoming'),

      // Modal / sheet states.
      'Attach menu' => const ParityModalSurface(type: 'attachMenu'),
      'Attach contact' => const ParityModalSurface(type: 'attachContact'),
      'Attach event' => const ParityModalSurface(type: 'attachEvent'),
      'Attach poll' => const ParityModalSurface(type: 'attachPoll'),
      'Attach sticker' => const ParityModalSurface(type: 'attachSticker'),
      'Avatar upload' => const ParityModalSurface(type: 'avatarUpload'),
      'Image cropper' => const ParityModalSurface(type: 'imageCropper'),
      'Change password' => const ParityModalSurface(type: 'changePassword'),
      'Delete account' => const ParityModalSurface(type: 'deleteAccount'),
      'Confirm add participant' => const ParityModalSurface(type: 'confirmAdd'),
      'Confirm delete chat' => const ParityModalSurface(type: 'deleteChat'),
      'Confirm delete chat + inbox' => const ParityModalSurface(type: 'deleteChatInbox'),
      'Confirm delete contact' => const ParityModalSurface(type: 'deleteContact'),
      'Confirm exit group' => const ParityModalSurface(type: 'exitGroup'),
      'Confirm new group' => const ParityModalSurface(type: 'confirmGroup'),
      'Edit group' => const ParityModalSurface(type: 'editGroup'),
      'Feedback' => const ParityModalSurface(type: 'feedback'),
      'Group context menu' => const ParityModalSurface(type: 'groupMenu'),
      'Inbox context menu' => const ParityModalSurface(type: 'inboxMenu'),
      'Media preview' => const ParityModalSurface(type: 'mediaPreview'),
      'New contact' => const ParityModalSurface(type: 'newContact'),
      'Photo full screen' => const ParityPhotoSurface(),
      'QR profile / device' => const ParityModalSurface(type: 'qr'),
      'Record voice' => const ParityModalSurface(type: 'recordVoice'),
      'Room appearance' => const RoomAppearanceScreen(),
      'Room header menu' => const ParityModalSurface(type: 'roomMenu'),
      'Send file' => const ParityModalSurface(type: 'sendFile'),
      'Share contact' => const ParityModalSurface(type: 'shareContact'),
      'Sign out' => const ParityModalSurface(type: 'signOut'),
      'Webcam capture' => const ParityModalSurface(type: 'webcam'),

      // Only non-catalog programming errors can reach this branch.
      _ => _UnknownParitySurface(title: title),
    };
  }
}

class _UnknownParitySurface extends StatelessWidget {
  const _UnknownParitySurface({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Text('Unregistered SyncChat surface: $title'),
        ),
      ),
    );
  }
}
