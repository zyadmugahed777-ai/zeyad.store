const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { getRepositories } = require('../../repositories');
const { productService } = require('../../services/product-service');
const { parsePagination } = require('../../utils/helpers');
const { uploadProductMedia, UPLOAD_DIR } = require('../../middleware/upload');
const { setFlash, requireAuth } = require('../../middleware/auth');
const { syncFrontend } = require('../../utils/sync-frontend');
const { invalidateProductCache } = require('../api/products');

router.use(requireAuth);

/**
 * Safely processes an uploaded product image:
 * Converts to optimized WebP format with unique filename.
 * Returns public web path: '/uploads/products/filename.webp'
 */
async function processUploadedProductImage(file) {
  const uploadDir = path.join(UPLOAD_DIR, 'products');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const uniqueId = Date.now() + '-' + Math.round(Math.random() * 1e6);
  const webpFilename = 'prod-' + uniqueId + '.webp';
  const finalWebpPath = path.join(uploadDir, webpFilename);

  try {
    const inputBuffer = fs.readFileSync(file.path);
    try {
      await sharp(inputBuffer, { failOn: 'none' })
        .rotate() // Auto-orient from EXIF
        .webp({ quality: 85 })
        .toFile(finalWebpPath);

      if (fs.existsSync(finalWebpPath) && fs.statSync(finalWebpPath).size > 0) {
        try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch (_) {}
        return '/uploads/products/' + webpFilename;
      }
    } catch (sharpErr) {
      console.warn('Sharp conversion fallback:', sharpErr.message);
      // Fallback: Copy original file directly
      const ext = path.extname(file.originalname || file.path || '.jpg').toLowerCase() || '.jpg';
      const rawFilename = 'prod-' + uniqueId + ext;
      const rawPath = path.join(uploadDir, rawFilename);
      fs.copyFileSync(file.path, rawPath);
      try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch (_) {}
      return '/uploads/products/' + rawFilename;
    }
  } catch (err) {
    try {
      if (fs.existsSync(finalWebpPath)) fs.unlinkSync(finalWebpPath);
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch (_) {}
    throw err;
  }
}

/**
 * Safely processes an uploaded product video:
 * Validates and ensures it is placed into /uploads/videos/
 * Returns public web path: '/uploads/videos/filename.mp4'
 */
function processUploadedProductVideo(file) {
  if (!file) return null;
  const videosDir = path.join(UPLOAD_DIR, 'videos');
  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
  }

  const filename = path.basename(file.path);
  return '/uploads/videos/' + filename;
}

const COLOR_HEX_MAP = {
  'أبيض': '#FFFFFF',
  'أسود': '#1A1A1A',
  'رمادي': '#808080',
  'فضي': '#C0C0C0',
  'ذهبي': '#D4AF37',
  'خشبي': '#8D6E63',
  'بيج': '#D2B48C',
  'بني': '#5D4037',
  'كحلي': '#0D2B45',
  'أزرق': '#1976D2',
  'أخضر': '#2E7D32',
  'أحمر': '#C62828',
  'أصفر': '#FBC02D',
  'برتقالي': '#F57C00',
  'وردي': '#E91E63',
  'بنفسجي': '#7B1FA2'
};

const variants = require('../../services/product-variant-service');

/*
 * A text field must arrive as text. If a form ever posts the same name twice --
 * a duplicated input, a stray hidden field -- Express hands over an array, and
 * storing that verbatim is how a product page ended up telling customers its
 * delivery time was {"2","2"}. Take the first non-empty value and move on.
 */
function firstText(value) {
  if (Array.isArray(value)) {
    const hit = value.map(v => String(v == null ? '' : v).trim()).find(Boolean);
    return hit || '';
  }
  return String(value == null ? '' : value).trim();
}

/*
 * An HTML checkbox posts nothing at all when it is unticked, and 'on' when it
 * is ticked. A <select> posts its value. Both funnel through here so "off" is
 * decided in one place -- and so the string '0', which JavaScript considers
 * true, is decided to be false. Getting that wrong is what made "free
 * installation" switch itself on for every product that was saved.
 */
function isOn(value) {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === undefined || v === null) return false;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'on' || s === 'true' || s === 'yes';
}

/*
 * A checkbox that was rendered on the form but left unticked posts nothing, so
 * "absent" has to mean false -- otherwise no box could ever be turned off. The
 * form carries a hidden marker naming every placement checkbox it drew;
 * without that marker (an API client, the AI employee, an older form) the
 * placements are left untouched rather than silently reset.
 */
const PLACEMENT_FIELDS = [
  'show_in_department',
  'show_on_home',
  'show_in_search',
  'show_in_najm',
  'show_in_offers'
];

function readPlacements(body) {
  if (!isOn(body.placements_submitted)) return {};
  const out = {};
  for (const field of PLACEMENT_FIELDS) out[field] = isOn(body[field]) ? 1 : 0;
  return out;
}

/*
 * The delivery and installation policy the operator chose. Every one of these
 * four fields existed on the form, in the database and in the delivery
 * calculation -- and none was ever read off the request, so choosing
 * "customer is quoted after confirmation" saved nothing and the product kept
 * the store default. Absent fields are returned absent, so a partial update
 * from elsewhere cannot blank a policy it never asked about.
 */
function readDeliveryPolicy(body) {
  const out = {};
  const ALLOWED = ['default', 'free_sana_a', 'quote_after_confirmation', 'estimated', 'fixed'];
  if (body.delivery_policy_type !== undefined) {
    const t = firstText(body.delivery_policy_type);
    out.delivery_policy_type = ALLOWED.includes(t) ? t : 'default';
  }
  if (body.delivery_fixed_fee_sar !== undefined) {
    out.delivery_fixed_fee_sar = Math.max(0, parseFloat(body.delivery_fixed_fee_sar) || 0);
  }
  if (body.requires_installation !== undefined) {
    out.requires_installation = isOn(body.requires_installation) ? 1 : 0;
  }
  if (body.installation_fee_sar !== undefined) {
    out.installation_fee_sar = Math.max(0, parseFloat(body.installation_fee_sar) || 0);
  }
  return out;
}

/*
 * Which colour each freshly uploaded photo shows.
 *
 * Existing images are tagged by id (image_color_<id>), which a photo being
 * uploaded for the first time does not have yet -- so until now the only way
 * to tie a photo to a colour was to save the product, reopen it, tag, and save
 * again. The upload form now posts one new_image_color[] entry per selected
 * file, in the same order the files are sent, so a photo can arrive already
 * tagged.
 */
function readNewImageColors(body) {
  const raw = [].concat(body['new_image_color[]'] || body.new_image_color || []);
  return raw.map((v) => String(v == null ? '' : v).trim());
}

function formatColors(rawColors) {
  let colorList = [];
  if (typeof rawColors === 'string') {
    colorList = rawColors.split(/[,،]+/).map(c => c.trim()).filter(Boolean);
  } else if (Array.isArray(rawColors)) {
    colorList = rawColors.map(c => typeof c === 'object' ? c.name : String(c).trim()).filter(Boolean);
  }

  return colorList.map(colorName => ({
    name: colorName,
    hex: COLOR_HEX_MAP[colorName] || '#808080'
  }));
}

// Multer upload fields handler (supports up to 30 images at once)
const productUploadHandler = uploadProductMedia.fields([
  { name: 'images', maxCount: 30 },
  { name: 'images[]', maxCount: 30 },
  { name: 'video_file', maxCount: 1 }
]);

// List Products
router.get('/', async (req, res, next) => {
  try {
    const { products: productRepo, categories: categoryRepo, departments: departmentRepo } = getRepositories();
    const { page, limit, offset } = parsePagination(req.query);
    const search = req.query.q || '';
    const catId = req.query.category || '';
    const deptId = req.query.department || '';

    const filters = { search, category: catId, department: deptId };
    const totalItems = await productRepo.countAdminList(filters);
    const products = await productRepo.findAdminList(filters, limit, offset);
    const categories = await categoryRepo.findAll();
    const departments = await departmentRepo.listSimple();
    const totalPages = Math.ceil(totalItems / limit);

    res.render('admin/products/list', {
      title: 'المنتجات',
      active: 'products',
      products,
      categories,
      departments,
      page,
      totalPages,
      totalItems,
      pagination: {
        page,
        totalPages,
        totalItems
      },
      search,
      catId,
      deptId,
      csrfToken: (req.session && req.session.csrfToken) || res.locals.csrfToken || ''
    });
  } catch (error) {
    next(error);
  }
});

// New Form
router.get(['/new', '/create'], async (req, res, next) => {
  try {
    const { categories: categoryRepo, departments: departmentRepo } = getRepositories();
    const categories = await categoryRepo.findAll();
    const departments = await departmentRepo.listSimple();
    res.render('admin/products/form', { 
      title: 'إضافة منتج جديد', 
      active: 'products',
      categories,
      departments,
      product: null,
      images: [],
      specs: [],
      faq: [],
      colors: [],
      sizes: [],
      csrfToken: (req.session && req.session.csrfToken) || res.locals.csrfToken || ''
    });
  } catch (error) {
    next(error);
  }
});

// Handle Create (Atomic Transaction with Sharp Images & Video Upload)
router.post(['/create', '/new'], productUploadHandler, async (req, res, next) => {
  const uploadedFiles = [
    ...((req.files && req.files['images']) || []),
    ...((req.files && req.files['images[]']) || [])
  ];
  const videoFile = (req.files && req.files['video_file'] && req.files['video_file'][0]) || null;
  const processedWebpPaths = [];
  let savedVideoPath = '';

  try {
    const { products: productRepo } = getRepositories();
    const body = req.body;

    // 1. Process uploaded images
    for (const file of uploadedFiles) {
      const webpUrl = await processUploadedProductImage(file);
      processedWebpPaths.push(webpUrl);
    }

    // 2. Process uploaded video file
    if (videoFile) {
      savedVideoPath = processUploadedProductVideo(videoFile);
    } else if (body.video) {
      savedVideoPath = String(body.video).trim();
    }

    // 3. Prepare images list with primary selection
    const primaryNewIdx = parseInt(body.primary_new_image_index, 10);
    const chosenPrimIdx = (Number.isInteger(primaryNewIdx) && primaryNewIdx >= 0 && primaryNewIdx < processedWebpPaths.length) ? primaryNewIdx : 0;
    const imagePayload = processedWebpPaths.map((p, idx) => ({
      image_path: p,
      is_primary: idx === chosenPrimIdx ? 1 : 0
    }));

    const colorsPayload = formatColors(body.colors_input || body.colors);

    // 4. Create product via repo (atomic sync transaction)
    const newProductId = await productRepo.create({
      product_id: body.product_id ? String(body.product_id).trim() : ('P-' + Date.now()),
      category_id: body.category_id ? parseInt(body.category_id) : null,
      department_id: body.department_id ? parseInt(body.department_id) : null,
      title: body.title,
      description: body.description || '',
      short_description: body.short_description || '',
      price: parseFloat(body.price) || 0,
      old_price: body.old_price ? parseFloat(body.old_price) : null,
      sku: body.sku || '',
      barcode: body.barcode || '',
      tags: body.tags || '',
      brand: body.brand || '',
      origin: body.origin || '',
      warranty: body.warranty || '',
      shipping: body.shipping || '',
      delivery_time: firstText(body.delivery_time),
      installation: isOn(body.installation) ? 1 : 0,
      weight: body.weight || null,
      video: savedVideoPath || '',
      is_new: isOn(body.is_new) ? 1 : 0,
      is_best_seller: isOn(body.is_best_seller) ? 1 : 0,
      is_active: body.is_active === undefined ? 1 : (isOn(body.is_active) ? 1 : 0),
      ...readDeliveryPolicy(body),
      ...readPlacements(body),
      stock_status: body.stock_status || 'in-stock',
      // stock_quantity was never read off the form, so it never reached the
      // repository and every product silently landed on the repo's default of
      // 10, whatever the admin typed. That stopped being cosmetic once
      // checkout began decrementing stock (decrementStockLocked): the number
      // being decremented was fiction.
      stock_quantity: body.stock_quantity !== undefined && String(body.stock_quantity).trim() !== ''
        ? Math.max(0, parseInt(body.stock_quantity, 10) || 0)
        : undefined
    }, imagePayload, [], [], colorsPayload);

    /*
     * Sizes, specifications and per-photo colours on the CREATE path.
     *
     * The edit form saved all three; the create form posted all three and the
     * create route threw them away. So a product built in one sitting -- with
     * its sizes, its specification table and its colour photos filled in --
     * was saved without any of them, and the operator had to reopen it and
     * enter everything a second time. That is the same complaint as "the size
     * I added never appears", one step earlier in the journey.
     */
    const newImageColors = readNewImageColors(body);
    if (newImageColors.some(Boolean)) {
      const created = await productRepo.findImages(newProductId);
      for (let i = 0; i < created.length && i < newImageColors.length; i++) {
        const name = newImageColors[i];
        if (!name) continue;
        await productRepo.db.prepare(
          'UPDATE product_images SET color_name = ? WHERE id = ? AND product_id = ?'
        ).run(name, created[i].id, newProductId);
      }
    }

    await variants.saveSizes(productRepo.db, newProductId, variants.parseSizes(body));
    await variants.saveSpecs(productRepo.db, newProductId, variants.parseSpecs(body));

    // Invalidate API search cache immediately
    try { invalidateProductCache(); } catch (_) {}

    // Synchronize static frontend cache immediately
    try { await syncFrontend(); } catch (syncErr) { console.error('syncFrontend error:', syncErr.message); }

    console.log('[Product Created] ID:', newProductId, 'Images:', processedWebpPaths.length, 'Video:', savedVideoPath);
    setFlash(req, 'success', 'تمت إضافة المنتج بنجاح');
    res.redirect('/admin/products');
  } catch (error) {
    console.error('Error creating product:', error);
    // Rollback processed image files
    processedWebpPaths.forEach(webpUrl => {
      try {
        const fsPath = path.join(__dirname, '..', '..', webpUrl.replace(/^\//, ''));
        if (fs.existsSync(fsPath)) fs.unlinkSync(fsPath);
      } catch (_) {}
    });
    // Rollback video file
    if (savedVideoPath && savedVideoPath.startsWith('/uploads/videos/')) {
      try {
        const vPath = path.join(__dirname, '..', '..', savedVideoPath.replace(/^\//, ''));
        if (fs.existsSync(vPath)) fs.unlinkSync(vPath);
      } catch (_) {}
    }
    setFlash(req, 'danger', 'حدث خطأ أثناء إضافة المنتج: ' + error.message);
    res.redirect('back');
  }
});

// Edit Form
router.get('/:id/edit', async (req, res, next) => {
  try {
    const { products: productRepo, categories: categoryRepo, departments: departmentRepo } = getRepositories();
    const product = await productRepo.findRawById(req.params.id);
    
    if (!product) {
      req.session.flash = { type: 'danger', message: 'المنتج غير موجود' };
      return res.redirect('/admin/products');
    }

    const rawImages = await productRepo.findImages(product.id);
    const images = (rawImages || []).map(img => {
      let p = (img.image_path || '').trim();
      if (!p) p = '/assets/placeholder.svg';
      else if (!p.startsWith('/') && !p.startsWith('http') && !p.startsWith('data:')) p = '/' + p;
      return {
        ...img,
        image_path: p
      };
    });

    const specs = await productRepo.findSpecs(product.id);
    const faq = await productRepo.findFaqs(product.id);
    const colors = await productRepo.findColors(product.id);
    const sizes = await variants.findSizes(productRepo.db, product.id);
    const categories = await categoryRepo.findAll();
    const departments = await departmentRepo.listSimple();

    res.render('admin/products/form', { 
      title: 'تعديل المنتج', 
      active: 'products',
      product,
      images,
      specs,
      faq,
      colors,
      sizes,
      categories,
      departments,
      csrfToken: (req.session && req.session.csrfToken) || res.locals.csrfToken || ''
    });
  } catch (error) {
    next(error);
  }
});

// Handle Edit (Atomic & Safe)
router.post('/:id/edit', productUploadHandler, async (req, res) => {
  const uploadedFiles = [
    ...((req.files && req.files['images']) || []),
    ...((req.files && req.files['images[]']) || [])
  ];
  const videoFile = (req.files && req.files['video_file'] && req.files['video_file'][0]) || null;
  const processedWebpPaths = [];
  let newVideoPath = null;

  try {
    const { products: productRepo } = getRepositories();
    const productId = req.params.id;

    // Verify product exists
    const existing = await productRepo.findRawById(productId);
    if (!existing) {
      setFlash(req, 'danger', 'المنتج المطلوب تعديله غير موجود');
      return res.redirect('/admin/products');
    }

    const { 
      title, description, short_description, price, old_price, product_id, sku, barcode, tags, brand, origin, 
      warranty, shipping, delivery_time, installation, weight, video, remove_video,
      category_id, department_id, is_new, is_best_seller, is_active, stock_status, stock_quantity
    } = req.body;

    const finalProductId = (product_id && String(product_id).trim()) || existing.product_id || ('P-' + productId);

    // 1. Process new uploaded images
    for (const file of uploadedFiles) {
      const webpUrl = await processUploadedProductImage(file);
      processedWebpPaths.push(webpUrl);
    }

    // 2. Process video logic
    let finalVideoValue = existing.video || '';
    if (videoFile) {
      newVideoPath = processUploadedProductVideo(videoFile);
      finalVideoValue = newVideoPath;
      // Delete old video if on disk
      if (existing.video && existing.video.startsWith('/uploads/videos/')) {
        try {
          const oldV = path.join(__dirname, '..', '..', existing.video.replace(/^\//, ''));
          if (fs.existsSync(oldV)) fs.unlinkSync(oldV);
        } catch (_) {}
      }
    } else if (remove_video === '1' || remove_video === 'on') {
      if (existing.video && existing.video.startsWith('/uploads/videos/')) {
        try {
          const oldV = path.join(__dirname, '..', '..', existing.video.replace(/^\//, ''));
          if (fs.existsSync(oldV)) fs.unlinkSync(oldV);
        } catch (_) {}
      }
      finalVideoValue = '';
    } else if (video !== undefined) {
      finalVideoValue = String(video).trim();
    }

    // 3. Handle image deletions from disk
    const rawDeletes = [].concat(req.body.delete_images || [], req.body['delete_images[]'] || []).filter(Boolean);
    for (const imgId of rawDeletes) {
      const deleted = await productRepo.deleteImage(productId, imgId);
      if (deleted && deleted.image_path) {
        const p = (deleted.image_path || '').trim();
        if (p.startsWith('/uploads/products/') || p.startsWith('uploads/products/')) {
          try {
            const fsPath = path.join(__dirname, '..', '..', p.replace(/^\//, ''));
            if (fs.existsSync(fsPath)) fs.unlinkSync(fsPath);
          } catch (unlinkErr) {
            console.warn('Could not unlink deleted product image file:', unlinkErr.message);
          }
        }
      }
    }

    // 4. Update basic product info & colors
    const colorsPayload = formatColors(req.body.colors_input || req.body.colors);

    await productRepo.update(productId, {
      product_id: finalProductId,
      category_id: category_id !== undefined ? (category_id ? parseInt(category_id) : null) : existing.category_id,
      department_id: department_id !== undefined ? (department_id ? parseInt(department_id) : null) : existing.department_id,
      title: title || existing.title,
      description: description !== undefined ? description : (existing.description || ''),
      short_description: short_description !== undefined ? short_description : (existing.short_description || ''),
      price: price !== undefined ? (parseFloat(price) || 0) : existing.price,
      old_price: old_price ? (parseFloat(old_price) || null) : null,
      sku: sku !== undefined ? sku : (existing.sku || ''),
      barcode: barcode !== undefined ? barcode : (existing.barcode || ''),
      tags: tags !== undefined ? tags : (existing.tags || ''),
      brand: brand !== undefined ? brand : (existing.brand || ''),
      origin: origin !== undefined ? origin : (existing.origin || ''),
      warranty: warranty !== undefined ? warranty : (existing.warranty || ''),
      shipping: shipping !== undefined ? shipping : (existing.shipping || ''),
      delivery_time: delivery_time !== undefined ? firstText(delivery_time) : (existing.delivery_time || ''),
      installation: isOn(installation) ? 1 : 0,
      weight: weight !== undefined ? weight : (existing.weight || ''),
      video: finalVideoValue,
      is_new: isOn(is_new) ? 1 : 0,
      is_best_seller: isOn(is_best_seller) ? 1 : 0,
      is_active: is_active === undefined ? 1 : (isOn(is_active) ? 1 : 0),
      ...readDeliveryPolicy(req.body),
      ...readPlacements(req.body),
      stock_status: stock_status || existing.stock_status || 'in-stock',
      // Same omission as the create path: the edit form posted a stock
      // quantity that was never destructured, so editing a product quietly
      // left its stock at whatever the create default had set.
      stock_quantity: stock_quantity !== undefined && String(stock_quantity).trim() !== ''
        ? Math.max(0, parseInt(stock_quantity, 10) || 0)
        : undefined
    }, null, null, null, colorsPayload);

    // 5. Handle newly uploaded images
    const primaryNewIdx = parseInt(req.body.primary_new_image_index, 10);
    const hasNewPrimary = (Number.isInteger(primaryNewIdx) && primaryNewIdx >= 0 && primaryNewIdx < processedWebpPaths.length);

    if (processedWebpPaths.length > 0) {
      const existingImages = await productRepo.findImages(productId);
      const currentCount = existingImages.length;
      let newPrimaryImageId = null;

      const newImageColors = readNewImageColors(req.body);
      for (let idx = 0; idx < processedWebpPaths.length; idx++) {
        const imgPath = processedWebpPaths[idx];
        // Never insert with is_primary=1 directly when replacing an existing
        // primary -- addImage() is a bare INSERT with no clearing logic, so
        // inserting a second primary row alongside an already-primary
        // existing image would leave two images marked primary at once.
        // setPrimaryImage() below clears every other row first.
        const willBecomePrimary = (hasNewPrimary && idx === primaryNewIdx) || (!hasNewPrimary && currentCount === 0 && idx === 0);
        const result = await productRepo.addImage(productId, imgPath, currentCount + idx, 0, newImageColors[idx] || null);
        if (willBecomePrimary) {
          newPrimaryImageId = result.lastInsertRowid;
        }
      }

      if (newPrimaryImageId) {
        await productRepo.setPrimaryImage(productId, newPrimaryImageId);
      }
    }

    // 6. Update primary image if explicitly selected
    if (!hasNewPrimary && req.body.primary_image_id) {
      await productRepo.setPrimaryImage(productId, req.body.primary_image_id);
    }

    // Ensure at least one image is primary if images exist
    const remainingImages = await productRepo.findImages(productId);
    if (remainingImages.length > 0 && !remainingImages.some(img => img.is_primary === true || img.is_primary === 1)) {
      await productRepo.setPrimaryImage(productId, remainingImages[0].id);
    }

    // 7. Sizes and per-image colour tags.
    // Both are replace-wholesale: what the form submitted is what the product
    // has afterwards, so removing a size row in the UI removes it here too. A
    // product with no size rows keeps a single price and shows no size picker,
    // which is the behaviour asked for.
    await variants.saveSizes(productRepo.db, productId, variants.parseSizes(req.body));
    await variants.saveImageColors(productRepo.db, productId, variants.parseImageColors(req.body));

    // Specifications. The form had no way to enter these at all -- it carried
    // a note saying they were "managed from separate pages", and no such page
    // exists -- so the product page's specs table could only ever show what
    // was seeded directly into the database.
    await variants.saveSpecs(productRepo.db, productId, variants.parseSpecs(req.body));

    // Invalidate API search cache immediately
    try { invalidateProductCache(); } catch (_) {}

    // Synchronize static frontend cache immediately
    try { await syncFrontend(); } catch (syncErr) { console.error('syncFrontend error:', syncErr.message); }

    console.log('[Product Updated] ID:', productId, 'Images added:', processedWebpPaths.length, 'Video:', finalVideoValue);
    setFlash(req, 'success', 'تم تحديث المنتج بنجاح');
    res.redirect('/admin/products');
  } catch (error) {
    console.error('Error updating product:', error);
    // Rollback newly uploaded images
    processedWebpPaths.forEach(webpUrl => {
      try {
        const fsPath = path.join(__dirname, '..', '..', webpUrl.replace(/^\//, ''));
        if (fs.existsSync(fsPath)) fs.unlinkSync(fsPath);
      } catch (_) {}
    });
    // Rollback newly uploaded video
    if (newVideoPath && newVideoPath.startsWith('/uploads/videos/')) {
      try {
        const vPath = path.join(__dirname, '..', '..', newVideoPath.replace(/^\//, ''));
        if (fs.existsSync(vPath)) fs.unlinkSync(vPath);
      } catch (_) {}
    }
    setFlash(req, 'danger', 'حدث خطأ أثناء تعديل المنتج: ' + error.message);
    res.redirect('back');
  }
});

// Delete Product (Safe with Uploads Cleanup)
router.post('/:id/delete', async (req, res) => {
  try {
    const { products: productRepo } = getRepositories();
    const id = req.params.id;

    const prod = await productRepo.findRawById(id);
    if (!prod) {
      setFlash(req, 'danger', 'المنتج غير موجود');
      return res.redirect('/admin/products');
    }

    const images = await productRepo.hardDelete(id);

    // Cleanup image files
    (images || []).forEach(img => {
      const p = (img.image_path || '').trim();
      if (p.startsWith('/uploads/products/') || p.startsWith('uploads/products/')) {
        try {
          const fsPath = path.join(__dirname, '..', '..', p.replace(/^\//, ''));
          if (fs.existsSync(fsPath)) fs.unlinkSync(fsPath);
        } catch (_) {}
      }
    });

    // Cleanup video file
    if (prod.video && prod.video.startsWith('/uploads/videos/')) {
      try {
        const vPath = path.join(__dirname, '..', '..', prod.video.replace(/^\//, ''));
        if (fs.existsSync(vPath)) fs.unlinkSync(vPath);
      } catch (_) {}
    }

    // Invalidate API search cache immediately
    try { invalidateProductCache(); } catch (_) {}

    // Synchronize static frontend cache immediately
    try { await syncFrontend(); } catch (syncErr) { console.error('syncFrontend error:', syncErr.message); }

    console.log('[Product Deleted] ID:', id);
    setFlash(req, 'success', 'تم حذف المنتج بنجاح');
    res.redirect('/admin/products');
  } catch (error) {
    console.error('Error deleting product:', error);
    setFlash(req, 'danger', 'حدث خطأ أثناء حذف المنتج: ' + error.message);
    res.redirect('/admin/products');
  }
});

// Duplicate an existing product (title/specs/images/faqs/colors), leaving
// the original untouched. The list.ejs "copy" button has posted here since
// before this route existed.
router.post('/:id/duplicate', async (req, res) => {
  try {
    const { products: productRepo } = getRepositories();
    const id = req.params.id;

    const original = await productRepo.findRawById(id);
    if (!original) {
      setFlash(req, 'danger', 'المنتج غير موجود');
      return res.redirect('/admin/products');
    }

    const [images, specs, faqs, colors] = await Promise.all([
      productRepo.findImages(original.id),
      productRepo.findSpecs(original.id),
      productRepo.findFaqs(original.id),
      productRepo.findColors(original.id)
    ]);

    // Copy each image file to its own new filename rather than sharing the
    // original's path -- otherwise deleting an image from either the
    // original or the duplicate later would delete the file both rows
    // point to, breaking the other product's image.
    const duplicatedImages = images.map(img => {
      const p = (img.image_path || '').trim();
      if (!p.startsWith('/uploads/products/')) {
        return { image_path: p, is_primary: img.is_primary };
      }
      try {
        const srcPath = path.join(UPLOAD_DIR, 'products', path.basename(p));
        if (!fs.existsSync(srcPath)) {
          return { image_path: p, is_primary: img.is_primary };
        }
        const ext = path.extname(srcPath);
        const newFilename = 'prod-' + Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
        const destPath = path.join(UPLOAD_DIR, 'products', newFilename);
        fs.copyFileSync(srcPath, destPath);
        return { image_path: '/uploads/products/' + newFilename, is_primary: img.is_primary };
      } catch (copyErr) {
        console.warn('Could not copy image file for duplicate, reusing original path:', copyErr.message);
        return { image_path: p, is_primary: img.is_primary };
      }
    });

    const newProductId = await productRepo.create({
      product_id: 'P-' + Date.now(),
      category_id: original.category_id,
      department_id: original.department_id,
      title: `نسخة من ${original.title}`,
      description: original.description || '',
      short_description: original.short_description || '',
      price: original.price,
      old_price: original.old_price,
      sku: '',
      barcode: '',
      tags: original.tags || '',
      brand: original.brand || '',
      origin: original.origin || '',
      warranty: original.warranty || '',
      shipping: original.shipping || '',
      delivery_time: original.delivery_time || '',
      installation: original.installation || '',
      weight: original.weight || '',
      video: '',
      is_new: original.is_new,
      is_best_seller: original.is_best_seller,
      is_active: 0,
      stock_status: original.stock_status || 'in-stock',
      stock_quantity: original.stock_quantity,
      delivery_policy_type: original.delivery_policy_type,
      delivery_fixed_fee_sar: original.delivery_fixed_fee_sar,
      requires_installation: original.requires_installation,
      installation_fee_sar: original.installation_fee_sar
    }, duplicatedImages, specs, faqs, colors);

    try { invalidateProductCache(); } catch (_) {}
    try { await syncFrontend(); } catch (syncErr) { console.error('syncFrontend error:', syncErr.message); }

    console.log('[Product Duplicated] Original ID:', id, 'New ID:', newProductId);
    setFlash(req, 'success', 'تم نسخ المنتج بنجاح. المنتج الجديد غير مفعّل حتى تراجعه.');
    res.redirect(`/admin/products/${newProductId}/edit`);
  } catch (error) {
    console.error('Error duplicating product:', error);
    setFlash(req, 'danger', 'حدث خطأ أثناء نسخ المنتج: ' + error.message);
    res.redirect('/admin/products');
  }
});

// AJAX: Set Primary Image
router.post('/:id/images/:imageId/set-primary', async (req, res) => {
  try {
    const updated = await productService.setPrimaryImage(req.params.id, req.params.imageId);
    res.json({ success: true, message: 'تم تعيين الصورة الرئيسية بنجاح', data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// AJAX: Delete Product Image
router.post('/:id/images/:imageId/delete', async (req, res) => {
  try {
    const updated = await productService.deleteProductImage(req.params.id, req.params.imageId);
    res.json({ success: true, message: 'تم حذف الصورة بنجاح', data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// API: Verify Cache Consistency
router.get('/api/verify-consistency', async (req, res) => {
  try {
    const report = await productService.verifyCacheConsistency();
    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
