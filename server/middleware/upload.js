const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadRootDir } = require('../helpers/storage');

const makeDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = path.join(uploadRootDir, 'chat');
    if (req.baseUrl.includes('avatar')) {
      folder = path.join(uploadRootDir, 'avatars');
    } else if (req.user?._id) {
      const safeUserId = String(req.user._id).replace(/[^a-zA-Z0-9_-]/g, '');
      folder = path.join(uploadRootDir, 'chat', safeUserId || 'unknown');
    }
    makeDir(folder);
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({ storage });
module.exports = upload;
