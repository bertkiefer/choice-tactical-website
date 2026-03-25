/* ═══════════════════════════════════════════════
   CHOICE TACTICAL — Main JavaScript
   ═══════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Load Shared Includes (nav + footer) ──
  function loadIncludes() {
    var includes = document.querySelectorAll('[data-include]');
    var remaining = includes.length;

    if (remaining === 0) {
      initNav();
      return;
    }

    includes.forEach(function (el) {
      var file = el.getAttribute('data-include');
      fetch(file)
        .then(function (res) { return res.text(); })
        .then(function (html) {
          el.innerHTML = html;
          remaining--;
          if (remaining === 0) initNav();
        })
        .catch(function () {
          remaining--;
          if (remaining === 0) initNav();
        });
    });
  }

  // ── Navigation ──
  function initNav() {
    var navbar = document.getElementById('navbar');
    var navToggle = document.getElementById('navToggle');
    var navLinks = document.getElementById('navLinks');

    if (!navbar) return;

    // Active page highlight
    var currentPage = document.body.getAttribute('data-page') || 'home';
    var pageLinks = document.querySelectorAll('.nav-link[data-page]');
    pageLinks.forEach(function (link) {
      if (link.getAttribute('data-page') === currentPage) {
        link.classList.add('active');
      }
    });

    // Sticky nav darken on scroll
    function handleScroll() {
      if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    // Mobile menu toggle
    if (navToggle && navLinks) {
      navToggle.addEventListener('click', function () {
        navToggle.classList.toggle('open');
        navLinks.classList.toggle('open');
      });

      // Close on link click
      navLinks.querySelectorAll('.nav-link').forEach(function (link) {
        link.addEventListener('click', function () {
          navToggle.classList.remove('open');
          navLinks.classList.remove('open');
        });
      });
    }
  }

  // ── Smooth Scroll for Hash Links ──
  document.addEventListener('click', function (e) {
    var anchor = e.target.closest('a[href^="#"]');
    if (!anchor) return;
    var target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });

  // ── Init ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadIncludes);
  } else {
    loadIncludes();
  }
})();
