/**
 * Import products from products_db.json into SQLite database
 * Run: node utils/import-products.js
 * Delegates data access and atomic transactions to canonical repositories (products, categories).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { getRepositories } = require('../repositories');

const PRODUCTS_JSON_PATH = path.join(__dirname, '..', '..', 'products_db.json');

function importProducts(customProductsArray = null) {
  console.log('Starting product import...');
  const repos = getRepositories();

  // Check if products already exist (unless custom products array passed for tests)
  if (!customProductsArray) {
    const existingCount = repos.products.count();
    if (existingCount > 0) {
      console.log(`Database already has ${existingCount} products. Skipping import.`);
      console.log('To re-import, delete existing products first.');
      return { skipped: true, existingCount };
    }
  }

  let products = customProductsArray;
  if (!products) {
    // Read products JSON
    if (!fs.existsSync(PRODUCTS_JSON_PATH)) {
      console.error(`Products file not found: ${PRODUCTS_JSON_PATH}`);
      return { error: 'file_not_found' };
    }

    try {
      const raw = fs.readFileSync(PRODUCTS_JSON_PATH, 'utf8');
      products = JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse products_db.json:', e.message);
      return { error: 'parse_error', message: e.message };
    }
  }

  console.log(`Found ${products.length} products to import.`);

  // Load category IDs via repository
  const categoryMap = repos.categories.getCodeToIdMap();

  // Import atomically via repository transaction
  const result = repos.products.importProductsBatch(products, categoryMap);

  console.log(`\nImport complete:`);
  console.log(`  Imported: ${result.imported}`);
  console.log(`  Skipped: ${result.skipped}`);
  console.log(`  Total in DB: ${repos.products.count()}`);

  return result;
}

// Run if called directly
if (require.main === module) {
  importProducts();
}

module.exports = { importProducts };
