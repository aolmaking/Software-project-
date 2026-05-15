let allItems = [];
let activeCategory = '';
let activeSearch = '';

document.addEventListener('DOMContentLoaded', () => {
  bindSearchInput();
  bindMenuActions();
  loadMenu();
});

async function loadMenu() {
  try {
    const data = await apiFetch('/menu');
    allItems = normalizeItems(data.items || []);
    renderCategoryFilters();
    renderMenu();
  } catch (err) {
    showErrorState(err.message || 'Failed to load menu. Please try again.');
  } finally {
    document.getElementById('loading-state')?.classList.add('hidden');
  }
}

function normalizeItems(items) {
  return items.map((item) => ({
    id: String(item.id || ''),
    name: String(item.name || ''),
    description: String(item.description || ''),
    price: Number(item.price || 0),
    category: String(item.category || 'uncategorized'),
    available: Boolean(item.available),
    allergens: Array.isArray(item.allergens) ? item.allergens.map(String) : [],
    imageUrl: String(item.image_url || ''),
  }));
}

function renderCategoryFilters() {
  const container = document.querySelector('.filter-pills');
  if (!container) return;

  const categories = [...new Set(allItems.map((item) => item.category))]
    .sort((a, b) => displayCategory(a).localeCompare(displayCategory(b)));

  container.innerHTML = [
    filterButtonTemplate('', 'All'),
    ...categories.map((category) => filterButtonTemplate(category, displayCategory(category))),
  ].join('');

  bindFilterButtons();
}

function filterButtonTemplate(category, label) {
  const active = category === activeCategory;
  return `
    <button
      class="filter-btn${active ? ' active' : ''}"
      type="button"
      data-cat="${escapeHtml(category)}"
      aria-pressed="${active ? 'true' : 'false'}"
    >${escapeHtml(label)}</button>`;
}

function bindFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      activeCategory = btn.dataset.cat || '';
      document.querySelectorAll('.filter-btn').forEach((button) => {
        const pressed = button.dataset.cat === activeCategory;
        button.classList.toggle('active', pressed);
        button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      });
      renderMenu();
    });
  });
}

function bindMenuActions() {
  const root = document.getElementById('menu-root');
  if (!root) return;

  root.addEventListener('click', (event) => {
    const btn = event.target.closest('.add-btn[data-item-id]');
    if (!btn) return;

    event.preventDefault();
    event.stopPropagation();

    if (!btn.disabled) {
      handleAddToCart(btn);
    }
  });
}

function bindSearchInput() {
  const input = document.getElementById('menu-search');
  if (!input) return;

  input.addEventListener('input', () => {
    activeSearch = input.value.trim().toLowerCase();
    renderMenu();
  });
}

function renderMenu() {
  const root = document.getElementById('menu-root');
  if (!root) return;

  const filtered = allItems.filter((item) => {
    const categoryMatches = !activeCategory || item.category === activeCategory;
    const queryMatches =
      !activeSearch ||
      item.name.toLowerCase().includes(activeSearch) ||
      item.description.toLowerCase().includes(activeSearch) ||
      item.allergens.some((allergen) => allergen.toLowerCase().includes(activeSearch));

    return categoryMatches && queryMatches;
  });

  if (!filtered.length) {
    root.innerHTML = '<div class="empty-state"><p>No menu items found.</p></div>';
    return;
  }

  const categories = [...new Set(filtered.map((item) => item.category))]
    .sort((a, b) => displayCategory(a).localeCompare(displayCategory(b)));

  root.innerHTML = categories
    .map((category) => renderSection(category, filtered.filter((item) => item.category === category)))
    .join('');

}

function renderSection(category, items) {
  return `
    <section aria-label="${escapeHtml(displayCategory(category))}">
      <h2 class="section-title">${escapeHtml(displayCategory(category))}</h2>
      <div class="menu-grid">
        ${items.map(renderCard).join('')}
      </div>
    </section>`;
}

function renderCard(item) {
  const unavailable = !item.available;
  const allergens = item.allergens.filter(Boolean);
  const allergenHtml = allergens.length
    ? `<div class="allergen-bar" aria-label="Allergens: ${escapeHtml(allergens.join(', '))}">
         ${allergens.map((allergen) => `<span class="allergen-tag">${escapeHtml(allergen)}</span>`).join('')}
       </div>`
    : '';
  const soldOutHtml = unavailable
    ? '<span class="sold-out-badge" aria-label="Sold out">Sold out</span>'
    : '';
  const imageHtml = item.imageUrl
    ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy" />`
    : `<span class="card-img-fallback" aria-hidden="true">${escapeHtml(displayCategory(item.category).slice(0, 1))}</span>`;

  return `
    <article class="menu-card${unavailable ? ' sold-out' : ''}">
      <div class="card-img">
        ${imageHtml}
        ${soldOutHtml}
        ${allergenHtml}
      </div>
      <div class="card-body">
        <h3 class="card-name">${escapeHtml(item.name)}</h3>
        <p class="card-desc">${escapeHtml(item.description)}</p>
        <div class="card-footer">
          <span class="price">${formatPrice(item.price)} <span class="price-currency">EGP</span></span>
          <button
            class="add-btn"
            type="button"
            data-item-id="${escapeHtml(item.id)}"
            data-item-name="${escapeHtml(item.name)}"
            ${unavailable ? 'disabled aria-disabled="true"' : ''}
            aria-label="${unavailable ? 'Sold out' : `Add ${escapeHtml(item.name)} to cart`}"
          >${unavailable ? 'Sold out' : 'Add'}</button>
        </div>
      </div>
    </article>`;
}

async function handleAddToCart(btn) {
  const itemId = btn.dataset.itemId;
  const itemName = btn.dataset.itemName || 'Item';

  btn.disabled = true;
  btn.textContent = 'Adding';

  try {
    await apiFetch('/cart', {
      method: 'POST',
      body: JSON.stringify({ item_id: itemId, quantity: 1 }),
    });
    showToast(`${itemName} added to cart`);
    refreshCartBadge();
  } catch (err) {
    if (err.status === 409) {
      markCardSoldOut(btn);
      showToast(`${itemName} is sold out.`);
    } else {
      showToast(err.message || 'Could not add item. Please try again.');
    }
  } finally {
    if (!btn.closest('.menu-card')?.classList.contains('sold-out')) {
      btn.disabled = false;
      btn.textContent = 'Add';
    }
  }
}

function markCardSoldOut(btn) {
  const card = btn.closest('.menu-card');
  card?.classList.add('sold-out');
  btn.disabled = true;
  btn.setAttribute('aria-disabled', 'true');
  btn.textContent = 'Sold out';
}

function showErrorState(message) {
  const root = document.getElementById('menu-root');
  if (!root) return;
  root.innerHTML = `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`;
}

function displayCategory(category) {
  return String(category || 'uncategorized')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatPrice(price) {
  return Number(price || 0).toLocaleString('en-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
