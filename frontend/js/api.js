/**
 * api.js  —  Shared fetch helper for all frontend modules.
 *
 * Responsibilities:
 *   - Sets base URL so every module just calls apiFetch('/menu')
 *   - Injects Authorization header automatically from localStorage token
 *   - Throws structured errors so callers can catch them consistently
 *
 * Loaded BEFORE any feature-specific JS in every HTML page.
 */

const BASE_URL = 'http://127.0.0.1:5000/api';

/**
 * Core fetch wrapper.
 *
 * @param {string} endpoint  - e.g. '/menu', '/cart', '/order'
 * @param {object} options   - standard fetch options (method, body, etc.)
 * @returns {Promise<any>}   - parsed JSON response
 * @throws {{ status, message }} on non-2xx responses
 */
async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('saofa_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Redirect to login for protected routes
  if (response.status === 401) {
    const onProtectedPage = ['/history.html', '/status.html'].some(
      (p) => window.location.pathname.includes(p)
    );
    if (onProtectedPage) {
      window.location.href = 'login.html';
      return;
    }
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Server error' }));
    throw { status: response.status, message: err.message || 'Request failed' };
  }

  // 204 No Content — return null instead of crashing on .json()
  if (response.status === 204) return null;

  return response.json();
}

/**
 * Cart badge updater — called after any cart mutation to keep the
 * navbar badge count current. Fetches GET /cart and updates DOM.
 */
async function refreshCartBadge() {
  try {
    const data = await apiFetch('/cart');
    const totalQty = (data.items || []).reduce((sum, i) => sum + i.quantity, 0);
    const badge = document.getElementById('cart-badge');
    if (badge) badge.textContent = totalQty;
  } catch (_) {
    // Silent fail — badge stays at previous value
  }
}

/**
 * Show a toast notification (shared DOM element in shared.css).
 * @param {string} message
 * @param {number} durationMs
 */
function showToast(message, durationMs = 2400) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), durationMs);
}

// Initialise cart badge on every page load
document.addEventListener('DOMContentLoaded', refreshCartBadge);