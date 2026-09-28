const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const UPLOAD_DIR = path.join(__dirname, "../uploads/notifications");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_EXT = {
  ".mp3": ["audio/mpeg"],
  ".wav": ["audio/wav", "audio/x-wav", "audio/wave"],
  ".ogg": ["audio/ogg", "audio/vorbis"],
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const randomName = crypto.randomBytes(16).toString("hex");
    cb(null, `${randomName}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedMimes = ALLOWED_EXT[ext];

  if (!allowedMimes) {
    return cb(
      new Error(
        `Invalid file extension "${ext}". Allowed: .mp3, .wav, .ogg`
      ),
      false
    );
  }

  const mime = (file.mimetype || "").toLowerCase();
  const mimeMatches = allowedMimes.some(
    (allowed) => allowed === mime || mime.startsWith(allowed.split("/")[0])
  );

  if (!mimeMatches) {
    return cb(
      new Error(
        `MIME type "${mime}" does not match file extension "${ext}". Allowed: audio/mpeg, audio/wav, audio/ogg`
      ),
      false
    );
  }

  cb(null, true);
};

const soundUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

module.exports = soundUpload;
