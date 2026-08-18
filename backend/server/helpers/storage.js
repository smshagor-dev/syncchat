const path = require('path');
const { Readable, Writable } = require('stream');
const ftp = require('basic-ftp');
const {
  getStorageConfig,
  mergeStorageInput,
  markStorageTest,
} = require('./storageConfig');

const cleanSegment = (value = '') =>
  String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/');

const remotePathFor = (config, folder, filename) => {
  const safeFolder = cleanSegment(folder);
  const safeFilename = String(filename || '').replace(/[\\/]/g, '').trim();
  if (!safeFolder || !safeFilename) {
    throw new Error('Invalid FTP file destination');
  }
  return path.posix.join(config.basePath, safeFolder, safeFilename);
};

const publicUrlFor = (config, remotePath) => {
  if (!config.publicBaseUrl) {
    throw new Error('FTP public base URL is not configured');
  }
  const relative = path.posix
    .relative(config.basePath, remotePath)
    .replace(/^\/+/, '');
  return `${config.publicBaseUrl}/${relative}`;
};

const accessOptions = (config) => {
  const secure =
    config.secureMode === 'implicit'
      ? 'implicit'
      : config.secureMode === 'explicit'
        ? true
        : false;
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    secure,
    secureOptions: secure
      ? { rejectUnauthorized: config.rejectUnauthorized !== false }
      : undefined,
  };
};

const assertConfigured = (config) => {
  if (!config.enabled) {
    const error = new Error(
      'FTP storage is not enabled. Configure it in Admin > FTP Storage.'
    );
    error.statusCode = 503;
    throw error;
  }
  if (!config.host || !config.user || !config.password || !config.publicBaseUrl) {
    const error = new Error('FTP storage configuration is incomplete');
    error.statusCode = 503;
    throw error;
  }
};

const withClient = async (config, callback) => {
  const client = new ftp.Client(config.timeoutMs || 15000);
  client.ftp.verbose = process.env.FTP_DEBUG === 'true';
  try {
    await client.access(accessOptions(config));
    return await callback(client);
  } finally {
    client.close();
  }
};

const uploadStreamFile = async ({ stream, folder, filename, size = null }) => {
  const config = await getStorageConfig();
  assertConfigured(config);
  const remotePath = remotePathFor(config, folder, filename);
  await withClient(config, async (client) => {
    const remoteDir = path.posix.dirname(remotePath);
    await client.ensureDir(remoteDir);
    await client.uploadFrom(stream, path.posix.basename(remotePath));
  });
  const url = publicUrlFor(config, remotePath);
  return {
    url,
    publicPath: url,
    remotePath,
    size: Number.isFinite(Number(size)) ? Number(size) : null,
  };
};

const saveBufferFile = async ({ buffer, folder, filename }) => {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('FTP upload requires a Buffer');
  }
  return uploadStreamFile({
    stream: Readable.from(buffer),
    folder,
    filename,
    size: buffer.length,
  });
};

const remotePathFromUrl = (config, fileUrl = '') => {
  const raw = String(fileUrl || '').trim();
  if (!raw || !config.publicBaseUrl) return null;
  const base = `${config.publicBaseUrl.replace(/\/+$/, '')}/`;
  if (!raw.startsWith(base)) return null;
  const relative = decodeURIComponent(raw.slice(base.length)).replace(/^\/+/, '');
  if (!relative || relative.includes('..')) return null;
  return path.posix.join(config.basePath, relative);
};

const deleteStorageFileByUrl = async (fileUrl) => {
  const config = await getStorageConfig();
  if (!config.enabled) return false;
  const remotePath = remotePathFromUrl(config, fileUrl);
  if (!remotePath) return false;
  await withClient(config, async (client) => {
    await client.cd(path.posix.dirname(remotePath));
    await client.remove(path.posix.basename(remotePath), true);
  });
  return true;
};

const readStorageFileToBuffer = async (fileUrl) => {
  const config = await getStorageConfig();
  assertConfigured(config);
  const remotePath = remotePathFromUrl(config, fileUrl);
  if (!remotePath) throw new Error('File URL does not belong to configured FTP storage');

  const chunks = [];
  const sink = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });

  await withClient(config, async (client) => {
    await client.cd(path.posix.dirname(remotePath));
    await client.downloadTo(sink, path.posix.basename(remotePath));
  });
  return Buffer.concat(chunks);
};

const testFtpConnection = async (raw = null) => {
  const config = raw ? await mergeStorageInput({ ...raw, enabled: true }) : await getStorageConfig();
  assertConfigured({ ...config, enabled: true });
  const startedAt = Date.now();
  const testName = `.syncchat-write-test-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}.txt`;

  try {
    await withClient(config, async (client) => {
      await client.ensureDir(config.basePath);
      await client.uploadFrom(
        Readable.from(Buffer.from(`SyncChat FTP test ${new Date().toISOString()}\n`)),
        testName
      );
      await client.remove(testName, true);
    });
    const result = {
      success: true,
      message: 'FTP connection and write/delete test succeeded',
      latencyMs: Date.now() - startedAt,
      basePath: config.basePath,
      publicBaseUrl: config.publicBaseUrl,
    };
    await markStorageTest(result).catch(() => {});
    return result;
  } catch (error0) {
    await markStorageTest({ success: false, message: error0.message }).catch(() => {});
    throw error0;
  }
};

const getServerOrigin = () => {
  const explicit =
    process.env.UPLOAD_PUBLIC_ORIGIN ||
    process.env.SOCKET_URL ||
    process.env.API_BASE_URL ||
    process.env.PUBLIC_ORIGIN;
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch (error0) {
      return String(explicit || '').replace(/\/$/, '');
    }
  }
  return process.env.NODE_ENV !== 'production'
    ? `http://localhost:${process.env.PORT || 5599}`
    : '';
};

const toPublicUrl = (publicPath) => `${getServerOrigin()}${publicPath}`;

const toAbsoluteUploadUrl = (url = '') => {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/uploads/')) return toPublicUrl(url);
  return url;
};

const parseDataUri = (dataUri = '') => {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error('Invalid data URL');
  const [, mime, payload] = match;
  return { mime, buffer: Buffer.from(payload, 'base64') };
};

// Backward-compatible names: all persistent operations now target FTP.
const deleteLocalFileByUrl = deleteStorageFileByUrl;
const resolveLocalUploadPath = () => null;
const uploadRootDir = '';

module.exports = {
  saveBufferFile,
  uploadStreamFile,
  readStorageFileToBuffer,
  deleteStorageFileByUrl,
  deleteLocalFileByUrl,
  testFtpConnection,
  parseDataUri,
  toAbsoluteUploadUrl,
  toPublicUrl,
  resolveLocalUploadPath,
  uploadRootDir,
};
