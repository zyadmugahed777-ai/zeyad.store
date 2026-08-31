const bcrypt = require('bcryptjs');
const { getRepositories } = require('../repositories');
const { wantsJson } = require('./csrf');

/**
 * Middleware to require admin authentication
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }

  // An expired session on a fetch() call used to answer with a 302 to the HTML
  // login page. The browser followed it and the caller's `await res.json()`
  // died on "Unexpected token '<', \"<!DOCTYPE \"..." -- an error that hides
  // the real cause (you are logged out). Answer JSON callers in their own
  // language so the panel can say so plainly.
  if (wantsJson(req)) {
    return res.status(401).json({
      success: false,
      code: 'AUTH_REQUIRED',
      message: 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى ثم أعد المحاولة.'
    });
  }

  // Store original URL for redirect after login
  req.session.returnTo = req.originalUrl;
  return res.redirect('/admin/login');
}

/**
 * Middleware for Role Based Access Control
 */
function requireRole(allowedRoles) {
  return async (req, res, next) => {
    if (!req.session || !req.session.admin) return res.redirect('/admin/login');
    
    const roleId = req.session.admin.role_id;
    const { auth: authRepo } = getRepositories();
    const role = await authRepo.findRoleById(roleId);
    
    if (role && allowedRoles.includes(role.name)) {
      return next();
    }
    
    req.session.flash = { type: 'danger', message: 'ليس لديك صلاحية للوصول إلى هذه الصفحة' };
    res.redirect('/admin');
  };
}

/**
 * Function to log admin actions (Audit Logs)
 */
async function logAction(userId, action, entity, entityId, newValues = null, oldValues = null, ip = null) {
  try {
    const { auth: authRepo } = getRepositories();
    await authRepo.logAction({
      user_id: userId,
      action,
      entity,
      entity_id: entityId,
      old_values: oldValues,
      new_values: newValues,
      ip_address: ip
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

/**
 * Login admin user
 */
async function loginAdmin(username, password, req) {
  const { auth: authRepo } = getRepositories();
  // Fetch user and join with roles
  const admin = await authRepo.findAdminByUsername(username);

  if (!admin || !admin.password_hash) return null;

  const isValid = bcrypt.compareSync(password, admin.password_hash);
  if (!isValid) return null;

  // Update last login
  await authRepo.updateLastLogin(admin.id);

  await logAction(admin.id, 'LOGIN', 'auth', admin.id, null, null, req ? req.ip : null);

  return {
    id: admin.id,
    username: admin.username,
    full_name: admin.full_name,
    email: admin.email,
    role_id: admin.role_id,
    role_name: admin.role_name
  };
}

/**
 * Create default admin user if none exists
 */
async function ensureDefaultAdmin() {
  const { auth: authRepo } = getRepositories();
  const count = await authRepo.countAdminUsersTotal();

  if (count === 0) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'changeme123';
    const hash = bcrypt.hashSync(password, 10);

    // Assume role_id 1 is Super Admin based on update_v2.sql
    await authRepo.createAdminUser({
      username,
      password_hash: hash,
      full_name: 'مدير النظام',
      role: 'admin',
      role_id: 1,
      is_active: 1
    });

    console.log(`  Default admin created: ${username}`);
  }
}

/**
 * Set flash message in session
 */
function setFlash(req, type, message) {
  if (req.session) {
    req.session.flash = { type, message };
  }
}

module.exports = { requireAuth, requireRole, logAction, loginAdmin, ensureDefaultAdmin, setFlash };
