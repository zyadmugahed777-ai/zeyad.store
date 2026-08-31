const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { currentCustomerId } = require('../../middleware/customer-auth');

/**
 * A signed-in customer's wishlist is keyed on their id alone. The guest id is
 * a caller-written header, so honouring it alongside a session would let a
 * logged-in shopper read or write an arbitrary guest's list.
 */
function wishlistIdentity(req) {
  const userId = currentCustomerId(req);
  return { userId, guestId: userId ? null : (req.headers['x-guest-id'] || null) };
}

/**
 * Get current wishlist
 */
router.get('/', async (req, res) => {
  try {
    const repos = getRepositories();
    const { userId, guestId } = wishlistIdentity(req);

    if (!userId && !guestId) {
      return res.json({ success: true, items: [], count: 0 });
    }

    const wl = await repos.wishlists.findOrCreateWishlist({ userId, guestId });
    if (!wl) {
      return res.json({ success: true, items: [], count: 0 });
    }

    const rawItems = (await repos.wishlists.getItems(wl.id)) || [];

    const items = rawItems.map(row => {
      const pid = row.code || row.raw_product_id || String(row.internal_id || '');
      return {
        id: pid,
        product_id: pid,
        title: row.title || 'منتج من متجر زياد ستور',
        price: Number(row.price) || 0,
        oldPrice: Number(row.old_price) || Number(row.price) || 0,
        brand: row.brand || 'زياد ستور',
        stock_status: row.stock_status || 'in-stock',
        image: row.main_image ? (row.main_image.startsWith('/') || row.main_image.startsWith('http') ? row.main_image : '/' + row.main_image) : '/assets/placeholder.svg',
        gallery: [row.main_image ? (row.main_image.startsWith('/') || row.main_image.startsWith('http') ? row.main_image : '/' + row.main_image) : '/assets/placeholder.svg']
      };
    });

    res.json({ success: true, count: items.length, items });
  } catch (error) {
    console.error('Get Wishlist Error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * Toggle product in wishlist
 */
router.post('/toggle', async (req, res) => {
  try {
    const repos = getRepositories();
    const { userId, guestId } = wishlistIdentity(req);
    const { productId } = req.body;

    if (!userId && !guestId) {
      return res.status(400).json({ success: false, error: 'Session required' });
    }
    if (!productId) {
      return res.status(400).json({ success: false, error: 'Product ID required' });
    }

    const wl = await repos.wishlists.findOrCreateWishlist({ userId, guestId });
    const { isAdded } = (await repos.wishlists.toggleItem(wl.id, String(productId))) || {};

    res.json({ success: true, isAdded: Boolean(isAdded) });
  } catch (error) {
    console.error('Toggle Wishlist Error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * Merge guest wishlist into user wishlist
 */
router.post('/merge', async (req, res) => {
  try {
    const repos = getRepositories();
    const userId = currentCustomerId(req);
    const { guestId } = req.body;

    if (!userId || !guestId) {
      return res.json({ success: true, ignored: true });
    }

    const result = await repos.wishlists.mergeWishlists(guestId, userId);
    res.json(result);
  } catch (error) {
    console.error('Merge Wishlist Error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
