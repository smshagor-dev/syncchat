import 'package:flutter/material.dart';

import 'core/app_scope.dart';
import 'theme.dart';

class SyncAvatar extends StatelessWidget {
  const SyncAvatar({
    super.key,
    required this.name,
    this.imageUrl,
    this.radius = 24,
    this.online = false,
  });

  final String name;
  final String? imageUrl;
  final double radius;
  final bool online;

  @override
  Widget build(BuildContext context) {
    final initials = name
        .split(' ')
        .where((part) => part.trim().isNotEmpty)
        .take(2)
        .map((part) => part.trim()[0].toUpperCase())
        .join();
    final resolvedUrl = context.services.config.resolveMediaUrl(imageUrl);

    Widget fallback() => CircleAvatar(
          radius: radius,
          backgroundColor: SyncColors.sky.withOpacity(.14),
          child: Text(
            initials.isEmpty ? 'S' : initials,
            style: TextStyle(
              color: context.isDark ? const Color(0xFFBAE6FD) : SyncColors.sky700,
              fontWeight: FontWeight.w900,
              fontSize: radius * .66,
            ),
          ),
        );

    final avatar = resolvedUrl.isEmpty
        ? fallback()
        : ClipOval(
            child: SizedBox.square(
              dimension: radius * 2,
              child: Image.network(
                resolvedUrl,
                fit: BoxFit.cover,
                gaplessPlayback: true,
                filterQuality: FilterQuality.medium,
                loadingBuilder: (context, child, progress) =>
                    progress == null ? child : fallback(),
                errorBuilder: (_, __, ___) => fallback(),
              ),
            ),
          );

    return Stack(
      clipBehavior: Clip.none,
      children: [
        avatar,
        if (online)
          Positioned(
            right: -1,
            bottom: -1,
            child: Container(
              width: radius * .58,
              height: radius * .58,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: SyncColors.success,
                border: Border.all(color: context.panel, width: 2),
              ),
            ),
          ),
      ],
    );
  }
}

class SyncSoftCard extends StatelessWidget {
  const SyncSoftCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.margin,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      padding: padding,
      decoration: BoxDecoration(
        color: context.panel,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.border),
        boxShadow: context.isDark
            ? null
            : const [
                BoxShadow(
                  color: Color(0x100F172A),
                  blurRadius: 12,
                  offset: Offset(0, 4),
                ),
              ],
      ),
      child: child,
    );
  }
}

class SyncFeatureCard extends StatelessWidget {
  const SyncFeatureCard({
    super.key,
    required this.icon,
    required this.title,
    required this.body,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String body;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: context.isDark
              ? [SyncColors.spill800, SyncColors.spill900]
              : [const Color(0xFFE0F2FE), const Color(0xFFECFEFF)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: context.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            backgroundColor: SyncColors.sky.withOpacity(.14),
            child: Icon(icon, color: SyncColors.sky),
          ),
          const SizedBox(height: 12),
          Text(
            title,
            style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 5),
          Text(
            body,
            style: TextStyle(color: context.muted, height: 1.45),
          ),
          if (actionLabel != null) ...[
            const SizedBox(height: 13),
            FilledButton.icon(
              onPressed: onAction,
              icon: const Icon(Icons.add_rounded),
              label: Text(actionLabel!),
            ),
          ],
        ],
      ),
    );
  }
}

class SyncEntityTile extends StatelessWidget {
  const SyncEntityTile({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.trailing,
    this.danger = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Widget? trailing;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final tone = danger ? SyncColors.danger : SyncColors.sky;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: context.panel,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              border: Border.all(color: context.border),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  backgroundColor: tone.withOpacity(.10),
                  child: Icon(icon, color: tone, size: 20),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          color: danger ? SyncColors.danger : null,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        subtitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12, color: context.muted),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                trailing ?? Icon(Icons.chevron_right_rounded, color: context.muted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class SyncSectionLabel extends StatelessWidget {
  const SyncSectionLabel(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label.toUpperCase(),
      style: TextStyle(
        color: context.muted,
        fontSize: 11,
        fontWeight: FontWeight.w900,
        letterSpacing: 1.3,
      ),
    );
  }
}

class SyncStandardPage extends StatelessWidget {
  const SyncStandardPage({
    super.key,
    required this.title,
    required this.child,
    this.actions = const [],
  });

  final String title;
  final Widget child;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.isDark ? SyncColors.spill950 : Colors.white,
      appBar: AppBar(
        leading: IconButton(
          onPressed: () => Navigator.maybePop(context),
          icon: const Icon(Icons.arrow_back_rounded),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
        actions: actions,
      ),
      body: child,
    );
  }
}

class SyncDockPage extends StatelessWidget {
  const SyncDockPage({
    super.key,
    required this.title,
    required this.child,
    this.trailing,
  });

  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: context.isDark ? SyncColors.spill950 : Colors.white,
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Container(
              height: 64,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              color: context.panel,
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
                    ),
                  ),
                  if (trailing != null) trailing!,
                ],
              ),
            ),
            Divider(height: 1, color: context.border),
            Expanded(child: child),
          ],
        ),
      ),
    );
  }
}

class SyncRoundAction extends StatelessWidget {
  const SyncRoundAction({
    super.key,
    required this.icon,
    required this.onTap,
    this.color,
  });

  final IconData icon;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onTap,
      icon: Icon(icon, size: 21, color: color ?? context.muted),
    );
  }
}

class SyncStatusAvatar extends StatelessWidget {
  const SyncStatusAvatar({
    super.key,
    required this.name,
    this.imageUrl,
    this.add = false,
  });

  final String name;
  final String? imageUrl;
  final bool add;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 68,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: add ? context.border : SyncColors.sky,
                    width: 2,
                  ),
                ),
                child: SyncAvatar(name: name, imageUrl: imageUrl, radius: 21),
              ),
              if (add)
                const Positioned(
                  right: -1,
                  bottom: -1,
                  child: CircleAvatar(
                    radius: 9,
                    backgroundColor: SyncColors.sky600,
                    child: Icon(Icons.add_rounded, color: Colors.white, size: 14),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 5),
          Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}
