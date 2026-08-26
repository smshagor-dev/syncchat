import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

import '../theme.dart';

class VoiceNoteDraft {
  const VoiceNoteDraft({
    required this.path,
    required this.durationSeconds,
  });

  final String path;
  final int durationSeconds;

  String get filename => path.split(Platform.pathSeparator).last;

  Future<void> delete() async {
    try {
      final file = File(path);
      if (await file.exists()) await file.delete();
    } on FileSystemException {
      // Temp cleanup is best effort.
    }
  }
}

Future<VoiceNoteDraft?> showVoiceRecorderSheet(BuildContext context) {
  return showModalBottomSheet<VoiceNoteDraft>(
    context: context,
    isScrollControlled: true,
    isDismissible: false,
    enableDrag: false,
    builder: (_) => const _VoiceRecorderSheet(),
  );
}

class _VoiceRecorderSheet extends StatefulWidget {
  const _VoiceRecorderSheet();

  @override
  State<_VoiceRecorderSheet> createState() => _VoiceRecorderSheetState();
}

class _VoiceRecorderSheetState extends State<_VoiceRecorderSheet> {
  final recorder = AudioRecorder();
  StreamSubscription<Amplitude>? amplitudeSubscription;
  Timer? timer;

  bool preparing = true;
  bool recording = false;
  bool paused = false;
  bool finishing = false;
  String? error;
  String? path;
  int seconds = 0;
  double amplitude = .18;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  @override
  void dispose() {
    timer?.cancel();
    amplitudeSubscription?.cancel();
    unawaited(recorder.dispose());
    super.dispose();
  }

  Future<void> _start() async {
    try {
      if (!await recorder.hasPermission()) {
        throw Exception('Microphone permission denied or unavailable.');
      }
      final directory = await getTemporaryDirectory();
      final filePath = '${directory.path}${Platform.pathSeparator}'
          'voice-${DateTime.now().millisecondsSinceEpoch}.m4a';
      await recorder.start(
        const RecordConfig(
          encoder: AudioEncoder.aacLc,
          bitRate: 64000,
          sampleRate: 44100,
          numChannels: 1,
          autoGain: true,
          echoCancel: true,
          noiseSuppress: true,
        ),
        path: filePath,
      );
      amplitudeSubscription = recorder
          .onAmplitudeChanged(const Duration(milliseconds: 120))
          .listen((sample) {
        if (!mounted || paused) return;
        // Typical dBFS values are negative. Map roughly -60..0 dB to 0..1.
        final normalized = ((sample.current + 60) / 60).clamp(0.12, 1.0);
        setState(() => amplitude = normalized.toDouble());
      });
      if (!mounted) return;
      setState(() {
        path = filePath;
        preparing = false;
        recording = true;
        error = null;
      });
      _startTimer();
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        preparing = false;
        recording = false;
        error = failure.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  void _startTimer() {
    timer?.cancel();
    timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && recording && !paused) setState(() => seconds += 1);
    });
  }

  Future<void> _togglePause() async {
    if (!recording || finishing) return;
    try {
      if (paused) {
        await recorder.resume();
        if (!mounted) return;
        setState(() => paused = false);
        _startTimer();
      } else {
        await recorder.pause();
        timer?.cancel();
        if (!mounted) return;
        setState(() {
          paused = true;
          amplitude = .18;
        });
      }
    } on Object catch (failure) {
      if (mounted) {
        setState(() => error = failure.toString().replaceFirst('Exception: ', ''));
      }
    }
  }

  Future<void> _cancel() async {
    if (finishing) return;
    setState(() => finishing = true);
    timer?.cancel();
    amplitudeSubscription?.cancel();
    try {
      await recorder.cancel();
    } on Object {
      final filePath = path;
      if (filePath != null) {
        try {
          final file = File(filePath);
          if (await file.exists()) await file.delete();
        } on FileSystemException {
          // Best effort.
        }
      }
    }
    if (mounted) Navigator.pop(context);
  }

  Future<void> _send() async {
    if (!recording || finishing) return;
    setState(() => finishing = true);
    timer?.cancel();
    amplitudeSubscription?.cancel();
    try {
      final recordedPath = await recorder.stop();
      if (!mounted) return;
      final resolvedPath = recordedPath ?? path;
      if (resolvedPath == null || resolvedPath.isEmpty) {
        throw Exception('Voice recording could not be saved.');
      }
      final file = File(resolvedPath);
      if (!await file.exists() || await file.length() == 0) {
        throw Exception('Voice recording is empty.');
      }
      Navigator.pop(
        context,
        VoiceNoteDraft(
          path: resolvedPath,
          durationSeconds: math.max(1, seconds),
        ),
      );
    } on Object catch (failure) {
      if (!mounted) return;
      setState(() {
        finishing = false;
        error = failure.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Voice message',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Cancel',
                    onPressed: finishing ? null : _cancel,
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
                decoration: BoxDecoration(
                  color: context.softPanel,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: context.border),
                ),
                child: Column(
                  children: [
                    Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: recording
                            ? SyncColors.sky.withValues(alpha: .14)
                            : context.panel,
                      ),
                      child: Icon(
                        paused ? Icons.pause_rounded : Icons.mic_rounded,
                        color: SyncColors.sky,
                        size: 31,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      _duration(seconds),
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                    const SizedBox(height: 14),
                    SizedBox(
                      height: 44,
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: List.generate(24, (index) {
                          final phase = .58 + ((index * 7) % 13) / 20;
                          final level = paused ? .18 : (amplitude * phase).clamp(.16, 1.0);
                          return Expanded(
                            child: Align(
                              alignment: Alignment.center,
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 110),
                                margin: const EdgeInsets.symmetric(horizontal: 1.2),
                                height: 7 + (32 * level),
                                decoration: BoxDecoration(
                                  color: SyncColors.sky.withValues(alpha: .82),
                                  borderRadius: BorderRadius.circular(99),
                                ),
                              ),
                            ),
                          );
                        }),
                      ),
                    ),
                    if (preparing) ...[
                      const SizedBox(height: 12),
                      const LinearProgressIndicator(minHeight: 2),
                      const SizedBox(height: 8),
                      const Text('Preparing microphone...'),
                    ],
                    if (error != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: SyncColors.danger,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: recording && !finishing ? _togglePause : null,
                      icon: Icon(paused ? Icons.play_arrow_rounded : Icons.pause_rounded),
                      label: Text(paused ? 'Resume' : 'Pause'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: recording && !finishing ? _send : null,
                      icon: finishing
                          ? const SizedBox.square(
                              dimension: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.send_rounded),
                      label: const Text('Send'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class VoiceNotePlayer extends StatefulWidget {
  const VoiceNotePlayer({super.key, required this.file});

  final Map<String, dynamic> file;

  @override
  State<VoiceNotePlayer> createState() => _VoiceNotePlayerState();
}

class _VoiceNotePlayerState extends State<VoiceNotePlayer> {
  static const rates = [1.0, 1.5, 2.0];

  final player = AudioPlayer();
  StreamSubscription<Duration>? positionSubscription;
  StreamSubscription<Duration>? durationSubscription;
  StreamSubscription<void>? completeSubscription;
  StreamSubscription<PlayerState>? stateSubscription;

  Duration position = Duration.zero;
  Duration duration = Duration.zero;
  bool playing = false;
  bool loaded = false;
  int rateIndex = 0;

  String get url => widget.file['url']?.toString() ?? '';

  @override
  void initState() {
    super.initState();
    final fallback = (widget.file['duration'] as num?)?.round() ?? 0;
    if (fallback > 0) duration = Duration(seconds: fallback);
    positionSubscription = player.onPositionChanged.listen((value) {
      if (mounted) setState(() => position = value);
    });
    durationSubscription = player.onDurationChanged.listen((value) {
      if (mounted && value > Duration.zero) setState(() => duration = value);
    });
    completeSubscription = player.onPlayerComplete.listen((_) {
      if (!mounted) return;
      setState(() {
        playing = false;
        position = Duration.zero;
      });
      player.seek(Duration.zero);
    });
    stateSubscription = player.onPlayerStateChanged.listen((state) {
      if (!mounted) return;
      setState(() => playing = state == PlayerState.playing);
    });
  }

  @override
  void dispose() {
    positionSubscription?.cancel();
    durationSubscription?.cancel();
    completeSubscription?.cancel();
    stateSubscription?.cancel();
    player.dispose();
    super.dispose();
  }

  Future<void> _toggle() async {
    if (url.isEmpty) return;
    if (playing) {
      await player.pause();
      return;
    }
    if (!loaded) {
      await player.play(UrlSource(url));
      loaded = true;
    } else {
      await player.resume();
    }
  }

  Future<void> _seek(double value) async {
    if (duration <= Duration.zero) return;
    await player.seek(Duration(milliseconds: value.round()));
  }

  Future<void> _changeRate() async {
    rateIndex = (rateIndex + 1) % rates.length;
    await player.setPlaybackRate(rates[rateIndex]);
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final maxMs = math.max(1, duration.inMilliseconds).toDouble();
    final positionMs = position.inMilliseconds.clamp(0, maxMs.round()).toDouble();
    return Container(
      width: 250,
      padding: const EdgeInsets.fromLTRB(8, 7, 8, 7),
      decoration: BoxDecoration(
        color: context.softPanel,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.border),
      ),
      child: Row(
        children: [
          Material(
            color: SyncColors.sky,
            shape: const CircleBorder(),
            child: InkWell(
              onTap: _toggle,
              customBorder: const CircleBorder(),
              child: SizedBox.square(
                dimension: 39,
                child: Icon(
                  playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
                  color: Colors.white,
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SliderTheme(
                  data: SliderTheme.of(context).copyWith(
                    trackHeight: 2.5,
                    thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 5),
                    overlayShape: const RoundSliderOverlayShape(overlayRadius: 11),
                  ),
                  child: Slider(
                    value: positionMs,
                    max: maxMs,
                    onChanged: duration > Duration.zero ? _seek : null,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Row(
                    children: [
                      Text(
                        _duration(position.inSeconds),
                        style: TextStyle(fontSize: 10, color: context.muted),
                      ),
                      const Spacer(),
                      Text(
                        _duration(duration.inSeconds),
                        style: TextStyle(fontSize: 10, color: context.muted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 2),
          InkWell(
            borderRadius: BorderRadius.circular(99),
            onTap: _changeRate,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 5),
              decoration: BoxDecoration(
                color: context.panel,
                borderRadius: BorderRadius.circular(99),
                border: Border.all(color: context.border),
              ),
              child: Text(
                '${rates[rateIndex].toStringAsFixed(rates[rateIndex] == 1 ? 0 : 1)}x',
                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

String _duration(int totalSeconds) {
  final safe = math.max(0, totalSeconds);
  final minutes = safe ~/ 60;
  final seconds = safe % 60;
  return '$minutes:${seconds.toString().padLeft(2, '0')}';
}
