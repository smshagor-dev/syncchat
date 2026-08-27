import 'package:flutter/material.dart';

import '../core/app_scope.dart';
import '../core/public_app_config.dart';

class RuntimeBrandLogo extends StatelessWidget {
  const RuntimeBrandLogo({
    super.key,
    this.size = 40,
    this.borderRadius = 10,
    this.fit = BoxFit.cover,
  });

  final double size;
  final double borderRadius;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final raw = context.publicAppConfig.appLogo.trim();
    final resolved = raw.isEmpty
        ? ''
        : context.services.config.resolveMediaUrl(raw).trim();

    Widget fallback() => Image.asset(
          'assets/syncchat_logo.png',
          width: size,
          height: size,
          fit: fit,
          filterQuality: FilterQuality.high,
        );

    final image = resolved.isEmpty
        ? fallback()
        : Image.network(
            resolved,
            width: size,
            height: size,
            fit: fit,
            filterQuality: FilterQuality.high,
            errorBuilder: (_, __, ___) => fallback(),
          );

    return ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: SizedBox.square(dimension: size, child: image),
    );
  }
}
