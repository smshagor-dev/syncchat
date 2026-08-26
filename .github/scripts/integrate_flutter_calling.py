from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)


root = Path("mobile")
call_path = root / "lib/screens/live_call_screen.dart"
chat_path = root / "lib/screens/live_chat_room_screen.dart"

call = call_path.read_text()
call = replace_once(
    call,
    "  bool initialized = false;\n  bool joined = false;",
    "  bool initialized = false;\n  bool callingBound = false;\n  bool joined = false;",
    "calling bound flag",
)
call = replace_once(
    call,
    "    _bindEvents();\n\n    try {",
    "    _bindEvents();\n    callingBound = true;\n\n    try {",
    "calling event bind state",
)
call = replace_once(
    call,
    "    await room.localParticipant.setMicrophoneEnabled(true);",
    "    await room.localParticipant?.setMicrophoneEnabled(true);",
    "livekit mic nullable",
)
call = replace_once(
    call,
    "      await room.localParticipant.setCameraEnabled(true);",
    "      await room.localParticipant?.setCameraEnabled(true);",
    "livekit camera nullable",
)
call = replace_once(
    call,
    "      await liveKitRoom?.localParticipant.setMicrophoneEnabled(!next);",
    "      await liveKitRoom?.localParticipant?.setMicrophoneEnabled(!next);",
    "livekit toggle mic nullable",
)
call = replace_once(
    call,
    "      await liveKitRoom?.localParticipant.setCameraEnabled(!next);",
    "      await liveKitRoom?.localParticipant?.setCameraEnabled(!next);",
    "livekit toggle camera nullable",
)
call = replace_once(
    call,
    """  void _unbindEvents() {
    if (!initialized && !closing) return;""",
    """  void _unbindEvents() {
    if (!callingBound) return;""",
    "calling safe unbind",
)
call = replace_once(
    call,
    """    calling.off('call/cancelled', _onCancelled);
  }

  void _onEnded""",
    """    calling.off('call/cancelled', _onCancelled);
    callingBound = false;
  }

  void _onEnded""",
    "calling unbind completion",
)
call = replace_once(
    call,
    """    final tracks = <lk.VideoTrack>[];
    for (final publication in room.localParticipant.videoTrackPublications) {
      final track = publication.track;
      if (track != null) tracks.add(track);
    }
    for (final participant in room.remoteParticipants.values) {""",
    """    final tracks = <lk.VideoTrack>[];
    final localParticipant = room.localParticipant;
    if (localParticipant != null) {
      for (final publication in localParticipant.videoTrackPublications) {
        final track = publication.track;
        if (track != null) tracks.add(track);
      }
    }
    for (final participant in room.remoteParticipants.values) {""",
    "livekit local tracks nullable",
)
call = replace_once(
    call,
    "${liveKitRoom?.remoteParticipants.length ?? 0 + 1} participants · LiveKit SFU",
    "${(liveKitRoom?.remoteParticipants.length ?? 0) + 1} participants · LiveKit SFU",
    "livekit participant count",
)
call_path.write_text(call)

chat = chat_path.read_text()
chat = replace_once(
    chat,
    "import 'forward_message_sheet.dart';\nimport 'voice_note_widgets.dart';",
    "import 'forward_message_sheet.dart';\nimport 'live_call_screen.dart';\nimport 'voice_note_widgets.dart';",
    "chat call import",
)
chat = replace_once(
    chat,
    """              e2eeEnabled: e2eeEnabled,
              onSecurity: _showE2eeSheet,
            ),""",
    """              e2eeEnabled: e2eeEnabled,
              onAudioCall: () {
                openOutgoingCall(
                  context,
                  inbox: effectiveInbox,
                  name: widget.name,
                  video: false,
                );
              },
              onVideoCall: () {
                openOutgoingCall(
                  context,
                  inbox: effectiveInbox,
                  name: widget.name,
                  video: true,
                );
              },
              onSecurity: _showE2eeSheet,
            ),""",
    "chat header call callbacks",
)
chat = replace_once(
    chat,
    """    required this.typingText,
    required this.e2eeEnabled,
    required this.onSecurity,
  });

  final String name;
  final Map<String, dynamic> inbox;
  final String typingText;
  final bool e2eeEnabled;
  final VoidCallback onSecurity;""",
    """    required this.typingText,
    required this.e2eeEnabled,
    required this.onAudioCall,
    required this.onVideoCall,
    required this.onSecurity,
  });

  final String name;
  final Map<String, dynamic> inbox;
  final String typingText;
  final bool e2eeEnabled;
  final VoidCallback onAudioCall;
  final VoidCallback onVideoCall;
  final VoidCallback onSecurity;""",
    "room header call fields",
)
chat = replace_once(
    chat,
    """          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.videocam_outlined),
          ),
          IconButton(onPressed: () {}, icon: const Icon(Icons.call_outlined)),""",
    """          IconButton(
            tooltip: 'Video call',
            onPressed: onVideoCall,
            icon: const Icon(Icons.videocam_outlined),
          ),
          IconButton(
            tooltip: 'Voice call',
            onPressed: onAudioCall,
            icon: const Icon(Icons.call_outlined),
          ),""",
    "room header call buttons",
)
chat_path.write_text(chat)

manifest = root / "android/app/src/main/AndroidManifest.xml"
if manifest.exists():
    text = manifest.read_text()
    marker = '<manifest xmlns:android="http://schemas.android.com/apk/res/android">'
    permissions = '''<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.CHANGE_NETWORK_STATE" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />'''
    if 'android.permission.RECORD_AUDIO' not in text:
        text = replace_once(text, marker, permissions, "android calling permissions")
    manifest.write_text(text)

android_gradle = root / "android/app/build.gradle.kts"
if android_gradle.exists():
    text = android_gradle.read_text()
    if 'maxOf(flutter.minSdkVersion, 23)' not in text:
        text = text.replace(
            'minSdk = flutter.minSdkVersion',
            'minSdk = maxOf(flutter.minSdkVersion, 23)',
        )
    android_gradle.write_text(text)

info = root / "ios/Runner/Info.plist"
if info.exists():
    text = info.read_text()
    if '<key>NSCameraUsageDescription</key>' not in text:
        additions = '''\t<key>NSCameraUsageDescription</key>
\t<string>SyncChat uses the camera for video calls.</string>
\t<key>NSMicrophoneUsageDescription</key>
\t<string>SyncChat uses the microphone for voice and video calls.</string>
\t<key>UIBackgroundModes</key>
\t<array>
\t\t<string>audio</string>
\t</array>
'''
        text = replace_once(text, '</dict>', additions + '</dict>', "ios calling permissions")
    info.write_text(text)

podfile = root / "ios/Podfile"
if podfile.exists():
    text = podfile.read_text()
    if re.search(r"^platform :ios,", text, flags=re.MULTILINE):
        text = re.sub(
            r"^platform :ios, ['\"][0-9.]+['\"]",
            "platform :ios, '12.1'",
            text,
            count=1,
            flags=re.MULTILINE,
        )
    else:
        text = "platform :ios, '12.1'\n" + text
    if "ONLY_ACTIVE_ARCH'] = 'YES'" not in text:
        needle = "      flutter_additional_ios_build_settings(target)"
        replacement = needle + "\n      target.build_configurations.each do |config|\n        config.build_settings['ONLY_ACTIVE_ARCH'] = 'YES'\n      end"
        text = replace_once(text, needle, replacement, "ios active arch workaround")
    podfile.write_text(text)
