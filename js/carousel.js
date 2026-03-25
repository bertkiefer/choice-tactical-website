/* ═══════════════════════════════════════════════
   CHOICE TACTICAL — Screenshot Carousel
   Swipeable rolodex with touch + mouse drag
   Supports multiple carousels per page
   ═══════════════════════════════════════════════ */

(function () {
  'use strict';

  function setupCarousel(wrapper) {
    var track = wrapper.querySelector('.carousel-track');
    var cards = Array.from(track.querySelectorAll('.carousel-card'));
    var leftArrow = wrapper.querySelector('.carousel-arrow-left');
    var rightArrow = wrapper.querySelector('.carousel-arrow-right');
    var dotsContainer = wrapper.querySelector('.carousel-dots');
    var currentIndex = 0;
    var cardCount = cards.length;

    function getVisibleCount() {
      if (window.innerWidth <= 768) return 1;
      if (window.innerWidth <= 1024) return 2;
      return 3;
    }

    function buildDots() {
      dotsContainer.innerHTML = '';
      var maxIndex = cardCount - getVisibleCount();
      for (var i = 0; i <= maxIndex; i++) {
        var dot = document.createElement('button');
        dot.className = 'carousel-dot';
        dot.setAttribute('aria-label', 'Go to slide ' + (i + 1));
        dot.dataset.index = i;
        dot.addEventListener('click', function () {
          goTo(parseInt(this.dataset.index, 10));
        });
        dotsContainer.appendChild(dot);
      }
    }

    function updateClasses() {
      var visible = getVisibleCount();
      var centerOffset = Math.floor(visible / 2);

      cards.forEach(function (card, i) {
        card.classList.remove('active', 'adjacent');
        if (i >= currentIndex && i < currentIndex + visible) {
          if (visible === 1) {
            card.classList.add('active');
          } else if (i === currentIndex + centerOffset) {
            card.classList.add('active');
          } else {
            card.classList.add('adjacent');
          }
        }
      });

      var dots = dotsContainer.querySelectorAll('.carousel-dot');
      dots.forEach(function (dot, i) {
        dot.classList.toggle('active', i === currentIndex);
      });

      leftArrow.style.opacity = currentIndex === 0 ? '0.3' : '1';
      leftArrow.style.pointerEvents = currentIndex === 0 ? 'none' : 'auto';
      var maxIndex = cardCount - getVisibleCount();
      rightArrow.style.opacity = currentIndex >= maxIndex ? '0.3' : '1';
      rightArrow.style.pointerEvents = currentIndex >= maxIndex ? 'none' : 'auto';
    }

    function getCardWidth() {
      if (!cards.length) return 0;
      var style = window.getComputedStyle(cards[0]);
      var margin = parseFloat(style.marginLeft) + parseFloat(style.marginRight);
      return cards[0].offsetWidth + margin;
    }

    function goTo(index) {
      var maxIndex = cardCount - getVisibleCount();
      currentIndex = Math.max(0, Math.min(index, maxIndex));
      var offset = currentIndex * getCardWidth();
      track.style.transform = 'translateX(' + (-offset) + 'px)';
      updateClasses();
    }

    function next() { goTo(currentIndex + 1); }
    function prev() { goTo(currentIndex - 1); }

    leftArrow.addEventListener('click', prev);
    rightArrow.addEventListener('click', next);

    wrapper.setAttribute('tabindex', '0');
    wrapper.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { prev(); e.preventDefault(); }
      if (e.key === 'ArrowRight') { next(); e.preventDefault(); }
    });

    // ── Touch / Mouse Drag ──
    var startX = 0;
    var dragOffset = 0;
    var isDragging = false;
    var baseTranslate = 0;

    function onDragStart(x) {
      isDragging = true;
      startX = x;
      baseTranslate = -(currentIndex * getCardWidth());
      track.classList.add('dragging');
    }

    function onDragMove(x) {
      if (!isDragging) return;
      dragOffset = x - startX;
      track.style.transform = 'translateX(' + (baseTranslate + dragOffset) + 'px)';
    }

    function onDragEnd() {
      if (!isDragging) return;
      isDragging = false;
      track.classList.remove('dragging');

      var threshold = getCardWidth() * 0.25;
      if (dragOffset < -threshold) {
        next();
      } else if (dragOffset > threshold) {
        prev();
      } else {
        goTo(currentIndex);
      }
      dragOffset = 0;
    }

    track.addEventListener('touchstart', function (e) {
      onDragStart(e.touches[0].clientX);
    }, { passive: true });

    track.addEventListener('touchmove', function (e) {
      onDragMove(e.touches[0].clientX);
    }, { passive: true });

    track.addEventListener('touchend', onDragEnd);

    track.addEventListener('mousedown', function (e) {
      e.preventDefault();
      onDragStart(e.clientX);
    });

    window.addEventListener('mousemove', function (e) {
      if (isDragging) onDragMove(e.clientX);
    });

    window.addEventListener('mouseup', function () {
      if (isDragging) onDragEnd();
    });

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        buildDots();
        goTo(currentIndex);
      }, 150);
    });

    buildDots();
    goTo(0);
  }

  function initCarousels() {
    var wrappers = document.querySelectorAll('.carousel-wrapper');
    wrappers.forEach(function (wrapper) {
      setupCarousel(wrapper);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCarousels);
  } else {
    initCarousels();
  }
})();
