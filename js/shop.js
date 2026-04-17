/* ═══════════════════════════════════════════════
   CHOICE TACTICAL — Shop & Cart
   ═══════════════════════════════════════════════ */

(function () {
  'use strict';

  var CART_KEY = 'ct_cart';
  var PRODUCTS_URL = '/shop/products.json';

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

  function addToCart(item) {
    // item = { slug, stripePriceId, qty }
    var cart = readCart();
    var existing = null;
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].stripePriceId === item.stripePriceId) {
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
        qty: Math.min(99, Math.max(1, item.qty))
      });
    }
    writeCart(cart);
  }

  function updateCartLineQty(stripePriceId, qty) {
    var cart = readCart();
    var out = [];
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].stripePriceId === stripePriceId) {
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

  function removeCartLine(stripePriceId) {
    var cart = readCart().filter(function (i) {
      return i.stripePriceId !== stripePriceId;
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
    }
    return null;
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
      var soldOut = !p.inStock
        ? '<span class="product-card-sold-out">Sold Out</span>' : '';
      return '' +
        '<a class="product-card" href="/shop/' + escapeHtml(p.slug) + '/">' +
          '<img class="product-card-image" src="' + escapeHtml(img) + '" alt="' + escapeHtml(p.name) + '">' +
          '<div class="product-card-body">' +
            '<h3 class="product-card-name">' + escapeHtml(p.name) + '</h3>' +
            '<p class="product-card-tagline">' + escapeHtml(p.tagline) + '</p>' +
            '<p class="product-card-price">' + formatUSD(p.priceUsd) + '</p>' +
            soldOut +
          '</div>' +
        '</a>';
    }).join('');
  }

  // ── Detail rendering ───────────────────────────
  function renderProductDetail(container, product) {
    var img = (product.images && product.images[0]) || '/shop/images/placeholder-1.svg';
    var addBtn = product.inStock
      ? '<button type="button" class="add-to-cart-btn" id="addToCartBtn" ' +
        'data-price-id="' + escapeHtml(product.stripePriceId) + '" ' +
        'data-slug="' + escapeHtml(product.slug) + '">Add to Cart</button>'
      : '<span class="product-card-sold-out">Sold Out</span>';
    container.innerHTML = '' +
      '<div>' +
        '<img class="product-detail-image" src="' + escapeHtml(img) + '" alt="' + escapeHtml(product.name) + '">' +
      '</div>' +
      '<div>' +
        '<h1 class="product-detail-name">' + escapeHtml(product.name) + '</h1>' +
        '<p class="product-detail-tagline">' + escapeHtml(product.tagline) + '</p>' +
        '<p class="product-detail-price">' + formatUSD(product.priceUsd) + '</p>' +
        '<p class="product-detail-description">' + escapeHtml(product.description) + '</p>' +
        (product.inStock ? '<div class="qty-row">' +
          '<label class="qty-label" for="qtyInput">Quantity</label>' +
          '<input class="qty-input" id="qtyInput" type="number" min="1" max="10" value="1">' +
        '</div>' : '') +
        addBtn +
      '</div>';
    document.title = product.name + ' — Precision Gear — Choice Tactical';

    var btn = document.getElementById('addToCartBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        var qtyInput = document.getElementById('qtyInput');
        var qty = Math.max(1, Math.min(10, parseInt(qtyInput && qtyInput.value, 10) || 1));
        addToCart({
          slug: product.slug,
          stripePriceId: product.stripePriceId,
          qty: qty
        });
        showToast('Added to cart');
      });
    }
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

  function initPage() {
    // Nav loads asynchronously; delay badge refresh.
    setTimeout(updateCartBadge, 300);
    initShopGrid();
    initProductDetail();
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
