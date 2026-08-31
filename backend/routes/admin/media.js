const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { getRepositories } = require('../../repositories');
const upload = require('../../middleware/upload');
const { UPLOAD_DIR } = upload;
const { requireAuth, setFlash, logAction } = require('../../middleware/auth');
const { parsePagination } = require('../../utils/helpers');

router.use(requireAuth);

// Restrict folder names to a safe charset so a value like "../../etc" can't
// escape UPLOAD_DIR via path.join (path.join normalizes ".." segments but
// does not clamp the result to stay inside the base directory).
function sanitizeFolderName(folder) {
  const clean = String(folder || 'general').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  return clean || 'general';
}

const UPLOADS_ROOT = path.resolve(UPLOAD_DIR, '..');

function safeUnlink(mediaPath) {
  if (!mediaPath) return;
  const relative = String(mediaPath).replace(/^\//, '');
  const filePath = path.resolve(UPLOADS_ROOT, relative);
  // Ensure the resolved path never escapes the app's own uploads directory,
  // regardless of ".." segments smuggled into the stored path value.
  if (!filePath.startsWith(UPLOAD_DIR + path.sep) && filePath !== UPLOAD_DIR) return;
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

router.get('/', async (req, res, next) => {
  try {
    const { media: mediaRepo } = getRepositories();
    const { page, limit, offset } = parsePagination(req.query, 24);
    const folder = req.query.folder || 'all';
    const search = req.query.q || '';
    const type = req.query.type || '';

    const filterObj = {
      folder,
      search,
      type,
      limit,
      offset
    };

    const totalItems = await mediaRepo.count({ folder, search, type });
    const media = await mediaRepo.findAll(filterObj);
    const folders = (await mediaRepo.getFolders()) || [];

    res.render('admin/media/list', {
      title: 'إدارة الوسائط',
      active: 'media',
      media,
      folders,
      currentFolder: folder,
      search,
      type,
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/upload-ajax', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'لم يتم رفع ملفات' });
    }

    const { media: mediaRepo } = getRepositories();
    const folder = sanitizeFolderName(req.body.folder);
    const destFolder = path.join(UPLOAD_DIR, folder);
    if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });

    const uploadedMedia = [];
    for (const file of req.files) {
      let finalPath = file.path;
      let finalFilename = file.filename;
      let finalMime = file.mimetype;
      let finalSize = file.size;

      if (file.mimetype.startsWith('image/') && !file.mimetype.includes('svg')) {
        const webpFilename = file.filename.replace(path.extname(file.filename), '.webp');
        const webpPath = path.join(destFolder, webpFilename);
        await sharp(file.path).webp({ quality: 82 }).toFile(webpPath);
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        finalPath = webpPath;
        finalFilename = webpFilename;
        finalMime = 'image/webp';
        finalSize = fs.statSync(webpPath).size;
      } else {
        const newPath = path.join(destFolder, file.filename);
        if (file.path !== newPath) {
          fs.renameSync(file.path, newPath);
          finalPath = newPath;
        }
      }

      const relativePath = `/uploads/${folder}/${finalFilename}`;
      const result = await mediaRepo.create({
        filename: finalFilename,
        original_name: file.originalname,
        mime_type: finalMime,
        size: finalSize,
        path: relativePath,
        folder,
        title: file.originalname
      });

      const item = {
        id: result.lastInsertRowid || result.id,
        filename: finalFilename,
        original_name: file.originalname,
        path: relativePath,
        size: finalSize,
        mime_type: finalMime,
        folder
      };
      uploadedMedia.push(item);
      await logAction(req.session.admin.id, 'UPLOAD', 'media', result.lastInsertRowid || result.id, item, null, req.ip);
    }

    res.json({ success: true, files: uploadedMedia });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/upload', upload.array('files', 20), async (req, res) => {
  req.url = '/upload-ajax';
  res.redirect('/admin/media');
});

router.post('/:id/edit', async (req, res) => {
  try {
    const { media: mediaRepo } = getRepositories();
    const oldMedia = await mediaRepo.findById(req.params.id);
    if (!oldMedia) throw new Error('الملف غير موجود');

    const payload = {
      title: (req.body.title || '').trim(),
      alt_text: (req.body.alt_text || '').trim(),
      description: (req.body.description || '').trim(),
      folder: (req.body.folder || 'general').trim()
    };

    await mediaRepo.update(req.params.id, payload);

    await logAction(req.session.admin.id, 'UPDATE', 'media', req.params.id, payload, oldMedia, req.ip);
    setFlash(req, 'success', 'تم تحديث بيانات الملف');
    res.redirect('/admin/media');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('/admin/media');
  }
});

router.post('/:id/replace', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) throw new Error('اختر ملفاً للاستبدال');
    const { media: mediaRepo } = getRepositories();
    const oldMedia = await mediaRepo.findById(req.params.id);
    if (!oldMedia) throw new Error('الملف غير موجود');

    safeUnlink(oldMedia.path);
    const relativePath = `/uploads/media/${req.file.filename}`;

    await mediaRepo.replace(req.params.id, {
      filename: req.file.filename,
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size: req.file.size,
      path: relativePath
    });

    await logAction(req.session.admin.id, 'REPLACE', 'media', req.params.id, { path: relativePath }, oldMedia, req.ip);
    setFlash(req, 'success', 'تم استبدال الملف');
    res.redirect('/admin/media');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('/admin/media');
  }
});

router.post('/bulk', async (req, res) => {
  try {
    const { media: mediaRepo } = getRepositories();
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.ids].filter(Boolean);
    if (!ids.length || req.body.action !== 'delete') {
      setFlash(req, 'danger', 'حدد ملفات واختر عملية صحيحة');
      return res.redirect('/admin/media');
    }

    for (const id of ids) {
      const media = await mediaRepo.findById(id);
      if (media) {
        safeUnlink(media.path);
        await mediaRepo.delete(id);
      }
    }

    await logAction(req.session.admin.id, 'BULK_DELETE', 'media', ids.join(','), { ids }, null, req.ip);
    setFlash(req, 'success', 'تم حذف الملفات المحددة');
    res.redirect('/admin/media');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('/admin/media');
  }
});

router.post('/:id/delete', async (req, res) => {
  try {
    const { media: mediaRepo } = getRepositories();
    const media = await mediaRepo.findById(req.params.id);
    if (media) {
      safeUnlink(media.path);
      await mediaRepo.delete(req.params.id);
      await logAction(req.session.admin.id, 'DELETE', 'media', req.params.id, null, media, req.ip);
    }

    if (req.xhr || (req.headers.accept || '').includes('json')) {
      return res.json({ success: true });
    }

    setFlash(req, 'success', 'تم حذف الملف بنجاح');
    res.redirect('/admin/media');
  } catch (error) {
    if (req.xhr || (req.headers.accept || '').includes('json')) {
      return res.status(500).json({ success: false, message: error.message });
    }
    setFlash(req, 'danger', error.message);
    res.redirect('/admin/media');
  }
});

module.exports = router;
