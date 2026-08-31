const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Resolve to an absolute path regardless of the process's launch directory.
// A relative UPLOAD_DIR in .env (e.g. "./uploads") used to resolve against
// process.cwd(), which silently pointed at a different directory than this
// file's hardcoded backend/uploads fallback depending on how the server was
// started, producing two divergent upload trees on disk.
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(__dirname, '..', process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', 'uploads');

// Ensure upload directories exist
const dirs = ['', 'products', 'videos', 'banners', 'offers', 'media', 'consultations', 'quotes', 'reports'];
dirs.forEach(dir => {
  const fullPath = path.join(UPLOAD_DIR, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine subfolder based on field name or route
    let subfolder = 'media';
    if (file.fieldname === 'video_file' || (file.mimetype && file.mimetype.startsWith('video/'))) {
      subfolder = 'videos';
    } else if (req.baseUrl.includes('products') || req.path.includes('product')) {
      subfolder = 'products';
    } else if (req.baseUrl.includes('banners') || req.path.includes('banner')) {
      subfolder = 'banners';
    } else if (req.baseUrl.includes('offers') || req.path.includes('offer')) {
      subfolder = 'offers';
    } else if (req.baseUrl.includes('consultation')) {
      subfolder = 'consultations';
    } else if (req.baseUrl.includes('quote')) {
      subfolder = 'quotes';
    } else if (req.baseUrl.includes('report') || req.path.includes('report')) {
      subfolder = 'reports';
    }

    const dest = path.join(UPLOAD_DIR, subfolder);
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    const rawExt = path.extname(file.originalname).toLowerCase();
    let safeExt = rawExt;
    if (file.fieldname === 'video_file' || (file.mimetype && file.mimetype.startsWith('video/'))) {
      safeExt = ['.mp4', '.webm', '.mov', '.ogg'].includes(rawExt) ? rawExt : '.mp4';
    } else {
      safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(rawExt) ? rawExt : '.jpg';
    }
    cb(null, uniqueSuffix + safeExt);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('نوع الملف غير مسموح'), false);
  }
};

const productImageFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];

  if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('صيغة الصورة غير مدعومة. يرجى رفع صورة بصيغة JPG أو PNG أو WEBP فقط.'), false);
  }
};

const productMediaFilter = (req, file, cb) => {
  if (file.fieldname === 'video_file') {
    const allowedVideoMimes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg'];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedVideoExts = ['.mp4', '.webm', '.mov', '.ogg'];
    if (allowedVideoMimes.includes(file.mimetype) || allowedVideoExts.includes(ext)) {
      return cb(null, true);
    }
    return cb(new Error('صيغة الفيديو غير مدعومة. يرجى رفع فيديو بصيغة MP4 أو WebM أو MOV.'), false);
  }

  // Otherwise treat as image
  const allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedImageExts = ['.jpg', '.jpeg', '.png', '.webp'];

  if (allowedImageMimes.includes(file.mimetype) && allowedImageExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('صيغة الصورة غير مدعومة. يرجى رفع صورة بصيغة JPG أو PNG أو WEBP فقط.'), false);
  }
};

const reportImageFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

  if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('صيغة الصورة غير مدعومة. يرجى رفع صورة بصيغة JPG أو PNG أو WEBP فقط.'), false);
  }
};

const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024; // 50MB for video/media
const maxReportImageSize = 5 * 1024 * 1024; // 5MB

// Export configured multer instances
const upload = multer({ storage, fileFilter, limits: { fileSize: maxSize } });
const uploadProductImages = multer({ storage, fileFilter: productImageFilter, limits: { fileSize: maxSize } });
const uploadProductMedia = multer({ storage, fileFilter: productMediaFilter, limits: { fileSize: maxSize } });
const uploadReportImage = multer({ storage, fileFilter: reportImageFilter, limits: { fileSize: maxReportImageSize } });

/**
 * Public URL for a file multer just wrote.
 *
 * The storage engine below picks a SUBFOLDER (products, banners, offers,
 * media, ...) based on the field name and route. Several routes ignored that
 * and built their URL as '/uploads/' + file.filename, dropping the subfolder.
 * The file landed in uploads/media/x.png while the database recorded
 * /uploads/x.png, so express.static looked in uploads/ and answered 404 --
 * every department and branch image uploaded through the admin panel was a
 * broken link the moment it was saved, with no error shown to the operator.
 *
 * Deriving the URL from file.destination -- where multer actually put it --
 * rather than restating the rule at each call site means the two cannot drift
 * apart again.
 *
 * @param {Express.Multer.File} file  the file object multer attached
 * @param {string} [overrideFilename] use when the route rewrote the file
 *                                    afterwards (e.g. converted it to .webp)
 * @returns {string|null} a path under /uploads, or null when there is no file
 */
function publicPathFor(file, overrideFilename) {
  if (!file) return null;
  const name = overrideFilename || file.filename;
  if (!name) return null;

  const dest = file.destination || UPLOAD_DIR;
  const relDir = path.relative(UPLOAD_DIR, dest).split(path.sep).filter(Boolean).join('/');

  return relDir ? `/uploads/${relDir}/${name}` : `/uploads/${name}`;
}

module.exports = upload;
module.exports.upload = upload;
module.exports.publicPathFor = publicPathFor;
module.exports.uploadProductImages = uploadProductImages;
module.exports.uploadProductMedia = uploadProductMedia;
module.exports.uploadReportImage = uploadReportImage;
module.exports.UPLOAD_DIR = UPLOAD_DIR;
