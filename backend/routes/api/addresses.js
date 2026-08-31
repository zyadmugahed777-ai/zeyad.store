const router = require('express').Router();
const { addressService } = require('../../services/address-service');
const { currentCustomerId } = require('../../middleware/customer-auth');

/**
 * Who is asking, resolved once, the same way for every handler below.
 *
 * Two rules that the previous per-handler copies did not all keep:
 *
 *  - A signed-in customer is a customer, full stop. Their guest header is
 *    ignored, so nobody can hold a session and still reach a guest bucket by
 *    sending along someone else's x-guest-id.
 *  - A caller who is neither -- no session, no guest id -- has no identity at
 *    all, and the handlers refuse rather than falling through to a service
 *    that used to interpret "no owner given" as "skip the ownership check".
 */
function identify(req) {
  const customerId = currentCustomerId(req);
  if (customerId) return { customerId, guestId: null };

  const guestId = req.headers['x-guest-id'] || req.query.guestId || (req.body && req.body.guestId) || null;
  return { customerId: null, guestId: guestId ? String(guestId) : null };
}

function requireIdentity(req, res) {
  const identity = identify(req);
  if (!identity.customerId && !identity.guestId) {
    res.status(401).json({
      success: false,
      code: 'IDENTITY_REQUIRED',
      error: 'يجب تسجيل الدخول للوصول إلى العناوين'
    });
    return null;
  }
  return identity;
}

// Get all saved addresses for current user / guest
router.get('/', async (req, res) => {
  try {
    const identity = requireIdentity(req, res);
    if (!identity) return;

    const addresses = await addressService.getAddresses(identity);
    res.json({
      success: true,
      count: addresses.length,
      data: addresses
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'تعذر تحميل العناوين' });
  }
});

// Get single address
router.get('/:id', async (req, res) => {
  try {
    const identity = requireIdentity(req, res);
    if (!identity) return;

    const address = await addressService.getAddressById(req.params.id, identity);
    if (!address) {
      return res.status(404).json({ success: false, error: 'العنوان غير موجود أو لا تملك صلاحية الوصول إليه' });
    }
    res.json({ success: true, data: address });
  } catch (err) {
    res.status(500).json({ success: false, error: 'تعذر تحميل العنوان' });
  }
});

// Create new address
router.post('/', async (req, res) => {
  try {
    const identity = requireIdentity(req, res);
    if (!identity) return;

    const address = await addressService.createAddress(req.body, identity);
    res.status(201).json({
      success: true,
      message: 'تم حفظ العنوان بنجاح',
      data: address
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Update address
router.put('/:id', async (req, res) => {
  try {
    const identity = requireIdentity(req, res);
    if (!identity) return;

    const address = await addressService.updateAddress(req.params.id, req.body, identity);
    res.json({
      success: true,
      message: 'تم تحديث العنوان بنجاح',
      data: address
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Delete address
router.delete('/:id', async (req, res) => {
  try {
    const identity = requireIdentity(req, res);
    if (!identity) return;

    await addressService.deleteAddress(req.params.id, identity);
    res.json({
      success: true,
      message: 'تم حذف العنوان بنجاح'
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Set address as default
router.post('/:id/default', async (req, res) => {
  try {
    const identity = requireIdentity(req, res);
    if (!identity) return;

    const address = await addressService.setDefault(req.params.id, identity);
    res.json({
      success: true,
      message: 'تم تعيين العنوان كعنوان افتراضي',
      data: address
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
