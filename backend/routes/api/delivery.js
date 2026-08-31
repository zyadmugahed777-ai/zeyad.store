/**
 * Zeyad For Business - Public Delivery API
 */

const router = require('express').Router();
const { deliveryService } = require('../../services/delivery-service');
const { couponService } = require('../../services/coupon-service');

// Get all active delivery policies
router.get('/policies', async (req, res) => {
  try {
    const policies = (await deliveryService.getPolicies({ activeOnly: true })) || [];
    res.json({ success: true, count: policies.length, policies });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all provinces
router.get('/provinces', async (req, res) => {
  try {
    const provinces = (await deliveryService.getProvinces(true)) || [];
    res.json({ success: true, count: provinces.length, provinces });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get comprehensive public delivery page info
router.get('/info', async (req, res) => {
  try {
    const info = (await deliveryService.getPublicDeliveryInfo()) || {};
    res.json({ success: true, data: info });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Evaluate delivery for custom items and location
router.post('/evaluate', async (req, res) => {
  try {
    const { items = [], city = '', deliveryMethod = 'standard', couponCode = '', currency = 'SAR' } = req.body;

    let appliedCoupon = null;
    if (couponCode && String(couponCode).trim()) {
      const v = await couponService.validateCoupon(couponCode, { targetCurrency: currency });
      if (v.isValid) appliedCoupon = v.coupon;
    }

    const evaluation = await deliveryService.evaluateCartDelivery(items, city, deliveryMethod, appliedCoupon, currency);
    res.json({ success: true, data: evaluation });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
