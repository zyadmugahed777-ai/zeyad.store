/**
 * Global Constants & Configuration
 * Single Source of Truth for Site Identity & SEO
 */

const SITE_URL = (process.env.SITE_URL || 'https://zeyad.store').trim().replace(/\/+$/, '');

/**
 * A short content hash for a file under the repo root, or '' if unreadable.
 *
 * The social card and the logo are served with
 * `Cache-Control: public, max-age=31536000, immutable`, and Facebook, WhatsApp
 * and TikTok each keep their own copy of an og:image keyed on its URL. When
 * the mark changed from an olive ز to a gold Z the origin had the new card
 * immediately and the edge went on serving the old one for hours -- measured
 * cf-cache-status HIT with an Age of 10,572 against a file replaced seconds
 * earlier. A share posted before the change would have kept showing the old
 * card indefinitely.
 *
 * Appending the hash makes a changed file a changed URL, which no cache has
 * seen. It is computed once at require time, not per request.
 *
 * Failure is silent and returns '': a missing file must not stop the server
 * booting over a cache-busting nicety.
 */
function assetVersion(relPath) {
  try {
    const crypto = require('crypto');
    const path = require('path');
    const abs = path.join(__dirname, '..', '..', relPath);
    return crypto.createHash('sha1').update(require('fs').readFileSync(abs)).digest('hex').slice(0, 8);
  } catch (_) {
    return '';
  }
}

function versioned(relPath) {
  const v = assetVersion(relPath);
  return SITE_URL + '/' + relPath + (v ? '?v=' + v : '');
}

/**
 * Brand identity. One name.
 *
 * The site used to carry three at once -- 44 page titles ended in
 * "زياد للأعمال", 21 in "زياد للتجارة", two in "Zeyad Store" -- and the retired
 * ones were then republished to Google as schema.org alternateName, on the
 * reasoning that customers might still search for them.
 *
 * The owner has ended that: the company is زياد ستور and nothing else is to be
 * relied on anywhere. The reasoning behind the alternates does not survive the
 * facts either. This domain is weeks old and has almost no search presence, so
 * there is no established stream of "زياد للتجارة" traffic to preserve; the
 * alternates were protecting a history the search index never recorded, at the
 * cost of telling Google the business answers to four names.
 *
 * If a legacy name is ever needed again it belongs here, declared once, and
 * nowhere else. It is not to be reintroduced into page copy.
 */
const BRAND_AR = 'زياد ستور';
const BRAND_EN = 'Zeyad Store';

module.exports = {
  SITE_URL,

  BRAND_AR,
  BRAND_EN,
  /* The only alternate is the English rendering of the same name. The retired
     trading names are gone: publishing them told Google this business answers
     to four things, which is the opposite of what a single strong identity
     looks like. */
  BRAND_ALTERNATES: [BRAND_EN],

  // Retained under their original names: several modules already import these,
  // and they now resolve to the primary brand rather than a fourth variant.
  SITE_NAME_AR: BRAND_AR,
  SITE_NAME_EN: BRAND_EN,

  // The suffix every page title ends with, so one edit here restyles the whole
  // site rather than 71 files disagreeing.
  TITLE_SUFFIX_AR: ' | ' + BRAND_AR,

  /* This pointed at /assets/placeholder-logo.webp, which returns 404 and
     always has. The Organization structured data declared it as the business's
     logo AND its image, so the one picture Google associates with this
     business was a missing file. og-default.png is 1200x630 and exists. */
  DEFAULT_OG_IMAGE: versioned('assets/brand/og-default.png'),

  /* The square mark, for Organization.logo. Google wants a logo it can render
     beside the business name; a 1200x630 social card is the wrong shape for
     that, so the 512x512 icon is used instead. */
  BRAND_LOGO: versioned('assets/brand/icon-512.png'),

  /**
   * How to reach the shop. Read off the storefront rather than invented:
   * +967 775 010 726 appears on 63 of the 71 pages and is watermarked into the
   * product photographs; "صنعاء، شارع الزبيري" is the address in the footer.
   *
   * Published as Organization.telephone and Organization.address, which is
   * what lets Google connect zeyad.store to a real business in Sana'a -- the
   * same details that must match the Google Business Profile exactly, or the
   * two records compete instead of reinforcing each other.
   */
  BUSINESS: {
    phone: '+967775010726',
    whatsapp: '967775010726',
    /* No streetAddress, deliberately.
     *
     * This is an online shop with several warehouses, and a customer visits by
     * appointment so the right warehouse can be chosen for what they are
     * buying. There is no single door to turn up at, so publishing one address
     * as THE address would send someone to the wrong building -- and it is the
     * kind of claim structured data is read as a promise.
     *
     * The city is still stated, because the business really is based in
     * Sana'a, and that is what ties the domain to a place. Google's own model
     * for this shape of business is a "service area business": no public
     * street address, an explicit list of areas served instead. The Business
     * Profile must be set up the same way or the two records disagree.
     */
    city: 'صنعاء',
    country: 'YE',
    /* The whole country, stated as the country.
     *
     * This listed ten governorates, taken from the ten cities the geocoder
     * happens to know. The owner has corrected that: the shop serves every
     * governorate in Yemen, and delivery-service.js agrees -- it sorts an
     * address into "صنعاء" or "المحافظات" and quotes a price either way, so
     * nowhere in the country is refused.
     *
     * Naming ten of them was therefore both wrong and smaller than the truth.
     * One Country is the accurate statement and the one Google reads cleanly.
     */
    areaServedCountry: 'اليمن',

    /* Open all hours. Published as openingHours in the schema.org shorthand:
       Mo-Su 00:00-23:59. */
    opensAllHours: true
  },
  SITEMAP_URL: SITE_URL + '/sitemap.xml',

  /**
   * The shop's return terms, exactly as returns.html states them to customers.
   *
   * Published to Google as MerchantReturnPolicy. Search Console flagged
   * hasMerchantReturnPolicy as missing on every product; this is the answer,
   * and it is copied from the page rather than invented:
   *
   *   "يمكنك إرجاع المنتج خلال ٧ أيام من تاريخ الاستلام"
   *   "يتحمل العميل تكلفة الشحن" for a change of mind
   *
   * The 14-day exchange window is deliberately NOT published here. Google's
   * merchantReturnDays means the window for a REFUND, and conflating the two
   * would tell shoppers they have fourteen days to get their money back when
   * the shop's own page says seven.
   *
   * If the policy on the page changes, change it here in the same commit.
   */
  RETURN_POLICY: {
    days: 7,
    country: 'YE',
    url: SITE_URL + '/returns.html',
    // The customer pays return shipping unless the item was faulty or wrong,
    // which is a per-case exception schema.org has no vocabulary for. The
    // general rule is what gets published.
    feesAreCustomers: true
  },

  /**
   * What delivery actually costs, in SAR.
   *
   * These are not decorative: delivery-service.js charges exactly these
   * figures at checkout whenever the delivery_policies table has no matching
   * row -- and on production that table is EMPTY, so this is every order. The
   * structured data reads the same constant, so what Google is told and what
   * the customer is charged cannot drift apart.
   *
   * Fill delivery_policies from the admin and the checkout starts using those
   * instead; this stays the floor.
   */
  DELIVERY_FALLBACK_SAR: {
    sanaa: { min: 7.14, max: 14.29 },
    provinces: { min: 21.43, max: 42.86 },
    country: 'YE',
    // Measured from the shop's own copy: "توصيل بأسعار رمزية داخل المدن
    // الرئيسية". No transit-time claim is published, because nothing in the
    // system records one.
    currency: 'SAR'
  }
};
