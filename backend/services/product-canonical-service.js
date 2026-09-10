/**
 * Which product page represents a group of near-identical ones.
 *
 * The problem
 * -----------
 * 57 products share 16 descriptions. Twenty-nine of them differ from a sibling
 * by nothing a shopper could search for: the title ends in a bracketed letter
 * -- "غرفه نوم ملكي فاخره شكل حديث وفاخر (P)", "... (V)", "... (J)" -- and the
 * specifications, the price and the description are identical. They are the
 * same bedroom photographed in a different finish.
 *
 * Google resolves a group like that by picking one page and dropping the rest,
 * and it picks without being told which one matters. Meanwhile the group's
 * links, clicks and relevance are split across all of them, so the one Google
 * keeps is weaker than the group deserves. rel=canonical is the mechanism for
 * saying "these are one thing, and this is the one to rank".
 *
 * What this deliberately does NOT do
 * ----------------------------------
 * It does not touch pages whose title says something real. Twenty-three
 * products in these same clusters are titled "استيل ابيض", "استيل اسود",
 * "استيل ازرق" -- a shopper genuinely searches for a white or a blue bedroom,
 * those pages deserve to rank on their own, and collapsing them would throw
 * away demand the shop can actually serve.
 *
 * It never groups across a price. Two products at 2,100 and 1,850 are not the
 * same offer however alike they look, and pointing one at the other would send
 * a shopper to a different price than the one they searched.
 *
 * Nothing here hides a page or changes what a shopper sees. Every URL keeps
 * working, keeps converting, and keeps serving the advertisements that point
 * at it -- which is the whole reason canonical is the right tool and merging
 * the catalogue is not.
 */

/** A title that ends in a bracketed single letter: "... (P)", "... (w)". */
const LETTER_TAG = /\([A-Za-z]\)\s*$/;

/** Normalise a description to the text a crawler would compare. */
function descriptionKey(product) {
  return String(product.description || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function imageCount(product) {
  return Array.isArray(product.gallery) ? product.gallery.length
    : Array.isArray(product.images) ? product.images.length : 0;
}

/**
 * Build a map of product id -> the product id that should be its canonical.
 *
 * Only letter-tagged products appear in the map, and only when a better
 * representative exists in the same description-and-price group. Everything
 * else is absent, which means "you are your own canonical".
 *
 * @param {Array} products the storefront catalogue
 * @returns {Map<string,string>}
 */
function buildCanonicalMap(products) {
  const map = new Map();
  if (!Array.isArray(products) || !products.length) return map;

  const groups = new Map();
  for (const p of products) {
    const key = descriptionKey(p);
    // A product with no description shares nothing, so it groups with nobody.
    if (key.length < 40) continue;
    const groupKey = key + '||' + String(p.price);
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(p);
  }

  for (const members of groups.values()) {
    if (members.length < 2) continue;

    const idOf = (p) => String(p.product_id || p.id);

    /* The representative, in order of preference:
     *   1. a sibling whose title says something a shopper would search for
     *   2. failing that, the one with the most photographs -- the fullest page
     * Ties break on id so the choice is stable across rebuilds; a canonical
     * that moves between deploys teaches a crawler nothing. */
    const named = members.filter((p) => !LETTER_TAG.test(String(p.title || '').trim()));
    const pool = named.length ? named : members;
    const rep = pool.slice().sort((a, b) => {
      const d = imageCount(b) - imageCount(a);
      return d !== 0 ? d : idOf(a).localeCompare(idOf(b));
    })[0];

    const repId = idOf(rep);

    for (const p of members) {
      const id = idOf(p);
      if (id === repId) continue;
      // Only the ones a shopper could not distinguish.
      if (!LETTER_TAG.test(String(p.title || '').trim())) continue;
      map.set(id, repId);
    }
  }

  return map;
}

module.exports = { buildCanonicalMap, descriptionKey, LETTER_TAG };
