/**
 * menu.js  —  Menu page controller (Member 1's slice)
 *
 * Responsibilities:
 *  - Fetch menu items from GET /api/menu
 *  - Render items grouped by category
 *  - Client-side filter by category pill (F-MNU-03 — no page reload)
 *  - Client-side search filter
 *  - Display allergen tags (F-MNU-02 / EC-07)
 *  - Disable "Add" button for unavailable items (F-MNU-04)
 *  - Add item to cart via POST /api/cart (F-CRT-02)
 *  - Update cart badge after each addition
 *
 * Depends on:  api.js  (must load first)
 */

// ── State ──────────────────────────────────────────────────
let ALL_ITEMS = [];          // full list fetched once from server
let activeCategory = '';     // '' = all
let activeSearch = '';

// ── Category display labels & icons ───────────────────────
const CATEGORY_META = {
  coffee:   { label: 'Coffee',      icon: '☕' },
  pastry:   { label: 'Pastries',    icon: '🥐' },
  cold:     { label: 'Cold drinks', icon: '🧊' },
  seasonal: { label: 'Seasonal',    icon: '🌸' },
};

// ── Boot ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindFilterButtons();
  bindSearchInput();
  loadMenu();
});

// ── 1. Fetch menu from Flask API ───────────────────────────
async function loadMenu() {
  try {
    // GET /api/menu  →  [{ id, name, description, price, category, available, allergens }]
    const data = await apiFetch('/menu');
    ALL_ITEMS = data.items || [];
    renderMenu();
  } catch (err) {
    showErrorState(err.message || 'Failed to load menu. Please try again.');
  } finally {
    // Hide the loading spinner
    const loader = document.getElementById('loading-state');
    if (loader) loader.classList.add('hidden');
  }
}

// ── 2. Filter pills ────────────────────────────────────────
function bindFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      // Update active state
      document.querySelectorAll('.filter-btn').forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');

      activeCategory = btn.dataset.cat || '';
      renderMenu();
    });
  });
}

// ── 3. Search input ────────────────────────────────────────
function bindSearchInput() {
  const input = document.getElementById('menu-search');
  if (!input) return;
  input.addEventListener('input', () => {
    activeSearch = input.value.trim().toLowerCase();
    renderMenu();
  });
}

// ── 4. Render filtered items grouped by category ───────────
function renderMenu() {
  const root = document.getElementById('menu-root');

  // Apply filters
  const filtered = ALL_ITEMS.filter((item) => {
    const catMatch = !activeCategory || item.category === activeCategory;
    const q = activeSearch;
    const searchMatch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q);
    return catMatch && searchMatch;
  });

  if (filtered.length === 0) {
    root.innerHTML = `
      <div class="empty-state">
        <p>No items found. <a href="index.html">Clear filters</a></p>
      </div>`;
    return;
  }

  // Group by category, preserving a consistent display order
  const order = ['coffee', 'pastry', 'cold', 'seasonal'];
  const groups = order
    .map((cat) => ({
      cat,
      items: filtered.filter((i) => i.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  root.innerHTML = groups
    .map(({ cat, items }) => renderSection(cat, items))
    .join('');

  // Bind Add-to-Cart buttons after DOM update
  root.querySelectorAll('.add-btn[data-item-id]').forEach((btn) => {
    btn.addEventListener('click', () => handleAddToCart(btn));
  });
}

// ── 5. Render one category section ────────────────────────
function renderSection(cat, items) {
  const meta = CATEGORY_META[cat] || { label: cat, icon: '' };
  return `
    <section aria-label="${meta.label}">
      <p class="section-title">${meta.label}</p>
      <div class="menu-grid">
        ${items.map(renderCard).join('')}
      </div>
    </section>`;
}

// ── 6. Render one menu card ────────────────────────────────
function renderCard(item) {
  const meta = CATEGORY_META[item.category] || { icon: '' };
  const unavailable = !item.available;

  // Allergen tags  (EC-07 — legal requirement)
  const allergenHtml =
    item.allergens && item.allergens.length
      ? `<div class="allergen-bar" aria-label="Allergens: ${item.allergens.join(', ')}">
           ${item.allergens.map((a) => `<span class="allergen-tag">${a}</span>`).join('')}
         </div>`
      : '';

  // Sold-out ribbon  (F-MNU-04)
  const soldOutHtml = unavailable
    ? `<span class="sold-out-badge" aria-label="Sold out">Sold out</span>`
    : '';

  return `
    <article class="menu-card${unavailable ? ' sold-out' : ''}">
      <div class="card-img" role="img" aria-label="${item.name} image placeholder">
        <span class="card-img-icon" aria-hidden="true">${meta.icon}</span>
        ${soldOutHtml}
        ${allergenHtml}
      </div>
      <div class="card-body">
        <p class="card-name">${escapeHtml(item.name)}</p>
        <p class="card-desc">${escapeHtml(item.description)}</p>
        <div class="card-footer">
          <span class="price">
            ${Number(item.price).toFixed(2)}
            <span class="price-currency">EGP</span>
          </span>
          <button
            class="add-btn"
            data-item-id="${item.id}"
            data-item-name="${escapeHtml(item.name)}"
            ${unavailable ? 'disabled aria-disabled="true"' : ''}
            aria-label="Add ${escapeHtml(item.name)} to cart"
          >Add</button>
        </div>
      </div>
    </article>`;
}

// ── 7. Add to cart ─────────────────────────────────────────
async function handleAddToCart(btn) {
  const itemId = btn.dataset.itemId;
  const itemName = btn.dataset.itemName;

  // Prevent double-click during request
  btn.disabled = true;
  btn.textContent = '…';

  try {
    // POST /api/cart  →  body: { item_id, quantity: 1 }
    // F-CRT-02: server increments qty if already in cart
    await apiFetch('/cart', {
      method: 'POST',
      body: JSON.stringify({ item_id: itemId, quantity: 1 }),
    });

    showToast(`${itemName} added to cart`);
    refreshCartBadge();   // update navbar badge
  } catch (err) {
    // F-CRT-06: 409 means item became unavailable after page load
    if (err.status === 409) {
      showToast(`${itemName} is no longer available.`);
      // Visually mark as sold out without a full page reload
      btn.closest('.menu-card').classList.add('sold-out');
    } else {
      showToast('Could not add item. Please try again.');
    }
  } finally {
    // Re-enable only if item is still available
    const card = btn.closest('.menu-card');
    if (!card.classList.contains('sold-out')) {
      btn.disabled = false;
      btn.textContent = 'Add';
    }
  }
}

// ── 8. Error state ─────────────────────────────────────────
function showErrorState(message) {
  const root = document.getElementById('menu-root');
  root.innerHTML = `
    <div class="empty-state">
      <p>${escapeHtml(message)}</p>
      <p><a href="index.html">Retry</a></p>
    </div>`;
}

// ── 9. XSS helper ──────────────────────────────────────────
// Sanitise any string before inserting into innerHTML
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}