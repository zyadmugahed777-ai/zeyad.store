const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(__dirname, '../..');
const UPLOADS_DIR = path.join(BACKEND_DIR, 'uploads');

const { getRepositories } = require('../repositories');
const { syncFrontend } = require('./sync-frontend');

function auditAndRepairImages() {
  console.log('=== STARTING PRODUCT IMAGE AUDIT & REPAIR ===\n');
  const repos = getRepositories();

  const totalProducts = repos.products.count();
  const allImages = repos.products.findAllImageRecords();

  const report = {
    totalProducts,
    totalImages: allImages.length,
    validImages: 0,
    brokenImages: 0,
    fixedPaths: 0,
    missingFiles: []
  };

  for (const img of allImages) {
    let rawPath = (img.image_path || '').trim();
    if (!rawPath) {
      report.brokenImages++;
      report.missingFiles.push({ id: img.id, product_id: img.product_id, path: '(empty)' });
      continue;
    }

    // Skip external http/https/data URLs (valid by definition)
    if (rawPath.startsWith('http://') || rawPath.startsWith('https://') || rawPath.startsWith('data:')) {
      report.validImages++;
      continue;
    }

    // Normalize path separators
    let normalized = rawPath.replace(/\\/g, '/');

    // Clean leading duplicate slashes
    while (normalized.startsWith('//')) normalized = normalized.substring(1);
    if (!normalized.startsWith('/')) normalized = '/' + normalized;

    // Check potential physical file locations
    const rootCandidate = path.join(ROOT_DIR, normalized.substring(1));
    const backendCandidate = path.join(BACKEND_DIR, normalized.substring(1));

    let fileFound = false;
    let finalValidWebPath = normalized;

    if (fs.existsSync(rootCandidate) && fs.statSync(rootCandidate).isFile()) {
      fileFound = true;
    } else if (fs.existsSync(backendCandidate) && fs.statSync(backendCandidate).isFile()) {
      fileFound = true;
    } else {
      // Try searching for file in uploads/products by basename if name matches
      const basename = path.basename(normalized);
      const inUploads = path.join(UPLOADS_DIR, 'products', basename);
      const inAssets = path.join(ROOT_DIR, 'assets', basename);
      if (fs.existsSync(inUploads) && fs.statSync(inUploads).isFile()) {
        fileFound = true;
        finalValidWebPath = '/uploads/products/' + basename;
      } else if (fs.existsSync(inAssets) && fs.statSync(inAssets).isFile()) {
        fileFound = true;
        finalValidWebPath = '/assets/' + basename;
      }
    }

    if (fileFound) {
      report.validImages++;
      if (finalValidWebPath !== rawPath) {
        repos.products.updateImagePath(img.id, finalValidWebPath);
        report.fixedPaths++;
      }
    } else {
      report.brokenImages++;
      report.missingFiles.push({ id: img.id, product_id: img.product_id, path: rawPath });
      // If broken, point to valid placeholder to avoid 404
      repos.products.updateImagePath(img.id, '/assets/placeholder.svg');
      report.fixedPaths++;
    }
  }

  // Ensure every product with images has at least one primary image
  repos.products.ensurePrimaryImages();

  // Sync caches
  try {
    syncFrontend();
  } catch (_) {}

  console.log('==============================================');
  console.log('        IMAGE AUDIT & REPAIR SUMMARY          ');
  console.log('==============================================');
  console.log('  Total Products:  ' + report.totalProducts);
  console.log('  Total Images:    ' + report.totalImages);
  console.log('  Valid Images:    ' + report.validImages);
  console.log('  Broken Images:   ' + report.brokenImages);
  console.log('  Fixed DB Paths:  ' + report.fixedPaths);
  console.log('  Missing Files:   ' + report.missingFiles.length);
  console.log('==============================================\n');

  return report;
}

if (require.main === module) {
  auditAndRepairImages();
}

module.exports = { auditAndRepairImages };
