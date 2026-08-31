
document.addEventListener('DOMContentLoaded', () => {
    // 1. Keyboard Navigation for Gallery
    document.addEventListener('keydown', (e) => {
        if(!window.location.pathname.includes('product.html')) return;
        const thumbs = Array.from(document.querySelectorAll('.thumb-nav'));
        if(thumbs.length <= 1) return;
        
        const activeIndex = thumbs.findIndex(t => t.classList.contains('is-active'));
        if(activeIndex === -1) return;

        if(e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            const next = (activeIndex + 1) % thumbs.length;
            thumbs[next].click();
        } else if(e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = (activeIndex - 1 + thumbs.length) % thumbs.length;
            thumbs[prev].click();
        }
    });

    // 2. Touch Swipe & Zoom Support for Gallery using MutationObserver
    let touchStartX = 0;
    let touchEndX = 0;
    let galleryBound = false;

    function handleSwipe() {
        const thumbs = Array.from(document.querySelectorAll('.thumb-nav'));
        if(thumbs.length <= 1) return;
        const activeIndex = thumbs.findIndex(t => t.classList.contains('is-active'));
        if(activeIndex === -1) return;

        if (touchEndX < touchStartX - 40) {
            // Swiped left -> next
            const next = (activeIndex + 1) % thumbs.length;
            thumbs[next].click();
        }
        if (touchEndX > touchStartX + 40) {
            // Swiped right -> prev
            const prev = (activeIndex - 1 + thumbs.length) % thumbs.length;
            thumbs[prev].click();
        }
    }

    function bindGalleryEvents() {
        const galleryMain = document.querySelector('.product-gallery-main');
        if(!galleryMain || galleryBound) return;
        galleryBound = true;

        galleryMain.addEventListener('touchstart', e => {
            touchStartX = e.changedTouches[0].screenX;
        }, {passive: true});
        
        galleryMain.addEventListener('touchend', e => {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
        }, {passive: true});

        // Zoom on hover (desktop only)
        galleryMain.addEventListener('mousemove', function(e) {
            if(window.innerWidth < 1024) return;
            const img = this.querySelector('img, video');
            if(!img) return;
            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            img.style.transformOrigin = `${(x / rect.width) * 100}% ${(y / rect.height) * 100}%`;
            img.style.transform = 'scale(1.8)';
            img.style.cursor = 'zoom-in';
        });
        
        galleryMain.addEventListener('mouseleave', function() {
            const img = this.querySelector('img, video');
            if(img) {
                img.style.transformOrigin = 'center center';
                img.style.transform = 'scale(1)';
                // smooth transition back
                img.style.transition = 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)';
            }
        });
        
        galleryMain.addEventListener('mouseenter', function() {
            const img = this.querySelector('img, video');
            if(img) {
                img.style.transition = 'none'; // remove transition for instant follow
            }
        });
    }

    const observer = new MutationObserver(() => {
        if(document.querySelector('.product-gallery-main')) {
            bindGalleryEvents();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
});
