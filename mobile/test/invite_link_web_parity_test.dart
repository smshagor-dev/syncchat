import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('group invite link mirrors web origin and permission gate', () {
    final config = File('lib/core/app_config.dart').readAsStringSync();
    final groups = File('lib/screens/live_groups_screen.dart').readAsStringSync();

    expect(config, contains('String groupInviteUrl(String? value)'));
    expect(config, contains("final marker = '/group/+';"));
    expect(config, contains("queryParameters: {'g': token}"));
    expect(groups, contains("bool get canInvite => permissions['memberCanInviteViaLink'] == true"));
    expect(groups, contains('context.services.config.groupInviteUrl('));
    expect(groups, contains('if (canInvite && link.isNotEmpty)'));
    expect(groups, contains('ClipboardData(text: link)'));
    expect(groups, isNot(contains("final link = group?['link']?.toString().trim()")));
  });

  test('channel invite visibility follows web permission without admin override', () {
    final source = File('lib/screens/live_channel_profile_web_parity_screen.dart')
        .readAsStringSync();

    expect(source, contains("bool get canInvite => permissions['memberCanInviteViaLink'] == true"));
    expect(source, contains('channelInviteUrl('));
    expect(source, contains('if (canInvite && invite.isNotEmpty)'));
    expect(source, isNot(contains("bool get canInvite => isAdmin ||")));
  });
}
