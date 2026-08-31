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

  DEFAULT_OG_IMAGE: SITE_URL + '/assets/placeholder-logo.webp',
  SITEMAP_URL: SITE_URL + '/sitemap.xml'
};
