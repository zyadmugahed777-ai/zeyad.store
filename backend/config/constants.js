/**
 * Global Constants & Configuration
 * Single Source of Truth for Site Identity & SEO
 */

const SITE_URL = (process.env.SITE_URL || 'https://zeyad.store').trim().replace(/\/+$/, '');

/**
 * Brand identity.
 *
 * The site was carrying three different names at once: 44 page titles ended in
 * "زياد للأعمال", 21 in "زياد للتجارة", two in "Zeyad Store", and this file
 * declared a fourth answer for anything that asked programmatically. To a
 * visitor -- and to a crawler trying to work out who owns zeyad.store -- that
 * reads as several unrelated businesses sharing a domain.
 *
 * One primary name, stated the same way everywhere:
 *
 *   BRAND_AR / BRAND_EN   the name the store goes by now.
 *   BRAND_LEGACY_AR       the name it traded under before, kept deliberately.
 *
 * The legacy name is not decoration and must not be deleted. Customers still
 * search for "زياد للتجارة", and it is published as schema.org `alternateName`
 * so a search engine can connect the two names to one organisation. That is a
 * truthful statement about a real former trading name -- not keyword stuffing,
 * which is why it belongs in structured data and in a plain sentence on the
 * page, and nowhere else.
 */
const BRAND_AR = 'زياد ستور';
const BRAND_EN = 'Zeyad Store';
const BRAND_LEGACY_AR = 'زياد للتجارة';
const BRAND_LEGACY_EN = 'Zeyad For Business';
// The third name the site was using: it ended 44 of the 71 page titles, so it
// is at least as established with returning visitors as the other legacy name
// and is published as an alternate for the same reason.
const BRAND_LEGACY_AR_2 = 'زياد للأعمال';

module.exports = {
  SITE_URL,

  BRAND_AR,
  BRAND_EN,
  BRAND_LEGACY_AR,
  BRAND_LEGACY_EN,
  BRAND_LEGACY_AR_2,
  // Every name this business is legitimately known by, for schema.org
  // alternateName. Order is deliberate: Arabic legacy name first, because it is
  // the one customers actually type into a search box.
  BRAND_ALTERNATES: [BRAND_LEGACY_AR, BRAND_LEGACY_AR_2, BRAND_EN, BRAND_LEGACY_EN],

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
  DEFAULT_OG_IMAGE: SITE_URL + '/assets/brand/og-default.png',

  /* The square mark, for Organization.logo. Google wants a logo it can render
     beside the business name; a 1200x630 social card is the wrong shape for
     that, so the 512x512 icon is used instead. */
  BRAND_LOGO: SITE_URL + '/assets/brand/icon-512.png',

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
    /* Where the shop actually delivers, from the zones address-service.js and
       delivery-service.js already recognise. Not a marketing claim -- these
       are the governorates the checkout will quote a price for. */
    areaServed: [
      'صنعاء', 'عدن', 'تعز', 'الحديدة', 'إب',
      'ذمار', 'حضرموت', 'المكلا', 'حجة', 'صعدة'
    ]
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
