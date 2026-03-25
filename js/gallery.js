/* ═══════════════════════════════════════════════
   CHOICE TACTICAL — Screenshot Gallery
   Category filtering + lightbox modal
   ═══════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Category Filter ──
  function initFilters() {
    var filterBtns = document.querySelectorAll('.filter-btn');
    var cards = document.querySelectorAll('.screenshot-card[data-category]');

    if (!filterBtns.length) return;

    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var category = btn.getAttribute('data-filter');

        // Update active button
        filterBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');

        // Filter cards
        cards.forEach(function (card) {
          if (category === 'all' || card.getAttribute('data-category') === category) {
            card.style.display = '';
            // Re-trigger fade-in
            card.classList.remove('visible');
            requestAnimationFrame(function () {
              card.classList.add('visible');
            });
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

  function initLightbox() {
    lightbox = document.getElementById('lightbox');
    if (!lightbox) return;

    lightboxImg = lightbox.querySelector('.lightbox-img');
    lightboxTitle = lightbox.querySelector('.screenshot-title');
    lightboxDesc = lightbox.querySelector('.screenshot-desc');

    // Collect gallery items
    var cards = document.querySelectorAll('.screenshot-card[data-src]');
    cards.forEach(function (card, index) {
      galleryItems.push({
        src: card.getAttribute('data-src'),
        title: card.getAttribute('data-title') || '',
        desc: card.getAttribute('data-desc') || '',
      });

      card.addEventListener('click', function () {
        openLightbox(index);
      });
    });

    // Close button
    var closeBtn = lightbox.querySelector('.lightbox-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeLightbox);
    }

    // Nav buttons
    var prevBtn = lightbox.querySelector('.lightbox-prev');
    var nextBtn = lightbox.querySelector('.lightbox-next');
    if (prevBtn) prevBtn.addEventListener('click', function () { navigate(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { navigate(1); });

    // Close on backdrop click
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLightbox();
    });

    // Keyboard nav
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
    // Only navigate visible items
    var visibleItems = [];
    var cards = document.querySelectorAll('.screenshot-card[data-src]');
    cards.forEach(function (card, i) {
      if (card.style.display !== 'none') {
        visibleItems.push(i);
      }
    });

    var currentVisible = visibleItems.indexOf(currentIndex);
    if (currentVisible === -1) return;

    var newVisible = currentVisible + dir;
    if (newVisible < 0) newVisible = visibleItems.length - 1;
    if (newVisible >= visibleItems.length) newVisible = 0;

    currentIndex = visibleItems[newVisible];
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

  // ── Init ──
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
