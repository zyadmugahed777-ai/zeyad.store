const router = require('express').Router();
const { geocodingService } = require('../../services/geocoding-service');

// Search locations with Yemeni auto-suggestions
router.get('/search', async (req, res) => {
  try {
    const q = req.query.q || '';
    const results = await geocodingService.searchLocations(q);
    res.json({
      success: true,
      query: q,
      count: results.length,
      data: results
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reverse geocode (lat, lng) to structured address
router.get('/reverse', async (req, res) => {
  try {
    const lat = req.query.lat;
    const lng = req.query.lng;
    if (!lat || !lng) {
      return res.status(400).json({ success: false, error: 'الإحداثيات الجغرافية (lat, lng) مطلوبة' });
    }

    const result = await geocodingService.reverseGeocode(lat, lng);
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
