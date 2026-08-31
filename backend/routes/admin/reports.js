const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { REQUEST_TYPE_MAP, REQUEST_STATUS_MAP } = require('../../services/customer-request-service');

router.get('/', async (req, res, next) => {
  try {
    const repos = getRepositories();
    
    // 1. Orders Status breakdown
    const statusCounts = (await repos.orders.getStatusDistribution()) || [];
    
    // 2. Top products by sales
    const topProducts = (await repos.orders.getTopProductsBySales(10)) || [];

    // 3. Customer Requests Operational Breakdown
    const requestStatusCounts = (await repos.customerRequests.getStatusCounts()) || {};
    const requestTypeCounts = (await repos.customerRequests.getTypeCounts()) || {};

    // 4. Customer Issue Reports Breakdown
    const fullReportStats = (await repos.customerReports.getStats()) || {};
    const reportStats = {
      total: fullReportStats.total || 0,
      new: fullReportStats.new || 0,
      verified: fullReportStats.verified || 0,
      rewarded: fullReportStats.rewarded || 0,
      completed: fullReportStats.completed || 0
    };

    // 5. Aggregate Sales & Conversion totals
    const totalRevenueRow = await repos.orders.getRevenueSummary();
    const totalOrdersCount = await repos.orders.count();
    const totalCustomersCount = await repos.customers.count();

    res.render('admin/reports/index', {
      title: 'التقارير والعمليات التشغيلية',
      active: 'reports',
      statusCounts,
      topProducts,
      requestStatusCounts,
      requestTypeCounts,
      reportStats,
      requestTypeMap: REQUEST_TYPE_MAP,
      requestStatusMap: REQUEST_STATUS_MAP,
      totalRevenue: totalRevenueRow?.total_sar || 0,
      totalOrdersCount,
      totalCustomersCount
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;