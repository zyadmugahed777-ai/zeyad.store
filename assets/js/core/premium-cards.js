
document.addEventListener('DOMContentLoaded', () => {
    /* One badge per card. The catalogue pages already print a .discount-tag
       into the price row; adding a .premium-badge beside it gave the same card
       two labels saying the same thing, and pushed the price onto a second
       line. */
    function hasBadge(card) {
        return !!card.querySelector('.premium-badge, .discount-tag, .badge-discount, .badge-bestseller');
    }

    /* The badge belongs beside the price, not on top of the photograph: the
       photograph is the thing the customer came to look at. Falls back to the
       top of the information block on the few cards that print no price. */
    function placeBadge(card, badge) {
        const price = card.querySelector('.product-body .price');
        if (price) { price.appendChild(badge); return; }
        const body = card.querySelector('.product-body');
        if (body) body.insertBefore(badge, body.firstChild);
    }

    function upgradeCards() {
        document.querySelectorAll('.product-card').forEach(card => {
            if(card.dataset.premiumUpgraded) return;
            card.dataset.premiumUpgraded = 'true';
            
            const id = card.dataset.productId;
            let p = null;
            if(window.PRODUCTS_DB) p = window.PRODUCTS_DB.find(x => x.id === id);
            
            // Add Badge
            if(p && p.isBestSeller && !hasBadge(card)) {
                const badge = document.createElement('span');
                badge.className = 'premium-badge badge-bestseller';
                badge.textContent = 'الأكثر مبيعاً';
                placeBadge(card, badge);
            } else if(p && p.oldPrice > p.price && !hasBadge(card)) {
                const badge = document.createElement('span');
                badge.className = 'premium-badge badge-discount';
                const percent = Math.round((1 - p.price / p.oldPrice) * 100);
                badge.textContent = `-${percent}%`;
                placeBadge(card, badge);
            }

            // Add Ratings
            if(p && p.rating && !card.querySelector('.premium-rating')) {
                const ratingDiv = document.createElement('div');
                ratingDiv.className = 'premium-rating';
                ratingDiv.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" class="star"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg> <span>${p.rating}</span> <span class="reviews-count">(${p.reviewsCount || 0})</span>`;
                const title = card.querySelector('h3');
                if(title) {
                    title.parentNode.insertBefore(ratingDiv, title.nextSibling);
                }
            }
            
            // Setup Wishlist State immediately
            if (window.ZFB && window.ZFB.Wishlist && window.ZFB.Wishlist.has(id)) {
                const wishBtn = card.querySelector('.wish, .btn-wishlist');
                if(wishBtn) wishBtn.classList.add('is-active');
            }
        });
    }

    // Run on load and whenever DOM updates
    upgradeCards();
    const observer = new MutationObserver((mutations) => {
        let shouldUpgrade = false;
        mutations.forEach(m => {
            if (m.addedNodes.length) {
                m.addedNodes.forEach(n => {
                    if (n.nodeType === 1 && (n.classList.contains('product-card') || n.querySelector('.product-card'))) {
                        shouldUpgrade = true;
                    }
                });
            }
        });
        if (shouldUpgrade) upgradeCards();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Global listener to sync wishlist buttons
    document.addEventListener('click', (e) => {
        const wishBtn = e.target.closest('.wish, .btn-wishlist');
        if(!wishBtn) return;
        setTimeout(() => {
            const card = wishBtn.closest('[data-product-id], .premium-product-page');
            if(card && window.ZFB && window.ZFB.Wishlist) {
                const id = card.dataset.productId || new URLSearchParams(window.location.search).get('id');
                if(id) {
                    const has = window.ZFB.Wishlist.has(id);
                    document.querySelectorAll(`[data-product-id="${id}"] .wish, [data-product-id="${id}"] .btn-wishlist, .premium-product-page .btn-wishlist`).forEach(btn => {
                        if(has) btn.classList.add('is-active');
                        else btn.classList.remove('is-active');
                    });
                }
            }
        }, 50); // slight delay to allow toggle to finish
    });
});
