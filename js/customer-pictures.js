// js/customer-pictures.js
(function () {
  'use strict';

  var SLUG_TO_NAME = { 'the-axis': 'The AXIS', 'the-stack': 'The Stack' };

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function buildGrid(items) {
    if (!items.length) {
      var empty = el('div', 'cp-empty');
      empty.textContent = 'No customer pictures yet — be the first to share!';
      return empty;
    }
    var grid = el('div', 'cp-grid');
    items.forEach(function (item) {
      var url = item.photoUrls[0];
      var tile = el('div', 'cp-tile');
      tile.innerHTML =
        '<img src="' + escapeAttr(url) + '" alt="" loading="lazy">' +
        '<div class="cp-tile-meta">' +
          '<div class="cp-tile-name">' + escapeAttr(item.name) + '</div>' +
          '<div class="cp-tile-caption">' + escapeAttr(item.caption) + '</div>' +
        '</div>';
      grid.appendChild(tile);
    });
    return grid;
  }

  function open(slug, data) {
    var overlay = el('div', 'cp-overlay');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(overlay); });

    var box = el('div', 'cp-box');
    var header = el('div', 'cp-header');
    header.innerHTML =
      '<h2>Customer Pictures — ' + escapeAttr(SLUG_TO_NAME[slug] || slug) + '</h2>' +
      '<button type="button" class="cp-close" aria-label="Close">×</button>';
    header.querySelector('.cp-close').addEventListener('click', function () { close(overlay); });

    var content = el('div', 'cp-content');
    content.appendChild(buildGrid(data.items || []));

    var footer = el('div', 'cp-footer');
    var submitBtn = el('button', 'cp-submit-btn');
    submitBtn.type = 'button';
    submitBtn.innerHTML = '<span>➕</span> Submit Your Picture';
    submitBtn.addEventListener('click', function () {
      // Wired up in Task 15
      submitBtn.textContent = 'Submit form coming next…';
    });
    footer.appendChild(submitBtn);

    box.appendChild(header);
    box.appendChild(content);
    box.appendChild(footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    function escHandler(e) {
      if (e.key === 'Escape') close(overlay);
    }
    document.addEventListener('keydown', escHandler);
    overlay._escHandler = escHandler;
  }

  function close(overlay) {
    document.body.style.overflow = '';
    if (overlay._escHandler) document.removeEventListener('keydown', overlay._escHandler);
    overlay.remove();
  }

  window.CustomerPictures = { open: open };
})();
