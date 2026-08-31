const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'ai', 'temp');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer in-memory storage for Sharp processing
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('صيغة الملف غير مدعومة. يرجى رفع صورة بصيغة JPG أو PNG أو WEBP.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB maximum
  }
});

async function processAndSaveImage(fileBuffer, originalMime) {
  const fileHash = crypto.randomBytes(12).toString('hex');
  const filename = `vision-${fileHash}-${Date.now()}.webp`;
  const targetPath = path.join(UPLOAD_DIR, filename);

  const processedBuffer = await sharp(fileBuffer)
    .rotate() // auto-orient from EXIF
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();

  fs.writeFileSync(targetPath, processedBuffer);

  const base64 = processedBuffer.toString('base64');
  const publicUrl = `/uploads/ai/temp/${filename}`;

  return {
    filename,
    targetPath,
    publicUrl,
    mimeType: 'image/webp',
    base64,
    dataUrl: `data:image/webp;base64,${base64}`,
  };
}

function cleanupOldTempImages(maxAgeHours = 24) {
  try {
    if (!fs.existsSync(UPLOAD_DIR)) return;
    const now = Date.now();
    const files = fs.readdirSync(UPLOAD_DIR);
    files.forEach(file => {
      const filePath = path.join(UPLOAD_DIR, file);
      const stats = fs.statSync(filePath);
      const ageHours = (now - stats.mtimeMs) / (1000 * 60 * 60);
      if (ageHours > maxAgeHours) {
        fs.unlinkSync(filePath);
      }
    });
  } catch (err) {
    console.error('Temp images cleanup error:', err.message);
  }
}

// Run cleanup every 12 hours
setInterval(() => cleanupOldTempImages(24), 12 * 60 * 60 * 1000);

module.exports = {
  upload,
  processAndSaveImage,
  cleanupOldTempImages
};