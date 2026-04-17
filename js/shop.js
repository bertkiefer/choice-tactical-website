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
    initShopGrid();
    initProductDetail();
  }

  // Expose for later tasks
  window.ShopApp = {
    init: function () { initShopGrid(); },
    loadProducts: loadProducts,
    findProductBySlug: findProductBySlug,
    findProductByStripePriceId: findProductByStripePriceId,
    formatUSD: formatUSD,
    escapeHtml: escapeHtml,
    getQueryParam: getQueryParam
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }
})();
