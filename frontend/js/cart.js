/**
 * frontend/js/cart.js
 * SOFA Coffee Shop — Cart Module
 * ES Module, async/await, event delegation, debouncing
 */

"use strict";

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────
const API_BASE   = "/api/cart";
const MIN_QTY    = 1;
const MAX_QTY    = 20;
const TOAST_TTL  = 3500;   // ms a toast lives
const DEBOUNCE_MS = 400;   // qty update debounce

// ─────────────────────────────────────────
// DOM refs (resolved once on DOMContentLoaded)
// ─────────────────────────────────────────
let elItemsList, elEmptyState, elSkeletonList, elCartActions,
    elClearBtn, elCountLabel, elCartBadge, elCheckoutBtn,
    elSubtotal, elTax, elTotal, elToastContainer;

// ─────────────────────────────────────────
// State
// ─────────────────────────────────────────
let cartState  = { items: [], subtotal: 0 };
let debounceMap = {};           // { item_id: timerId }

// ═══════════════════════════════════════════════════════
// API helpers
// ═══════════════════════════════════════════════════════

/**
 * Centralised fetch wrapper — always returns parsed JSON or throws.
 */
async function cartApiFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    credentials: "include",
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    throw Object.assign(
      new Error(data.error || "Request failed."),
      { status: response.status, data }
    );
  }
  return data;
}

// ═══════════════════════════════════════════════════════
// Core cart operations
// ═══════════════════════════════════════════════════════

/**
 * F-CRT-01: Fetch cart from server (persists in session).
 */
async function fetchCart() {
  showSkeleton(true);
  try {
    const data = await cartApiFetch(API_BASE + "/");
    cartState = data;
    renderCart(cartState);
  } catch (err) {
    showToast("Could not load cart. Please refresh.", "error");
    console.error("[SOFA] fetchCart error:", err);
  } finally {
    showSkeleton(false);
  }
}

/**
 * PATCH /api/cart/:item_id  — set explicit quantity.
 * F-CRT-03, F-CRT-05, EC-04
 */
async function updateQuantity(itemId, newQty) {
  // Frontend validation mirrors backend
  if (!validateQtyClient(newQty)) return;

  try {
    const data = await cartApiFetch(`${API_BASE}/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity: newQty }),
    });

    // Patch local state (avoid full re-render flicker)
    const item = cartState.items.find(i => i.item_id === itemId);
    if (item) {
      item.quantity  = newQty;
      item.line_total = parseFloat((item.price * newQty).toFixed(2));
    }
    cartState.subtotal = data.subtotal;

    updateLineTotalUI(itemId, item?.line_total ?? 0);
    updateSummaryUI(data.subtotal);
    updateBadge();
    animateQtyDisplay(itemId);
  } catch (err) {
    handleApiError(err);
    // Revert UI on error
    renderCart(cartState);
  }
}

/**
 * DELETE /api/cart/:item_id
 * F-CRT-03
 */
async function removeItem(itemId) {
  const itemEl = document.querySelector(`[data-item-id="${itemId}"]`);
  if (itemEl) itemEl.classList.add("cart-item--removing");

  // Wait for remove animation
  await delay(350);

  try {
    const data = await cartApiFetch(`${API_BASE}/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
    });

    cartState.items     = cartState.items.filter(i => i.item_id !== itemId);
    cartState.subtotal  = data.subtotal;

    renderCart(cartState);
    showToast("Item removed from cart.", "info");
  } catch (err) {
    handleApiError(err);
    renderCart(cartState);   // revert animation
  }
}

/**
 * DELETE /api/cart  — clear entire cart.
 */
async function clearCart() {
  if (!confirm("Remove all items from your cart?")) return;
  try {
    const data = await cartApiFetch(API_BASE + "/", { method: "DELETE" });
    cartState = { items: [], subtotal: 0 };
    renderCart(cartState);
    showToast("Cart cleared.", "info");
  } catch (err) {
    handleApiError(err);
  }
}

// ═══════════════════════════════════════════════════════
// Rendering
// ═══════════════════════════════════════════════════════

/**
 * Master render — decides which UI state to show.
 */
function renderCart(cart) {
  const hasItems = cart.items && cart.items.length > 0;

  toggleEl(elEmptyState,   !hasItems);
  toggleEl(elItemsList,     hasItems);
  toggleEl(elCartActions,   hasItems);

  if (hasItems) {
    elItemsList.innerHTML = "";
    cart.items.forEach(item => {
      elItemsList.appendChild(buildCartItemEl(item));
    });
  }

  updateSummaryUI(cart.subtotal);
  updateCountLabel(cart.items.length);
  updateBadge(cart.items.reduce((sum, i) => sum + i.quantity, 0));

  elCheckoutBtn.disabled = !hasItems;
}

/**
 * Render empty state.
 */
function renderEmptyState() {
  toggleEl(elEmptyState,  true);
  toggleEl(elItemsList,   false);
  toggleEl(elCartActions, false);
  updateSummaryUI(0);
  updateCountLabel(0);
  updateBadge(0);
  elCheckoutBtn.disabled = true;
}

/**
 * Build a single cart item <li> element.
 */
function buildCartItemEl(item) {
  const li = document.createElement("li");
  li.className  = "cart-item";
  li.dataset.itemId = item.item_id;

  const decDisabled = item.quantity <= MIN_QTY ? "disabled" : "";
  const incDisabled = item.quantity >= MAX_QTY ? "disabled" : "";

  li.innerHTML = `
    <div class="cart-item__info">
      <p class="cart-item__category">${escHtml(item.category || "")}</p>
      <h3 class="cart-item__name">${escHtml(item.name)}</h3>
      <p class="cart-item__price-per">EGP ${fmt(item.price)} each</p>
    </div>
    <div class="cart-item__controls">
      <p class="cart-item__line-total" data-line-total="${item.item_id}">
        EGP ${fmt(item.line_total)}
      </p>
      <div class="qty-stepper" role="group" aria-label="Quantity for ${escHtml(item.name)}">
        <button
          class="qty-btn qty-btn--dec"
          aria-label="Decrease quantity"
          data-action="decrease"
          data-item-id="${item.item_id}"
          ${decDisabled}
        >−</button>
        <span
          class="qty-display"
          id="qty-${item.item_id}"
          aria-live="polite"
          aria-atomic="true"
        >${item.quantity}</span>
        <button
          class="qty-btn qty-btn--inc"
          aria-label="Increase quantity"
          data-action="increase"
          data-item-id="${item.item_id}"
          ${incDisabled}
        >+</button>
      </div>
      <button
        class="cart-item__remove"
        aria-label="Remove ${escHtml(item.name)} from cart"
        data-action="remove"
        data-item-id="${item.item_id}"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        </svg>
      </button>
    </div>
  `;
  return li;
}

// ═══════════════════════════════════════════════════════
// Partial DOM updates (avoid full re-render on qty change)
// ═══════════════════════════════════════════════════════

function updateLineTotalUI(itemId, lineTotal) {
  const el = document.querySelector(`[data-line-total="${itemId}"]`);
  if (el) el.textContent = `EGP ${fmt(lineTotal)}`;
}

function updateQtyDisplayUI(itemId, qty) {
  const el = document.getElementById(`qty-${itemId}`);
  if (!el) return;
  el.textContent = qty;

  // Enable / disable stepper buttons
  const li   = document.querySelector(`[data-item-id="${itemId}"]`);
  if (!li) return;
  const dec  = li.querySelector(`[data-action="decrease"]`);
  const inc  = li.querySelector(`[data-action="increase"]`);
  if (dec) dec.disabled = qty <= MIN_QTY;
  if (inc) inc.disabled = qty >= MAX_QTY;
}

function animateQtyDisplay(itemId) {
  const el = document.getElementById(`qty-${itemId}`);
  if (!el) return;
  el.classList.remove("bump");
  void el.offsetWidth;   // force reflow
  el.classList.add("bump");
}

function updateSummaryUI(subtotal) {
  const tax   = parseFloat((subtotal * 0.10).toFixed(2));
  const total = parseFloat((subtotal + tax).toFixed(2));

  setText(elSubtotal, `EGP ${fmt(subtotal)}`);
  setText(elTax,      `EGP ${fmt(tax)}`);
  setText(elTotal,    `EGP ${fmt(total)}`);

  // Pulse animation
  [elSubtotal, elTotal].forEach(el => {
    el.classList.remove("subtotal-updated");
    void el.offsetWidth;
    el.classList.add("subtotal-updated");
  });
}

function updateCountLabel(count) {
  elCountLabel.textContent =
    count === 0 ? "Your cart is empty."
    : count === 1 ? "1 item in your order"
    : `${count} items in your order`;
}

function updateBadge(totalQty) {
  if (totalQty === undefined) {
    totalQty = cartState.items.reduce((s, i) => s + i.quantity, 0);
  }
  elCartBadge.textContent = totalQty > 99 ? "99+" : totalQty;
  elCartBadge.classList.toggle("visible", totalQty > 0);
}

// ═══════════════════════════════════════════════════════
// Event handling — single delegated listener
// ═══════════════════════════════════════════════════════

function attachListeners() {
  // Cart item actions (event delegation on the list)
  elItemsList.addEventListener("click", handleItemAction);

  // Clear cart
  elClearBtn.addEventListener("click", clearCart);

  // Checkout (placeholder — integrate with checkout module)
  elCheckoutBtn.addEventListener("click", () => {
    window.location.href = "checkout.html";
  });
}

/**
 * Handles increase / decrease / remove via data-action.
 */
function handleItemAction(e) {
  const btn    = e.target.closest("[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const itemId = btn.dataset.itemId;
  if (!itemId) return;

  const item = cartState.items.find(i => i.item_id === itemId);
  if (!item && action !== "remove") return;

  switch (action) {
    case "increase": {
      const newQty = (item?.quantity ?? 0) + 1;
      if (newQty > MAX_QTY) {
        showToast(`Maximum quantity is ${MAX_QTY}.`, "warning");
        return;
      }
      // Optimistic UI update
      item.quantity  = newQty;
      item.line_total = parseFloat((item.price * newQty).toFixed(2));
      updateQtyDisplayUI(itemId, newQty);
      updateLineTotalUI(itemId, item.line_total);
      debouncedUpdate(itemId, newQty);
      break;
    }
    case "decrease": {
      const newQty = (item?.quantity ?? 1) - 1;
      if (newQty < MIN_QTY) return;
      // Optimistic UI update
      item.quantity  = newQty;
      item.line_total = parseFloat((item.price * newQty).toFixed(2));
      updateQtyDisplayUI(itemId, newQty);
      updateLineTotalUI(itemId, item.line_total);
      debouncedUpdate(itemId, newQty);
      break;
    }
    case "remove":
      removeItem(itemId);
      break;
  }
}

// ═══════════════════════════════════════════════════════
// Debounce helper for quantity updates
// ═══════════════════════════════════════════════════════

/**
 * Debounce quantity PATCH calls so rapid +/- clicks send a single request.
 */
function debouncedUpdate(itemId, qty) {
  clearTimeout(debounceMap[itemId]);
  debounceMap[itemId] = setTimeout(() => {
    updateQuantity(itemId, qty);
  }, DEBOUNCE_MS);
}

// ═══════════════════════════════════════════════════════
// Toast notifications
// ═══════════════════════════════════════════════════════

const TOAST_ICONS = {
  success: "✓",
  error:   "✕",
  info:    "ℹ",
  warning: "⚠",
};

/**
 * Show a non-blocking toast notification.
 * @param {string} message
 * @param {"success"|"error"|"info"|"warning"} type
 */
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.setAttribute("role", "alert");
  toast.innerHTML = `
    <span class="toast__icon" aria-hidden="true">${TOAST_ICONS[type] ?? "ℹ"}</span>
    <span>${escHtml(message)}</span>
  `;

  elToastContainer.appendChild(toast);

  // Auto-dismiss
  setTimeout(() => {
    toast.classList.add("toast--exit");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }, TOAST_TTL);
}

// ═══════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════

function validateQtyClient(qty) {
  if (!Number.isInteger(qty) || qty < MIN_QTY || qty > MAX_QTY) {
    showToast(`Quantity must be between ${MIN_QTY} and ${MAX_QTY}.`, "error");
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════
// Utility helpers
// ═══════════════════════════════════════════════════════

/** Format a number to 2 decimal places. */
function fmt(n) {
  return parseFloat(n).toFixed(2);
}

/** Escape HTML to prevent XSS. */
function escHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str ?? "");
  return div.innerHTML;
}

/** Toggle element visibility using the `hidden` attribute. */
function toggleEl(el, show) {
  if (show) {
    el.removeAttribute("hidden");
  } else {
    el.setAttribute("hidden", "");
  }
}

/** Set text content safely. */
function setText(el, text) {
  if (el) el.textContent = text;
}

/** Promise-based delay. */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Show / hide loading skeletons. */
function showSkeleton(visible) {
  elSkeletonList.style.display = visible ? "block" : "none";
}

/** Handle API errors gracefully. */
function handleApiError(err) {
  const msg = err?.data?.error || err?.message || "Something went wrong.";
  showToast(msg, "error");
  console.error("[SOFA] API error:", err);
}

// ═══════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════

function init() {
  // Resolve all DOM refs once
  elItemsList       = document.getElementById("cart-items-list");
  elEmptyState      = document.getElementById("empty-state");
  elSkeletonList    = document.getElementById("skeleton-list");
  elCartActions     = document.getElementById("cart-actions");
  elClearBtn        = document.getElementById("clear-cart-btn");
  elCountLabel      = document.getElementById("cart-count-label");
  elCartBadge       = document.getElementById("cart-badge");
  elCheckoutBtn     = document.getElementById("checkout-btn");
  elSubtotal        = document.getElementById("summary-subtotal");
  elTax             = document.getElementById("summary-tax");
  elTotal           = document.getElementById("summary-total");
  elToastContainer  = document.getElementById("toast-container");

  attachListeners();
  fetchCart();
}

document.addEventListener("DOMContentLoaded", init);
