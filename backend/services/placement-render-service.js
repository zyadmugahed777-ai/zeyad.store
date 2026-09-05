/**
 * Fills the product grids that are NOT a department catalogue: the home page
 * and the offers page.
 *
 * Why this exists
 * ---------------
 * catalog-render-service rebuilt every department page from the database, and
 * that was the end of it. The home page and the offers page kept serving the
 * cards baked into their HTML.
 *
 * Those cards were not placeholders, which is what makes it serious: they were
 * SNAPSHOTS of real products, frozen at whatever the price was on the day the
 * page was written. offers.html was advertising gen-0043 "طقم مجلس فاخر متكامل"
 * at ١٢٬٩٩٩ with 35% off; the database has held 354 against an old price of 405
 * -- about 13% -- for as long as anyone can tell. Every price on both pages was
 * a number the shop had stopped honouring, and no edit in the admin could
 * correct one of them.
 *
 * The offers page in particular is the page the shop cares most about, and
 * nothing an operator did could put a single current product on it.
 *
 * Adding the five `show_*` columns made the intent expressible; this is what
 * acts on it.
 *
 * The rules
 * ---------
 * - If NO product qualifies, the page is left exactly as it was. Blanking a
 *   page that currently shows something is the worse failure, and it is the
 *   one an operator cannot diagnose.
 * - But once the first grid HAS been rebuilt, a later grid that runs out of
 *   products is emptied and its section hidden rather than left holding its
 *   frozen cards. The shop went live with five products; the first grid took
 *   all five and the second kept advertising gen-0030 at 4,200 — a product at
 *   a price that exists nowhere. An absent section is honest; that is not.
 * - Grids are capped. `show_on_home` defaults to true for every product, so
 *   without a cap the first page of the shop would be all 435 of them.
 * - Nothing here invents a discount, a badge or a price. It renders what the
 *   database says, through the same card markup the department pages use.
 */

const { renderCard } = require('./catalog-render-service');
const { looksLikeTestProduct } = require('../utils/test-data');
const { hideEmptySections } = require('./empty-section-service');

/**
 * Which grids each page owns, the flag that governs them, and how many cards
 * each will hold.
 *
 * The selectors were read off the live HTML. Where a page has more than one
 * grid they are listed in the order they appear, and products are dealt into
 * them in that order -- so the offers page fills its headline row first and
 * only then the row beneath it.
 */
const PLACEMENT_MAP = {
  index: {
    flag: 'showOnHome',
    grids: [
      { selector: 'div.product-grid#main-product-grid', limit: 24 },
      // "اختيارات تكمل بيتك". It held four more frozen snapshots -- gen-0030
      // quoted at 4,200 while the database has said 120 for months. Leaving it
      // alone would have fixed the grid above it and left a wrong price four
      // hundred pixels below.
      { selector: 'section.product-section.recommended div.product-grid', limit: 8 }
    ]
  },
  offers: {
    flag: 'showInOffers',
    grids: [
      { selector: 'div.todays-offers-row', limit: 10 },
      { selector: 'div.products-follow-row', limit: 10 }
    ]
  }
};

/** A product whose current price is genuinely below a stated old price. */
function isDiscounted(p) {
  const price = Number(p.price);
  const old = Number(p.oldPrice);
  return Number.isFinite(price) && Number.isFinite(old) && old > price && price > 0;
}

/** How much off, as a fraction. 0 when there is no discount. */
function discountFraction(p) {
  return isDiscounted(p) ? 1 - Number(p.price) / Number(p.oldPrice) : 0;
}

/*
 * A discount believable enough to headline an unattended page.
 *
 * The fallback picks products nobody curated, so it has to be sceptical about
 * the numbers. The live catalogue contains rows whose old price is
 * 70,000,000,000,000,000,000 against a current price of 71,260 -- a typo, or a
 * field used for something else -- and "deepest discount first" put exactly
 * that row at the top of the offers page, advertising 100% off a product
 * titled with somebody's name.
 *
 * Bounds, and why: below 5% is not an offer worth a page; above 90% is a data
 * error far more often than a real price; an old price more than ten times the
 * current one is not a discount anyone will believe even if it is true.
 *
 * This restrains the FALLBACK only. A product the operator explicitly flagged
 * appears whatever its numbers say -- that is their decision to make.
 */
function isCredibleDiscount(p) {
  if (!isDiscounted(p)) return false;
  const ratio = Number(p.oldPrice) / Number(p.price);
  if (ratio > 10) return false;
  const off = discountFraction(p);
  return off >= 0.05 && off <= 0.9;
}

/**
 * The products a page's grids should show.
 *
 * The offers page has a fallback the home page does not: `show_in_offers`
 * defaults to false, so on the day the column is added nothing is flagged and
 * a strict reading would empty the shop's most important page. Until an
 * operator curates it, products that carry a real discount stand in -- which
 * is what the page claims to be showing anyway. Once anything is flagged, the
 * flag wins outright and the fallback never runs again.
 */
function candidatesFor(slug, products) {
  const spec = PLACEMENT_MAP[slug];
  if (!spec) return [];

  /* The front page and the offers page are the two the shop is judged by, so
     development leftovers are kept off them. Three rows named TEST-P-... /
     CART-TEST-... were leading the home grid on first render, ahead of every
     real product, purely because they were the newest. */
  const all = (products || []).filter((p) => !looksLikeTestProduct(p));
  const flagged = all.filter((p) => p[spec.flag] === true);

  if (slug === 'offers') {
    if (flagged.length > 0) return sortForOffers(flagged);
    return sortForOffers(all.filter(isCredibleDiscount));
  }

  return flagged;
}

/** Deepest discount first -- an offers page that leads with 5% off is lying. */
function sortForOffers(list) {
  return list.slice().sort((a, b) => discountFraction(b) - discountFraction(a));
}

/**
 * Rebuild the placement grids on one page.
 *
 * @param {CheerioAPI} $      the loaded page
 * @param {string} slug       page slug, e.g. 'index' or 'offers'
 * @param {Array} products    the storefront product list
 * @returns {{rendered:number, grids:number}|null} null when the page has none
 */
function injectPlacementGrids($, slug, products) {
  const spec = PLACEMENT_MAP[slug];
  if (!spec) return null;

  const pool = candidatesFor(slug, products);
  if (pool.length === 0) return null;

  let cursor = 0;
  let rendered = 0;
  let gridsFilled = 0;
  const starved = [];

  for (const g of spec.grids) {
    const grid = $(g.selector).first();
    if (!grid.length) continue;

    const slice = pool.slice(cursor, cursor + g.limit);
    if (slice.length === 0) {
      // Note it rather than skip it: what happens next depends on whether any
      // OTHER grid on this page was rebuilt.
      starved.push(g.selector);
      continue;
    }

    cursor += slice.length;
    grid.empty();
    grid.append(slice.map(renderCard).join(''));
    rendered += slice.length;
    gridsFilled++;
  }

  // Nothing was rebuilt at all -- the catalogue is empty or unreachable. Leave
  // the page untouched; its own markup is the better failure.
  if (gridsFilled === 0) return null;

  /* Something WAS rebuilt, so the page is now a mix of current data and
     whatever a starved grid is still holding. Those leftovers are snapshots,
     not placeholders: real product names at prices the shop stopped honouring.
     Empty them and let hideEmptySections take the heading down with them. */
  let hidden = 0;
  if (starved.length > 0) {
    for (const selector of starved) {
      const grid = $(selector).first();
      if (grid.length) grid.empty();
    }
    const res = hideEmptySections($, starved, {});
    hidden = (res && res.removed ? res.removed.length : 0);
  }

  return { rendered, grids: gridsFilled, hidden };
}

module.exports = { injectPlacementGrids, PLACEMENT_MAP, isCredibleDiscount };
