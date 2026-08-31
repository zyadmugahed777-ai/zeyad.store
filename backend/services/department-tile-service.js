/**
 * Puts a real photograph on each department tile of category.html.
 *
 * Before, every tile carried the same style of gold line-glyph. Six departments
 * drawn as six outline drawings tell a customer nothing about what is inside
 * them, and nothing about them was editable: the glyphs are inline SVG paths in
 * the page.
 *
 * `departments.image` already exists in the database and the admin department
 * form already uploads to it -- the storefront simply never read it. So the
 * order of preference is:
 *
 *   1. the department's own uploaded image (admin-controlled)
 *   2. failing that, a photograph of a product that is actually in that
 *      department, so the tile shows something the shop really sells
 *   3. failing that, the page's existing glyph, untouched
 *
 * Nothing is invented: a department with no image and no product photography
 * keeps exactly what it has today.
 */

const { PAGE_MAP } = require('./catalog-render-service');

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** "majalis.html" -> the department slug that page belongs to. */
function departmentSlugForHref(href) {
  const file = String(href || '').split('/').pop().split('?')[0].split('#')[0];
  const slug = file.replace(/\.html$/i, '');
  const spec = PAGE_MAP[slug];
  return spec ? spec.department : null;
}

/**
 * @param {CheerioAPI} $
 * @param {Array} departments  from storefront-data-service
 * @param {Function} productImageForDepartment  (deptSlug) => image path | null
 */
function injectDepartmentTiles($, departments, productImageForDepartment) {
  const tiles = $('a.main-cat-card');
  if (!tiles.length) return { rendered: 0 };

  const bySlug = new Map((departments || []).map((d) => [d.slug, d]));
  let rendered = 0;

  tiles.each((_, el) => {
    const tile = $(el);
    const deptSlug = departmentSlugForHref(tile.attr('href'));
    if (!deptSlug) return;

    const dept = bySlug.get(deptSlug);
    const name = (dept && dept.name) || tile.find('h2').first().text().trim();

    let image = dept && dept.image ? dept.image : null;
    if (!image && typeof productImageForDepartment === 'function') {
      image = productImageForDepartment(deptSlug) || null;
    }
    if (!image) return;   // keep the page's own glyph

    const icon = tile.find('.cat-icon').first();
    if (!icon.length) return;

    /* The glyph is replaced, not hidden, so the tile does not carry two icons.
       aria-hidden because the department's name is right underneath it -- a
       screen reader announcing the picture as well would just repeat it. */
    icon.addClass('cat-icon--photo');
    icon.html(
      `<img src="${esc(image)}" alt="" aria-hidden="true" loading="lazy" decoding="async">`
    );
    tile.attr('data-department', deptSlug);
    if (name) tile.attr('aria-label', name);
    rendered++;
  });

  return { rendered };
}

module.exports = { injectDepartmentTiles, departmentSlugForHref };
