const http = require('http');

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function run() {
  console.log('=== ADMIN ROUTES COMPREHENSIVE VERIFICATION ===');

  const loginPageRes = await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/admin/login',
    method: 'GET'
  });

  if (loginPageRes.statusCode !== 200) {
    throw new Error(`Failed to load login page: ${loginPageRes.statusCode}`);
  }

  let cookies = [];
  const setCookie = loginPageRes.headers['set-cookie'];
  if (setCookie) {
    cookies = setCookie.map(c => c.split(';')[0]);
  }

  const loginBody = 'username=admin&password=admin';
  const loginRes = await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/admin/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(loginBody),
      'Cookie': cookies.join('; ')
    }
  }, loginBody);

  console.log('Login Response Status:', loginRes.statusCode, 'Location:', loginRes.headers.location);
  if (loginRes.headers['set-cookie']) {
    cookies = loginRes.headers['set-cookie'].map(c => c.split(';')[0]);
  }

  const cookieHeader = cookies.join('; ');

  const routesToTest = [
    '/admin',
    '/admin/dashboard',
    '/admin/products',
    '/admin/orders',
    '/admin/categories',
    '/admin/customers',
    '/admin/najm',
    '/admin/coupons',
    '/admin/banners',
    '/admin/departments',
    '/admin/delivery',
    '/admin/requests',
    '/admin/customer-reports',
    '/admin/notifications',
    '/admin/reports',
    '/admin/settings',
    '/admin/theme',
    '/admin/users',
    '/admin/media',
    '/admin/pages',
    '/admin/frame-products',
    '/admin/branches',
    '/admin/ai-employee'
  ];

  let passed = 0;
  let failed = 0;

  for (const route of routesToTest) {
    try {
      const res = await request({
        hostname: '127.0.0.1',
        port: 3000,
        path: route,
        method: 'GET',
        headers: {
          'Cookie': cookieHeader
        }
      });

      if (res.statusCode === 200 || (res.statusCode === 302 && (res.headers.location === '/admin/dashboard' || res.headers.location === '/admin'))) {
        console.log(`[PASS] ${route} -> Status: ${res.statusCode}${res.headers.location ? ' (Redirect: ' + res.headers.location + ')' : ''}`);
        passed++;
      } else {
        console.error(`[FAIL] ${route} -> Status: ${res.statusCode} (Redirect: ${res.headers.location})`);
        console.error(res.body.slice(0, 300));
        failed++;
      }
    } catch (err) {
      console.error(`[ERROR] ${route} -> Exception: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
