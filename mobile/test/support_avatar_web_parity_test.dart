import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('shared avatar mirrors Web support identity branding', () {
    final source = File('lib/widgets.dart').readAsStringSync();

    expect(source, contains("const _supportDisplayName = 'SyncChat Support';"));
    expect(source, contains('name.trim() == _supportDisplayName'));
    expect(source, contains("import 'widgets/runtime_brand.dart'"));
    expect(source, contains('RuntimeBrandLogo('));
    expect(source, contains('size: radius * 2'));
    expect(source, contains('borderRadius: radius * 2'));
  });

  test('ordinary avatar and presence behavior stays intact', () {
    final source = File('lib/widgets.dart').readAsStringSync();

    expect(source, contains('context.services.config.resolveMediaUrl(imageUrl)'));
    expect(source, contains('Image.network('));
    expect(source, contains('errorBuilder: (_, __, ___) => fallback()'));
    expect(source, contains('if (online)'));
    expect(source, contains('color: SyncColors.success'));
  });
}
