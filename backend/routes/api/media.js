const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const upload = require('../../middleware/upload');
const { parsePagination, paginationInfo } = require('../../utils/helpers');

router.get('/', async (req, res, next) => {
  try {
    const { media: mediaRepo } = getRepositories();
    const { page, limit, offset } = parsePagination(req.query);

    const totalItems = await mediaRepo.count();
    const media = await mediaRepo.findAll({ limit, offset });

    res.json({
      success: true,
      data: media,
      pagination: paginationInfo(page, limit, totalItems)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/upload', upload.array('files', 10), async (req, res, next) => {
  try {
    const { media: mediaRepo } = getRepositories();
    const results = [];

    if (req.files && req.files.length > 0) {
      for (const f of req.files) {
        const filePath = '/uploads/media/' + f.filename;
        const info = await mediaRepo.create({
          filename: f.filename,
          original_name: f.originalname,
          mime_type: f.mimetype,
          size: f.size,
          path: filePath,
          folder: 'general',
          title: f.originalname
        });
        results.push({
          id: info.lastInsertRowid,
          filename: f.filename,
          original_name: f.originalname,
          url: filePath
        });
      }
    }

    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});

module.exports = router;