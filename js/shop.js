/* ═══════════════════════════════════════════════
   CHOICE TACTICAL — Shop & Cart
   ═══════════════════════════════════════════════ */

(function () {
  'use strict';

  var CART_KEY = 'ct_cart';
  var PRODUCTS_URL = '/shop/products.json?v=16';

  // ── Utilities ──────────────────────────────────
  function formatUSD(cents) {
    return '$' + cents.toFixed(2);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getQueryParam(name) {
    var m = new URLSearchParams(window.location.search).get(name);
    return m || '';
  }

  // ── Cart state (localStorage) ──────────────────
  function readCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartBadge();
  }

  function cartItemCount() {
    return readCart().reduce(function (sum, i) { return sum + (i.qty || 0); }, 0);
  }

  function lineKey(line) {
    return (line.stripePriceId || '')
      + '|' + JSON.stringify(line.selections || {})
      + '|' + JSON.stringify(line.metadata || {});
  }

  function addToCart(item) {
    // item = { slug, stripePriceId, qty, selections?, metadata? }
    var cart = readCart();
    var newKey = lineKey(item);
    var existing = null;
    for (var i = 0; i < cart.length; i++) {
      if (lineKey(cart[i]) === newKey) {
        existing = cart[i];
        break;
      }
    }
    if (existing) {
      existing.qty = Math.min(99, (existing.qty || 0) + item.qty);
    } else {
      cart.push({
        slug: item.slug,
        stripePriceId: item.stripePriceId,
        selections: item.selections || null,
        metadata: item.metadata || null,
        qty: Math.min(99, Math.max(1, item.qty))
      });
    }
    writeCart(cart);
  }

  function updateCartLineQty(key, qty) {
    var cart = readCart();
    var out = [];
    for (var i = 0; i < cart.length; i++) {
      if (lineKey(cart[i]) === key) {
        if (qty > 0) {
          cart[i].qty = Math.min(99, qty);
          out.push(cart[i]);
        }
      } else {
        out.push(cart[i]);
      }
    }
    writeCart(out);
  }

  function removeCartLine(key) {
    var cart = readCart().filter(function (i) {
      return lineKey(i) !== key;
    });
    writeCart(cart);
  }

  function clearCart() {
    localStorage.removeItem(CART_KEY);
    updateCartBadge();
  }

  function updateCartBadge() {
    var badge = document.getElementById('navCartBadge');
    if (!badge) return;
    var count = cartItemCount();
    if (count > 0) {
      badge.textContent = String(count);
      badge.hidden = false;
    } else {
      badge.textContent = '0';
      badge.hidden = true;
    }
  }

  // ── Toast ──────────────────────────────────────
  function showToast(message) {
    var toast = document.getElementById('shopToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'shopToast';
      toast.className = 'shop-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    requestAnimationFrame(function () {
      toast.classList.add('visible');
    });
    setTimeout(function () {
      toast.classList.remove('visible');
    }, 1800);
  }

  // ── Checkout ───────────────────────────────────
  function startCheckout(btn) {
    var cart = readCart();
    if (!cart.length) {
      showToast('Cart is empty');
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Redirecting…'; }

    loadProducts().then(function (products) {
      var rateIds = [];
      var rateSeen = {};
      var items = cart.map(function (i) {
        var p = findProductByStripePriceId(products, i.stripePriceId);
        // Resolve shipping rate from the most specific match available:
        // 1. replacementPlate (when this line is the plate-only line)
        // 2. matching variant's shippingRateId
        // 3. product top-level shippingRateId (legacy / simple products)
        var rateId = null;
        if (p) {
          if (p.replacementPlate && p.replacementPlate.stripePriceId === i.stripePriceId
              && p.replacementPlate.shippingRateId) {
            rateId = p.replacementPlate.shippingRateId;
          } else {
            var v = findVariantByStripePriceId(p, i.stripePriceId);
            if (v && v.shippingRateId) {
              rateId = v.shippingRateId;
            } else if (p.shippingRateId) {
              rateId = p.shippingRateId;
            }
          }
        }
        if (rateId && !rateSeen[rateId]) {
          rateIds.push(rateId);
          rateSeen[rateId] = true;
        }
        return {
          stripePriceId: i.stripePriceId,
          qty: i.qty,
          selections: i.selections || null,
          metadata: i.metadata || null
        };
      });

      fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items,
          shippingRateIds: rateIds
        })
      })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
        .then(function (res) {
          if (res.status >= 200 && res.status < 300 && res.body.url) {
            window.location = res.body.url;
          } else {
            var msg = (res.body && res.body.error) || 'Checkout failed — please try again.';
            showCheckoutError(msg);
            if (btn) { btn.disabled = false; btn.textContent = 'Checkout'; }
          }
        })
        .catch(function () {
          showCheckoutError('Network error — please check your connection and try again.');
          if (btn) { btn.disabled = false; btn.textContent = 'Checkout'; }
        });
    });
  }

  function showCheckoutError(msg) {
    var container = document.getElementById('cartContainer');
    if (!container) return;
    var existing = container.querySelector('.shop-error');
    if (existing) existing.remove();
    var banner = document.createElement('div');
    banner.className = 'shop-error';
    banner.textContent = msg;
    container.appendChild(banner);
  }

  // ── Catalog ────────────────────────────────────
  var _productsCache = null;
  function loadProducts() {
    if (_productsCache) return Promise.resolve(_productsCache);
    return fetch(PRODUCTS_URL)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _productsCache = data.products || [];
        return _productsCache;
      });
  }

  function findProductBySlug(products, slug) {
    for (var i = 0; i < products.length; i++) {
      if (products[i].slug === slug) return products[i];
    }
    return null;
  }

  function findProductByStripePriceId(products, priceId) {
    for (var i = 0; i < products.length; i++) {
      if (products[i].stripePriceId === priceId) return products[i];
      var vs = products[i].variants;
      if (Array.isArray(vs)) {
        for (var j = 0; j < vs.length; j++) {
          if (vs[j].stripePriceId === priceId) return products[i];
        }
      }
    }
    return null;
  }

  function findVariantByStripePriceId(product, priceId) {
    if (!product || !Array.isArray(product.variants)) return null;
    for (var i = 0; i < product.variants.length; i++) {
      if (product.variants[i].stripePriceId === priceId) return product.variants[i];
    }
    return null;
  }

  function findVariantBySelections(product, selections) {
    if (!product || !Array.isArray(product.variants)) return null;
    for (var i = 0; i < product.variants.length; i++) {
      var v = product.variants[i];
      if (!v.selections) continue;
      var match = true;
      // Match only on the keys the variant declares — extra user selections (like
      // color, which doesn't drive price) are ignored at variant lookup time.
      for (var key in v.selections) {
        if (selections[key] !== v.selections[key]) { match = false; break; }
      }
      if (match) return v;
    }
    return null;
  }

  function selectionsDisplayName(product, selections) {
    if (!selections || !Array.isArray(product.options)) return '';
    var parts = [];
    product.options.forEach(function (opt) {
      var selId = selections[opt.id];
      if (!selId) return;
      var matching = null;
      (opt.values || []).forEach(function (val) { if (val.id === selId) matching = val; });
      if (matching) parts.push(matching.name);
    });
    return parts.join(', ');
  }

  function variantDisplayName(product, variant) {
    if (!variant) return '';
    if (variant.selections) return selectionsDisplayName(product, variant.selections);
    return variant.name || '';
  }

  function lowestVariantPrice(product) {
    if (!Array.isArray(product.variants) || !product.variants.length) {
      return product.priceUsd || 0;
    }
    var min = Infinity;
    for (var i = 0; i < product.variants.length; i++) {
      if (product.variants[i].priceUsd < min) min = product.variants[i].priceUsd;
    }
    return min;
  }

  // ── Grid rendering ─────────────────────────────
  function renderProductGrid(container, products) {
    if (!products.length) {
      container.innerHTML = '<p style="text-align:center;color:#B0B0B0">' +
        'No products available yet. Check back soon.</p>';
      return;
    }
    container.innerHTML = products.map(function (p) {
      var img = (p.images && p.images[0]) || '/shop/images/placeholder-1.svg';
      var subtitle = p.subtitle
        ? '<p class="product-card-subtitle">' + escapeHtml(p.subtitle) + '</p>' : '';
      var status;
      if (p.comingSoon) {
        status = '<span class="product-card-coming-soon">Coming Soon</span>';
      } else if (!p.inStock) {
        status = '<span class="product-card-sold-out">Sold Out</span>';
      } else if (Array.isArray(p.variants) && p.variants.length) {
        status = '<p class="product-card-price"><span class="price-from">from</span> ' + formatUSD(lowestVariantPrice(p)) + '</p>';
      } else {
        status = '<p class="product-card-price">' + formatUSD(p.priceUsd) + '</p>';
      }
      var tagline = (!p.comingSoon && p.tagline)
        ? '<p class="product-card-tagline">' + escapeHtml(p.tagline) + '</p>' : '';
      var cardPhoto = p.cardImage
        ? '<img class="product-card-photo" src="' + escapeHtml(p.cardImage) +
          '" alt="' + escapeHtml(p.name) + '">' : '';
      return '' +
        '<a class="product-card" href="/shop/product.html?slug=' + escapeHtml(p.slug) + '">' +
          '<div class="product-card-square">' +
            '<img class="product-card-element-mark" src="/images/logo-element-badge-gold.png" alt="Element">' +
            '<h3 class="product-card-name">' + escapeHtml(p.name) + '</h3>' +
            subtitle +
            tagline +
          '</div>' +
          cardPhoto +
          '<div class="product-card-body">' +
            status +
          '</div>' +
        '</a>';
    }).join('');
  }

  // ── Detail rendering ───────────────────────────
  function renderDescription(desc) {
    if (!desc) return '';
    if (typeof desc === 'string') {
      return '<p class="product-detail-description">' + escapeHtml(desc) + '</p>';
    }
    if (!Array.isArray(desc)) return '';
    return '<div class="product-detail-description">' + desc.map(function (sec) {
      var heading = sec.heading
        ? '<h3 class="product-detail-section-heading">' + escapeHtml(sec.heading) + '</h3>' : '';
      var body = '';
      if (sec.body) {
        body = '<p class="product-detail-section-body">' + escapeHtml(sec.body) + '</p>';
      } else if (Array.isArray(sec.items)) {
        body = '<ul class="product-detail-section-list">' + sec.items.map(function (it) {
          return '<li>' + escapeHtml(it) + '</li>';
        }).join('') + '</ul>';
      }
      return heading + body;
    }).join('') + '</div>';
  }

  function renderProductDetail(container, product) {
    var images = (product.images && product.images.length)
      ? product.images : ['/shop/images/placeholder-1.svg'];
    var galleryButton = product.customerPictures
      ? '<div class="customer-pictures-button-wrap">' +
          '<button type="button" class="customer-pictures-button" data-slug="' +
            escapeHtml(product.slug) + '">' +
            '<span class="customer-pictures-icon">📷</span>' +
            '<span class="customer-pictures-label">Customer Pictures</span>' +
          '</button>' +
        '</div>'
      : '';

    var gallery = '<div class="product-gallery">' +
      '<img class="product-gallery-hero no-zoom" id="productHero" ' +
        'data-index="0" src="' + escapeHtml(images[0]) +
        '" alt="' + escapeHtml(product.name) + '">' +
      '<div class="product-gallery-thumbs">' +
        images.map(function (src, i) {
          return '<button type="button" class="product-gallery-thumb no-zoom' +
            (i === 0 ? ' active' : '') + '" data-index="' + i + '" data-src="' +
            escapeHtml(src) + '" aria-label="View image ' + (i + 1) + '">' +
            '<img class="no-zoom" src="' + escapeHtml(src) + '" alt="">' +
          '</button>';
        }).join('') +
      '</div>' +
      galleryButton +
    '</div>';

    var subtitle = product.subtitle
      ? '<p class="product-detail-subtitle">' + escapeHtml(product.subtitle) + '</p>' : '';
    var tagline = (!product.comingSoon && product.tagline)
      ? '<p class="product-detail-tagline">' + escapeHtml(product.tagline) + '</p>' : '';
    var description = (!product.comingSoon) ? renderDescription(product.description) : '';
    var hasOptions = Array.isArray(product.options) && product.options.length > 0
                     && Array.isArray(product.variants) && product.variants.length > 0;
    var hasFlatVariants = !hasOptions && Array.isArray(product.variants) && product.variants.length > 0;
    var statusBlock = '', variantPicker = '', qtyRow = '', addBtn = '';
    if (product.comingSoon) {
      statusBlock = '<span class="product-card-coming-soon product-detail-coming-soon">Coming Soon</span>';
    } else if (!product.inStock) {
      statusBlock = '<span class="product-card-sold-out">Sold Out</span>';
    } else {
      var initialVariant = null;
      var initialPrice = product.priceUsd || 0;
      var initialPriceId = product.stripePriceId || '';

      if (hasOptions) {
        // Pick the default-flagged value, or fall back to the first one
        var defaultValueIdByOption = {};
        product.options.forEach(function (opt) {
          var def = (opt.values || []).find(function (v) { return v.default; });
          defaultValueIdByOption[opt.id] = def
            ? def.id
            : (opt.values && opt.values[0] && opt.values[0].id);
        });

        var initialSelections = {};
        Object.keys(defaultValueIdByOption).forEach(function (k) {
          initialSelections[k] = defaultValueIdByOption[k];
        });
        initialVariant = findVariantBySelections(product, initialSelections) || product.variants[0];
        initialPrice = initialVariant.priceUsd;
        initialPriceId = initialVariant.stripePriceId;

        variantPicker = '<div class="variant-picker">' +
          product.options.map(function (opt) {
            var defId = defaultValueIdByOption[opt.id];
            return '<div class="variant-option-group">' +
              '<label class="variant-option-label" for="opt_' + escapeHtml(opt.id) + '">' +
                escapeHtml(opt.name) +
              '</label>' +
              '<select class="variant-option-select" id="opt_' + escapeHtml(opt.id) + '" ' +
                'data-option-id="' + escapeHtml(opt.id) + '">' +
                (opt.values || []).map(function (val) {
                  var label = val.name + (val.subtitle ? ' (' + val.subtitle + ')' : '');
                  return '<option value="' + escapeHtml(val.id) + '"' +
                    (val.id === defId ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
                }).join('') +
              '</select>' +
            '</div>';
          }).join('') +
          // Plate-size dropdown — hidden by default, shown when active option value has plateSelectable
          '<div class="variant-option-group plate-size-group" id="plateSizeGroup" style="display:none">' +
            '<label class="variant-option-label" for="opt_plate_size">Plate Size — match your laser\'s diameter</label>' +
            '<select class="variant-option-select" id="opt_plate_size" data-plate-size="1">' +
              '<option value="">Pick a size</option>' +
              ((product.replacementPlate && product.replacementPlate.plateSizes) || []).map(function (s) {
                return '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + ' mm</option>';
              }).join('') +
            '</select>' +
          '</div>' +
        '</div>';
      } else if (hasFlatVariants) {
        initialVariant = product.variants[0];
        initialPrice = initialVariant.priceUsd;
        initialPriceId = initialVariant.stripePriceId;
        variantPicker = '<div class="variant-picker">' +
          '<div class="variant-option-group">' +
            '<label class="variant-option-label" for="opt_variant">Option</label>' +
            '<select class="variant-option-select" id="opt_variant" data-flat-variant="1">' +
              product.variants.map(function (v, i) {
                return '<option value="' + i + '"' + (i === 0 ? ' selected' : '') + '>' +
                  escapeHtml(v.name + ' — ' + formatUSD(v.priceUsd)) + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
        '</div>';
      }

      var pricePrefix = (hasOptions || hasFlatVariants)
        ? '<span class="price-from">from</span> ' : '';
      statusBlock = '<p class="product-detail-price" id="productPrice">' +
        pricePrefix + formatUSD(initialPrice) + '</p>';
      qtyRow = '<div class="qty-row">' +
        '<label class="qty-label" for="qtyInput">Quantity</label>' +
        '<input class="qty-input" id="qtyInput" type="number" min="1" max="10" value="1">' +
      '</div>';
      addBtn = '<button type="button" class="add-to-cart-btn" id="addToCartBtn" ' +
        'data-price-id="' + escapeHtml(initialPriceId) + '" ' +
        'data-slug="' + escapeHtml(product.slug) + '">Add to Cart</button>';
    }
    container.innerHTML = '' +
      '<div>' + gallery + '</div>' +
      '<div>' +
        '<img class="product-detail-element-mark" src="/images/logo-element-badge-gold.png" alt="Element">' +
        '<h1 class="product-detail-name">' + escapeHtml(product.name) + '</h1>' +
        subtitle +
        tagline +
        statusBlock +
        variantPicker +
        qtyRow +
        addBtn +
        description +
      '</div>';
    document.title = product.name + ' — The ELEMENT Line — Choice Tactical';

    if (hasOptions || hasFlatVariants) {
      var priceLabel = document.getElementById('productPrice');
      var addBtnEl = document.getElementById('addToCartBtn');
      var selects = container.querySelectorAll('.variant-option-select');

      var plateGroup = container.querySelector('#plateSizeGroup');
      var plateSelect = container.querySelector('#opt_plate_size');
      var allowedPlates = (product.replacementPlate && product.replacementPlate.plateSizes) || [];

      function activeOptionValue(optId, sels) {
        var opt = (product.options || []).find(function (o) { return o.id === optId; });
        if (!opt) return null;
        return (opt.values || []).find(function (v) { return v.id === sels[optId]; });
      }

      function applyVariant(v) {
        if (!v) return;
        if (priceLabel) {
          priceLabel.innerHTML = '<span class="price-from">from</span> ' + formatUSD(v.priceUsd);
        }
        if (addBtnEl) addBtnEl.setAttribute('data-price-id', v.stripePriceId);
      }

      function refreshPlateGate() {
        if (hasOptions) {
          var sels = {};
          selects.forEach(function (s) { sels[s.getAttribute('data-option-id')] = s.value; });
          applyVariant(findVariantBySelections(product, sels));

          // Decide whether plate dropdown is required (any selected option value has plateSelectable)
          var plateRequired = false;
          Object.keys(sels).forEach(function (optId) {
            var val = activeOptionValue(optId, sels);
            if (val && val.plateSelectable) plateRequired = true;
          });

          if (plateGroup) {
            if (plateRequired) {
              plateGroup.style.display = '';
            } else {
              plateGroup.style.display = 'none';
              if (plateSelect) plateSelect.value = '';
            }
          }

          // Gate Add to Cart button
          if (addBtnEl) {
            var plateOk = !plateRequired
              || (plateSelect && allowedPlates.indexOf(plateSelect.value) !== -1);
            addBtnEl.disabled = !plateOk;
            addBtnEl.title = plateOk ? '' : 'Pick your plate size to continue';
          }
        } else {
          var idx = Number(selects[0] && selects[0].value);
          applyVariant(product.variants[idx]);
        }
      }

      selects.forEach(function (sel) {
        sel.addEventListener('change', refreshPlateGate);
      });
      if (plateSelect) plateSelect.addEventListener('change', refreshPlateGate);
      refreshPlateGate(); // initial state
    }

    var btn = document.getElementById('addToCartBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        var qtyInput = document.getElementById('qtyInput');
        var qty = Math.max(1, Math.min(10, parseInt(qtyInput && qtyInput.value, 10) || 1));
        var priceId = btn.getAttribute('data-price-id');
        var sel = null;
        if (hasOptions) {
          sel = {};
          var pickerSelects = container.querySelectorAll('.variant-option-select');
          pickerSelects.forEach(function (s) {
            sel[s.getAttribute('data-option-id')] = s.value;
          });
        }
        var meta = null;
        if (plateGroup && plateGroup.style.display !== 'none' && plateSelect && plateSelect.value) {
          meta = { plate_size: plateSelect.value };
        }
        addToCart({
          slug: product.slug,
          stripePriceId: priceId,
          selections: sel,
          qty: qty,
          metadata: meta
        });
        showToast('Added to cart');
      });
    }

    bindGalleryInteractions(container, images, product.name);
    setupCustomerPicturesButton(container, product);
    renderReplacementPlateSection(container, product);
  }

  // ── Product gallery — hero swap + lightbox ─────
  var _productLightbox = null;
  var _productLightboxIndex = 0;
  var _productLightboxImages = [];
  var _productLightboxName = '';

  function bindGalleryInteractions(container, images, productName) {
    var hero = container.querySelector('#productHero');
    var thumbs = container.querySelectorAll('.product-gallery-thumb');
    if (!hero) return;

    var currentIndex = 0;

    function activate(i) {
      if (i < 0 || i >= images.length) return;
      currentIndex = i;
      hero.src = images[i];
      hero.setAttribute('data-index', String(i));
      thumbs.forEach(function (t) {
        t.classList.toggle('active', Number(t.getAttribute('data-index')) === i);
      });
    }

    thumbs.forEach(function (t) {
      t.addEventListener('click', function () {
        activate(Number(t.getAttribute('data-index')));
      });
    });

    hero.style.cursor = 'zoom-in';
    hero.addEventListener('click', function () {
      openProductLightbox(images, currentIndex, productName);
    });
  }

  function setupCustomerPicturesButton(container, product) {
    if (!product.customerPictures) return;
    var btn = container.querySelector(
      '.customer-pictures-button[data-slug="' + product.slug + '"]'
    );
    if (!btn) return;

    var labelEl = btn.querySelector('.customer-pictures-label');
    var iconEl = btn.querySelector('.customer-pictures-icon');

    function openLightbox(data) {
      if (window.CustomerPictures && typeof window.CustomerPictures.open === 'function') {
        window.CustomerPictures.open(product.slug, data);
      }
    }

    fetch('/api/customer-pictures/' + encodeURIComponent(product.slug))
      .then(function (r) { return r.ok ? r.json() : { items: [], count: 0 }; })
      .catch(function () { return { items: [], count: 0 }; })
      .then(function (data) {
        if (data.count > 0) {
          if (labelEl) labelEl.textContent = 'Customer Pictures (' + data.count + ')';
          if (iconEl) iconEl.textContent = '📷';
        } else {
          if (labelEl) labelEl.textContent = 'Submit a Picture';
          if (iconEl) iconEl.textContent = '➕';
        }
        btn.addEventListener('click', function () { openLightbox(data); });
      });
  }

  function renderReplacementPlateSection(container, product) {
    var rp = product.replacementPlate;
    if (!rp || !Array.isArray(rp.plateSizes) || !rp.plateSizes.length) return;

    var section = document.createElement('div');
    section.className = 'replacement-plate-section';
    section.innerHTML =
      '<hr class="replacement-plate-divider">' +
      '<h2 class="replacement-plate-h">Already own an AXIS?</h2>' +
      '<p class="replacement-plate-blurb">Need a different plate to fit a different laser? ' +
        'Replacement plates ship in a small padded envelope, free shipping included.</p>' +
      '<div class="variant-option-group">' +
        '<label class="variant-option-label" for="rp_plate_size">Plate Size</label>' +
        '<select class="variant-option-select" id="rp_plate_size">' +
          '<option value="">Pick a size</option>' +
          rp.plateSizes.map(function (s) {
            return '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + ' mm</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<p class="replacement-plate-price">' + formatUSD(rp.priceUsd) + ' (shipping included)</p>' +
      '<button type="button" class="add-to-cart-btn" id="rpAddBtn" disabled ' +
        'title="Pick your plate size to continue">Add Plate to Cart</button>';

    container.appendChild(section);

    var sel = section.querySelector('#rp_plate_size');
    var btn = section.querySelector('#rpAddBtn');
    var allowed = rp.plateSizes;

    sel.addEventListener('change', function () {
      var ok = allowed.indexOf(sel.value) !== -1;
      btn.disabled = !ok;
      btn.title = ok ? '' : 'Pick your plate size to continue';
    });

    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      addToCart({
        slug: product.slug,
        stripePriceId: rp.stripePriceId,
        qty: 1,
        selections: null,
        metadata: { plate_size: sel.value }
      });
      showToast('Added to cart');
    });
  }

  function ensureProductLightbox() {
    if (_productLightbox) return _productLightbox;
    var html =
      '<div class="product-lightbox" id="productLightbox" aria-hidden="true">' +
        '<button class="product-lightbox-close" type="button" aria-label="Close">&times;</button>' +
        '<button class="product-lightbox-nav product-lightbox-prev" type="button" aria-label="Previous">&#8249;</button>' +
        '<button class="product-lightbox-nav product-lightbox-next" type="button" aria-label="Next">&#8250;</button>' +
        '<img class="product-lightbox-img" alt="">' +
        '<div class="product-lightbox-counter"></div>' +
      '</div>';
    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);
    _productLightbox = document.getElementById('productLightbox');

    _productLightbox.querySelector('.product-lightbox-close')
      .addEventListener('click', closeProductLightbox);
    _productLightbox.querySelector('.product-lightbox-prev')
      .addEventListener('click', function () { navigateProductLightbox(-1); });
    _productLightbox.querySelector('.product-lightbox-next')
      .addEventListener('click', function () { navigateProductLightbox(1); });
    _productLightbox.addEventListener('click', function (e) {
      if (e.target === _productLightbox) closeProductLightbox();
    });
    document.addEventListener('keydown', function (e) {
      if (!_productLightbox.classList.contains('open')) return;
      if (e.key === 'Escape') closeProductLightbox();
      if (e.key === 'ArrowLeft') navigateProductLightbox(-1);
      if (e.key === 'ArrowRight') navigateProductLightbox(1);
    });
    return _productLightbox;
  }

  function openProductLightbox(images, index, productName) {
    var lb = ensureProductLightbox();
    _productLightboxImages = images || [];
    _productLightboxIndex = Math.max(0, Math.min(index || 0, _productLightboxImages.length - 1));
    _productLightboxName = productName || '';
    updateProductLightbox();
    lb.classList.add('open');
    lb.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeProductLightbox() {
    if (!_productLightbox) return;
    _productLightbox.classList.remove('open');
    _productLightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function navigateProductLightbox(dir) {
    if (!_productLightboxImages.length) return;
    var n = _productLightboxImages.length;
    _productLightboxIndex = ((_productLightboxIndex + dir) % n + n) % n;
    updateProductLightbox();
  }

  function updateProductLightbox() {
    if (!_productLightbox) return;
    var img = _productLightbox.querySelector('.product-lightbox-img');
    var counter = _productLightbox.querySelector('.product-lightbox-counter');
    var src = _productLightboxImages[_productLightboxIndex];
    img.src = src || '';
    img.alt = _productLightboxName || '';
    counter.textContent = (_productLightboxIndex + 1) + ' / ' + _productLightboxImages.length;
  }

  // ── Page init ──────────────────────────────────
  function initShopGrid() {
    var container = document.getElementById('productGrid');
    if (!container) return;
    loadProducts()
      .then(function (products) { renderProductGrid(container, products); })
      .catch(function (err) {
        console.error('Failed to load products', err);
        container.innerHTML = '<p style="color:#FF5722">Unable to load products. Please refresh.</p>';
      });
  }

  function initProductDetail() {
    var container = document.getElementById('productDetail');
    if (!container) return;
    var slug = getQueryParam('slug');
    if (!slug) {
      // Fall back to parsing slug from /shop/<slug>/ URL path
      // (Cloudflare 200-rewrite keeps the pretty URL in the browser, hiding the query string)
      var m = window.location.pathname.match(/^\/shop\/([^\/]+)\/?$/);
      if (m && m[1] !== 'cart' && m[1] !== 'thanks') {
        slug = m[1];
      }
    }
    if (!slug) {
      container.innerHTML = '<p class="shop-error">No product specified.</p>';
      return;
    }
    loadProducts().then(function (products) {
      var product = findProductBySlug(products, slug);
      if (!product) {
        container.innerHTML = '<p class="shop-error">Product not found. <a href="/shop/">Back to shop</a></p>';
        return;
      }
      renderProductDetail(container, product);
    });
  }

  function renderCartPage(container) {
    var cart = readCart();
    if (!cart.length) {
      container.innerHTML = '' +
        '<header class="shop-header">' +
          '<h1 class="shop-title">Your Cart</h1>' +
        '</header>' +
        '<div class="cart-empty">' +
          '<p>Your cart is empty.</p>' +
          '<p><a class="btn-primary" href="/shop/">Browse Precision Gear</a></p>' +
        '</div>';
      return;
    }
    loadProducts().then(function (products) {
      var rows = [];
      var subtotalCents = 0;
      var missing = [];
      cart.forEach(function (line) {
        var p = findProductByStripePriceId(products, line.stripePriceId);
        if (!p) { missing.push(line.stripePriceId); return; }
        var v = findVariantByStripePriceId(p, line.stripePriceId);
        var unitPrice = v ? v.priceUsd : p.priceUsd;
        // For the replacement plate line (no variant), use replacementPlate.priceUsd
        if (!v && p.replacementPlate && p.replacementPlate.stripePriceId === line.stripePriceId) {
          unitPrice = p.replacementPlate.priceUsd;
        }
        // Prefer line.selections (captures color too) over variant.selections (price only)
        var displayParts = '';
        if (line.selections) displayParts = selectionsDisplayName(p, line.selections);
        if (!displayParts) displayParts = variantDisplayName(p, v);
        // For the replacement-plate line, show the displayName from the rp block
        var baseName = p.name;
        if (!v && p.replacementPlate && p.replacementPlate.stripePriceId === line.stripePriceId) {
          baseName = p.replacementPlate.displayName || (p.name + ' Replacement Plate');
        }
        var displayName = displayParts ? (baseName + ' — ' + displayParts) : baseName;
        // Append plate size suffix when the line carries plate metadata
        if (line.metadata && typeof line.metadata.plate_size === 'string' && line.metadata.plate_size) {
          displayName = displayName + ' · ' + line.metadata.plate_size + ' mm plate';
        }
        var lineTotal = unitPrice * line.qty;
        subtotalCents += lineTotal;
        var img = (p.images && p.images[0]) || '/shop/images/placeholder-1.svg';
        var key = lineKey(line);
        rows.push('' +
          '<div class="cart-row" data-line-key="' + escapeHtml(key) + '">' +
            '<img class="cart-row-image" src="' + escapeHtml(img) + '" alt="' + escapeHtml(p.name) + '">' +
            '<a class="cart-row-name" href="/shop/product.html?slug=' + escapeHtml(p.slug) + '">' + escapeHtml(displayName) + '</a>' +
            '<input class="cart-row-qty" type="number" min="1" max="99" value="' + line.qty + '">' +
            '<span class="cart-row-subtotal">' + formatUSD(lineTotal) + '</span>' +
            '<button class="cart-row-remove" type="button" aria-label="Remove">×</button>' +
          '</div>'
        );
      });
      container.innerHTML = '' +
        '<header class="shop-header">' +
          '<h1 class="shop-title">Your Cart</h1>' +
        '</header>' +
        rows.join('') +
        '<div class="cart-total">' +
          '<span class="cart-total-label">Subtotal</span>' +
          '<span class="cart-total-amount">' + formatUSD(subtotalCents) + '</span>' +
        '</div>' +
        '<p class="cart-note">Shipping &amp; tax calculated at checkout.</p>' +
        '<div class="cart-actions">' +
          '<a class="btn-secondary" href="/shop/">Continue Shopping</a>' +
          '<button class="btn-primary" id="checkoutBtn" type="button">Checkout</button>' +
        '</div>' +
        (missing.length ? '<div class="shop-error">Some items in your cart are no longer available and were skipped.</div>' : '');

      // Wire up line-level events
      container.querySelectorAll('.cart-row').forEach(function (row) {
        var key = row.getAttribute('data-line-key');
        var qtyEl = row.querySelector('.cart-row-qty');
        var removeBtn = row.querySelector('.cart-row-remove');
        qtyEl.addEventListener('change', function () {
          var n = parseInt(qtyEl.value, 10);
          if (!isFinite(n) || n < 1) n = 1;
          if (n > 99) n = 99;
          updateCartLineQty(key, n);
          renderCartPage(container);
        });
        removeBtn.addEventListener('click', function () {
          removeCartLine(key);
          renderCartPage(container);
        });
      });

      var checkoutBtn = document.getElementById('checkoutBtn');
      if (checkoutBtn) {
        checkoutBtn.addEventListener('click', function () {
          startCheckout(checkoutBtn);
        });
      }
    });
  }

  function initCartPage() {
    var container = document.getElementById('cartContainer');
    if (!container) return;
    renderCartPage(container);
  }

  function initPage() {
    // Nav loads asynchronously; delay badge refresh.
    setTimeout(updateCartBadge, 300);
    initShopGrid();
    initProductDetail();
    initCartPage();
  }

  // Expose for later tasks
  window.ShopApp = {
    init: function () { initPage(); },
    loadProducts: loadProducts,
    findProductBySlug: findProductBySlug,
    findProductByStripePriceId: findProductByStripePriceId,
    formatUSD: formatUSD,
    escapeHtml: escapeHtml,
    getQueryParam: getQueryParam,
    readCart: readCart,
    writeCart: writeCart,
    addToCart: addToCart,
    updateCartLineQty: updateCartLineQty,
    removeCartLine: removeCartLine,
    clearCart: clearCart,
    cartItemCount: cartItemCount,
    updateCartBadge: updateCartBadge,
    showToast: showToast
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }
})();
