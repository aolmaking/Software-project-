/**
 * tests/e2e/playwright/pages/CartPage.js
 * Page Object Model — SOFA Cart Page
 */

class CartPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;

    // ── Locators ──────────────────────────────────────────
    this.itemsList    = page.locator("#cart-items-list");
    this.emptyState   = page.locator("#empty-state");
    this.skeletonList = page.locator("#skeleton-list");
    this.clearBtn     = page.locator("#clear-cart-btn");
    this.checkoutBtn  = page.locator("#checkout-btn");
    this.subtotalEl   = page.locator("#summary-subtotal");
    this.taxEl        = page.locator("#summary-tax");
    this.totalEl      = page.locator("#summary-total");
    this.countLabel   = page.locator("#cart-count-label");
    this.cartBadge    = page.locator("#cart-badge");
    this.toastContainer = page.locator("#toast-container");
  }

  // ════════════════════════════════════════════════════════
  // Navigation
  // ════════════════════════════════════════════════════════

  /**
   * Navigate to the cart page and wait for it to load.
   */
  async open() {
    await this.page.goto("/cart.html");
    // Wait for skeleton to disappear (fetch complete)
    await this.page.waitForFunction(() => {
      const skeleton = document.getElementById("skeleton-list");
      return skeleton && skeleton.style.display === "none";
    }, { timeout: 10_000 });
  }

  // ════════════════════════════════════════════════════════
  // API helpers (seed cart state via API directly)
  // ════════════════════════════════════════════════════════

  /**
   * Add an item via the API (bypasses UI for speed).
   * @param {string} itemId
   * @param {number} quantity
   */
  async addItem(itemId, quantity = 1) {
    const response = await this.page.request.post("/api/cart/", {
      data: { item_id: itemId, quantity },
    });
    return response;
  }

  /**
   * Clear the cart via API.
   */
  async clearViaApi() {
    await this.page.request.delete("/api/cart/");
  }

  // ════════════════════════════════════════════════════════
  // UI interactions
  // ════════════════════════════════════════════════════════

  /**
   * Click the increase (+) button for a cart item.
   * @param {string} itemId
   */
  async increaseQty(itemId) {
    await this.page
      .locator(`[data-item-id="${itemId}"] [data-action="increase"]`)
      .click();
    await this._waitForQtySettled();
  }

  /**
   * Click the decrease (−) button for a cart item.
   * @param {string} itemId
   */
  async decreaseQty(itemId) {
    await this.page
      .locator(`[data-item-id="${itemId}"] [data-action="decrease"]`)
      .click();
    await this._waitForQtySettled();
  }

  /**
   * Click the remove (🗑) button for a cart item.
   * @param {string} itemId
   */
  async removeItem(itemId) {
    await this.page
      .locator(`[data-item-id="${itemId}"] [data-action="remove"]`)
      .click();
    // Wait for remove animation + re-render
    await this.page.waitForTimeout(500);
  }

  /**
   * Click the "Clear Cart" button and confirm the dialog.
   */
  async clearCart() {
    this.page.on("dialog", dialog => dialog.accept());
    await this.clearBtn.click();
    await this.page.waitForTimeout(300);
  }

  // ════════════════════════════════════════════════════════
  // Assertions / getters
  // ════════════════════════════════════════════════════════

  /**
   * Get the displayed subtotal text, e.g. "EGP 12.00"
   */
  async getSubtotal() {
    return this.subtotalEl.textContent();
  }

  /**
   * Get the displayed total text.
   */
  async getTotal() {
    return this.totalEl.textContent();
  }

  /**
   * Get the quantity shown for a specific item.
   * @param {string} itemId
   * @returns {Promise<number>}
   */
  async getQtyFor(itemId) {
    const text = await this.page.locator(`#qty-${itemId}`).textContent();
    return parseInt(text.trim(), 10);
  }

  /**
   * Returns true if the empty state element is visible.
   */
  async isEmptyStateVisible() {
    return this.emptyState.isVisible();
  }

  /**
   * Returns true if a cart item row for the given itemId is present.
   * @param {string} itemId
   */
  async hasItem(itemId) {
    return this.page.locator(`[data-item-id="${itemId}"]`).isVisible();
  }

  /**
   * Returns the number of item rows in the cart list.
   */
  async itemCount() {
    return this.page.locator(".cart-item").count();
  }

  /**
   * Wait for a toast message containing the given text.
   * @param {string} text
   */
  async waitForToast(text) {
    await this.page.locator(".toast").filter({ hasText: text }).waitFor({
      state: "visible",
      timeout: 5000,
    });
  }

  /**
   * Get the cart badge count.
   * @returns {Promise<number>}
   */
  async getBadgeCount() {
    const text = await this.cartBadge.textContent();
    return parseInt(text.trim(), 10) || 0;
  }

  // ════════════════════════════════════════════════════════
  // Private helpers
  // ════════════════════════════════════════════════════════

  /** Wait for debounce + network round-trip to settle. */
  async _waitForQtySettled() {
    // Debounce is 400ms — wait 600ms to be safe
    await this.page.waitForTimeout(600);
  }
}

module.exports = { CartPage };