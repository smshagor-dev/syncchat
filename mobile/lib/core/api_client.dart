import 'dart:convert';

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
  })  : _config = config,
        _sessionStore = sessionStore,
        _httpClient = httpClient ?? http.Client();

  final SyncChatConfig _config;
  final SessionStore _sessionStore;
  final http.Client _httpClient;

  Future<ApiEnvelope> get(
    String path, {
    Map<String, dynamic>? query,
    bool authenticated = true,
  }) =>
      _send('GET', path, query: query, authenticated: authenticated);

  Future<ApiEnvelope> post(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    bool authenticated = true,
  }) =>
      _send(
        'POST',
        path,
        body: body,
        query: query,
        authenticated: authenticated,
      );

  Future<ApiEnvelope> put(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    bool authenticated = true,
  }) =>
      _send(
        'PUT',
        path,
        body: body,
        query: query,
        authenticated: authenticated,
      );

  Future<ApiEnvelope> patch(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    bool authenticated = true,
  }) =>
      _send(
        'PATCH',
        path,
        body: body,
        query: query,
        authenticated: authenticated,
      );

  Future<ApiEnvelope> delete(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    bool authenticated = true,
  }) =>
      _send(
        'DELETE',
        path,
        body: body,
        query: query,
        authenticated: authenticated,
      );

  Future<ApiEnvelope> _send(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    required bool authenticated,
  }) async {
    final uri = _config.apiUri(path, queryParameters: query);
    final headers = <String, String>{
      'accept': 'application/json',
      if (body != null) 'content-type': 'application/json; charset=utf-8',
    };

    if (authenticated) {
      final token = await _sessionStore.readAccessToken();
      if (token == null) {
        throw const ApiException(
          statusCode: 401,
          message: 'Authentication required',
        );
      }
      headers['authorization'] = 'Bearer $token';
    }

    final request = http.Request(method, uri)..headers.addAll(headers);
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
