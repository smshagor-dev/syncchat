const multer = require('multer');
const path = require('path');
const fs = require('fs');

const makeDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'uploads/chat';
    if (req.baseUrl.includes('avatar')) folder = 'uploads/avatars';
    makeDir(folder);
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({ storage });
module.exports = upload;
