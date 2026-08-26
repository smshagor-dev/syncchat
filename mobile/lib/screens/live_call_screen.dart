import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:livekit_client/livekit_client.dart' as lk;

import '../core/api_client.dart';
import '../core/app_scope.dart';
import '../core/calling_repository.dart';
import '../theme.dart';
import '../widgets.dart';

Future<void> openOutgoingCall(
  BuildContext context, {
  required Map<String, dynamic> inbox,
  required String name,
  required bool video,
}) async {
  await Navigator.of(context).push(
    MaterialPageRoute<void>(
      fullscreenDialog: true,
      builder: (_) => LiveCallScreen(inbox: inbox, name: name, video: video),
    ),
  );
}

class LiveCallScreen extends StatefulWidget {
  const LiveCallScreen({
    super.key,
    required this.name,
    required this.video,
    this.inbox,
    this.incomingCall,
    this.autoAccept = false,
  });

  final Map<String, dynamic>? inbox;
  final Map<String, dynamic>? incomingCall;
  final String name;
  final bool video;
  final bool autoAccept;

  bool get incoming => incomingCall != null;

  @override
  State<LiveCallScreen> createState() => _LiveCallScreenState();
}

class _LiveCallScreenState extends State<LiveCallScreen> {
  final RTCVideoRenderer _localRenderer = RTCVideoRenderer();
  final RTCVideoRenderer _remoteRenderer = RTCVideoRenderer();
  final Map<String, RTCPeerConnection> _peers = {};
  final Map<String, List<RTCIceCandidate>> _queuedIce = {};

  late CallingRepository calling;
  CallRuntimeConfig? config;
  Map<String, dynamic>? currentUser;
  MediaStream? localStream;
  lk.Room? liveKitRoom;
  Timer? durationTimer;
  Timer? ringTimer;

  bool initialized = false;
  bool callingBound = false;
  bool joined = false;
  bool connected = false;
  bool muted = false;
  bool speaker = true;
  bool cameraOff = false;
  bool sfuMode = false;
  bool closing = false;
  bool frontCamera = true;
  int seconds = 0;
  String status = 'Preparing call…';
  String? callId;
  Offset? selfVideoOffset;

  String get roomId =>
      widget.incomingCall?['roomId']?.toString() ??
      widget.inbox?['roomId']?.toString() ??
      '';

  String get roomType =>
      widget.incomingCall?['roomType']?.toString() ??
      widget.inbox?['roomType']?.toString() ??
      'private';

  String get userId => currentUser?['_id']?.toString() ?? '';
  String get callerId => widget.incomingCall?['fromUserId']?.toString() ?? '';
  bool get group => roomType == 'group';
  bool get groupHost => group && !widget.incoming;

  List<String> get recipients {
    final owners = widget.inbox?['ownersId'];
    if (owners is List) {
      return owners
          .map((item) => item.toString())
          .where((id) => id.isNotEmpty && id != userId)
          .toList(growable: false);
    }
    final incomingRecipients = widget.incomingCall?['recipientsId'];
    if (incomingRecipients is List) {
      return incomingRecipients
          .map((item) => item.toString())
          .where((id) => id.isNotEmpty && id != userId)
          .toList(growable: false);
    }
    return callerId.isEmpty ? const [] : [callerId];
  }

  @override
  void initState() {
    super.initState();
    callId = widget.incomingCall?['callId']?.toString();
    status = widget.incoming ? 'Incoming call' : 'Preparing call…';
    WidgetsBinding.instance.addPostFrameCallback((_) => _initialize());
  }

  @override
  void dispose() {
    _unbindEvents();
    durationTimer?.cancel();
    ringTimer?.cancel();
    _disposeMedia();
    _localRenderer.dispose();
    _remoteRenderer.dispose();
    super.dispose();
  }

  Future<void> _initialize() async {
    calling = context.services.calling;
    await _localRenderer.initialize();
    await _remoteRenderer.initialize();
    _bindEvents();
    callingBound = true;

    try {
      final results = await Future.wait<dynamic>([
        calling.currentUser(),
        calling.runtimeConfig(refresh: true),
        calling.ensureRealtime(),
      ]);
      currentUser = Map<String, dynamic>.from(results[0] as Map);
      config = results[1] as CallRuntimeConfig;
      if (!_allowed()) {
        throw const ApiException(
          statusCode: 403,
          message: 'This call type is disabled by the administrator.',
        );
      }
      if (!mounted) return;
      setState(() {
        initialized = true;
        status = widget.incoming
            ? (widget.video ? 'Incoming video call' : 'Incoming voice call')
            : 'Preparing call…';
      });
      if (!widget.incoming) {
        await _startOutgoing();
      } else if (widget.autoAccept) {
        await _accept();
      }
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        initialized = true;
        status = _messageFor(error);
      });
    }
  }

  bool _allowed() {
    final value = config;
    if (value == null) return false;
    final participants = group ? recipients.length + 1 : 2;
    return value.allows(
      video: widget.video,
      group: group,
      participants: participants,
    );
  }

  Future<void> _startOutgoing() async {
    if (roomId.isEmpty || userId.isEmpty) {
      throw const ApiException(
        statusCode: 400,
        message: 'Call room or current user is missing.',
      );
    }
    if (!group) await _ensureP2pMedia();
    setState(() => status = group ? 'Creating group call…' : 'Ringing…');
    await calling.emit('call/start', {
      'roomId': roomId,
      'roomType': roomType,
      'fromUserId': userId,
      'mediaType': widget.video ? 'video' : 'audio',
      'fromName': currentUser?['fullname']?.toString() ?? '',
      'fromUsername': currentUser?['username']?.toString() ?? '',
      'recipientsId': recipients,
    });
    if (!group) {
      await calling.emit('call/join', {
        'roomId': roomId,
        'userId': userId,
        'mediaType': widget.video ? 'video' : 'audio',
      });
      joined = true;
    }
  }

  Future<void> _accept() async {
    if (!initialized || userId.isEmpty || callId == null) return;
    try {
      setState(() => status = 'Connecting…');
      if (group) {
        await calling.emit('call/accept', {
          'callId': callId,
          'roomId': roomId,
          'userId': userId,
          'fromUserId': callerId,
        });
        await _prepareGroupMedia(callId!);
      } else {
        await _ensureP2pMedia();
        await calling.emit('call/join', {
          'callId': callId,
          'roomId': roomId,
          'userId': userId,
          'mediaType': widget.video ? 'video' : 'audio',
        });
        joined = true;
        await calling.emit('call/accept', {
          'callId': callId,
          'roomId': roomId,
          'userId': userId,
          'fromUserId': callerId,
        });
      }
      if (mounted) setState(() {});
    } on Object catch (error) {
      if (mounted) setState(() => status = _messageFor(error));
    }
  }

  Future<void> _reject() async {
    if (callId != null && userId.isNotEmpty) {
      await calling
          .emit('call/reject', {
            'callId': callId,
            'roomId': roomId,
            'fromUserId': userId,
            'toUserId': callerId,
          })
          .catchError((_) {});
    }
    await _close();
  }

  Future<void> _end() async {
    if (callId != null && userId.isNotEmpty) {
      await calling
          .emit(connected || widget.incoming ? 'call/end' : 'call/cancel', {
            'callId': callId,
            'roomId': roomId,
            'userId': userId,
            'reason': connected ? 'ended' : 'cancelled',
          })
          .catchError((_) {});
    }
    await _close();
  }

  Future<void> _close() async {
    if (closing) return;
    closing = true;
    durationTimer?.cancel();
    ringTimer?.cancel();
    if (joined && userId.isNotEmpty) {
      await calling
          .emit('call/leave', {
            'callId': callId,
            'roomId': roomId,
            'userId': userId,
          })
          .catchError((_) {});
    }
    await _disposeMedia();
    final nativeCallId = callId;
    if (nativeCallId != null && nativeCallId.isNotEmpty) {
      await context.services.nativeCallPush
          .endNativeUi(nativeCallId)
          .catchError((_) {});
    }
    if (!mounted) return;
    Navigator.of(context).maybePop();
  }

  Future<void> _ensureP2pMedia() async {
    if (localStream != null) return;
    final audio = config?.audioProfile ?? const <String, dynamic>{};
    final video = config?.videoProfile ?? const <String, dynamic>{};
    final stream = await navigator.mediaDevices.getUserMedia({
      'audio': {
        'echoCancellation': audio['echoCancellation'] != false,
        'noiseSuppression': audio['noiseSuppression'] != false,
        'autoGainControl': audio['autoGainControl'] != false,
      },
      'video': widget.video
          ? {
              'facingMode': 'user',
              'width': {'ideal': (video['width'] as num?)?.toInt() ?? 1280},
              'height': {'ideal': (video['height'] as num?)?.toInt() ?? 720},
              'frameRate': {
                'ideal': (video['frameRate'] as num?)?.toInt() ?? 30,
              },
            }
          : false,
    });
    localStream = stream;
    _localRenderer.srcObject = stream;
    await Helper.setSpeakerphoneOn(speaker);
    if (mounted) setState(() {});
  }

  Future<RTCPeerConnection> _ensurePeer(String peerId) async {
    final existing = _peers[peerId];
    if (existing != null) return existing;
    await _ensureP2pMedia();
    final pc = await createPeerConnection({
      'iceServers': config?.iceServers ?? const [],
      'iceTransportPolicy': config?.iceTransportPolicy ?? 'all',
    });
    final stream = localStream!;
    for (final track in stream.getTracks()) {
      await pc.addTrack(track, stream);
    }
    pc.onIceCandidate = (candidate) {
      final candidateText = candidate.candidate;
      if (candidateText == null || candidateText.isEmpty) return;
      calling
          .emit('call/signal', {
            'callId': callId,
            'roomId': roomId,
            'fromUserId': userId,
            'toUserId': peerId,
            'signal': {'type': 'ice', 'candidate': candidate.toMap()},
          })
          .catchError((_) {});
    };
    pc.onTrack = (event) {
      if (event.streams.isNotEmpty) {
        _remoteRenderer.srcObject = event.streams.first;
      }
      if (mounted) {
        setState(() {
          connected = true;
          status = 'Connected';
        });
        _startDuration();
      }
    };
    pc.onConnectionState = (state) {
      if (!mounted) return;
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
        setState(() {
          connected = true;
          status = 'Connected';
        });
        _startDuration();
      } else if (state ==
          RTCPeerConnectionState.RTCPeerConnectionStateDisconnected) {
        setState(() => status = 'Reconnecting…');
      } else if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed) {
        setState(() => status = 'Connection failed');
        pc.restartIce();
      }
    };
    _peers[peerId] = pc;
    return pc;
  }

  Future<void> _offer(String peerId) async {
    final pc = await _ensurePeer(peerId);
    final offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await calling.emit('call/signal', {
      'callId': callId,
      'roomId': roomId,
      'fromUserId': userId,
      'toUserId': peerId,
      'signal': {'type': 'offer', 'sdp': offer.sdp},
    });
  }

  Future<void> _onSignal(dynamic raw) async {
    if (raw is! Map || !_matches(raw)) return;
    final fromUserId = raw['fromUserId']?.toString() ?? '';
    final signal = raw['signal'];
    if (fromUserId.isEmpty || signal is! Map) return;
    final nextCallId = raw['callId']?.toString();
    if ((callId == null || callId!.isEmpty) && nextCallId?.isNotEmpty == true) {
      callId = nextCallId;
    }
    try {
      final pc = await _ensurePeer(fromUserId);
      final type = signal['type']?.toString();
      if (type == 'offer') {
        await pc.setRemoteDescription(
          RTCSessionDescription(signal['sdp']?.toString(), 'offer'),
        );
        await _flushIce(fromUserId, pc);
        final answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await calling.emit('call/signal', {
          'callId': callId,
          'roomId': roomId,
          'fromUserId': userId,
          'toUserId': fromUserId,
          'signal': {'type': 'answer', 'sdp': answer.sdp},
        });
      } else if (type == 'answer') {
        await pc.setRemoteDescription(
          RTCSessionDescription(signal['sdp']?.toString(), 'answer'),
        );
        await _flushIce(fromUserId, pc);
      } else if (type == 'ice' && signal['candidate'] is Map) {
        final map = Map<String, dynamic>.from(signal['candidate'] as Map);
        final candidate = RTCIceCandidate(
          map['candidate']?.toString(),
          map['sdpMid']?.toString(),
          (map['sdpMLineIndex'] as num?)?.toInt(),
        );
        if (await pc.getRemoteDescription() != null) {
          await pc.addCandidate(candidate);
        } else {
          (_queuedIce[fromUserId] ??= []).add(candidate);
        }
      }
    } on Object catch (error) {
      if (mounted) setState(() => status = _messageFor(error));
    }
  }

  Future<void> _flushIce(String peerId, RTCPeerConnection pc) async {
    final queued = _queuedIce.remove(peerId) ?? const <RTCIceCandidate>[];
    for (final candidate in queued) {
      await pc.addCandidate(candidate);
    }
  }

  Future<void> _prepareGroupMedia(String canonicalCallId) async {
    final session = await calling.sessionMedia(canonicalCallId);
    if (session['mediaMode']?.toString() == 'sfu') {
      await _connectLiveKit(canonicalCallId);
    } else {
      sfuMode = false;
      await _ensureP2pMedia();
      await calling.emit('call/join', {
        'callId': canonicalCallId,
        'roomId': roomId,
        'userId': userId,
        'mediaType': widget.video ? 'video' : 'audio',
      });
      joined = true;
      if (mounted) setState(() {});
    }
  }

  Future<void> _connectLiveKit(String canonicalCallId) async {
    if (liveKitRoom != null) return;
    final credentials = await calling.sfuCredentials(canonicalCallId);
    final url = credentials['url']?.toString() ?? '';
    final token = credentials['token']?.toString() ?? '';
    if (url.isEmpty || token.isEmpty) {
      throw const ApiException(
        statusCode: 500,
        message: 'Group media credentials are unavailable.',
      );
    }
    final room = lk.Room(
      roomOptions: lk.RoomOptions(
        adaptiveStream: credentials['adaptiveStream'] != false,
        dynacast: credentials['dynacast'] != false,
      ),
    );
    room.addListener(_onLiveKitChanged);
    liveKitRoom = room;
    sfuMode = true;
    setState(() => status = 'Connecting group media…');
    await room.prepareConnection(url, token);
    await room.connect(url, token);
    await room.localParticipant?.setMicrophoneEnabled(true);
    if (widget.video) {
      await room.localParticipant?.setCameraEnabled(true);
    }
    await calling.emit('call/join', {
      'callId': canonicalCallId,
      'roomId': roomId,
      'userId': userId,
      'mediaType': widget.video ? 'video' : 'audio',
    });
    joined = true;
    if (mounted) setState(() {});
  }

  void _onLiveKitChanged() {
    if (!mounted) return;
    final room = liveKitRoom;
    setState(() {
      if (room != null && room.remoteParticipants.isNotEmpty) {
        connected = true;
        status = 'Connected';
      }
    });
    if (connected) _startDuration();
  }

  void _onStarted(dynamic raw) {
    if (raw is! Map || raw['roomId']?.toString() != roomId) return;
    final id = raw['callId']?.toString() ?? '';
    if (id.isEmpty || (callId != null && callId != id)) return;
    callId = id;
    _startRingTimer();
    if (group && !widget.incoming) {
      _prepareGroupMedia(id).catchError((Object error) {
        if (mounted) setState(() => status = _messageFor(error));
      });
    }
    if (mounted) setState(() {});
  }

  void _onUserJoined(dynamic raw) {
    if (raw is! Map || !_matches(raw) || !joined || sfuMode) return;
    final peerId = raw['userId']?.toString() ?? '';
    if (peerId.isEmpty || peerId == userId) return;
    _offer(peerId).catchError((Object error) {
      if (mounted) setState(() => status = _messageFor(error));
    });
  }

  void _onUserLeft(dynamic raw) {
    if (raw is! Map || !_matches(raw)) return;
    final peerId = raw['userId']?.toString() ?? '';
    final peer = _peers.remove(peerId);
    _queuedIce.remove(peerId);
    peer?.close();
    if (!group && connected) {
      _finish('Call ended');
    } else if (mounted) {
      setState(() {});
    }
  }

  void _onAccepted(dynamic raw) {
    if (raw is! Map || !_matches(raw)) return;
    if (mounted) setState(() => status = 'Participant accepted. Connecting…');
  }

  void _onConnected(dynamic raw) {
    if (raw is! Map || !_matches(raw)) return;
    ringTimer?.cancel();
    if (mounted) {
      setState(() {
        connected = true;
        status = 'Connected';
      });
    }
    _startDuration();
    final nativeCallId = callId;
    if (nativeCallId != null && nativeCallId.isNotEmpty) {
      context.services.nativeCallPush
          .markConnected(nativeCallId)
          .catchError((_) {});
    }
  }

  void _onError(dynamic raw) {
    if (raw is Map && !_matches(raw, allowMissingRoom: true)) return;
    final message = raw is Map
        ? raw['message']?.toString() ?? 'Call failed.'
        : 'Call failed.';
    if (mounted) setState(() => status = message);
  }

  void _finishFromEvent(String label, dynamic raw) {
    if (raw is Map && !_matches(raw, allowMissingRoom: true)) return;
    _finish(label);
  }

  void _finish(String label) {
    ringTimer?.cancel();
    durationTimer?.cancel();
    if (!mounted || closing) return;
    setState(() => status = label);
    Future<void>.delayed(const Duration(milliseconds: 650), _close);
  }

  bool _matches(Map raw, {bool allowMissingRoom = false}) {
    final rawRoom = raw['roomId']?.toString() ?? '';
    if (!allowMissingRoom && rawRoom.isNotEmpty && rawRoom != roomId) {
      return false;
    }
    if (rawRoom.isNotEmpty && rawRoom != roomId) return false;
    final rawCall = raw['callId']?.toString() ?? '';
    return callId == null ||
        callId!.isEmpty ||
        rawCall.isEmpty ||
        rawCall == callId;
  }

  void _bindEvents() {
    calling.on('call/started', _onStarted);
    calling.on('call/user-joined', _onUserJoined);
    calling.on('call/signal', _onSignal);
    calling.on('call/user-left', _onUserLeft);
    calling.on('call/connected', _onConnected);
    calling.on('call/accepted', _onAccepted);
    calling.on('call/error', _onError);
    calling.on('call/ended', _onEnded);
    calling.on('call/rejected', _onRejected);
    calling.on('call/busy', _onBusy);
    calling.on('call/missed', _onMissed);
    calling.on('call/cancelled', _onCancelled);
    calling.on('call/moderation', _onModeration);
    calling.on('call/moderation-applied', _onModerationApplied);
  }

  void _unbindEvents() {
    if (!callingBound) return;
    calling.off('call/started', _onStarted);
    calling.off('call/user-joined', _onUserJoined);
    calling.off('call/signal', _onSignal);
    calling.off('call/user-left', _onUserLeft);
    calling.off('call/connected', _onConnected);
    calling.off('call/accepted', _onAccepted);
    calling.off('call/error', _onError);
    calling.off('call/ended', _onEnded);
    calling.off('call/rejected', _onRejected);
    calling.off('call/busy', _onBusy);
    calling.off('call/missed', _onMissed);
    calling.off('call/cancelled', _onCancelled);
    calling.off('call/moderation', _onModeration);
    calling.off('call/moderation-applied', _onModerationApplied);
    callingBound = false;
  }

  Future<void> _forceMuteFromHost() async {
    if (sfuMode) {
      await liveKitRoom?.localParticipant?.setMicrophoneEnabled(false);
    } else {
      for (final track
          in localStream?.getAudioTracks() ?? const <MediaStreamTrack>[]) {
        track.enabled = false;
      }
    }
    if (mounted) {
      setState(() {
        muted = true;
        status = 'Muted by group call host';
      });
    }
  }

  void _onModeration(dynamic raw) {
    if (raw is! Map || !_matches(raw)) return;
    final action = raw['action']?.toString();
    if (action == 'mute') {
      _forceMuteFromHost().catchError((_) {});
    } else if (action == 'remove') {
      _finish('Removed from group call');
    }
  }

  void _onModerationApplied(dynamic raw) {
    if (raw is! Map || !_matches(raw) || !groupHost || !mounted) return;
    final action = raw['action']?.toString() ?? '';
    final target = raw['targetUserId']?.toString() ?? '';
    if (action.isEmpty || target.isEmpty) return;
    setState(() {
      status = action == 'remove' ? 'Participant removed' : 'Participant muted';
    });
  }

  void _onEnded(dynamic raw) => _finishFromEvent('Call ended', raw);
  void _onRejected(dynamic raw) => _finishFromEvent('Call rejected', raw);
  void _onBusy(dynamic raw) => _finishFromEvent('User is busy', raw);
  void _onMissed(dynamic raw) =>
      _finishFromEvent(widget.incoming ? 'Missed call' : 'No answer', raw);
  void _onCancelled(dynamic raw) => _finishFromEvent('Call cancelled', raw);

  void _startRingTimer() {
    ringTimer?.cancel();
    final timeout = config?.ringingTimeoutSec ?? 45;
    ringTimer = Timer(Duration(seconds: timeout), () {
      if (!connected && !closing) _finish('No answer');
    });
  }

  void _startDuration() {
    if (durationTimer != null) return;
    durationTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => seconds += 1);
    });
  }

  Future<void> _toggleMute() async {
    final next = !muted;
    if (sfuMode) {
      await liveKitRoom?.localParticipant?.setMicrophoneEnabled(!next);
    } else {
      for (final track
          in localStream?.getAudioTracks() ?? const <MediaStreamTrack>[]) {
        track.enabled = !next;
      }
    }
    if (mounted) setState(() => muted = next);
  }

  Future<void> _toggleCamera() async {
    if (!widget.video) return;
    final next = !cameraOff;
    if (sfuMode) {
      await liveKitRoom?.localParticipant?.setCameraEnabled(!next);
    } else {
      for (final track
          in localStream?.getVideoTracks() ?? const <MediaStreamTrack>[]) {
        track.enabled = !next;
      }
    }
    if (mounted) setState(() => cameraOff = next);
  }

  Future<void> _toggleSpeaker() async {
    final next = !speaker;
    await Helper.setSpeakerphoneOn(next);
    if (mounted) setState(() => speaker = next);
  }

  Future<void> _switchCamera() async {
    if (!widget.video || sfuMode) return;
    final tracks = localStream?.getVideoTracks() ?? const <MediaStreamTrack>[];
    if (tracks.isEmpty) return;
    await Helper.switchCamera(tracks.first, null, localStream);
    if (mounted) setState(() => frontCamera = !frontCamera);
  }

  Future<void> _disposeMedia() async {
    final room = liveKitRoom;
    if (room != null) {
      room.removeListener(_onLiveKitChanged);
      await room.disconnect();
      liveKitRoom = null;
    }
    for (final peer in _peers.values) {
      await peer.close();
      await peer.dispose();
    }
    _peers.clear();
    _queuedIce.clear();
    final stream = localStream;
    if (stream != null) {
      for (final track in stream.getTracks()) {
        await track.stop();
      }
      await stream.dispose();
      localStream = null;
    }
    _localRenderer.srcObject = null;
    _remoteRenderer.srcObject = null;
  }

  List<String> get _moderatableParticipantIds {
    final ids = <String>{};
    ids.addAll(_peers.keys);
    final room = liveKitRoom;
    if (room != null) {
      ids.addAll(
        room.remoteParticipants.values
            .map((participant) => participant.identity)
            .where((id) => id.isNotEmpty),
      );
    }
    ids.remove(userId);
    return ids.toList(growable: false);
  }

  Future<void> _moderateParticipant(String targetUserId, String action) async {
    final id = callId;
    if (!groupHost || id == null || id.isEmpty || targetUserId.isEmpty) return;
    await calling.emit('call/moderate', {
      'callId': id,
      'userId': userId,
      'targetUserId': targetUserId,
      'action': action,
    });
  }

  Future<void> _showModerationSheet() async {
    final participants = _moderatableParticipantIds;
    if (participants.isEmpty || !mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF101B23),
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Manage participants',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 10),
              ...participants.map(
                (participantId) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: SyncAvatar(name: participantId, radius: 18),
                  title: Text(
                    participantId.length > 18
                        ? '${participantId.substring(0, 8)}…${participantId.substring(participantId.length - 6)}'
                        : participantId,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  trailing: Wrap(
                    spacing: 4,
                    children: [
                      IconButton(
                        tooltip: 'Mute participant',
                        icon: const Icon(
                          Icons.mic_off_rounded,
                          color: Colors.white70,
                        ),
                        onPressed: () async {
                          await _moderateParticipant(participantId, 'mute');
                          if (sheetContext.mounted) Navigator.pop(sheetContext);
                        },
                      ),
                      IconButton(
                        tooltip: 'Remove participant',
                        icon: const Icon(
                          Icons.person_remove_rounded,
                          color: SyncColors.danger,
                        ),
                        onPressed: () async {
                          await _moderateParticipant(participantId, 'remove');
                          if (sheetContext.mounted) Navigator.pop(sheetContext);
                        },
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _messageFor(Object error) {
    if (error is ApiException) return error.message;
    return error.toString().replaceFirst('Exception: ', '');
  }

  String get durationLabel {
    final min = (seconds ~/ 60).toString().padLeft(2, '0');
    final sec = (seconds % 60).toString().padLeft(2, '0');
    return '$min:$sec';
  }

  List<lk.VideoTrack> _liveKitTracks() {
    final room = liveKitRoom;
    if (room == null) return const [];
    final tracks = <lk.VideoTrack>[];
    final localParticipant = room.localParticipant;
    if (localParticipant != null) {
      for (final publication in localParticipant.videoTrackPublications) {
        final track = publication.track;
        if (track != null) tracks.add(track);
      }
    }
    for (final participant in room.remoteParticipants.values) {
      for (final publication in participant.videoTrackPublications) {
        final track = publication.track;
        if (track != null) tracks.add(track);
      }
    }
    return tracks;
  }

  @override
  Widget build(BuildContext context) {
    final incomingWaiting = widget.incoming && !joined && !connected;
    return Scaffold(
      backgroundColor: const Color(0xFF061018),
      body: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(child: _mediaBackdrop()),
            Positioned(
              left: 14,
              right: 14,
              top: 12,
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 11,
                      vertical: 7,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0x990D1A21),
                      borderRadius: BorderRadius.circular(99),
                      border: Border.all(color: Colors.white12),
                    ),
                    child: const Row(
                      children: [
                        Icon(
                          Icons.lock_rounded,
                          color: SyncColors.success,
                          size: 15,
                        ),
                        SizedBox(width: 6),
                        Text(
                          'Encrypted media transport',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Spacer(),
                  if (widget.video && !sfuMode)
                    _CallControl(
                      icon: Icons.cameraswitch_outlined,
                      tooltip: 'Switch camera',
                      onTap: _switchCamera,
                      compact: true,
                    ),
                ],
              ),
            ),
            if (!widget.video ||
                (!connected && _remoteRenderer.srcObject == null && !sfuMode))
              Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SyncAvatar(name: widget.name, radius: 66),
                    const SizedBox(height: 20),
                    Text(
                      widget.name,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 26,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 7),
                    Text(
                      connected ? durationLabel : status,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white60,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (group && sfuMode) ...[
                      const SizedBox(height: 8),
                      Text(
                        '${(liveKitRoom?.remoteParticipants.length ?? 0) + 1} participants · LiveKit SFU',
                        style: const TextStyle(
                          color: Colors.white38,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            Positioned(
              left: 12,
              right: 12,
              bottom: 20,
              child: incomingWaiting ? _incomingControls() : _activeControls(),
            ),
            if (!initialized)
              const Positioned.fill(
                child: ColoredBox(
                  color: Color(0x66000000),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _mediaBackdrop() {
    if (!widget.video) {
      return const DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF102A3A), Color(0xFF071018)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
      );
    }

    if (sfuMode) {
      final tracks = _liveKitTracks();
      if (tracks.isEmpty) {
        return const ColoredBox(color: Color(0xFF071018));
      }
      return GridView.builder(
        padding: const EdgeInsets.fromLTRB(8, 58, 8, 104),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: tracks.length == 1 ? 1 : 2,
          crossAxisSpacing: 6,
          mainAxisSpacing: 6,
          childAspectRatio: .78,
        ),
        itemCount: tracks.length,
        itemBuilder: (_, index) => ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: lk.VideoTrackRenderer(tracks[index]),
        ),
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        const pipWidth = 112.0;
        const pipHeight = 154.0;
        const edge = 8.0;
        const topGuard = 58.0;
        const bottomGuard = 96.0;
        final maxLeft = (constraints.maxWidth - pipWidth - edge)
            .clamp(edge, constraints.maxWidth)
            .toDouble();
        final maxTop = (constraints.maxHeight - pipHeight - bottomGuard)
            .clamp(topGuard, constraints.maxHeight)
            .toDouble();
        final initial = Offset(maxLeft, topGuard);
        final raw = selfVideoOffset ?? initial;
        final left = raw.dx.clamp(edge, maxLeft).toDouble();
        final top = raw.dy.clamp(topGuard, maxTop).toDouble();

        return Stack(
          fit: StackFit.expand,
          children: [
            if (_remoteRenderer.srcObject != null)
              RTCVideoView(
                _remoteRenderer,
                objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
              )
            else
              const ColoredBox(color: Color(0xFF071018)),
            if (_localRenderer.srcObject != null)
              Positioned(
                left: left,
                top: top,
                width: pipWidth,
                height: pipHeight,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onDoubleTap: () => _switchCamera(),
                  onPanUpdate: (details) {
                    final nextLeft = (left + details.delta.dx)
                        .clamp(edge, maxLeft)
                        .toDouble();
                    final nextTop = (top + details.delta.dy)
                        .clamp(topGuard, maxTop)
                        .toDouble();
                    setState(() => selfVideoOffset = Offset(nextLeft, nextTop));
                  },
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: const Color(0xFF0D1A21),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: Colors.white24, width: 1.2),
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0x55000000),
                          blurRadius: 12,
                          offset: Offset(0, 5),
                        ),
                      ],
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(17),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          RTCVideoView(
                            _localRenderer,
                            mirror: frontCamera,
                            objectFit:
                                RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                          ),
                          Positioned(
                            right: 6,
                            top: 6,
                            child: Material(
                              color: const Color(0x88000000),
                              shape: const CircleBorder(),
                              child: InkWell(
                                customBorder: const CircleBorder(),
                                onTap: _switchCamera,
                                child: const SizedBox(
                                  width: 32,
                                  height: 32,
                                  child: Icon(
                                    Icons.cameraswitch_rounded,
                                    color: Colors.white,
                                    size: 18,
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const Positioned(
                            left: 7,
                            bottom: 6,
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color: Color(0x77000000),
                                borderRadius: BorderRadius.all(Radius.circular(8)),
                              ),
                              child: Padding(
                                padding: EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                                child: Text(
                                  'You',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }

  Widget _incomingControls() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _CallControl(
          icon: Icons.call_end_rounded,
          background: SyncColors.danger,
          tooltip: 'Decline',
          onTap: _reject,
          size: 64,
        ),
        const SizedBox(width: 34),
        _CallControl(
          icon: widget.video ? Icons.videocam_rounded : Icons.call_rounded,
          background: SyncColors.success,
          tooltip: 'Accept',
          onTap: _accept,
          size: 64,
        ),
      ],
    );
  }

  Widget _activeControls() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _CallControl(
          icon: muted ? Icons.mic_off_rounded : Icons.mic_rounded,
          active: muted,
          tooltip: muted ? 'Unmute' : 'Mute',
          onTap: _toggleMute,
        ),
        const SizedBox(width: 10),
        _CallControl(
          icon: speaker ? Icons.volume_up_rounded : Icons.hearing_rounded,
          active: speaker,
          tooltip: 'Speaker',
          onTap: _toggleSpeaker,
        ),
        if (widget.video) ...[
          const SizedBox(width: 10),
          _CallControl(
            icon: cameraOff
                ? Icons.videocam_off_rounded
                : Icons.videocam_rounded,
            active: cameraOff,
            tooltip: cameraOff ? 'Camera on' : 'Camera off',
            onTap: _toggleCamera,
          ),
        ],
        if (groupHost && _moderatableParticipantIds.isNotEmpty) ...[
          const SizedBox(width: 10),
          _CallControl(
            icon: Icons.manage_accounts_rounded,
            tooltip: 'Manage participants',
            onTap: _showModerationSheet,
          ),
        ],
        const SizedBox(width: 14),
        _CallControl(
          icon: Icons.call_end_rounded,
          background: SyncColors.danger,
          tooltip: 'End call',
          onTap: _end,
          size: 62,
        ),
      ],
    );
  }
}

class _CallControl extends StatelessWidget {
  const _CallControl({
    required this.icon,
    required this.onTap,
    required this.tooltip,
    this.background = const Color(0x2BFFFFFF),
    this.size = 52,
    this.active = false,
    this.compact = false,
  });

  final IconData icon;
  final FutureOr<void> Function() onTap;
  final String tooltip;
  final Color background;
  final double size;
  final bool active;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final dimension = compact ? 42.0 : size;
    return Tooltip(
      message: tooltip,
      child: Material(
        color: active ? Colors.white : background,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: () => onTap(),
          child: SizedBox(
            width: dimension,
            height: dimension,
            child: Icon(
              icon,
              color: active ? const Color(0xFF071018) : Colors.white,
              size: compact ? 20 : 22,
            ),
          ),
        ),
      ),
    );
  }
}
