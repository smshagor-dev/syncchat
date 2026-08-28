import 'package:flutter/material.dart';

import 'core/app_scope.dart';
import 'theme.dart';
import 'widgets/runtime_brand.dart';

const _supportDisplayName = 'SyncChat Support';

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
    final supportIdentity = name.trim() == _supportDisplayName;
    final resolvedUrl = context.services.config.resolveMediaUrl(imageUrl);

    Widget fallback() => CircleAvatar(
          radius: radius,
          backgroundColor: SyncColors.sky.withValues(alpha: .12),
          child: Text(
            initials.isEmpty ? 'S' : initials,
            style: TextStyle(
              color: context.isDark ? const Color(0xFFBAE6FD) : SyncColors.sky700,
              fontWeight: FontWeight.w800,
              fontSize: radius * .62,
            ),
          ),
        );

    final avatar = supportIdentity
        ? ClipOval(
            child: RuntimeBrandLogo(
              size: radius * 2,
              borderRadius: radius * 2,
            ),
          )
        : resolvedUrl.isEmpty
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
              width: radius * .52,
              height: radius * .52,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: SyncColors.success,
                border: Border.all(color: context.panel, width: 2.2),
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
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.border.withValues(alpha: .82)),
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
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.panel,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: context.border.withValues(alpha: .82)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: SyncColors.sky.withValues(alpha: .12),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: SyncColors.sky600, size: 21),
          ),
          const SizedBox(height: 12),
          Text(
            title,
            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 5),
          Text(
            body,
            style: TextStyle(color: context.muted, height: 1.4, fontSize: 13.5),
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
    final tone = danger ? SyncColors.danger : SyncColors.sky600;
    return Padding(
      padding: const EdgeInsets.only(bottom: 7),
      child: Material(
        color: context.panel,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              border: Border.all(color: context.border.withValues(alpha: .82)),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: tone.withValues(alpha: .10),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(icon, color: tone, size: 19),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: danger ? SyncColors.danger : null,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        subtitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12.5, color: context.muted),
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
      label,
      style: TextStyle(
        color: context.isDark ? const Color(0xFF7DD3FC) : SyncColors.sky700,
        fontSize: 12,
        fontWeight: FontWeight.w700,
        letterSpacing: .15,
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
    final canPop = Navigator.canPop(context);
    return Scaffold(
      backgroundColor: context.isDark ? SyncColors.spill950 : Colors.white,
      appBar: AppBar(
        automaticallyImplyLeading: false,
        leading: canPop
            ? IconButton(
                tooltip: 'Back',
                onPressed: () => Navigator.maybePop(context),
                icon: const Icon(Icons.arrow_back_rounded),
              )
            : null,
        title: Text(title),
        actions: actions,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Divider(height: 1, color: context.border.withValues(alpha: .72)),
        ),
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
              height: 58,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              color: context.panel,
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -.2,
                      ),
                    ),
                  ),
                  if (trailing != null) trailing!,
                ],
              ),
            ),
            Divider(height: 1, color: context.border.withValues(alpha: .72)),
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
      width: 72,
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
                    color: add ? context.border : SyncColors.sky600,
                    width: 2,
                  ),
                ),
                child: SyncAvatar(name: name, imageUrl: imageUrl, radius: 23),
              ),
              if (add)
                Positioned(
                  right: -1,
                  bottom: -1,
                  child: Container(
                    width: 20,
                    height: 20,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: SyncColors.sky600,
                      border: Border.all(color: context.panel, width: 2),
                    ),
                    child: const Icon(Icons.add_rounded, color: Colors.white, size: 14),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}