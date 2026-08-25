import 'package:flutter/material.dart';
import 'theme.dart';

Future<void> showSyncSheet(
  BuildContext context, {
  required String title,
  required List<SyncSheetAction> actions,
  Widget? body,
}) {
  return showModalBottomSheet<void>(
    context: context,
    useSafeArea: true,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) {
      return Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * .82,
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
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: context.border,
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close_rounded),
                    ),
                  ],
                ),
                if (body != null) ...[
                  const SizedBox(height: 8),
                  body,
                  const SizedBox(height: 12),
                ],
                ...actions.map(
                  (action) => Padding(
                    padding: const EdgeInsets.only(top: 7),
                    child: Material(
                      color: action.danger
                          ? SyncColors.danger.withOpacity(.08)
                          : context.softPanel,
                      borderRadius: BorderRadius.circular(16),
                      child: ListTile(
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                        leading: CircleAvatar(
                          backgroundColor: action.danger
                              ? SyncColors.danger.withOpacity(.12)
                              : SyncColors.sky.withOpacity(.12),
                          child: Icon(
                            action.icon,
                            color: action.danger ? SyncColors.danger : SyncColors.sky,
                          ),
                        ),
                        title: Text(
                          action.label,
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: action.danger ? SyncColors.danger : null,
                          ),
                        ),
                        subtitle: action.subtitle == null
                            ? null
                            : Text(action.subtitle!),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: () {
                          Navigator.pop(context);
                          action.onTap?.call();
                        },
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}

class SyncSheetAction {
  const SyncSheetAction({
    required this.label,
    required this.icon,
    this.subtitle,
    this.danger = false,
    this.onTap,
  });

  final String label;
  final String? subtitle;
  final IconData icon;
  final bool danger;
  final VoidCallback? onTap;
}

Future<void> showAttachmentSheet(BuildContext context) {
  return showSyncSheet(
    context,
    title: 'Attach',
    actions: const [
      SyncSheetAction(label: 'Photo & video', icon: Icons.photo_library_outlined),
      SyncSheetAction(label: 'Camera', icon: Icons.camera_alt_outlined),
      SyncSheetAction(label: 'File', icon: Icons.insert_drive_file_outlined),
      SyncSheetAction(label: 'Contact', icon: Icons.person_outline_rounded),
      SyncSheetAction(label: 'Poll', icon: Icons.poll_outlined),
      SyncSheetAction(label: 'Event', icon: Icons.event_outlined),
      SyncSheetAction(label: 'Sticker', icon: Icons.emoji_emotions_outlined),
      SyncSheetAction(label: 'Location', icon: Icons.location_on_outlined),
    ],
  );
}

Future<void> showInboxActionsSheet(BuildContext context) {
  return showSyncSheet(
    context,
    title: 'Chat actions',
    actions: const [
      SyncSheetAction(label: 'Mark as unread', icon: Icons.mark_chat_unread_outlined),
      SyncSheetAction(label: 'Favourite', icon: Icons.star_border_rounded),
      SyncSheetAction(label: 'Pin chat', icon: Icons.push_pin_outlined),
      SyncSheetAction(label: 'Archive', icon: Icons.archive_outlined),
      SyncSheetAction(label: 'Mute notification', icon: Icons.notifications_off_outlined),
      SyncSheetAction(label: 'Lock chat', icon: Icons.lock_outline_rounded),
      SyncSheetAction(label: 'Clear chat', icon: Icons.cleaning_services_outlined),
      SyncSheetAction(
        label: 'Delete chat',
        icon: Icons.delete_outline_rounded,
        danger: true,
      ),
    ],
  );
}

Future<void> showRoomActionsSheet(
  BuildContext context, {
  required VoidCallback onOpenTools,
  required VoidCallback onOpenAppearance,
}) {
  return showSyncSheet(
    context,
    title: 'Room menu',
    actions: [
      const SyncSheetAction(label: 'Contact / group info', icon: Icons.info_outline),
      const SyncSheetAction(label: 'Search', icon: Icons.search_rounded),
      const SyncSheetAction(label: 'Pinned messages', icon: Icons.push_pin_outlined),
      SyncSheetAction(
        label: 'Room appearance',
        icon: Icons.palette_outlined,
        onTap: onOpenAppearance,
      ),
      SyncSheetAction(
        label: 'Chat tools',
        icon: Icons.tune_rounded,
        onTap: onOpenTools,
      ),
      const SyncSheetAction(label: 'Media, links and files', icon: Icons.perm_media_outlined),
      const SyncSheetAction(label: 'Mute notification', icon: Icons.notifications_off_outlined),
      const SyncSheetAction(label: 'Disappearing / view-once options', icon: Icons.timer_outlined),
      const SyncSheetAction(
        label: 'Clear chat',
        icon: Icons.cleaning_services_outlined,
        danger: true,
      ),
    ],
  );
}
