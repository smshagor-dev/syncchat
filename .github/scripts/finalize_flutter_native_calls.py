from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    path.write_text(text.replace(old, new, 1))


root = Path("mobile")
call = root / "lib/screens/live_call_screen.dart"

replace_once(
    call,
    """    this.inbox,\n    this.incomingCall,\n  });\n\n  final Map<String, dynamic>? inbox;\n  final Map<String, dynamic>? incomingCall;\n  final String name;\n  final bool video;\n""",
    """    this.inbox,\n    this.incomingCall,\n    this.autoAccept = false,\n  });\n\n  final Map<String, dynamic>? inbox;\n  final Map<String, dynamic>? incomingCall;\n  final String name;\n  final bool video;\n  final bool autoAccept;\n""",
    "live call auto accept constructor",
)

replace_once(
    call,
    """  bool get group => roomType == 'group';\n\n  List<String> get recipients {\n""",
    """  bool get group => roomType == 'group';\n  bool get groupHost => group && !widget.incoming;\n\n  List<String> get recipients {\n""",
    "live call group host",
)

replace_once(
    call,
    """      if (!widget.incoming) await _startOutgoing();\n""",
    """      if (!widget.incoming) {\n        await _startOutgoing();\n      } else if (widget.autoAccept) {\n        await _accept();\n      }\n""",
    "live call automatic native accept",
)

replace_once(
    call,
    """    await _disposeMedia();\n    if (!mounted) return;\n    Navigator.of(context).maybePop();\n""",
    """    await _disposeMedia();\n    final nativeCallId = callId;\n    if (nativeCallId != null && nativeCallId.isNotEmpty) {\n      await context.services.nativeCallPush.endNativeUi(nativeCallId).catchError((_) {});\n    }\n    if (!mounted) return;\n    Navigator.of(context).maybePop();\n""",
    "live call native ui cleanup",
)

replace_once(
    call,
    """    _startDuration();\n  }\n\n  void _onError(dynamic raw) {\n""",
    """    _startDuration();\n    final nativeCallId = callId;\n    if (nativeCallId != null && nativeCallId.isNotEmpty) {\n      context.services.nativeCallPush.markConnected(nativeCallId).catchError((_) {});\n    }\n  }\n\n  void _onError(dynamic raw) {\n""",
    "live call native connected state",
)

replace_once(
    call,
    """    calling.on('call/cancelled', _onCancelled);\n  }\n""",
    """    calling.on('call/cancelled', _onCancelled);\n    calling.on('call/moderation', _onModeration);\n    calling.on('call/moderation-applied', _onModerationApplied);\n  }\n""",
    "live call moderation bind",
)

replace_once(
    call,
    """    calling.off('call/cancelled', _onCancelled);\n    callingBound = false;\n  }\n\n  void _onEnded(dynamic raw) => _finishFromEvent('Call ended', raw);\n""",
    """    calling.off('call/cancelled', _onCancelled);\n    calling.off('call/moderation', _onModeration);\n    calling.off('call/moderation-applied', _onModerationApplied);\n    callingBound = false;\n  }\n\n  Future<void> _forceMuteFromHost() async {\n    if (sfuMode) {\n      await liveKitRoom?.localParticipant?.setMicrophoneEnabled(false);\n    } else {\n      for (final track in localStream?.getAudioTracks() ?? const <MediaStreamTrack>[]) {\n        track.enabled = false;\n      }\n    }\n    if (mounted) {\n      setState(() {\n        muted = true;\n        status = 'Muted by group call host';\n      });\n    }\n  }\n\n  void _onModeration(dynamic raw) {\n    if (raw is! Map || !_matches(raw)) return;\n    final action = raw['action']?.toString();\n    if (action == 'mute') {\n      _forceMuteFromHost().catchError((_) {});\n    } else if (action == 'remove') {\n      _finish('Removed from group call');\n    }\n  }\n\n  void _onModerationApplied(dynamic raw) {\n    if (raw is! Map || !_matches(raw) || !groupHost || !mounted) return;\n    final action = raw['action']?.toString() ?? '';\n    final target = raw['targetUserId']?.toString() ?? '';\n    if (action.isEmpty || target.isEmpty) return;\n    setState(() {\n      status = action == 'remove'\n          ? 'Participant removed'\n          : 'Participant muted';\n    });\n  }\n\n  void _onEnded(dynamic raw) => _finishFromEvent('Call ended', raw);\n""",
    "live call moderation handlers",
)

replace_once(
    call,
    """  String _messageFor(Object error) {\n""",
    """  List<String> get _moderatableParticipantIds {\n    final ids = <String>{};\n    ids.addAll(_peers.keys);\n    final room = liveKitRoom;\n    if (room != null) {\n      ids.addAll(\n        room.remoteParticipants.values\n            .map((participant) => participant.identity)\n            .where((id) => id.isNotEmpty),\n      );\n    }\n    ids.remove(userId);\n    return ids.toList(growable: false);\n  }\n\n  Future<void> _moderateParticipant(String targetUserId, String action) async {\n    final id = callId;\n    if (!groupHost || id == null || id.isEmpty || targetUserId.isEmpty) return;\n    await calling.emit('call/moderate', {\n      'callId': id,\n      'userId': userId,\n      'targetUserId': targetUserId,\n      'action': action,\n    });\n  }\n\n  Future<void> _showModerationSheet() async {\n    final participants = _moderatableParticipantIds;\n    if (participants.isEmpty || !mounted) return;\n    await showModalBottomSheet<void>(\n      context: context,\n      backgroundColor: const Color(0xFF101B23),\n      showDragHandle: true,\n      builder: (sheetContext) => SafeArea(\n        child: Padding(\n          padding: const EdgeInsets.fromLTRB(16, 4, 16, 18),\n          child: Column(\n            mainAxisSize: MainAxisSize.min,\n            crossAxisAlignment: CrossAxisAlignment.stretch,\n            children: [\n              const Text(\n                'Manage participants',\n                style: TextStyle(\n                  color: Colors.white,\n                  fontSize: 18,\n                  fontWeight: FontWeight.w900,\n                ),\n              ),\n              const SizedBox(height: 10),\n              ...participants.map(\n                (participantId) => ListTile(\n                  contentPadding: EdgeInsets.zero,\n                  leading: SyncAvatar(name: participantId, radius: 18),\n                  title: Text(\n                    participantId.length > 18\n                        ? '${participantId.substring(0, 8)}…${participantId.substring(participantId.length - 6)}'\n                        : participantId,\n                    style: const TextStyle(\n                      color: Colors.white,\n                      fontWeight: FontWeight.w700,\n                    ),\n                  ),\n                  trailing: Wrap(\n                    spacing: 4,\n                    children: [\n                      IconButton(\n                        tooltip: 'Mute participant',\n                        icon: const Icon(Icons.mic_off_rounded, color: Colors.white70),\n                        onPressed: () async {\n                          await _moderateParticipant(participantId, 'mute');\n                          if (sheetContext.mounted) Navigator.pop(sheetContext);\n                        },\n                      ),\n                      IconButton(\n                        tooltip: 'Remove participant',\n                        icon: const Icon(Icons.person_remove_rounded, color: SyncColors.danger),\n                        onPressed: () async {\n                          await _moderateParticipant(participantId, 'remove');\n                          if (sheetContext.mounted) Navigator.pop(sheetContext);\n                        },\n                      ),\n                    ],\n                  ),\n                ),\n              ),\n            ],\n          ),\n        ),\n      ),\n    );\n  }\n\n  String _messageFor(Object error) {\n""",
    "live call moderation sheet",
)

replace_once(
    call,
    """        if (widget.video) ...[\n          const SizedBox(width: 10),\n          _CallControl(\n            icon: cameraOff ? Icons.videocam_off_rounded : Icons.videocam_rounded,\n            active: cameraOff,\n            tooltip: cameraOff ? 'Camera on' : 'Camera off',\n            onTap: _toggleCamera,\n          ),\n        ],\n        const SizedBox(width: 14),\n""",
    """        if (widget.video) ...[\n          const SizedBox(width: 10),\n          _CallControl(\n            icon: cameraOff ? Icons.videocam_off_rounded : Icons.videocam_rounded,\n            active: cameraOff,\n            tooltip: cameraOff ? 'Camera on' : 'Camera off',\n            onTap: _toggleCamera,\n          ),\n        ],\n        if (groupHost && _moderatableParticipantIds.isNotEmpty) ...[\n          const SizedBox(width: 10),\n          _CallControl(\n            icon: Icons.manage_accounts_rounded,\n            tooltip: 'Manage participants',\n            onTap: _showModerationSheet,\n          ),\n        ],\n        const SizedBox(width: 14),\n""",
    "live call host moderation control",
)

# Avoid a duplicate native incoming screen while the foreground Socket.IO layer is active.
native_push = root / "lib/core/native_call_push.dart"
text = native_push.read_text()
text = text.replace(
    "  StreamSubscription<RemoteMessage>? _foregroundMessageSubscription;\n",
    "",
)
foreground_block = """      _foregroundMessageSubscription = FirebaseMessaging.onMessage.listen(\n        (message) async {\n          final payload = Map<String, dynamic>.from(message.data);\n          if (payload['type']?.toString() == 'incoming_call') {\n            await showIncomingCall(payload);\n          }\n        },\n      );\n"""
text = text.replace(foreground_block, "")
text = text.replace(
    "  bool _started = false;\n  bool _disposed = false;\n",
    "  final Set<String> _locallyEndingCalls = <String>{};\n  bool _started = false;\n  bool _disposed = false;\n",
)
text = text.replace(
    """    if (event is CallEventActionCallEnded) {\n      await _end(payloadFromParams(event.callKitParams));\n      return;\n    }\n""",
    """    if (event is CallEventActionCallEnded) {\n      final payload = payloadFromParams(event.callKitParams);\n      final id = payload['callId']?.toString() ?? '';\n      if (id.isNotEmpty && _locallyEndingCalls.remove(id)) return;\n      await _end(payload);\n      return;\n    }\n""",
)
text = text.replace(
    """  Future<void> endNativeUi(String callId) async {\n    if (callId.trim().isEmpty) return;\n    await FlutterCallkitIncoming.endCall(callId);\n  }\n""",
    """  Future<void> endNativeUi(String callId) async {\n    final id = callId.trim();\n    if (id.isEmpty) return;\n    _locallyEndingCalls.add(id);\n    try {\n      await FlutterCallkitIncoming.endCall(id);\n    } on Object {\n      _locallyEndingCalls.remove(id);\n      rethrow;\n    }\n  }\n""",
)
text = text.replace(
    "duration: timeout.clamp(10, 120) * 1000,",
    "duration: timeout.clamp(10, 120).toInt() * 1000,",
)
text = text.replace(
    "    await _foregroundMessageSubscription?.cancel();\n",
    "",
)
native_push.write_text(text)

# Android full-screen incoming-call requirements.
manifest = root / "android/app/src/main/AndroidManifest.xml"
text = manifest.read_text()
for permission in [
    "android.permission.INTERNET",
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.USE_FULL_SCREEN_INTENT",
    "android.permission.WAKE_LOCK",
    "android.permission.VIBRATE",
]:
    if permission not in text:
        marker = "    <uses-feature android:name=\"android.hardware.camera\" android:required=\"false\" />"
        text = text.replace(
            marker,
            f'    <uses-permission android:name="{permission}" />\\n{marker}',
            1,
        )
text = text.replace('android:launchMode="singleTop"', 'android:launchMode="singleInstance"')
manifest.write_text(text)

# PushKit/background call modes.
info = root / "ios/Runner/Info.plist"
text = info.read_text()
if "\t\t<string>voip</string>" not in text:
    text = text.replace(
        "\t\t<string>audio</string>\n\t</array>",
        "\t\t<string>audio</string>\n\t\t<string>voip</string>\n\t\t<string>remote-notification</string>\n\t</array>",
        1,
    )
info.write_text(text)

# PushKit -> CallKit bridge for terminated/background iOS calls.
app_delegate = root / "ios/Runner/AppDelegate.swift"
app_delegate.write_text('''import Flutter\nimport UIKit\nimport CallKit\nimport AVFAudio\nimport PushKit\nimport flutter_callkit_incoming\n\n@main\n@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate, PKPushRegistryDelegate, CallkitIncomingAppDelegate {\n  private var voipRegistry: PKPushRegistry?\n  private var pendingVoipToken: String?\n\n  override func application(\n    _ application: UIApplication,\n    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n  ) -> Bool {\n    let registry = PKPushRegistry(queue: .main)\n    registry.delegate = self\n    registry.desiredPushTypes = [.voIP]\n    voipRegistry = registry\n    return super.application(application, didFinishLaunchingWithOptions: launchOptions)\n  }\n\n  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {\n    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)\n    if let token = pendingVoipToken {\n      SwiftFlutterCallkitIncomingPlugin.sharedInstance?.setDevicePushTokenVoIP(token)\n    }\n  }\n\n  func pushRegistry(_ registry: PKPushRegistry, didUpdate credentials: PKPushCredentials, for type: PKPushType) {\n    let token = credentials.token.map { String(format: "%02x", $0) }.joined()\n    pendingVoipToken = token\n    SwiftFlutterCallkitIncomingPlugin.sharedInstance?.setDevicePushTokenVoIP(token)\n  }\n\n  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {\n    pendingVoipToken = nil\n    SwiftFlutterCallkitIncomingPlugin.sharedInstance?.setDevicePushTokenVoIP("")\n  }\n\n  func pushRegistry(\n    _ registry: PKPushRegistry,\n    didReceiveIncomingPushWith payload: PKPushPayload,\n    for type: PKPushType,\n    completion: @escaping () -> Void\n  ) {\n    guard type == .voIP else {\n      completion()\n      return\n    }\n\n    let raw = payload.dictionaryPayload\n    let callId = raw["callId"] as? String ?? ""\n    guard !callId.isEmpty else {\n      completion()\n      return\n    }\n    let fromName = raw["fromName"] as? String ?? ""\n    let fromUsername = raw["fromUsername"] as? String ?? ""\n    let caller = !fromName.isEmpty ? fromName : (!fromUsername.isEmpty ? "@\\(fromUsername)" : "SyncChat caller")\n    let handle = !fromUsername.isEmpty ? "@\\(fromUsername)" : (raw["fromUserId"] as? String ?? caller)\n    let isVideo = (raw["mediaType"] as? String ?? "audio") == "video"\n\n    var extra: [String: Any] = [:]\n    for (key, value) in raw {\n      extra[String(describing: key)] = value\n    }\n    let data = flutter_callkit_incoming.Data(\n      id: callId,\n      nameCaller: caller,\n      handle: handle,\n      type: isVideo ? 1 : 0\n    )\n    data.extra = extra\n    data.supportsVideo = isVideo\n    SwiftFlutterCallkitIncomingPlugin.sharedInstance?.showCallkitIncoming(data, fromPushKit: true) {\n      completion()\n    }\n  }\n\n  func onAccept(_ call: Call, _ action: CXAnswerCallAction) {\n    action.fulfill()\n  }\n\n  func onDecline(_ call: Call, _ action: CXEndCallAction) {\n    action.fulfill()\n  }\n\n  func onEnd(_ call: Call, _ action: CXEndCallAction) {\n    action.fulfill()\n  }\n\n  func onTimeOut(_ call: Call) {}\n\n  func didActivateAudioSession(_ audioSession: AVAudioSession) {}\n\n  func didDeactivateAudioSession(_ audioSession: AVAudioSession) {}\n\n  func providerDidReset() {}\n}\n''')

# Keep generated Flutter state out of source control.
gitignore = Path(".gitignore")
text = gitignore.read_text()
flutter_ignores = """\n# Flutter generated state\nmobile/.dart_tool/\nmobile/.flutter-plugins\nmobile/.flutter-plugins-dependencies\nmobile/build/\n"""
if "mobile/.dart_tool/" not in text:
    gitignore.write_text(text.rstrip() + "\n" + flutter_ignores)

# Keep the deployment requirements discoverable without embedding provider secrets.
doc = root / "FUNCTIONAL_PARITY.md"
text = doc.read_text()
section = '''\n\n## Native incoming-call wake\n\n- Android background/terminated incoming calls use FCM data pushes plus full-screen CallKit-style UI.\n- iOS background/terminated incoming calls use PushKit VoIP pushes and system CallKit.\n- Native token registration uses `/settings/push/native/register`; provider private keys stay server-side.\n- Android client Firebase values are supplied at build time with `SYNCCHAT_FIREBASE_API_KEY`, `SYNCCHAT_FIREBASE_APP_ID`, `SYNCCHAT_FIREBASE_MESSAGING_SENDER_ID`, and `SYNCCHAT_FIREBASE_PROJECT_ID` dart-defines.\n- iOS release signing must enable Push Notifications and Voice over IP background capability for the production bundle identifier.\n- The durable backend `callId` is preserved from push -> native answer -> Socket.IO/WebRTC/LiveKit join.\n- Group-call hosts can mute or remove participants through the existing `call/moderate` contract.\n'''
if "## Native incoming-call wake" not in text:
    doc.write_text(text.rstrip() + section)
