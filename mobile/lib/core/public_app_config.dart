import 'api_client.dart';

class PublicAppConfig {
  const PublicAppConfig({
    this.appName = 'SyncChat',
    this.appLogo = '',
    this.supportEmail = '',
    this.featureFlags = const {
      'uploads': true,
      'status': true,
      'calls': true,
      'groups': true,
      'channels': true,
      'communities': true,
    },
    this.chatUploadLimitMb = 100,
    this.avatarUploadLimitMb = 10,
    this.allowedUploadTypes = const ['image', 'video', 'audio', 'document'],
    this.defaultMediaQuality = 'standard',
    this.hdEnabled = true,
    this.maintenanceEnabled = false,
    this.maintenanceMessage = '',
  });

  final String appName;
  final String appLogo;
  final String supportEmail;
  final Map<String, bool> featureFlags;
  final int chatUploadLimitMb;
  final int avatarUploadLimitMb;
  final List<String> allowedUploadTypes;
  final String defaultMediaQuality;
  final bool hdEnabled;
  final bool maintenanceEnabled;
  final String maintenanceMessage;

  static const fallback = PublicAppConfig();

  bool featureEnabled(String name) => featureFlags[name] != false;

  factory PublicAppConfig.fromPayload(dynamic raw) {
    if (raw is! Map) return fallback;
    final map = Map<String, dynamic>.from(raw);
    final flagsRaw = map['featureFlags'];
    final flags = <String, bool>{...fallback.featureFlags};
    if (flagsRaw is Map) {
      for (final entry in flagsRaw.entries) {
        if (entry.value is bool) flags[entry.key.toString()] = entry.value == true;
      }
    }

    final limits = map['uploadLimits'] is Map
        ? Map<String, dynamic>.from(map['uploadLimits'] as Map)
        : const <String, dynamic>{};
    final media = map['mediaProfile'] is Map
        ? Map<String, dynamic>.from(map['mediaProfile'] as Map)
        : const <String, dynamic>{};
    final maintenance = map['maintenance'] is Map
        ? Map<String, dynamic>.from(map['maintenance'] as Map)
        : const <String, dynamic>{};

    int positiveInt(dynamic value, int fallbackValue) {
      final parsed = value is num ? value.toInt() : int.tryParse(value?.toString() ?? '');
      return parsed != null && parsed > 0 ? parsed : fallbackValue;
    }

    final allowedRaw = limits['allowedTypes'];
    final allowed = allowedRaw is List
        ? allowedRaw
            .map((value) => value.toString().trim().toLowerCase())
            .where((value) => value.isNotEmpty)
            .toList(growable: false)
        : fallback.allowedUploadTypes;

    final quality = media['defaultQuality']?.toString().trim().toLowerCase();
    return PublicAppConfig(
      appName: _nonEmpty(map['appName'], fallback.appName),
      appLogo: map['appLogo']?.toString().trim() ?? '',
      supportEmail: map['supportEmail']?.toString().trim() ?? '',
      featureFlags: Map.unmodifiable(flags),
      chatUploadLimitMb: positiveInt(
        limits['chatMb'],
        fallback.chatUploadLimitMb,
      ),
      avatarUploadLimitMb: positiveInt(
        limits['avatarMb'],
        fallback.avatarUploadLimitMb,
      ),
      allowedUploadTypes: List.unmodifiable(
        allowed.isEmpty ? fallback.allowedUploadTypes : allowed,
      ),
      defaultMediaQuality: quality == 'hd' ? 'hd' : 'standard',
      hdEnabled: media['hdEnabled'] is bool
          ? media['hdEnabled'] == true
          : fallback.hdEnabled,
      maintenanceEnabled: maintenance['enabled'] == true,
      maintenanceMessage: maintenance['message']?.toString().trim() ?? '',
    );
  }

  static String _nonEmpty(dynamic value, String fallbackValue) {
    final text = value?.toString().trim() ?? '';
    return text.isEmpty ? fallbackValue : text;
  }
}

class PublicAppConfigRepository {
  const PublicAppConfigRepository(this._api);

  final ApiClient _api;

  Future<PublicAppConfig> load() async {
    final response = await _api.get('/app-config', authenticated: false);
    return PublicAppConfig.fromPayload(response.payload);
  }
}
