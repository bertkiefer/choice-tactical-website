/* ═══════════════════════════════════════════════
   CHOICE TACTICAL — Gallery / Lightbox
   Click-to-zoom for every content image, plus filter for screenshot grid.
   ═══════════════════════════════════════════════ */

(function () {
  'use strict';

  // Selectors whose images should NOT be zoomable.
  var SKIP_SELECTORS = [
    'nav', '.navbar',
    'footer', '.site-footer',
    '[data-include]',
    '.nav-logo', '.nav-cart', '.nav-cart-icon',
    '.footer-logo', '.footer-brand',
    '.shop-header-logo',
    '.product-path-logo-large',
    '.product-card-element-mark', '.product-detail-element-mark',
    '.app-store-badge', '.product-path-app-store',
    '.product-path-banner',
    '.hero-logo', '.app-logo',
    '.suite-card-icon',
    '.no-zoom'
  ].join(',');

  var LIGHTBOX_HTML =
    '<div id="lightbox" class="lightbox">' +
      '<button class="lightbox-close" aria-label="Close">&times;</button>' +
      '<button class="lightbox-nav lightbox-prev" aria-label="Previous">&#8249;</button>' +
      '<button class="lightbox-nav lightbox-next" aria-label="Next">&#8250;</button>' +
      '<div class="lightbox-content">' +
        '<img class="lightbox-img" src="" alt="">' +
        '<div class="lightbox-caption">' +
          '<p class="screenshot-title"></p>' +
          '<p class="screenshot-desc"></p>' +
        '</div>' +
      '</div>' +
    '</div>';

  // ── Category Filter (screenshots page) ──
  function initFilters() {
    var filterBtns = document.querySelectorAll('.filter-btn');
    var cards = document.querySelectorAll('.screenshot-card[data-category]');
    if (!filterBtns.length) return;
    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var category = btn.getAttribute('data-filter');
        filterBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        cards.forEach(function (card) {
          if (category === 'all' || card.getAttribute('data-category') === category) {
            card.style.display = '';
            card.classList.remove('visible');
            requestAnimationFrame(function () { card.classList.add('visible'); });
          } else {
            card.style.display = 'none';
          }
        });
      });
    });
  }

  // ── Lightbox ──
  var lightbox = null;
  var lightboxImg = null;
  var lightboxTitle = null;
  var lightboxDesc = null;
  var currentIndex = 0;
  var galleryItems = [];

  function ensureLightbox() {
    var lb = document.getElementById('lightbox');
    if (lb) return lb;
    var wrapper = document.createElement('div');
    wrapper.innerHTML = LIGHTBOX_HTML;
    document.body.appendChild(wrapper.firstElementChild);
    return document.getElementById('lightbox');
  }

  function isExcluded(el) {
    return !!el.closest(SKIP_SELECTORS);
  }

  function shouldZoomImage(img) {
    if (img.dataset.lightboxBound === '1') return false;
    if (isExcluded(img)) return false;
    // Skip very small icons that escape the selector list (decorative SVG-ish PNGs).
    if (img.naturalWidth && img.naturalWidth < 80) return false;
    if (img.naturalHeight && img.naturalHeight < 80) return false;
    // If the image lives inside a link, let the link handle the click.
    if (img.closest('a[href]')) return false;
    // If the image is inside a card that already has data-src wiring, the card handles it.
    if (img.closest('.screenshot-card[data-src], .carousel-card[data-src]')) return false;
    return true;
  }

  function bindCard(card, index) {
    card.style.cursor = 'zoom-in';
    card.addEventListener('click', function (e) {
      if (e.target.closest('a, button')) return;
      openLightbox(index);
    });
  }

  function bindStandaloneImage(img, index) {
    img.style.cursor = 'zoom-in';
    img.dataset.lightboxBound = '1';
    img.addEventListener('click', function () {
      openLightbox(index);
    });
  }

  function captureImageWhenReady(img, fn) {
    if (img.complete && img.naturalWidth) { fn(); return; }
    img.addEventListener('load', fn, { once: true });
    img.addEventListener('error', function () {}, { once: true });
  }

  function initLightbox() {
    lightbox = ensureLightbox();
    if (!lightbox) return;

    lightboxImg = lightbox.querySelector('.lightbox-img');
    lightboxTitle = lightbox.querySelector('.screenshot-title');
    lightboxDesc = lightbox.querySelector('.screenshot-desc');

    // 1) Card-style items keep their grouped behavior.
    var cards = document.querySelectorAll('.screenshot-card[data-src], .carousel-card[data-src]');
    cards.forEach(function (card) {
      var idx = galleryItems.length;
      galleryItems.push({
        src: card.getAttribute('data-src'),
        title: card.getAttribute('data-title') || '',
        desc: card.getAttribute('data-desc') || '',
        node: card
      });
      bindCard(card, idx);
    });

    // 2) All other content images become individually zoomable.
    var imgs = document.querySelectorAll('img');
    imgs.forEach(function (img) {
      // Wait for naturalWidth so size filter is meaningful.
      captureImageWhenReady(img, function () {
        if (!shouldZoomImage(img)) return;
        var idx = galleryItems.length;
        galleryItems.push({
          src: img.currentSrc || img.src,
          title: img.alt || '',
          desc: '',
          node: img
        });
        bindStandaloneImage(img, idx);
      });
    });

    // Controls.
    var closeBtn = lightbox.querySelector('.lightbox-close');
    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
    var prevBtn = lightbox.querySelector('.lightbox-prev');
    var nextBtn = lightbox.querySelector('.lightbox-next');
    if (prevBtn) prevBtn.addEventListener('click', function () { navigate(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { navigate(1); });
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', function (e) {
      if (!lightbox.classList.contains('open')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
    });
  }

  function openLightbox(index) {
    currentIndex = index;
    updateLightbox();
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
  }

  function navigate(dir) {
    var visibleItems = [];
    galleryItems.forEach(function (item, i) {
      var n = item.node;
      if (!n) { visibleItems.push(i); return; }
      // Hide-respecting: only count if node is still visible / displayed.
      var hidden = n.style && n.style.display === 'none';
      if (!hidden) visibleItems.push(i);
    });
    var currentVisible = visibleItems.indexOf(currentIndex);
    if (currentVisible === -1) {
      // Fall back to plain index walk.
      var ni = (currentIndex + dir + galleryItems.length) % galleryItems.length;
      currentIndex = ni;
    } else {
      var newVisible = currentVisible + dir;
      if (newVisible < 0) newVisible = visibleItems.length - 1;
      if (newVisible >= visibleItems.length) newVisible = 0;
      currentIndex = visibleItems[newVisible];
    }
    updateLightbox();
  }

  function updateLightbox() {
    var item = galleryItems[currentIndex];
    if (!item) return;
    lightboxImg.src = item.src;
    lightboxImg.alt = item.title;
    if (lightboxTitle) lightboxTitle.textContent = item.title;
    if (lightboxDesc) lightboxDesc.textContent = item.desc;
  }

  function init() {
    initFilters();
    initLightbox();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
