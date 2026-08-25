import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets.dart';

class ParityModalSurface extends StatelessWidget {
  const ParityModalSurface({super.key, required this.type});

  final String type;

  @override
  Widget build(BuildContext context) {
    final spec = _spec(type);
    return Scaffold(
      backgroundColor: Colors.black54,
      body: SafeArea(
        child: Align(
          alignment: Alignment.bottomCenter,
          child: Container(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(context).height * .84,
            ),
            decoration: BoxDecoration(
              color: context.panel,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
              border: Border.all(color: context.border),
            ),
            child: SafeArea(
              top: false,
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 42,
                      height: 4,
                      margin: const EdgeInsets.only(bottom: 15),
                      decoration: BoxDecoration(
                        color: context.border,
                        borderRadius: BorderRadius.circular(99),
                      ),
                    ),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            spec.title,
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
                    if (spec.body != null) ...[
                      const SizedBox(height: 8),
                      spec.body!,
                    ],
                    if (spec.actions.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      ...spec.actions.map(
                        (action) => Padding(
                          padding: const EdgeInsets.only(top: 7),
                          child: Container(
                            decoration: BoxDecoration(
                              color: action.danger
                                  ? SyncColors.danger.withValues(alpha: .08)
                                  : context.softPanel,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: ListTile(
                              leading: CircleAvatar(
                                backgroundColor: action.danger
                                    ? SyncColors.danger.withValues(alpha: .12)
                                    : SyncColors.sky.withValues(alpha: .12),
                                child: Icon(
                                  action.icon,
                                  color: action.danger
                                      ? SyncColors.danger
                                      : SyncColors.sky,
                                ),
                              ),
                              title: Text(
                                action.label,
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  color: action.danger ? SyncColors.danger : null,
                                ),
                              ),
                              subtitle: action.subtitle == null
                                  ? null
                                  : Text(action.subtitle!),
                              trailing: const Icon(Icons.chevron_right_rounded),
                              onTap: () {},
                            ),
                          ),
                        ),
                      ),
                    ],
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

_ModalSpec _spec(String type) {
  switch (type) {
    case 'attachMenu':
      return const _ModalSpec(
        title: 'Attach',
        actions: [
          _ModalAction(
            'Photo & video',
            Icons.photo_library_outlined,
            subtitle: 'Choose from gallery',
          ),
          _ModalAction('Camera', Icons.camera_alt_outlined),
          _ModalAction('File', Icons.insert_drive_file_outlined),
          _ModalAction('Contact', Icons.person_outline_rounded),
          _ModalAction('Poll', Icons.poll_outlined),
          _ModalAction('Event', Icons.event_outlined),
          _ModalAction('Sticker', Icons.emoji_emotions_outlined),
          _ModalAction('Location', Icons.location_on_outlined),
        ],
      );
    case 'attachContact':
      return const _ModalSpec(
        title: 'Share contact',
        body: _ContactChooser(),
        actions: [_ModalAction('Share selected contact', Icons.send_rounded)],
      );
    case 'attachEvent':
      return const _ModalSpec(
        title: 'Create event',
        body: _EventForm(),
        actions: [_ModalAction('Send event', Icons.send_rounded)],
      );
    case 'attachPoll':
      return const _ModalSpec(
        title: 'Create poll',
        body: _PollForm(),
        actions: [_ModalAction('Send poll', Icons.send_rounded)],
      );
    case 'attachSticker':
      return const _ModalSpec(
        title: 'Stickers',
        body: _StickerGrid(),
        actions: [],
      );
    case 'avatarUpload':
      return const _ModalSpec(
        title: 'Profile photo',
        body: _AvatarPreview(),
        actions: [
          _ModalAction('Choose from gallery', Icons.photo_library_outlined),
          _ModalAction('Take photo', Icons.camera_alt_outlined),
          _ModalAction('Remove photo', Icons.delete_outline_rounded, danger: true),
        ],
      );
    case 'imageCropper':
      return const _ModalSpec(
        title: 'Crop image',
        body: _CropPreview(),
        actions: [
          _ModalAction('Rotate', Icons.rotate_90_degrees_ccw_outlined),
          _ModalAction('Use photo', Icons.check_rounded),
        ],
      );
    case 'changePassword':
      return const _ModalSpec(
        title: 'Change password',
        body: _PasswordForm(),
        actions: [_ModalAction('Save new password', Icons.check_rounded)],
      );
    case 'deleteAccount':
      return const _ModalSpec(
        title: 'Delete account',
        body: _DeleteAccountBody(),
        actions: [
          _ModalAction(
            'Delete account permanently',
            Icons.delete_forever_outlined,
            danger: true,
          ),
        ],
      );
    case 'confirmAdd':
      return _confirm(
        'Add participants?',
        'Add 2 selected people to Product Team.',
        'Add participants',
        Icons.person_add_alt_1_rounded,
      );
    case 'deleteChat':
      return _confirm(
        'Delete chat?',
        'Messages will be removed from this device.',
        'Delete chat',
        Icons.delete_outline_rounded,
        danger: true,
      );
    case 'deleteChatInbox':
      return _confirm(
        'Delete chat and inbox?',
        'The conversation and its inbox entry will be removed.',
        'Delete chat and inbox',
        Icons.delete_forever_outlined,
        danger: true,
      );
    case 'deleteContact':
      return _confirm(
        'Delete contact?',
        'Atia Rahman will be removed from your saved contacts.',
        'Delete contact',
        Icons.person_remove_outlined,
        danger: true,
      );
    case 'exitGroup':
      return _confirm(
        'Exit group?',
        'You will stop receiving messages from Product Team.',
        'Exit group',
        Icons.exit_to_app_rounded,
        danger: true,
      );
    case 'confirmGroup':
      return _confirm(
        'Create group?',
        'Product Team · 4 selected participants',
        'Create group',
        Icons.group_add_outlined,
      );
    case 'editGroup':
      return const _ModalSpec(
        title: 'Edit group',
        body: _EditGroupForm(),
        actions: [
          _ModalAction('Change avatar', Icons.photo_library_outlined),
          _ModalAction('Save changes', Icons.check_rounded),
        ],
      );
    case 'feedback':
      return const _ModalSpec(
        title: 'Feedback',
        body: _FeedbackForm(),
        actions: [_ModalAction('Send feedback', Icons.send_rounded)],
      );
    case 'groupMenu':
      return const _ModalSpec(
        title: 'Group actions',
        actions: [
          _ModalAction('Group info', Icons.info_outline_rounded),
          _ModalAction('Search', Icons.search_rounded),
          _ModalAction('Mute notifications', Icons.notifications_off_outlined),
          _ModalAction('Clear chat', Icons.cleaning_services_outlined),
          _ModalAction('Exit group', Icons.exit_to_app_rounded, danger: true),
        ],
      );
    case 'inboxMenu':
      return const _ModalSpec(
        title: 'Chat actions',
        actions: [
          _ModalAction('Mark as unread', Icons.mark_chat_unread_outlined),
          _ModalAction('Favourite', Icons.star_border_rounded),
          _ModalAction('Pin chat', Icons.push_pin_outlined),
          _ModalAction('Archive', Icons.archive_outlined),
          _ModalAction('Mute notification', Icons.notifications_off_outlined),
          _ModalAction('Lock chat', Icons.lock_outline_rounded),
          _ModalAction('Clear chat', Icons.cleaning_services_outlined),
          _ModalAction('Delete chat', Icons.delete_outline_rounded, danger: true),
        ],
      );
    case 'mediaPreview':
      return const _ModalSpec(
        title: 'Media',
        body: _MediaPreview(),
        actions: [
          _ModalAction('Download', Icons.download_rounded),
          _ModalAction('Forward', Icons.forward_rounded),
          _ModalAction('Delete', Icons.delete_outline_rounded, danger: true),
        ],
      );
    case 'newContact':
      return const _ModalSpec(
        title: 'New contact',
        body: _NewContactForm(),
        actions: [_ModalAction('Save contact', Icons.person_add_alt_1_rounded)],
      );
    case 'qr':
      return const _ModalSpec(
        title: 'QR profile / device',
        body: _QrBody(),
        actions: [
          _ModalAction('Share QR', Icons.share_outlined),
          _ModalAction('Scan a QR', Icons.qr_code_scanner_rounded),
        ],
      );
    case 'recordVoice':
      return const _ModalSpec(
        title: 'Record voice',
        body: _VoiceBody(),
        actions: [
          _ModalAction('Pause recording', Icons.pause_rounded),
          _ModalAction('Send voice note', Icons.send_rounded),
        ],
      );
    case 'roomMenu':
      return const _ModalSpec(
        title: 'Room menu',
        actions: [
          _ModalAction('Contact / group info', Icons.info_outline_rounded),
          _ModalAction('Search', Icons.search_rounded),
          _ModalAction('Pinned messages', Icons.push_pin_outlined),
          _ModalAction('Room appearance', Icons.palette_outlined),
          _ModalAction('Chat tools', Icons.tune_rounded),
          _ModalAction('Media, links and files', Icons.perm_media_outlined),
          _ModalAction('Mute notification', Icons.notifications_off_outlined),
          _ModalAction('Clear chat', Icons.cleaning_services_outlined, danger: true),
        ],
      );
    case 'sendFile':
      return const _ModalSpec(
        title: 'Send file',
        body: _SendFileBody(),
        actions: [_ModalAction('Send file', Icons.send_rounded)],
      );
    case 'shareContact':
      return const _ModalSpec(
        title: 'Share contact',
        body: _ShareContactBody(),
        actions: [_ModalAction('Share contact', Icons.send_rounded)],
      );
    case 'signOut':
      return _confirm(
        'Sign out?',
        'This device will return to the sign-in screen.',
        'Sign out from this device',
        Icons.logout_rounded,
        danger: true,
      );
    case 'webcam':
      return const _ModalSpec(
        title: 'Camera',
        body: _CameraPreview(),
        actions: [
          _ModalAction('Switch camera', Icons.cameraswitch_outlined),
          _ModalAction('Take photo', Icons.camera_alt_rounded),
        ],
      );
    case 'startCall':
      return const _ModalSpec(
        title: 'Start call',
        body: ListTile(
          leading: SyncAvatar(name: 'Atia Rahman', online: true, radius: 24),
          title: Text('Atia Rahman', style: TextStyle(fontWeight: FontWeight.w900)),
          subtitle: Text('online'),
        ),
        actions: [
          _ModalAction('Audio call', Icons.call_outlined),
          _ModalAction('Video call', Icons.videocam_outlined),
        ],
      );
    default:
      return const _ModalSpec(title: 'SyncChat', actions: []);
  }
}

_ModalSpec _confirm(
  String title,
  String message,
  String label,
  IconData icon, {
  bool danger = false,
}) {
  return _ModalSpec(
    title: title,
    body: Text(message),
    actions: [_ModalAction(label, icon, danger: danger)],
  );
}

class _ModalSpec {
  const _ModalSpec({required this.title, this.body, required this.actions});

  final String title;
  final Widget? body;
  final List<_ModalAction> actions;
}

class _ModalAction {
  const _ModalAction(
    this.label,
    this.icon, {
    this.subtitle,
    this.danger = false,
  });

  final String label;
  final IconData icon;
  final String? subtitle;
  final bool danger;
}

class _ContactChooser extends StatelessWidget {
  const _ContactChooser();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        TextField(
          decoration: InputDecoration(
            hintText: 'Search contacts',
            prefixIcon: Icon(Icons.search_rounded),
          ),
        ),
        SizedBox(height: 8),
        ListTile(
          leading: SyncAvatar(name: 'Atia Rahman', radius: 20),
          title: Text('Atia Rahman'),
          trailing: Checkbox(value: true, onChanged: null),
        ),
        ListTile(
          leading: SyncAvatar(name: 'Nadia Karim', radius: 20),
          title: Text('Nadia Karim'),
          trailing: Checkbox(value: false, onChanged: null),
        ),
      ],
    );
  }
}

class _EventForm extends StatelessWidget {
  const _EventForm();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        TextField(
          decoration: InputDecoration(
            labelText: 'Event title',
            prefixIcon: Icon(Icons.event_outlined),
          ),
        ),
        SizedBox(height: 8),
        TextField(
          decoration: InputDecoration(
            labelText: 'Date & time',
            prefixIcon: Icon(Icons.calendar_today_outlined),
          ),
        ),
        SizedBox(height: 8),
        TextField(maxLines: 3, decoration: InputDecoration(labelText: 'Description')),
      ],
    );
  }
}

class _PollForm extends StatelessWidget {
  const _PollForm();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        TextField(
          decoration: InputDecoration(
            labelText: 'Question',
            prefixIcon: Icon(Icons.poll_outlined),
          ),
        ),
        SizedBox(height: 8),
        TextField(decoration: InputDecoration(labelText: 'Option 1')),
        SizedBox(height: 8),
        TextField(decoration: InputDecoration(labelText: 'Option 2')),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: true,
          onChanged: null,
          title: Text('Allow multiple answers'),
        ),
      ],
    );
  }
}

class _StickerGrid extends StatelessWidget {
  const _StickerGrid();

  @override
  Widget build(BuildContext context) {
    const emojis = [
      '😀','🔥','❤️','👍','🎉','😂','😎','✅','💯','🙏','😍','🤩','🥳','👏','👀',
    ];
    return SizedBox(
      height: 230,
      child: GridView.count(
        crossAxisCount: 5,
        children: emojis
            .map(
              (emoji) => Center(
                child: Text(emoji, style: const TextStyle(fontSize: 34)),
              ),
            )
            .toList(),
      ),
    );
  }
}

class _AvatarPreview extends StatelessWidget {
  const _AvatarPreview();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        CircleAvatar(
          radius: 58,
          backgroundColor: Color(0x170EA5E9),
          child: Icon(Icons.person_outline_rounded, size: 58, color: SyncColors.sky),
        ),
        SizedBox(height: 12),
        Text('Choose a clear square photo. You can crop it before saving.'),
      ],
    );
  }
}

class _CropPreview extends StatelessWidget {
  const _CropPreview();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 320,
      decoration: BoxDecoration(
        color: SyncColors.slate950,
        borderRadius: BorderRadius.circular(18),
      ),
      child: const Stack(
        alignment: Alignment.center,
        children: [
          Icon(Icons.image_outlined, size: 130, color: Colors.white24),
          SizedBox(
            width: 230,
            height: 230,
            child: DecoratedBox(
              decoration: BoxDecoration(
                border: Border.fromBorderSide(
                  BorderSide(color: Colors.white, width: 2),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PasswordForm extends StatelessWidget {
  const _PasswordForm();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        TextField(obscureText: true, decoration: InputDecoration(labelText: 'Current password')),
        SizedBox(height: 8),
        TextField(obscureText: true, decoration: InputDecoration(labelText: 'New password')),
        SizedBox(height: 8),
        TextField(obscureText: true, decoration: InputDecoration(labelText: 'Confirm new password')),
      ],
    );
  }
}

class _DeleteAccountBody extends StatelessWidget {
  const _DeleteAccountBody();

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'This permanently removes your SyncChat account and cannot be undone.',
          style: TextStyle(color: SyncColors.danger, fontWeight: FontWeight.w800),
        ),
        SizedBox(height: 10),
        TextField(
          obscureText: true,
          decoration: InputDecoration(labelText: 'Current password'),
        ),
      ],
    );
  }
}

class _EditGroupForm extends StatelessWidget {
  const _EditGroupForm();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        CircleAvatar(
          radius: 42,
          backgroundColor: Color(0x170EA5E9),
          child: Icon(Icons.groups_2_outlined, color: SyncColors.sky),
        ),
        SizedBox(height: 10),
        TextField(decoration: InputDecoration(labelText: 'Group name')),
        SizedBox(height: 8),
        TextField(maxLines: 3, decoration: InputDecoration(labelText: 'Description')),
      ],
    );
  }
}

class _FeedbackForm extends StatelessWidget {
  const _FeedbackForm();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const TextField(
          maxLines: 5,
          decoration: InputDecoration(hintText: 'Tell us what should improve…'),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: 'General',
          items: const [
            DropdownMenuItem(value: 'General', child: Text('General')),
            DropdownMenuItem(value: 'Bug', child: Text('Bug')),
            DropdownMenuItem(value: 'Feature', child: Text('Feature request')),
          ],
          onChanged: (_) {},
        ),
      ],
    );
  }
}

class _MediaPreview extends StatelessWidget {
  const _MediaPreview();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 310,
      decoration: BoxDecoration(
        color: SyncColors.slate950,
        borderRadius: BorderRadius.circular(18),
      ),
      child: const Center(
        child: Icon(Icons.image_outlined, size: 120, color: Colors.white24),
      ),
    );
  }
}

class _NewContactForm extends StatelessWidget {
  const _NewContactForm();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        TextField(
          decoration: InputDecoration(
            labelText: 'Full name',
            prefixIcon: Icon(Icons.person_outline_rounded),
          ),
        ),
        SizedBox(height: 8),
        TextField(
          decoration: InputDecoration(
            labelText: 'Username or email',
            prefixIcon: Icon(Icons.alternate_email_rounded),
          ),
        ),
        SizedBox(height: 8),
        TextField(
          decoration: InputDecoration(
            labelText: 'Phone',
            prefixIcon: Icon(Icons.phone_outlined),
          ),
        ),
      ],
    );
  }
}

class _QrBody extends StatelessWidget {
  const _QrBody();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        SizedBox(
          width: 220,
          height: 220,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.all(Radius.circular(18)),
            ),
            child: Icon(Icons.qr_code_2_rounded, size: 190, color: Colors.black),
          ),
        ),
        SizedBox(height: 12),
        Text('@atia', style: TextStyle(fontWeight: FontWeight.w900)),
      ],
    );
  }
}

class _VoiceBody extends StatelessWidget {
  const _VoiceBody();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        CircleAvatar(
          radius: 38,
          backgroundColor: Color(0x17F43F5E),
          child: Icon(Icons.mic_rounded, color: SyncColors.danger, size: 34),
        ),
        SizedBox(height: 10),
        Text('00:18', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
        SizedBox(height: 12),
        _VoiceWaveform(),
      ],
    );
  }
}

class _VoiceWaveform extends StatelessWidget {
  const _VoiceWaveform();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 50,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: List.generate(
          24,
          (index) => Container(
            width: 3,
            height: 10 + (index % 6) * 6,
            decoration: BoxDecoration(
              color: SyncColors.sky,
              borderRadius: BorderRadius.circular(99),
            ),
          ),
        ),
      ),
    );
  }
}

class _SendFileBody extends StatelessWidget {
  const _SendFileBody();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        ListTile(
          leading: CircleAvatar(
            backgroundColor: Color(0x170EA5E9),
            child: Icon(Icons.description_outlined, color: SyncColors.sky),
          ),
          title: Text('Project-Spec.pdf', style: TextStyle(fontWeight: FontWeight.w900)),
          subtitle: Text('8.4 MB · PDF'),
        ),
        SizedBox(height: 8),
        TextField(maxLines: 3, decoration: InputDecoration(hintText: 'Add a caption…')),
      ],
    );
  }
}

class _ShareContactBody extends StatelessWidget {
  const _ShareContactBody();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        ListTile(
          leading: SyncAvatar(name: 'Atia Rahman', radius: 25),
          title: Text('Atia Rahman', style: TextStyle(fontWeight: FontWeight.w900)),
          subtitle: Text('@atia'),
        ),
        CheckboxListTile(
          value: true,
          onChanged: null,
          title: Text('Share phone number'),
        ),
        CheckboxListTile(
          value: true,
          onChanged: null,
          title: Text('Share email'),
        ),
      ],
    );
  }
}

class _CameraPreview extends StatelessWidget {
  const _CameraPreview();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 340,
      decoration: BoxDecoration(
        color: SyncColors.slate950,
        borderRadius: BorderRadius.circular(18),
      ),
      child: const Center(
        child: Icon(Icons.person_rounded, color: Colors.white12, size: 150),
      ),
    );
  }
}
