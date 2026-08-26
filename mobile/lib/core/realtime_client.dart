import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import 'app_config.dart';
import 'session_store.dart';

enum RealtimeConnectionState {
  disconnected,
  connecting,
  connected,
  authenticationFailed,
}

class SocketAckException implements Exception {
  const SocketAckException(this.message);

  final String message;

  @override
  String toString() => message;
}

class RealtimeClient {
  RealtimeClient({
    required SyncChatConfig config,
    required SessionStore sessionStore,
  }) : _config = config,
       _sessionStore = sessionStore;

  final SyncChatConfig _config;
  final SessionStore _sessionStore;
  final _stateController = StreamController<RealtimeConnectionState>.broadcast(
    sync: true,
  );
  final Map<String, Set<void Function(dynamic)>> _listeners = {};

  io.Socket? _socket;
  RealtimeConnectionState _state = RealtimeConnectionState.disconnected;

  Stream<RealtimeConnectionState> get states => _stateController.stream;
  RealtimeConnectionState get state => _state;
  bool get isConnected => _socket?.connected == true;

  Future<void> connect() async {
    final token = await _sessionStore.readAccessToken();
    if (token == null || token.isEmpty) {
      _setState(RealtimeConnectionState.authenticationFailed);
      return;
    }

    _socket?.dispose();
    _setState(RealtimeConnectionState.connecting);

    final options = io.OptionBuilder()
        .setTransports(['websocket'])
        .setPath(_config.socketPath)
        .disableAutoConnect()
        .enableReconnection()
        .enableForceNew()
        .setReconnectionDelay(250)
        .setReconnectionDelayMax(1500)
        .setRandomizationFactor(.25)
        .setTimeout(8000)
        .setAuthFn((callback) {
          _sessionStore.readAccessToken().then((freshToken) {
            callback({'token': freshToken ?? ''});
          });
        })
        .build();

    final socket = io.io(_config.validatedSocketUrl, options);
    _socket = socket;

    for (final entry in _listeners.entries) {
      for (final handler in entry.value) {
        socket.on(entry.key, handler);
      }
    }

    socket.onConnect((_) {
      // The backend socket auth middleware derives the authoritative user id
      // from the access token and rewrites this payload. Emitting user/connect
      // joins the user's private socket room, updates presence/delivery state,
      // processes send-when-online messages, and activates same-account
      // session invalidation exactly like the web client.
      socket.emit('user/connect', '');
      _setState(RealtimeConnectionState.connected);
    });
    socket.onDisconnect((_) {
      if (_state != RealtimeConnectionState.authenticationFailed) {
        _setState(RealtimeConnectionState.disconnected);
      }
    });
    socket.onConnectError((error) {
      final code = _socketErrorCode(error);
      if (code == 'SOCKET_AUTH_INVALID' || code == 'SOCKET_AUTH_REQUIRED') {
        socket.disconnect();
        _setState(RealtimeConnectionState.authenticationFailed);
      }
    });

    socket.connect();
  }

  void on(String event, void Function(dynamic data) handler) {
    final handlers = _listeners.putIfAbsent(event, () => <void Function(dynamic)>{});
    if (!handlers.add(handler)) return;
    _socket?.on(event, handler);
  }

  void off(String event, [void Function(dynamic data)? handler]) {
    if (handler == null) {
      _listeners.remove(event);
      _socket?.off(event);
      return;
    }

    final handlers = _listeners[event];
    handlers?.remove(handler);
    if (handlers?.isEmpty == true) _listeners.remove(event);
    _socket?.off(event, handler);
  }

  void emit(String event, [dynamic payload]) {
    final socket = _socket;
    if (socket == null || !socket.connected) {
      throw const SocketAckException('Socket is not connected.');
    }
    socket.emit(event, payload);
  }

  Future<dynamic> emitWithAck(
    String event,
    dynamic payload, {
    Duration timeout = const Duration(seconds: 8),
  }) async {
    final socket = _socket;
    if (socket == null || !socket.connected) {
      throw const SocketAckException('Socket is not connected.');
    }

    final completer = Completer<dynamic>();
    Timer? timer;
    timer = Timer(timeout, () {
      if (!completer.isCompleted) {
        completer.completeError(
          TimeoutException('Socket acknowledgement timed out.', timeout),
        );
      }
    });

    socket.emitWithAck(
      event,
      payload,
      ack: (data) {
        timer?.cancel();
        if (!completer.isCompleted) completer.complete(data);
      },
    );

    return completer.future;
  }

  void disconnect() {
    _socket?.disconnect();
    _setState(RealtimeConnectionState.disconnected);
  }

  Future<void> dispose() async {
    _socket?.dispose();
    _socket = null;
    _listeners.clear();
    _setState(RealtimeConnectionState.disconnected);
    await _stateController.close();
  }

  String? _socketErrorCode(dynamic error) {
    if (error is Map) {
      final direct = error['code']?.toString();
      if (direct != null && direct.isNotEmpty) return direct;
      final data = error['data'];
      if (data is Map) return data['code']?.toString();
    }

    final text = error?.toString() ?? '';
    if (text.contains('SOCKET_AUTH_INVALID')) return 'SOCKET_AUTH_INVALID';
    if (text.contains('SOCKET_AUTH_REQUIRED')) return 'SOCKET_AUTH_REQUIRED';
    return null;
  }

  void _setState(RealtimeConnectionState next) {
    if (_state == next) return;
    _state = next;
    if (!_stateController.isClosed) _stateController.add(next);
  }
}
