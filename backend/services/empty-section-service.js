/**
 * Removes sections that ended up with nothing in them.
 *
 * Why
 * ---
 * The storefront pages are static HTML, so every section they declare is drawn
 * whether or not it has content. Filter a department down to a category with no
 * products and the page still rendered the heading, the countdown and the empty
 * grid frame -- a screen of furniture for a shop that, at that moment, had none.
 *
 * Scope, deliberately narrow
 * --------------------------
 * Only containers the SERVER is responsible for filling are considered:
 *
 *   - the grid catalog-render-service.js just rebuilt for this page
 *   - the category rail category-strip-service.js just rebuilt
 *   - anything a page explicitly opts in with [data-zs-hide-if-empty]
 *
 * Sections whose content arrives later from client-side JavaScript are left
 * alone. Removing one of those would delete the container the script is about
 * to write into, which turns "an empty section" into "a broken page" -- a much
 * worse outcome than the problem being solved.
 *
 * The section is hidden, not deleted, when it carries a data-vid: the visual
 * editor keys saved edits on those ids, and removing the node outright would
 * strand them.
 */

/**
 * @param {CheerioAPI} $
 * @param {string[]} serverFilledSelectors  containers this request rebuilt
 * @returns {{removed: string[]}}
 */
function hideEmptySections($, serverFilledSelectors, options) {
  const selectors = (serverFilledSelectors || []).concat(['[data-zs-hide-if-empty]']);
  const removed = [];
  const opts = options || {};

  /* Hiding the results is only half the job. A customer who picked a category
     and then saw the products disappear with no explanation is looking at a
     page that appears broken. Pages that carry the filter bar already print the
     message inside it; pages that do not (their own category strip is the
     navigation) get one here, next to where the results used to be.

     Only when a filter is actually active: a department with no products at all
     is a different situation and is not this function's to explain. */
  const notice = (before) => {
    if (!opts.clearHref || $('.zs-empty, [data-zs-empty]').length) return;
    before.before(
      '<div class="zs-empty" data-zs-empty>' +
        '<strong>لا توجد منتجات في هذه الفئة بعد</strong>' +
        '<span>جرّب فئة أخرى، أو تصفّح كل المنتجات.</span><br>' +
        '<a class="zs-empty-clear" href="' + opts.clearHref + '" data-category="">عرض كل الفئات</a>' +
      '</div>'
    );
  };

  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const container = $(el);

      // "Empty" means no product cards and no category tiles -- not merely no
      // child nodes, because a grid can legitimately hold whitespace, comments
      // or a template node.
      const hasContent =
        container.find('.product-card').length > 0 ||
        container.find('.zs-cat-tile').length > 0 ||
        container.find('[data-zs-content]').length > 0;

      if (hasContent) return;

      const section = container.closest('section');
      if (!section.length) {
        // No section to remove: hide just the container so its frame and any
        // border or background do not draw around nothing.
        container.attr('hidden', 'hidden');
        removed.push(selector + ' (container only)');
        return;
      }

      // A section that holds more than this one container may still have
      // something worth showing -- copy, a promo, a second grid. Only remove it
      // when this container is the reason the section exists.
      const otherContent =
        section.find('.product-card').length > 0 ||
        section.find('.zs-cat-tile').length > 0;
      if (otherContent) return;

      notice(section);
      if (section.attr('data-vid')) {
        section.attr('hidden', 'hidden');
      } else {
        section.remove();
      }
      removed.push(selector);
    });
  }

  return { removed };
}

module.exports = { hideEmptySections };
