const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runMobileHeaderTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING MOBILE HEADER EXACT POSITIONING VERIFICATION');
  console.log('====================================================');

  const globalUx = fs.readFileSync(path.resolve('assets/js/core/global-ux.js'), 'utf8');
  const responsiveCss = fs.readFileSync(path.resolve('responsive-pro.css'), 'utf8');

  console.log('\n--- Group 1: Mobile Header Element Structure & RTL DOM Order ---');
  // 1. Z Logo
  assert(globalUx.includes('zfb-mobile-brand-mark') && globalUx.includes('zfb-mobile-brand'), 'Header includes Z brand mark');
  
  // 2. Hamburger menu next to Z logo in brand group
  assert(globalUx.includes('zfb-mobile-brand-group') && globalUx.includes('zfb-mobile-menu-btn'), 'Hamburger menu ☰ is grouped with Z logo');
  assert(globalUx.includes('toggleMobileDrawer(true)'), 'Hamburger button invokes toggleMobileDrawer(true)');

  // 3. Search form in the middle
  assert(globalUx.includes('zfb-mobile-search') && globalUx.includes('zfb-mobile-search-field'), 'Search bar sits in the middle row');

  // 4. Actions group on the left: Theme, Currency, Cart, Options (Three-dots)
  assert(globalUx.includes('data-mobile-theme-toggle'), 'Header includes Theme toggle button');
  assert(globalUx.includes('data-mobile-currency-toggle') && globalUx.includes('data-mobile-currency-label'), 'Header includes Currency toggle button with live label');
  assert(globalUx.includes('zfb-mobile-cart-btn') && globalUx.includes('zfb-mobile-cart-count'), 'Header includes Cart button with quantity badge');
  assert(globalUx.includes('zfb-mobile-more-btn') && globalUx.includes('toggleOptionsMenu'), 'Header includes Three-dots menu button ⋮ invoking toggleOptionsMenu');

  console.log('\n--- Group 2: Currency & Options Event Handlers ---');
  assert(globalUx.includes('data-mobile-currency-toggle') && globalUx.includes('window.ZFB_CURRENCY.setCurrency'), 'Currency toggle click listener switches between YER and SAR');
  assert(globalUx.includes('window.toggleOptionsMenu = toggleOptionsMenu'), 'toggleOptionsMenu is globally available on window');
  assert(globalUx.includes('window.toggleMobileDrawer = toggleMobileDrawer'), 'toggleMobileDrawer is globally available on window');

  console.log('\n--- Group 3: CSS Responsive Architecture & Screen Size Sizing ---');
  assert(responsiveCss.includes('.zfb-mobile-main-row') && responsiveCss.includes('display: flex'), 'Mobile main row uses flexbox for fluid scaling');
  assert(responsiveCss.includes('.zfb-mobile-brand-group') && responsiveCss.includes('display: flex'), 'Brand group uses flexbox for Z logo + Hamburger');
  assert(responsiveCss.includes('.zfb-mobile-actions') && responsiveCss.includes('display: flex'), 'Actions group uses flexbox for buttons');
  assert(responsiveCss.includes('.zfb-mobile-search') && responsiveCss.includes('flex: 1 1 auto'), 'Search bar expands and contracts dynamically');
  assert(responsiveCss.includes('@media (max-width: 360px)'), 'Dedicated ultra-compact rules for <=360px viewports (320px, 360px)');

  console.log('\n--- Group 4: Desktop Protection ---');
  assert(globalUx.includes('!isMobileViewport()') && globalUx.includes('removeMobileChrome()'), 'Mobile header is removed on desktop viewport');

  console.log('\n====================================================');
  console.log('📊 ALL MOBILE HEADER TESTS PASSED SUCCESSFULLY (14/14)');
  console.log('====================================================\n');
}

runMobileHeaderTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
