const fs = require('fs');
const path = require('path');

const uploadRootDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, '..', '..', 'uploads');

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

const getServerOrigin = () => {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN.replace(/\/$/, '');
  if (process.env.NODE_ENV !== 'production') {
    return `http://localhost:${process.env.PORT || 8080}`;
  }
  return '';
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
  return {
    mime,
    buffer: Buffer.from(payload, 'base64'),
  };
};

const saveBufferFile = async ({ buffer, folder, filename }) => {
  const safeFolder = String(folder || '').replace(/^\/+|\/+$/g, '');
  const safeFilename = String(filename || '').replace(/[\\/]/g, '');

  if (!safeFolder || !safeFilename) {
    throw new Error('Invalid local file destination');
  }

  const dirPath = path.join(uploadRootDir, safeFolder);
  ensureDir(dirPath);

  const absolutePath = path.join(dirPath, safeFilename);
  await fs.promises.writeFile(absolutePath, buffer);

  const publicPath = `/uploads/${safeFolder}/${safeFilename}`.replace(
    /\\/g,
    '/'
  );

  return {
    url: toPublicUrl(publicPath),
    publicPath,
    absolutePath,
    size: buffer.length,
  };
};

const resolveLocalUploadPath = (fileUrl = '') => {
  if (!fileUrl) return null;

  let pathname = fileUrl;
  try {
    pathname = new URL(fileUrl).pathname;
  } catch (error0) {
    pathname = fileUrl;
  }

  if (!pathname.startsWith('/uploads/')) return null;

  const normalized = path.normalize(pathname).replace(/^([\\/])+/, '');
  const absolutePath = path.join(process.cwd(), normalized);
  const normalizedRoot = path.normalize(uploadRootDir);
  const normalizedAbsolute = path.normalize(absolutePath);

  if (!normalizedAbsolute.startsWith(normalizedRoot)) return null;
  return absolutePath;
};

const deleteLocalFileByUrl = async (fileUrl) => {
  const absolutePath = resolveLocalUploadPath(fileUrl);
  if (!absolutePath) return false;

  try {
    await fs.promises.unlink(absolutePath);
    return true;
  } catch (error0) {
    if (error0.code === 'ENOENT') return true;
    throw error0;
  }
};

module.exports = {
  saveBufferFile,
  parseDataUri,
  deleteLocalFileByUrl,
  toAbsoluteUploadUrl,
  toPublicUrl,
  resolveLocalUploadPath,
  uploadRootDir,
};
