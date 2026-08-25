class SyncChatConfig {
  const SyncChatConfig({
    required this.apiBaseUrl,
    required this.socketUrl,
    this.socketPath = '/socket.io',
    this.chatUploadLimitMb = 100,
    this.avatarUploadLimitMb = 10,
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

    return const SyncChatConfig(
      apiBaseUrl: apiBaseUrl,
      socketUrl: socketUrl,
    );
  }

  final String apiBaseUrl;
  final String socketUrl;
  final String socketPath;
  final int chatUploadLimitMb;
  final int avatarUploadLimitMb;

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
