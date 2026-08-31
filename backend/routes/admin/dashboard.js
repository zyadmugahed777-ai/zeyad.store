const express = require('express');
const router = express.Router();
const { getRepositories } = require('../../repositories');

router.get('/', async (req, res, next) => {
  try {
    const repos = getRepositories();
    const orderStats = (await repos.orders.getStats()) || {};
    
    // 1. Top Stats
    const stats = {
      productsCount: await repos.products.count({}),
      customersCount: await repos.customers.count({}),
      totalSales: orderStats.totalSalesNative || orderStats.totalSales || 0,
      ordersCount: orderStats.totalOrders || 0
    };

    // 2. Order Status Distribution (For Doughnut Chart)
    const statusDist = (await repos.orders.getStatusDistribution()) || [];
    
    // Format for Chart.js
    const chartStatusData = {
      labels: statusDist.map(s => s.status),
      data: statusDist.map(s => Number(s.count) || 0),
      colors: statusDist.map(s => {
        switch(s.status) {
          case 'pending': return '#f59e0b';
          case 'processing': return '#3b82f6';
          case 'shipped': return '#8b5cf6';
          case 'delivered': return '#10b981';
          case 'cancelled': return '#ef4444';
          default: return '#9ca3af';
        }
      })
    };

    // 3. Sales last 30 days (For Line Chart)
    const salesDataRaw = (await repos.orders.getSalesLastNDays(30)) || [];
    
    const chartSalesData = {
      labels: salesDataRaw.map(s => s.sale_date),
      data: salesDataRaw.map(s => Number(s.daily_total) || 0)
    };

    // 4. Top Selling Products
    const topProducts = (await repos.orders.getTopSellingProducts(5)) || [];

    // 5. Recent Orders
    const recentOrders = (await repos.orders.getRecentOrdersWithCustomer(6)) || [];

    res.render('admin/dashboard', { 
      title: 'لوحة التحكم', 
      active: 'dashboard',
      stats,
      statusDist,
      chartStatusData: JSON.stringify(chartStatusData),
      chartSalesData: JSON.stringify(chartSalesData),
      topProducts,
      recentOrders
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;