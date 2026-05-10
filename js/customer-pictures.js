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

  function buildGrid(items, allPhotos) {
    if (!items.length) {
      var empty = el('div', 'cp-empty');
      empty.textContent = 'No customer pictures yet — be the first to share!';
      return empty;
    }
    var grid = el('div', 'cp-grid');
    items.forEach(function (item) {
      var card = el('div', 'cp-submission');

      var photosWrap = el('div', 'cp-submission-photos');
      (item.photoUrls || []).forEach(function (url) {
        var idx = allPhotos.findIndex(function (p) { return p.url === url; });
        var link = el('a', 'cp-photo-link');
        link.href = url;
        link.setAttribute('aria-label', 'View larger');
        link.innerHTML = '<img src="' + escapeAttr(url) + '" alt="" loading="lazy">';
        link.addEventListener('click', function (e) {
          e.preventDefault();
          openPhotoZoom(allPhotos, idx);
        });
        photosWrap.appendChild(link);
      });

      var meta = el('div', 'cp-submission-meta');
      meta.innerHTML =
        '<div class="cp-submission-name">' + escapeAttr(item.name) + '</div>' +
        '<div class="cp-submission-caption">' + escapeAttr(item.caption) + '</div>';

      card.appendChild(photosWrap);
      card.appendChild(meta);
      grid.appendChild(card);
    });
    return grid;
  }

  function openPhotoZoom(allPhotos, startIdx) {
    if (!allPhotos.length) return;
    var idx = startIdx;

    var zoom = el('div', 'cp-zoom-overlay');
    zoom.innerHTML =
      '<button type="button" class="cp-zoom-close" aria-label="Close">×</button>' +
      '<button type="button" class="cp-zoom-nav cp-zoom-prev" aria-label="Previous">‹</button>' +
      '<button type="button" class="cp-zoom-nav cp-zoom-next" aria-label="Next">›</button>' +
      '<img class="cp-zoom-img" alt="">' +
      '<div class="cp-zoom-meta">' +
        '<div class="cp-zoom-name"></div>' +
        '<div class="cp-zoom-caption"></div>' +
      '</div>' +
      '<div class="cp-zoom-counter"></div>';

    var img = zoom.querySelector('.cp-zoom-img');
    var nameEl = zoom.querySelector('.cp-zoom-name');
    var captionEl = zoom.querySelector('.cp-zoom-caption');
    var counterEl = zoom.querySelector('.cp-zoom-counter');
    var prevBtn = zoom.querySelector('.cp-zoom-prev');
    var nextBtn = zoom.querySelector('.cp-zoom-next');

    function render() {
      var p = allPhotos[idx];
      img.src = p.url;
      nameEl.textContent = p.name;
      captionEl.textContent = p.caption;
      counterEl.textContent = (idx + 1) + ' / ' + allPhotos.length;
      var single = allPhotos.length <= 1;
      prevBtn.style.display = single ? 'none' : '';
      nextBtn.style.display = single ? 'none' : '';
    }

    function step(delta) {
      idx = (idx + delta + allPhotos.length) % allPhotos.length;
      render();
    }

    function closeZoom() {
      document.removeEventListener('keydown', zoomKey);
      zoom.remove();
    }

    function zoomKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); closeZoom(); }
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    }

    prevBtn.addEventListener('click', function (e) { e.stopPropagation(); step(-1); });
    nextBtn.addEventListener('click', function (e) { e.stopPropagation(); step(1); });
    zoom.querySelector('.cp-zoom-close').addEventListener('click', function (e) {
      e.stopPropagation(); closeZoom();
    });
    zoom.addEventListener('click', function (e) {
      // Click on backdrop (anywhere outside the image / controls) closes.
      if (e.target === zoom) closeZoom();
    });
    document.addEventListener('keydown', zoomKey);

    render();
    document.body.appendChild(zoom);
  }

  var TURNSTILE_SITE_KEY = window.CT_TURNSTILE_SITE_KEY || '';
  var MAX_PHOTOS = 3;
  var MAX_DIM = 1600; // resize longest edge to this before upload

  async function compressImage(file) {
    if (!file.type.startsWith('image/')) return file;
    var bmp = await createImageBitmap(file);
    var scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
    var w = Math.round(bmp.width * scale);
    var h = Math.round(bmp.height * scale);
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, w, h);
    var blob = await new Promise(function (resolve) {
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
    });
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  }

  function showSubmitForm(box, slug) {
    var content = box.querySelector('.cp-content');
    var footer = box.querySelector('.cp-footer');
    content.innerHTML = '';
    footer.innerHTML = '';

    var form = el('form', 'cp-form');
    form.innerHTML =
      '<label class="cp-label">Photos (up to 3)' +
        '<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" multiple required>' +
      '</label>' +
      '<label class="cp-label">Display name' +
        '<input type="text" name="name" required minlength="2" maxlength="60" placeholder="Mike R.">' +
      '</label>' +
      '<label class="cp-label">Email <span class="cp-hint">(kept private)</span>' +
        '<input type="email" name="email" required maxlength="120" placeholder="you@example.com">' +
      '</label>' +
      '<label class="cp-label">Caption' +
        '<input type="text" name="caption" required maxlength="140" placeholder="Mounted on my Vortex Razor">' +
      '</label>' +
      '<div class="cf-turnstile" data-sitekey="' + escapeAttr(TURNSTILE_SITE_KEY) + '"></div>' +
      '<div class="cp-form-status"></div>' +
      '<button type="submit" class="cp-submit-btn">Submit</button>';

    if (window.turnstile && TURNSTILE_SITE_KEY) {
      window.turnstile.render(form.querySelector('.cf-turnstile'));
    }

    var status = form.querySelector('.cp-form-status');
    var submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      status.textContent = 'Uploading…';
      submitBtn.disabled = true;

      var fileInput = form.querySelector('input[name="photo"]');
      var files = Array.from(fileInput.files || []);
      if (files.length < 1 || files.length > MAX_PHOTOS) {
        status.textContent = 'Please select between 1 and ' + MAX_PHOTOS + ' photos.';
        submitBtn.disabled = false;
        return;
      }

      try {
        var compressed = [];
        for (var i = 0; i < files.length; i++) {
          compressed.push(await compressImage(files[i]));
        }

        var fd = new FormData();
        fd.set('productSlug', slug);
        fd.set('name', form.name.value.trim());
        fd.set('email', form.email.value.trim());
        fd.set('caption', form.caption.value.trim());
        var turnstileToken = (form.querySelector('input[name="cf-turnstile-response"]') || {}).value || '';
        fd.set('turnstileToken', turnstileToken);
        compressed.forEach(function (f) { fd.append('photo', f); });

        var resp = await fetch('/api/customer-pictures/submit', { method: 'POST', body: fd });
        var data = await resp.json();
        if (resp.ok && data.ok) {
          content.innerHTML =
            '<div class="cp-thanks">' +
              '<h3>Thanks!</h3>' +
              '<p>Your picture will appear here once Choice Tactical approves it (usually within a day).</p>' +
            '</div>';
          footer.innerHTML = '';
        } else {
          status.textContent = data.error || 'Submission failed. Please try again.';
          submitBtn.disabled = false;
        }
      } catch (err) {
        status.textContent = 'Submission failed: ' + err.message;
        submitBtn.disabled = false;
      }
    });

    content.appendChild(form);
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

    // Flatten all photos across submissions for zoom navigation
    var allPhotos = [];
    (data.items || []).forEach(function (item) {
      (item.photoUrls || []).forEach(function (url) {
        allPhotos.push({ url: url, name: item.name, caption: item.caption });
      });
    });

    var content = el('div', 'cp-content');
    content.appendChild(buildGrid(data.items || [], allPhotos));

    var footer = el('div', 'cp-footer');
    var submitBtn = el('button', 'cp-submit-btn');
    submitBtn.type = 'button';
    submitBtn.innerHTML = '<span>➕</span> Submit Your Picture';
    submitBtn.addEventListener('click', function () {
      showSubmitForm(box, slug);
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
