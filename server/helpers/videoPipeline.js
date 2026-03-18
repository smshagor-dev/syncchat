const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const { toAbsoluteUploadUrl, uploadRootDir } = require('./storage');

const execFileAsync = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error0, stdout, stderr) => {
      if (error0) {
        reject(
          new Error(stderr || stdout || error0.message || 'Command failed')
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });

const toUploadPublicUrl = (absolutePath) => {
  const relative = path
    .relative(path.resolve(uploadRootDir), path.resolve(absolutePath))
    .replace(/\\/g, '/');
  if (!relative || relative.startsWith('..')) {
    throw new Error('Video output path is outside upload directory');
  }
  return toAbsoluteUploadUrl(`/uploads/${relative}`);
};

const ensureParentDir = async (targetPath) => {
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
};

const probeVideo = async (absolutePath) => {
  const { stdout } = await execFileAsync(ffprobePath, [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    absolutePath,
  ]);

  const payload = JSON.parse(stdout || '{}');
  const videoStream =
    (payload.streams || []).find((stream) => stream.codec_type === 'video') ||
    {};

  return {
    duration: Math.max(
      0,
      Math.round(
        Number(videoStream.duration || payload.format?.duration || 0) || 0
      )
    ),
    width: Math.max(0, Number(videoStream.width) || 0),
    height: Math.max(0, Number(videoStream.height) || 0),
  };
};

const transcodeVariant = async ({
  sourcePath,
  outputPath,
  maxHeight,
  videoBitrate,
}) => {
  await ensureParentDir(outputPath);
  await execFileAsync(ffmpegPath, [
    '-y',
    '-i',
    sourcePath,
    '-vf',
    `scale=-2:'min(${maxHeight},ih)'`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-profile:v',
    'main',
    '-movflags',
    '+faststart',
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
    outputPath,
  ]);
};

const generateThumbnail = async ({ sourcePath, outputPath }) => {
  await ensureParentDir(outputPath);
  await execFileAsync(ffmpegPath, [
    '-y',
    '-ss',
    '00:00:01',
    '-i',
    sourcePath,
    '-frames:v',
    '1',
    '-vf',
    'scale=640:-2',
    outputPath,
  ]);
};

const processUploadedVideo = async ({ absolutePath }) => {
  if (!ffmpegPath || !ffprobePath) {
    throw new Error('Video processing binaries are not available');
  }

  const parsed = path.parse(absolutePath);
  const standardPath = path.join(parsed.dir, `${parsed.name}-standard.mp4`);
  const hdPath = path.join(parsed.dir, `${parsed.name}-hd.mp4`);
  const thumbnailPath = path.join(parsed.dir, `${parsed.name}-thumb.jpg`);

  await Promise.all([
    transcodeVariant({
      sourcePath: absolutePath,
      outputPath: standardPath,
      maxHeight: 480,
      videoBitrate: '1200k',
    }),
    transcodeVariant({
      sourcePath: absolutePath,
      outputPath: hdPath,
      maxHeight: 720,
      videoBitrate: '2800k',
    }),
    generateThumbnail({
      sourcePath: absolutePath,
      outputPath: thumbnailPath,
    }),
  ]);

  const metadata = await probeVideo(standardPath);

  return {
    duration: metadata.duration,
    width: metadata.width,
    height: metadata.height,
    streamUrl: toUploadPublicUrl(standardPath),
    streamHdUrl: toUploadPublicUrl(hdPath),
    thumbnailUrl: toUploadPublicUrl(thumbnailPath),
  };
};

module.exports = {
  processUploadedVideo,
};
