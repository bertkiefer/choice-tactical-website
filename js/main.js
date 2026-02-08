/* ═══════════════════════════════════════════════
   CHOICE TACTICAL — Main JavaScript
   ═══════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Sticky Navigation ──
  const navbar = document.getElementById('navbar');
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  const links = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('section[id]');

  function handleScroll() {
    // Darken nav on scroll
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }

    // Active section highlight
    let current = '';
    sections.forEach(function (section) {
      var top = section.offsetTop - 100;
      if (window.scrollY >= top) {
        current = section.getAttribute('id');
      }
    });

    links.forEach(function (link) {
      link.classList.remove('active');
      if (link.getAttribute('href') === '#' + current) {
        link.classList.add('active');
      }
    });
  }

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  // ── Mobile Menu ──
  navToggle.addEventListener('click', function () {
    navToggle.classList.toggle('open');
    navLinks.classList.toggle('open');
  });

  // Close mobile menu on link click
  links.forEach(function (link) {
    link.addEventListener('click', function () {
      navToggle.classList.remove('open');
      navLinks.classList.remove('open');
    });
  });

  // ── Smooth Scroll ──
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // ── Scroll-Triggered Fade-In ──
  var fadeElements = document.querySelectorAll('.fade-in');

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px',
    }
  );

  fadeElements.forEach(function (el) {
    observer.observe(el);
  });

  // ── Stagger suite cards ──
  var suiteCards = document.querySelectorAll('.suite-card');
  suiteCards.forEach(function (card, i) {
    card.style.transitionDelay = i * 0.1 + 's';
  });

  var teaserItems = document.querySelectorAll('.teaser-item');
  teaserItems.forEach(function (item, i) {
    item.style.transitionDelay = i * 0.1 + 's';
  });
})();
