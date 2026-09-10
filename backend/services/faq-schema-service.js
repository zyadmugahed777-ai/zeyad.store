/**
 * FAQPage structured data, built from the questions the page already answers.
 *
 * Why
 * ---
 * The shop's stated goal is to be found not only in search but in answers --
 * the summaries ChatGPT, Gemini, Perplexity and Google's AI Overviews compose
 * instead of a list of links. Those systems lift facts most readily when a
 * page states them as an explicit question and an explicit answer, which is
 * exactly what FAQPage marks up. Audited on 2026-09-11: not one page on this
 * site carried it, including faq.html, which has seven real questions written
 * out in <details> elements and no machine-readable form of any of them.
 *
 * Extracted, never authored
 * -------------------------
 * Every question and answer here is read out of the rendered page. Nothing is
 * composed, padded or rephrased. Structured data that says something the page
 * does not say is a lie told to a crawler, and Google treats it as one.
 *
 * A page with no questions gets no schema, which is why this returns null far
 * more often than it returns markup.
 */

/** Collapse whitespace and strip the markup out of an answer. */
function plain($, el) {
  return $(el).text().replace(/\s+/g, ' ').trim();
}

/**
 * Read the <details><summary> pairs a page uses for its questions.
 *
 * This is the shape both faq.html and the product page use, so one reader
 * serves both. A <details> whose question or answer is empty is skipped rather
 * than published as a blank entry.
 */
function extractPairs($, selector) {
  const pairs = [];
  $(selector).each((_, el) => {
    const summary = $(el).find('summary').first();
    if (!summary.length) return;

    const question = plain($, summary);

    // The answer is everything in the <details> except the <summary>.
    const clone = $(el).clone();
    clone.find('summary').first().remove();
    const answer = plain($, clone);

    if (question.length < 3 || answer.length < 3) return;
    pairs.push({ question, answer });
  });
  return pairs;
}

/**
 * Build the FAQPage block for a page, or null if it has nothing to say.
 *
 * @param {CheerioAPI} $
 * @param {string} pageUrl        absolute URL, used as the block's @id
 * @param {object} [options]
 * @param {string} [options.selector='details']
 * @param {number} [options.min=2]  fewer questions than this is not an FAQ
 * @returns {string|null}           a <script type="application/ld+json"> tag
 */
function buildFaqSchema($, pageUrl, options = {}) {
  const selector = options.selector || 'details';
  const min = options.min == null ? 2 : options.min;

  const pairs = extractPairs($, selector);
  if (pairs.length < min) return null;

  const json = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': pageUrl + '#faq',
    mainEntity: pairs.map((p) => ({
      '@type': 'Question',
      name: p.question,
      acceptedAnswer: { '@type': 'Answer', text: p.answer }
    }))
  };

  /* </script> inside a value would end the block early and drop the rest of
     the page's markup into a script context. */
  const safe = JSON.stringify(json).replace(/<\//g, '<\\/');
  return '<script type="application/ld+json">' + safe + '</script>';
}

module.exports = { buildFaqSchema, extractPairs };
