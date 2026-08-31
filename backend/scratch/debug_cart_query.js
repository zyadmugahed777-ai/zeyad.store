const { getPgPool, closePgPool } = require('../config/pg-database');

async function debugQuery() {
  const pool = getPgPool();
  try {
    const sql = `
      SELECT 
        ci.id as cart_item_id,
        ci.cart_id,
        ci.product_id as stored_product_id,
        ci.quantity,
        ci.selected_color,
        ci.image_url as ci_image_url,
        p.id as internal_id,
        p.product_id,
        p.title,
        p.price,
        p.old_price,
        p.stock_quantity,
        p.stock_status,
        p.is_active,
        p.warranty,
        p.shipping,
        p.delivery_time,
        p.installation,
        (SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as main_image
      FROM cart_items ci
      JOIN products p ON (ci.product_id = p.product_id OR ci.product_id = p.id::TEXT)
      WHERE ci.cart_id = $1
      ORDER BY ci.id DESC
    `;
    const resNum = await pool.query(sql, [1]);
    console.log('Query successful! Rows:', resNum.rows.length);
  } catch (err) {
    console.error('Error caught:', err);
  } finally {
    await closePgPool();
  }
}

debugQuery();
