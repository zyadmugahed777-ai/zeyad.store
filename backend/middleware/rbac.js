
const rolePermissions = {
  'Super Admin': ['*'],
  'Admin': [
    'dashboard:view', 'orders:*', 'customers:*', 'branches:*', 'offers:*',
    'banners:*', 'media:*', 'pages:*', 'notifications:*', 'settings:*',
    'users:view', 'reports:view', 'departments:*', 'categories:*', 'products:*', 'ai:*',
    'coupons:*', 'delivery:*', 'requests:*', 'customer-reports:*', 'frame-products:*'
  ],
  'Editor': [
    'dashboard:view', 'products:view', 'products:update', 'categories:view',
    'offers:*', 'banners:*', 'media:*', 'pages:*', 'notifications:view',
    'departments:view', 'frame-products:view'
  ],
  'Sales': [
    'dashboard:view', 'orders:*', 'customers:*', 'offers:view', 'notifications:*', 'reports:view',
    'coupons:view', 'delivery:view', 'requests:*', 'customer-reports:*'
  ],
  'Support': [
    'dashboard:view', 'orders:view', 'customers:view', 'notifications:*',
    'requests:*', 'customer-reports:*'
  ]
};

function checkPermission(requiredPermission) {
  return (req, res, next) => {
    if (!req.session || !req.session.admin) {
      return res.redirect('/admin/login');
    }

    const roleName = req.session.admin.role_name;
    const perms = rolePermissions[roleName] || [];

    if (perms.includes('*') || perms.includes(requiredPermission)) {
      return next();
    }

    const [resource, action] = requiredPermission.split(':');
    const wildcard = `${resource}:*`;

    if (perms.includes(wildcard)) {
      return next();
    }

    const acceptsJson = (req.xhr) || String(req.headers.accept || '').indexOf('json') > -1;
    if (acceptsJson) {
      return res.status(403).json({ success: false, error: 'ليس لديك صلاحية لإجراء هذه العملية.' });
    }

    req.session.flash = { type: 'danger', message: 'ليس لديك صلاحية للوصول إلى هذه الصفحة.' };
    res.redirect('/admin/dashboard');
  };
}

module.exports = { checkPermission, rolePermissions };
