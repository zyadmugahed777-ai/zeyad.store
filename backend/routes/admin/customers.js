const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { parsePagination } = require('../../utils/helpers');

// List
router.get('/', async (req, res, next) => {
  try {
    const { customers: customerRepo } = getRepositories();
    const { page, limit, offset } = parsePagination(req.query);
    const search = req.query.q || '';

    const filters = { search };
    const totalItems = await customerRepo.count(filters);
    const customers = await customerRepo.findAll(filters, limit, offset);

    res.render('admin/customers/list', {
      title: 'العملاء',
      active: 'customers',
      customers,
      search,
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit)
    });
  } catch (error) {
    next(error);
  }
});

// Detail
router.get('/:id', async (req, res, next) => {
  try {
    const { customers: customerRepo } = getRepositories();
    const customer = await customerRepo.findById(req.params.id);
    if (!customer) return res.redirect('/admin/customers');

    const orders = await customerRepo.findCustomerOrders(customer.id);

    res.render('admin/customers/detail', {
      title: 'العميل: ' + (customer.first_name || '') + ' ' + (customer.last_name || ''),
      active: 'customers',
      customer,
      orders
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;