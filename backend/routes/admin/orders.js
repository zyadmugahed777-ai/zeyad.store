const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { parsePagination, formatDate, paymentLabel } = require('../../utils/helpers');
const whatsapp = require('../../services/whatsapp-message-service');
const { setFlash } = require('../../middleware/auth');

router.get('/', async (req, res, next) => {
  try {
    const orderRepo = getRepositories().orders;
    const { page, limit, offset } = parsePagination(req.query);
    const search = req.query.q || '';
    const status = req.query.status || '';

    const filters = { search, status };
    const totalItems = await orderRepo.count(filters);
    const orders = await orderRepo.findAll(filters, limit, offset);

    // One batched query for the whole page, so the list can show what was
    // actually ordered instead of a wall of identical-looking text rows.
    const previews = await orderRepo.findItemPreviewsForOrders(orders.map(o => o.id));
    for (const o of orders) {
      const bucket = previews.get(Number(o.id)) || { items: [], total: 0 };
      o.item_previews = bucket.items;
      o.item_count = bucket.total;
    }

    res.render('admin/orders/list', {
      title: 'الطلبات',
      active: 'orders',
      orders,
      search,
      status,
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const orderRepo = getRepositories().orders;
    const order = await orderRepo.findById(req.params.id);
    if (!order) {
      return res.status(404).render('admin/error', {
        title: 'الطلب غير موجود',
        active: 'orders',
        message: 'الطلب غير موجود أو تم حذفه'
      });
    }

    const items = await orderRepo.findItemsByOrderId(order.id);
    const payment = await orderRepo.findPaymentByOrderId(order.id);

    // Compose the customer message here rather than reading the stored
    // order.whatsapp_message column: that column is populated on only a
    // fraction of orders (so the button silently disappeared on the rest) and
    // what it holds is the customer's own checkout note, not a message from
    // the company.
    let settingsMap = {};
    try {
      settingsMap = (await getRepositories().settings.getAllAsMap()) || {};
    } catch (_) { /* fall back to the built-in defaults */ }

    const whatsappLink = whatsapp.buildOrderLink({
      order,
      items,
      settings: settingsMap,
      formatDate,
      paymentLabel
    });

    res.render('admin/orders/detail', {
      title: 'تفاصيل الطلب ' + order.order_id,
      active: 'orders',
      order,
      items,
      payment,
      whatsappLink
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/status', async (req, res, next) => {
  try {
    const orderRepo = getRepositories().orders;
    await orderRepo.updateStatus(req.params.id, req.body.status);
    setFlash(req, 'success', 'تم تحديث حالة الطلب بنجاح');
    res.redirect('/admin/orders/' + req.params.id);
  } catch (error) {
    next(error);
  }
});

module.exports = router;