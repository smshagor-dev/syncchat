const { spawn } = require('child_process');
const path = require('path');
const { saveBufferFile } = require('./storage');

const safeRequire = (moduleName) => {
  try {
    return require(moduleName);
  } catch (error0) {
    if (error0?.code === 'MODULE_NOT_FOUND') return null;
    throw error0;
  }
};

const ffmpegPath = safeRequire('ffmpeg-static');
const ffprobeModule = safeRequire('ffprobe-static');
const ffprobePath = ffprobeModule?.path || null;

const runPipe = ({ command, args, input }) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            Buffer.concat(stderr).toString('utf8') ||
              `Media command failed with code ${code}`
          )
        );
        return;
      }
      resolve(Buffer.concat(stdout));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });

const probeVideoBuffer = async (buffer) => {
  if (!ffprobePath) return { duration: 0, width: 0, height: 0 };
  const output = await runPipe({
    command: ffprobePath,
    args: [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      'pipe:0',
    ],
    input: buffer,
  });
  const payload = JSON.parse(output.toString('utf8') || '{}');
  const videoStream =
    (payload.streams || []).find((stream) => stream.codec_type === 'video') || {};
  return {
    duration: Math.max(
      0,
      Math.round(Number(videoStream.duration || payload.format?.duration || 0) || 0)
    ),
    width: Math.max(0, Number(videoStream.width) || 0),
    height: Math.max(0, Number(videoStream.height) || 0),
  };
};

const transcodeBuffer = async ({ buffer, maxHeight, videoBitrate }) =>
  runPipe({
    command: ffmpegPath,
    args: [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      '-vf',
      `scale=-2:'min(${maxHeight},ih)'`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-profile:v',
      'main',
      '-pix_fmt',
      'yuv420p',
      '-b:v',
      videoBitrate,
      '-maxrate',
      videoBitrate,
      '-bufsize',
      `${Number.parseInt(videoBitrate, 10) * 2 || 3000}k`,
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ac',
      '2',
      '-movflags',
      'frag_keyframe+empty_moov+default_base_moof',
      '-f',
      'mp4',
      'pipe:1',
    ],
    input: buffer,
  });

const thumbnailBuffer = async (buffer) =>
  runPipe({
    command: ffmpegPath,
    args: [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      '00:00:01',
      '-i',
      'pipe:0',
      '-frames:v',
      '1',
      '-vf',
      'scale=640:-2',
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      'pipe:1',
    ],
    input: buffer,
  });

const processUploadedVideoBuffer = async ({ buffer, folder, filename }) => {
  if (!ffmpegPath || !ffprobePath || !Buffer.isBuffer(buffer)) return {};

  const parsed = path.parse(filename || `video-${Date.now()}.mp4`);
  const base = parsed.name.replace(/[^a-zA-Z0-9_-]/g, '') || `video-${Date.now()}`;

  const [standard, hd, thumbnail, metadata] = await Promise.all([
    transcodeBuffer({ buffer, maxHeight: 480, videoBitrate: '1200k' }),
    transcodeBuffer({ buffer, maxHeight: 720, videoBitrate: '2800k' }),
    thumbnailBuffer(buffer),
    probeVideoBuffer(buffer),
  ]);

  const [standardSaved, hdSaved, thumbSaved] = await Promise.all([
    saveBufferFile({ buffer: standard, folder, filename: `${base}-standard.mp4` }),
    saveBufferFile({ buffer: hd, folder, filename: `${base}-hd.mp4` }),
    saveBufferFile({ buffer: thumbnail, folder, filename: `${base}-thumb.jpg` }),
  ]);

  return {
    duration: metadata.duration,
    width: metadata.width,
    height: metadata.height,
    streamUrl: standardSaved.url,
    streamHdUrl: hdSaved.url,
    thumbnailUrl: thumbSaved.url,
  };
};

module.exports = {
  processUploadedVideoBuffer,
};
