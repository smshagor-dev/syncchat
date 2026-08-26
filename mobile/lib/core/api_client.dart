import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'app_config.dart';
import 'session_store.dart';

class ApiEnvelope {
  const ApiEnvelope({
    required this.statusCode,
    required this.success,
    required this.message,
    this.payload,
  });

  final int statusCode;
  final bool success;
  final String? message;
  final dynamic payload;

  factory ApiEnvelope.fromJson(Map<String, dynamic> json, int fallbackStatus) {
    return ApiEnvelope(
      statusCode: (json['code'] as num?)?.toInt() ?? fallbackStatus,
      success: json['success'] == true,
      message: json['message']?.toString(),
      payload: json['payload'],
    );
  }
}

class ApiBinaryResponse {
  const ApiBinaryResponse({
    required this.statusCode,
    required this.bytes,
    required this.headers,
  });

  final int statusCode;
  final Uint8List bytes;
  final Map<String, String> headers;

  String? get contentDisposition => headers['content-disposition'];

  String? get filename {
    final value = contentDisposition;
    if (value == null || value.isEmpty) return null;
    final match = RegExp(
      r'''filename\*?=(?:UTF-8''|["'])?([^"';]+)''',
      caseSensitive: false,
    ).firstMatch(value);
    return match?.group(1)?.trim();
  }
}

class ApiException implements Exception {
  const ApiException({
    required this.statusCode,
    required this.message,
    this.payload,
  });

  final int statusCode;
  final String message;
  final dynamic payload;

  bool get isUnauthorized => statusCode == 401;
  bool get isOffline => statusCode == 0;
  bool get isVerificationRequired =>
      statusCode == 403 && message.toLowerCase().contains('verification');

  @override
  String toString() => 'ApiException($statusCode): $message';
}

class ApiClient {
  ApiClient({
    required SyncChatConfig config,
    required SessionStore sessionStore,
    http.Client? httpClient,
  }) : _config = config,
       _sessionStore = sessionStore,
       _httpClient = httpClient ?? http.Client();

  final SyncChatConfig _config;
  final SessionStore _sessionStore;
  final http.Client _httpClient;
  Future<bool>? _refreshInFlight;

  Future<ApiEnvelope> get(
    String path, {
    Map<String, dynamic>? query,
    bool authenticated = true,
    Map<String, String>? headers,
  }) => _send(
    'GET',
    path,
    query: query,
    authenticated: authenticated,
    extraHeaders: headers,
  );

  Future<ApiEnvelope> post(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    bool authenticated = true,
    Map<String, String>? headers,
  }) => _send(
    'POST',
    path,
    body: body,
    query: query,
    authenticated: authenticated,
    extraHeaders: headers,
  );

  Future<ApiEnvelope> put(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    bool authenticated = true,
    Map<String, String>? headers,
  }) => _send(
    'PUT',
    path,
    body: body,
    query: query,
    authenticated: authenticated,
    extraHeaders: headers,
  );

  Future<ApiEnvelope> patch(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    bool authenticated = true,
    Map<String, String>? headers,
  }) => _send(
    'PATCH',
    path,
    body: body,
    query: query,
    authenticated: authenticated,
    extraHeaders: headers,
  );

  Future<ApiEnvelope> delete(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    bool authenticated = true,
    Map<String, String>? headers,
  }) => _send(
    'DELETE',
    path,
    body: body,
    query: query,
    authenticated: authenticated,
    extraHeaders: headers,
  );

  Future<bool> ensurePersistentSession() async {
    final access = await _sessionStore.readAccessToken();
    if (access == null || access.isEmpty) return false;
    try {
      final response = await _send(
        'POST',
        '/users/session/persist',
        authenticated: true,
        allowRefresh: false,
      );
      final payload = response.payload;
      if (payload is! Map) return false;
      await _storeSessionPair(Map<String, dynamic>.from(payload));
      return (await _sessionStore.readRefreshToken())?.isNotEmpty == true;
    } on ApiException {
      return false;
    }
  }

  Future<bool> refreshSession() {
    final active = _refreshInFlight;
    if (active != null) return active;
    final future = _refreshSessionOnce();
    _refreshInFlight = future;
    return future.whenComplete(() {
      if (identical(_refreshInFlight, future)) _refreshInFlight = null;
    });
  }

  Future<bool> _refreshSessionOnce() async {
    final refreshToken = (await _sessionStore.readRefreshToken())?.trim();
    if (refreshToken == null || refreshToken.isEmpty) return false;

    final uri = _config.apiUri('/users/session/refresh');
    final request = http.Request('POST', uri)
      ..headers.addAll({
        'accept': 'application/json',
        'content-type': 'application/json; charset=utf-8',
      })
      ..body = jsonEncode({'refreshToken': refreshToken});

    try {
      final response = await _sendRequest(request);
      final payload = response.payload;
      if (payload is! Map) return false;
      await _storeSessionPair(Map<String, dynamic>.from(payload));
      return true;
    } on ApiException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        await _sessionStore.clearSession();
      }
      return false;
    }
  }

  Future<void> _storeSessionPair(Map<String, dynamic> payload) async {
    final token = payload['token']?.toString().trim() ?? '';
    final refreshToken = payload['refreshToken']?.toString().trim() ?? '';
    if (token.isNotEmpty) await _sessionStore.writeAccessToken(token);
    if (refreshToken.isNotEmpty) {
      await _sessionStore.writeRefreshToken(refreshToken);
    }
  }

  Future<ApiBinaryResponse> download(
    String path, {
    String method = 'GET',
    Object? body,
    Map<String, dynamic>? query,
    bool authenticated = true,
    Map<String, String>? headers,
  }) async {
    var refreshed = false;
    while (true) {
      try {
        return await _downloadOnce(
          path,
          method: method,
          body: body,
          query: query,
          authenticated: authenticated,
          headers: headers,
        );
      } on ApiException catch (error) {
        if (authenticated &&
            !refreshed &&
            error.isUnauthorized &&
            await refreshSession()) {
          refreshed = true;
          continue;
        }
        rethrow;
      }
    }
  }

  Future<ApiBinaryResponse> _downloadOnce(
    String path, {
    required String method,
    Object? body,
    Map<String, dynamic>? query,
    required bool authenticated,
    Map<String, String>? headers,
  }) async {
    final uri = _config.apiUri(path, queryParameters: query);
    final requestHeaders = <String, String>{
      'accept': 'application/octet-stream, application/json',
      if (body != null) 'content-type': 'application/json; charset=utf-8',
      ...?headers,
    };
    if (authenticated) {
      requestHeaders['authorization'] = 'Bearer ${await _requireAccessToken()}';
    }

    final request = http.Request(method, uri)..headers.addAll(requestHeaders);
    if (body != null) request.body = jsonEncode(body);

    http.StreamedResponse streamed;
    try {
      streamed = await _httpClient.send(request);
    } on Exception catch (error) {
      throw ApiException(
        statusCode: 0,
        message: 'Unable to connect to SyncChat: $error',
      );
    }

    final bytes = Uint8List.fromList(await streamed.stream.toBytes());
    if (streamed.statusCode < 200 || streamed.statusCode >= 300) {
      String message = 'SyncChat download failed';
      dynamic payload;
      try {
        final decoded = jsonDecode(utf8.decode(bytes));
        if (decoded is Map<String, dynamic>) {
          message = decoded['message']?.toString() ?? message;
          payload = decoded['payload'];
        }
      } on Object {
        // Binary/non-JSON error body. Keep the controlled fallback message.
      }
      throw ApiException(
        statusCode: streamed.statusCode,
        message: message,
        payload: payload,
      );
    }

    return ApiBinaryResponse(
      statusCode: streamed.statusCode,
      bytes: bytes,
      headers: Map<String, String>.from(streamed.headers),
    );
  }

  Future<ApiEnvelope> multipart(
    String path, {
    required String fieldName,
    required String filePath,
    String? filename,
    Map<String, String>? fields,
    Map<String, dynamic>? query,
    bool authenticated = true,
    Map<String, String>? headers,
  }) async {
    var refreshed = false;
    while (true) {
      try {
        return await _multipartOnce(
          path,
          fieldName: fieldName,
          filePath: filePath,
          filename: filename,
          fields: fields,
          query: query,
          authenticated: authenticated,
          headers: headers,
        );
      } on ApiException catch (error) {
        if (authenticated &&
            !refreshed &&
            error.isUnauthorized &&
            await refreshSession()) {
          refreshed = true;
          continue;
        }
        rethrow;
      }
    }
  }

  Future<ApiEnvelope> _multipartOnce(
    String path, {
    required String fieldName,
    required String filePath,
    String? filename,
    Map<String, String>? fields,
    Map<String, dynamic>? query,
    required bool authenticated,
    Map<String, String>? headers,
  }) async {
    final uri = _config.apiUri(path, queryParameters: query);
    final request = http.MultipartRequest('POST', uri);
    request.headers['accept'] = 'application/json';
    if (headers != null) request.headers.addAll(headers);

    if (authenticated) {
      final token = await _requireAccessToken();
      request.headers['authorization'] = 'Bearer $token';
    }

    if (fields != null) request.fields.addAll(fields);
    request.files.add(
      await http.MultipartFile.fromPath(
        fieldName,
        filePath,
        filename: filename,
      ),
    );

    return _sendRequest(request);
  }

  Future<ApiEnvelope> _send(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    required bool authenticated,
    Map<String, String>? extraHeaders,
    bool allowRefresh = true,
  }) async {
    var refreshed = false;
    while (true) {
      final uri = _config.apiUri(path, queryParameters: query);
      final headers = <String, String>{
        'accept': 'application/json',
        if (body != null) 'content-type': 'application/json; charset=utf-8',
        ...?extraHeaders,
      };

      if (authenticated) {
        headers['authorization'] = 'Bearer ${await _requireAccessToken()}';
      }

      final request = http.Request(method, uri)..headers.addAll(headers);
      if (body != null) request.body = jsonEncode(body);

      try {
        return await _sendRequest(request);
      } on ApiException catch (error) {
        if (authenticated &&
            allowRefresh &&
            !refreshed &&
            error.isUnauthorized &&
            await refreshSession()) {
          refreshed = true;
          continue;
        }
        rethrow;
      }
    }
  }

  Future<String> _requireAccessToken() async {
    final token = (await _sessionStore.readAccessToken())?.trim();
    if (token == null || token.isEmpty) {
      throw const ApiException(
        statusCode: 401,
        message: 'Authentication required',
      );
    }
    return token;
  }

  Future<ApiEnvelope> _sendRequest(http.BaseRequest request) async {
    http.StreamedResponse streamed;
    try {
      streamed = await _httpClient.send(request);
    } on Exception catch (error) {
      throw ApiException(
        statusCode: 0,
        message: 'Unable to connect to SyncChat: $error',
      );
    }

    final responseBody = await streamed.stream.bytesToString();
    final decoded = _decodeEnvelope(responseBody, streamed.statusCode);

    if (streamed.statusCode < 200 ||
        streamed.statusCode >= 300 ||
        !decoded.success) {
      throw ApiException(
        statusCode: streamed.statusCode,
        message: decoded.message ?? 'SyncChat request failed',
        payload: decoded.payload,
      );
    }

    return decoded;
  }

  ApiEnvelope _decodeEnvelope(String body, int statusCode) {
    if (body.trim().isEmpty) {
      return ApiEnvelope(
        statusCode: statusCode,
        success: statusCode >= 200 && statusCode < 300,
        message: null,
      );
    }

    try {
      final decoded = jsonDecode(body);
      if (decoded is Map<String, dynamic>) {
        return ApiEnvelope.fromJson(decoded, statusCode);
      }
    } on FormatException {
      // Converted to a controlled API exception below.
    }

    throw ApiException(
      statusCode: statusCode,
      message: 'SyncChat returned an invalid JSON response.',
    );
  }

  void close() => _httpClient.close();
}
