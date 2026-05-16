/**
 * tests/e2e/playwright/specs/cart.spec.js
 * E2E tests — SOFA Cart Page
 *
 * Run: npx playwright test tests/e2e/playwright/specs/cart.spec.js
 *
 * Prerequisites:
 *   - Flask dev server running at http://localhost:5000
 *   - Seeded DB with items:
 *       item-001  Caramel Latte   4.50  available=1
 *       item-002  Croissant       3.00  available=1
 *       item-003  Sold-Out Muffin 2.50  available=0
 */

const { test, expect }  = require("@playwright/test");
const { CartPage }      = require("../pages/CartPage");

// ─────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────
test.beforeEach(async ({ page }) => {
  const cart = new CartPage(page);
  // Reset cart state before every test
  await page.request.delete("http://localhost:5000/api/cart/");
});

// ═══════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════

test.describe("Cart — Empty state", () => {
  test("shows empty state when cart has no items", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.open();

    await expect(cart.emptyState).toBeVisible();
    await expect(cart.itemsList).toBeHidden();
    await expect(cart.checkoutBtn).toBeDisabled();
  });

  test("empty state has a link to the menu", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.open();

    const cta = cart.emptyState.locator(".empty-state__cta");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /menu/i);
  });
});

test.describe("Cart — Add item", () => {
  test("renders added item after API call and page load", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 1);
    await cart.open();

    await expect(cart.itemsList).toBeVisible();
    await expect(page.locator('[data-item-id="item-001"]')).toBeVisible();
  });

  test("displays correct item name, price and quantity", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 2);
    await cart.open();

    const row = page.locator('[data-item-id="item-001"]');
    await expect(row).toContainText("Caramel Latte");
    await expect(row).toContainText("4.50");

    const qty = await cart.getQtyFor("item-001");
    expect(qty).toBe(2);
  });

  test("shows correct subtotal for one item", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 2);   // 4.50 × 2 = 9.00
    await cart.open();

    const subtotal = await cart.getSubtotal();
    expect(subtotal).toContain("9.00");
  });
});

test.describe("Cart — Duplicate increment (F-CRT-02)", () => {
  test("adding same item twice merges into one row with summed qty", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 1);
    await cart.addItem("item-001", 2);   // should be qty=3 now
    await cart.open();

    expect(await cart.itemCount()).toBe(1);
    expect(await cart.getQtyFor("item-001")).toBe(3);
  });
});

test.describe("Cart — Increase / Decrease quantity (F-CRT-03)", () => {
  test("increase button increments quantity", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 1);
    await cart.open();

    await cart.increaseQty("item-001");
    expect(await cart.getQtyFor("item-001")).toBe(2);
  });

  test("decrease button decrements quantity", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 3);
    await cart.open();

    await cart.decreaseQty("item-001");
    expect(await cart.getQtyFor("item-001")).toBe(2);
  });

  test("decrease button is disabled at quantity 1", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 1);
    await cart.open();

    const decBtn = page.locator('[data-item-id="item-001"] [data-action="decrease"]');
    await expect(decBtn).toBeDisabled();
  });

  test("increase button is disabled at quantity 20", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 20);
    await cart.open();

    const incBtn = page.locator('[data-item-id="item-001"] [data-action="increase"]');
    await expect(incBtn).toBeDisabled();
  });

  test("subtotal updates when quantity changes (F-CRT-04)", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 1);   // 4.50
    await cart.open();

    let subtotal = await cart.getSubtotal();
    expect(subtotal).toContain("4.50");

    await cart.increaseQty("item-001");   // 4.50 × 2 = 9.00

    subtotal = await cart.getSubtotal();
    expect(subtotal).toContain("9.00");
  });
});

test.describe("Cart — Remove item (F-CRT-03)", () => {
  test("removes item row from cart", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 1);
    await cart.addItem("item-002", 1);
    await cart.open();

    await cart.removeItem("item-001");

    await expect(page.locator('[data-item-id="item-001"]')).toBeHidden();
    expect(await cart.itemCount()).toBe(1);
  });

  test("shows empty state after last item removed", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 1);
    await cart.open();

    await cart.removeItem("item-001");

    await expect(cart.emptyState).toBeVisible();
    await expect(cart.checkoutBtn).toBeDisabled();
  });

  test("subtotal updates after removal", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 1);   // 4.50
    await cart.addItem("item-002", 1);   // 3.00 — total 7.50
    await cart.open();

    await cart.removeItem("item-002");

    const subtotal = await cart.getSubtotal();
    expect(subtotal).toContain("4.50");
  });
});

test.describe("Cart — Clear cart", () => {
  test("clear button removes all items", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 2);
    await cart.addItem("item-002", 1);
    await cart.open();

    await cart.clearCart();

    await expect(cart.emptyState).toBeVisible();
    expect(await cart.itemCount()).toBe(0);
  });

  test("subtotal is 0.00 after clear", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 1);
    await cart.open();

    await cart.clearCart();

    const subtotal = await cart.getSubtotal();
    expect(subtotal).toContain("0.00");
  });
});

test.describe("Cart — Subtotal accuracy (F-CRT-04)", () => {
  test("subtotal = sum of all line totals", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 2);   // 4.50 × 2 = 9.00
    await cart.addItem("item-002", 3);   // 3.00 × 3 = 9.00 → total = 18.00
    await cart.open();

    const subtotal = await cart.getSubtotal();
    expect(subtotal).toContain("18.00");
  });

  test("line totals are rendered for each item", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 2);
    await cart.open();

    const lineTotal = page.locator(`[data-line-total="item-001"]`);
    await expect(lineTotal).toContainText("9.00");
  });
});

test.describe("Cart — Session persistence (F-CRT-01)", () => {
  test("cart survives page reload", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 2);
    await cart.open();

    // Hard reload
    await page.reload();

    // Wait for re-render
    await page.waitForFunction(() => {
      const skeleton = document.getElementById("skeleton-list");
      return skeleton && skeleton.style.display === "none";
    });

    const qty = await cart.getQtyFor("item-001");
    expect(qty).toBe(2);
  });
});

test.describe("Cart — Quantity validation (EC-04 / F-CRT-05)", () => {
  test("API rejects quantity=0 with 422", async ({ page }) => {
    const res = await page.request.post("http://localhost:5000/api/cart/", {
      data: { item_id: "item-001", quantity: 0 },
    });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("API rejects negative quantity with 422", async ({ page }) => {
    const res = await page.request.post("http://localhost:5000/api/cart/", {
      data: { item_id: "item-001", quantity: -1 },
    });
    expect(res.status()).toBe(422);
  });

  test("API rejects quantity > 20 with 422", async ({ page }) => {
    const res = await page.request.post("http://localhost:5000/api/cart/", {
      data: { item_id: "item-001", quantity: 999 },
    });
    expect(res.status()).toBe(422);
  });

  test("API rejects string quantity with 422", async ({ page }) => {
    const res = await page.request.post("http://localhost:5000/api/cart/", {
      data: { item_id: "item-001", quantity: "lots" },
    });
    expect(res.status()).toBe(422);
  });
});

test.describe("Cart — Unavailable item (F-CRT-06)", () => {
  test("API returns 409 for unavailable item", async ({ page }) => {
    const res = await page.request.post("http://localhost:5000/api/cart/", {
      data: { item_id: "item-003", quantity: 1 },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/unavailable/i);
  });
});

test.describe("Cart — Badge", () => {
  test("badge shows correct total item quantity", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 2);
    await cart.addItem("item-002", 1);
    await cart.open();

    const badgeCount = await cart.getBadgeCount();
    expect(badgeCount).toBe(3);
  });

  test("badge hides (count=0) when cart is empty", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.open();

    await expect(cart.cartBadge).not.toHaveClass(/visible/);
  });
});

test.describe("Cart — Multi-item order summary", () => {
  test("tax is 10% of subtotal", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 2);   // subtotal = 9.00, tax = 0.90
    await cart.open();

    const tax = await cart.taxEl.textContent();
    expect(tax).toContain("0.90");
  });

  test("total = subtotal + tax", async ({ page }) => {
    const cart = new CartPage(page);
    await cart.addItem("item-001", 2);   // total = 9.00 + 0.90 = 9.90
    await cart.open();

    const total = await cart.getTotal();
    expect(total).toContain("9.90");
  });
});
