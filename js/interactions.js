/* ═══════════════════════════════════════════════
   CHOICE TACTICAL — Interactions
   Scroll reveals, stat counters, expandables,
   sticky subnav highlighting
   ═══════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Scroll-Triggered Fade-In ──
  function initScrollReveal() {
    var fadeElements = document.querySelectorAll('.fade-in, .fade-in-left, .fade-in-right');
    if (!fadeElements.length) return;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    fadeElements.forEach(function (el) {
      observer.observe(el);
    });
  }

  // ── Animated Stat Counters ──
  function initStatCounters() {
    var counters = document.querySelectorAll('.stat-number[data-target]');
    if (!counters.length) return;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    counters.forEach(function (el) {
      observer.observe(el);
    });
  }

  function animateCounter(el) {
    var target = parseInt(el.getAttribute('data-target'), 10);
    var suffix = el.getAttribute('data-suffix') || '';
    var prefix = el.getAttribute('data-prefix') || '';
    var duration = 1500;
    var start = 0;
    var startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      // Ease out cubic
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(start + (target - start) * eased);
      el.textContent = prefix + current + suffix;
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }

  // ── Expandable Sections ──
  function initExpandables() {
    var headers = document.querySelectorAll('.expandable-header');

    headers.forEach(function (header) {
      header.addEventListener('click', function () {
        var parent = header.closest('.expandable');
        var isOpen = parent.classList.contains('open');

        // Close siblings (accordion behavior)
        var siblings = parent.parentElement.querySelectorAll('.expandable.open');
        siblings.forEach(function (sib) {
          if (sib !== parent) sib.classList.remove('open');
        });

        parent.classList.toggle('open', !isOpen);
      });
    });
  }

  // ── Sticky Subnav Highlighting ──
  function initSubnav() {
    var subnav = document.querySelector('.subnav');
    if (!subnav) return;

    var subnavLinks = subnav.querySelectorAll('.subnav-link');
    var sections = [];

    subnavLinks.forEach(function (link) {
      var href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        var section = document.querySelector(href);
        if (section) sections.push({ el: section, link: link });
      }
    });

    function updateActive() {
      var scrollPos = window.scrollY + 160; // offset for nav + subnav
      var current = null;

      sections.forEach(function (item) {
        if (scrollPos >= item.el.offsetTop) {
          current = item;
        }
      });

      subnavLinks.forEach(function (link) { link.classList.remove('active'); });
      if (current) current.link.classList.add('active');
    }

    window.addEventListener('scroll', updateActive, { passive: true });
    updateActive();
  }

  // ── Init All ──
  function init() {
    initScrollReveal();
    initStatCounters();
    initExpandables();
    initSubnav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
