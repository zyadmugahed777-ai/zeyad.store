/**
 * Product variants: sizes that carry their own price, and images tied to a
 * colour.
 *
 * The rules the operator set, and which this module enforces:
 *
 *   - A product shows sizes only if someone added sizes to it. A product with
 *     none stays a single-price product and its page looks exactly as before.
 *   - Same for colours: nothing is shown unless it was entered in the admin.
 *     No colour list is invented for a product that has none.
 *   - Each size carries a full price, not a delta. A 6kg washer at 1200 and a
 *     7kg at 1450 are two prices; picking one sets the price outright, so the
 *     checkout total never has to reconstruct anything.
 *   - Picking a colour shows that colour's photo. An image with no colour is a
 *     general product photo and keeps behaving as one.
 */

/** Parse the admin form's size rows into clean records. */
function parseSizes(body) {
  const labels = [].concat(body['size_label[]'] || body.size_label || []);
  const prices = [].concat(body['size_price[]'] || body.size_price || []);

  const out = [];
  const seen = new Set();
  for (let i = 0; i < labels.length; i++) {
    const label = String(labels[i] == null ? '' : labels[i]).trim();
    if (!label) continue;

    // A duplicate label would show the customer the same choice twice at two
    // prices. The database refuses it too; catching it here keeps the save
    // from failing outright over a typo.
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const price = Number(String(prices[i] == null ? '' : prices[i]).replace(/[^\d.]/g, ''));
    if (!Number.isFinite(price) || price < 0) continue;

    out.push({ label, price, sort_order: out.length + 1 });
  }
  return out;
}

/**
 * Parse which colour each existing image was tagged with.
 * The form posts image_color_<imageId>=<colour name>.
 */
function parseImageColors(body) {
  const map = new Map();
  for (const [key, value] of Object.entries(body || {})) {
    const m = /^image_color_(\d+)$/.exec(key);
    if (!m) continue;
    const name = String(value == null ? '' : value).trim();
    map.set(Number(m[1]), name || null);
  }
  return map;
}

/**
 * Parse the admin form's specification rows.
 *
 * The operator writes both halves: a heading such as "الاستهلاك" and its value
 * "تستهلك 50 وات فقط". Nothing is chosen for them and nothing is defaulted --
 * a product with no rows shows no specifications at all, exactly as before.
 */
function parseSpecs(body) {
  const labels = [].concat(body['spec_label[]'] || body.spec_label || []);
  const values = [].concat(body['spec_value[]'] || body.spec_value || []);

  const out = [];
  for (let i = 0; i < labels.length; i++) {
    const label = String(labels[i] == null ? '' : labels[i]).trim();
    const value = String(values[i] == null ? '' : values[i]).trim();
    // Both halves are required: a heading with no value, or a value with no
    // heading, would render as a broken row on the product page.
    if (!label || !value) continue;
    out.push({ label, value, sort_order: out.length + 1 });
  }
  return out;
}

/** Replace a product's specifications wholesale. Empty list clears them. */
async function saveSpecs(db, productId, specs) {
  await db.prepare('DELETE FROM product_specs WHERE product_id = ?').run(productId);
  for (const s of specs) {
    await db.prepare(
      'INSERT INTO product_specs (product_id, label, value, sort_order) VALUES (?, ?, ?, ?)'
    ).run(productId, s.label, s.value, s.sort_order);
  }
  return specs.length;
}

/** Replace a product's sizes wholesale. Empty list clears them. */
async function saveSizes(db, productId, sizes) {
  await db.prepare('DELETE FROM product_sizes WHERE product_id = ?').run(productId);
  for (const s of sizes) {
    await db.prepare(
      'INSERT INTO product_sizes (product_id, label, price, sort_order) VALUES (?, ?, ?, ?)'
    ).run(productId, s.label, s.price, s.sort_order);
  }
  return sizes.length;
}

/** Apply colour tags to existing images. */
async function saveImageColors(db, productId, colorMap) {
  let touched = 0;
  for (const [imageId, colorName] of colorMap) {
    const res = await db.prepare(
      'UPDATE product_images SET color_name = ? WHERE id = ? AND product_id = ?'
    ).run(colorName, imageId, productId);
    if (res && (res.changes || res.rowCount)) touched++;
  }
  return touched;
}

async function findSizes(db, productId) {
  return (await db.prepare(
    'SELECT id, label, price, sort_order FROM product_sizes WHERE product_id = ? AND is_active = TRUE ORDER BY sort_order ASC, id ASC'
  ).all(productId)) || [];
}

/**
 * Group a product's images by the colour they were tagged with.
 * Returns { 'أزرق': ['/uploads/a.webp'], ... } plus the untagged ones under ''.
 */
function groupImagesByColor(images) {
  const byColor = {};
  for (const img of images || []) {
    const key = (img.color_name || '').trim();
    if (!byColor[key]) byColor[key] = [];
    byColor[key].push(img.image_path);
  }
  return byColor;
}

/**
 * The price a customer actually pays for a chosen size.
 * Falls back to the product's own price when the product has no sizes, or the
 * chosen label is not one of them -- a stale link must never silently charge a
 * price that was never offered.
 */
function priceForSize(product, sizes, chosenLabel) {
  if (!chosenLabel || !sizes || sizes.length === 0) return Number(product.price) || 0;
  const hit = sizes.find((s) => s.label === chosenLabel);
  return hit ? Number(hit.price) : Number(product.price) || 0;
}

/** The image to show for a chosen colour, or the primary image. */
function imageForColor(images, chosenColor) {
  const list = images || [];
  if (chosenColor) {
    const hit = list.find((i) => (i.color_name || '').trim() === String(chosenColor).trim());
    if (hit) return hit.image_path;
  }
  const primary = list.find((i) => i.is_primary === true || i.is_primary === 1);
  return primary ? primary.image_path : (list[0] ? list[0].image_path : null);
}

module.exports = {
  parseSpecs,
  saveSpecs,
  parseSizes,
  parseImageColors,
  saveSizes,
  saveImageColors,
  findSizes,
  groupImagesByColor,
  priceForSize,
  imageForColor
};
