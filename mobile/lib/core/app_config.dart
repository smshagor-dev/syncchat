class SyncChatConfig {
  const SyncChatConfig({
    required this.apiBaseUrl,
    required this.socketUrl,
    this.publicOrigin = '',
    this.socketPath = '/socket.io',
    this.chatUploadLimitMb = 100,
    this.avatarUploadLimitMb = 10,
    this.firebaseApiKey = '',
    this.firebaseAppId = '',
    this.firebaseMessagingSenderId = '',
    this.firebaseProjectId = '',
    this.firebaseIosApiKey = '',
    this.firebaseIosAppId = '',
    this.firebaseIosBundleId = '',
    this.appVersion = '0.1.0',
  });

  factory SyncChatConfig.fromEnvironment() {
    const apiBaseUrl = String.fromEnvironment(
      'SYNCCHAT_API_BASE_URL',
      defaultValue: 'http://127.0.0.1:5599/api',
    );
    const socketUrl = String.fromEnvironment(
      'SYNCCHAT_SOCKET_URL',
      defaultValue: 'http://127.0.0.1:5599',
    );
    const publicOrigin = String.fromEnvironment(
      'SYNCCHAT_PUBLIC_ORIGIN',
      defaultValue: '',
    );
    const firebaseApiKey = String.fromEnvironment(
      'SYNCCHAT_FIREBASE_API_KEY',
      defaultValue: 'AIzaSyCIabLqUfQeyrD5e8D6wQj58ktPKKzKWcg',
    );
    const firebaseAppId = String.fromEnvironment(
      'SYNCCHAT_FIREBASE_APP_ID',
      defaultValue: '1:183539740148:android:aeb359ff30de6297f85da1',
    );
    const firebaseMessagingSenderId = String.fromEnvironment(
      'SYNCCHAT_FIREBASE_MESSAGING_SENDER_ID',
      defaultValue: '183539740148',
    );
    const firebaseProjectId = String.fromEnvironment(
      'SYNCCHAT_FIREBASE_PROJECT_ID',
      defaultValue: 'chat-c001b',
    );
    const firebaseIosApiKey = String.fromEnvironment(
      'SYNCCHAT_FIREBASE_IOS_API_KEY',
      defaultValue: '',
    );
    const firebaseIosAppId = String.fromEnvironment(
      'SYNCCHAT_FIREBASE_IOS_APP_ID',
      defaultValue: '',
    );
    const firebaseIosBundleId = String.fromEnvironment(
      'SYNCCHAT_FIREBASE_IOS_BUNDLE_ID',
      defaultValue: 'com.syncchat.syncchatMobile',
    );
    const appVersion = String.fromEnvironment(
      'SYNCCHAT_APP_VERSION',
      defaultValue: '0.1.0',
    );

    return const SyncChatConfig(
      apiBaseUrl: apiBaseUrl,
      socketUrl: socketUrl,
      publicOrigin: publicOrigin,
      firebaseApiKey: firebaseApiKey,
      firebaseAppId: firebaseAppId,
      firebaseMessagingSenderId: firebaseMessagingSenderId,
      firebaseProjectId: firebaseProjectId,
      firebaseIosApiKey: firebaseIosApiKey,
      firebaseIosAppId: firebaseIosAppId,
      firebaseIosBundleId: firebaseIosBundleId,
      appVersion: appVersion,
    );
  }

  final String apiBaseUrl;
  final String socketUrl;
  final String publicOrigin;
  final String socketPath;
  final int chatUploadLimitMb;
  final int avatarUploadLimitMb;
  final String firebaseApiKey;
  final String firebaseAppId;
  final String firebaseMessagingSenderId;
  final String firebaseProjectId;
  final String firebaseIosApiKey;
  final String firebaseIosAppId;
  final String firebaseIosBundleId;
  final String appVersion;

  SyncChatConfig copyWith({
    String? publicOrigin,
    int? chatUploadLimitMb,
    int? avatarUploadLimitMb,
  }) {
    return SyncChatConfig(
      apiBaseUrl: apiBaseUrl,
      socketUrl: socketUrl,
      publicOrigin: publicOrigin ?? this.publicOrigin,
      socketPath: socketPath,
      chatUploadLimitMb: chatUploadLimitMb ?? this.chatUploadLimitMb,
      avatarUploadLimitMb: avatarUploadLimitMb ?? this.avatarUploadLimitMb,
      firebaseApiKey: firebaseApiKey,
      firebaseAppId: firebaseAppId,
      firebaseMessagingSenderId: firebaseMessagingSenderId,
      firebaseProjectId: firebaseProjectId,
      firebaseIosApiKey: firebaseIosApiKey,
      firebaseIosAppId: firebaseIosAppId,
      firebaseIosBundleId: firebaseIosBundleId,
      appVersion: appVersion,
    );
  }

  bool get hasAndroidFirebaseConfig =>
      firebaseApiKey.trim().isNotEmpty &&
      firebaseAppId.trim().isNotEmpty &&
      firebaseMessagingSenderId.trim().isNotEmpty &&
      firebaseProjectId.trim().isNotEmpty;

  bool get hasIosFirebaseConfig =>
      firebaseIosApiKey.trim().isNotEmpty &&
      firebaseIosAppId.trim().isNotEmpty &&
      firebaseMessagingSenderId.trim().isNotEmpty &&
      firebaseProjectId.trim().isNotEmpty &&
      firebaseIosBundleId.trim().isNotEmpty;

  Uri apiUri(String path, {Map<String, dynamic>? queryParameters}) {
    final base = _validatedBase(apiBaseUrl, name: 'SYNCCHAT_API_BASE_URL');
    final cleanPath = path.startsWith('/') ? path.substring(1) : path;
    final basePath = base.path.endsWith('/') ? base.path : '${base.path}/';
    final uri = base.replace(path: '$basePath$cleanPath');

    if (queryParameters == null || queryParameters.isEmpty) return uri;
    return uri.replace(
      queryParameters: queryParameters.map(
        (key, value) => MapEntry(key, value?.toString() ?? ''),
      ),
    );
  }

  String channelInviteUrl(String? value) {
    final raw = value?.trim() ?? '';
    if (raw.isEmpty) return '';

    final marker = '/channel/+';
    final markerIndex = raw.indexOf(marker);
    if (markerIndex < 0) return raw;
    final token = raw.substring(markerIndex + marker.length).split(RegExp(r'[/?#]')).first.trim();
    if (token.isEmpty) return raw;

    final origin = Uri.tryParse(publicOrigin.trim());
    if (origin == null || !origin.hasScheme || origin.host.isEmpty) return raw;
    return origin
        .replace(
          path: '/chat',
          queryParameters: {'c': token},
          fragment: null,
        )
        .toString();
  }

  String resolveMediaUrl(String? value) {
    final raw = value?.trim() ?? '';
    if (raw.isEmpty) return '';

    // Protocol-relative public media is valid on the web. Native Image.network
    // needs an explicit scheme, so inherit the configured SyncChat scheme.
    if (raw.startsWith('//')) {
      return '${_socketOrigin().scheme}:$raw';
    }

    final parsed = Uri.tryParse(raw);
    if (parsed != null && parsed.hasScheme && parsed.host.isNotEmpty) {
      final localHost = parsed.host == 'localhost' ||
          parsed.host == '127.0.0.1' ||
          parsed.host == '::1';

      // Development/legacy payloads can contain localhost upload URLs. They
      // must point at the configured SyncChat origin on a physical device.
      if (localHost && parsed.path.startsWith('/uploads/')) {
        return _socketOrigin().replace(
          path: parsed.path,
          query: parsed.hasQuery ? parsed.query : null,
          fragment: parsed.hasFragment ? parsed.fragment : null,
        ).toString();
      }

      // Public storage/CDN/social avatar URLs are already usable by the native
      // client. Do not route arbitrary image URLs through /media/proxy because
      // that endpoint intentionally accepts configured SyncChat storage only.
      // Explicit backend proxy URLs remain valid here and are returned as-is.
      return raw;
    }

    if (raw.startsWith('/uploads/') || raw.startsWith('uploads/')) {
      final path = raw.startsWith('/') ? raw : '/$raw';
      return _socketOrigin().resolve(path).toString();
    }

    return raw;
  }

  Uri _socketOrigin() {
    final base = _validatedBase(socketUrl, name: 'SYNCCHAT_SOCKET_URL');
    return base.replace(path: '', query: null, fragment: null);
  }

  String get validatedSocketUrl =>
      _validatedBase(socketUrl, name: 'SYNCCHAT_SOCKET_URL').toString();

  static Uri _validatedBase(String value, {required String name}) {
    final uri = Uri.tryParse(value.trim());
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      throw StateError('$name must be an absolute http(s) URL.');
    }
    if (uri.scheme != 'http' && uri.scheme != 'https') {
      throw StateError('$name only supports http or https.');
    }
    return uri;
  }
}
