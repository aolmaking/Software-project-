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

const BASE_URL = window.location.protocol.startsWith('http')
  ? `${window.location.origin}/api`
  : 'http://127.0.0.1:5000/api';

function getStoredAuthToken() {
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
}

function clearStoredAuthToken() {
  localStorage.removeItem('auth_token');
  sessionStorage.removeItem('auth_token');
}

/**
 * Core fetch wrapper.
 *
 * @param {string} endpoint  - e.g. '/menu', '/cart', '/order'
 * @param {object} options   - standard fetch options (method, body, etc.)
 * @returns {Promise<any>}   - parsed JSON response
 * @throws {{ status, message }} on non-2xx responses
 */
async function apiFetch(endpoint, options = {}) {
  const token = getStoredAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401) {
    const onProtectedPage = ['/checkout.html', '/track.html', '/history.html', '/cart.html'].some(
      (p) => window.location.pathname.includes(p)
    );
    if (onProtectedPage) {
      window.location.href = 'login.html';
      return;
    }
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Server error' }));
    throw {
      status: response.status,
      message: err.message || err.error || 'Request failed',
      code: err.code || '',
    };
  }

  // 204 No Content — return null instead of crashing on .json()
  if (response.status === 204) return null;

  return response.json();
}

async function refreshNavbarAuth() {
  const slot = document.getElementById('nav-auth-slot');
  if (!slot) return;

  const token = getStoredAuthToken();
  if (!token) {
    slot.innerHTML = `
      <a href="login.html" class="nav-btn">Login</a>
      <a href="register.html" class="nav-btn">Register</a>
    `;
    return;
  }

  try {
    const me = await apiFetch('/auth/me');
    slot.innerHTML = `
      <span class="nav-username">${escapeSharedHtml(me.full_name || me.username || 'Account')}</span>
      <button type="button" class="nav-btn" id="nav-logout-btn">Logout</button>
    `;
    document.getElementById('nav-logout-btn')?.addEventListener('click', logoutUser);
  } catch (_) {
    clearStoredAuthToken();
    slot.innerHTML = `
      <a href="login.html" class="nav-btn">Login</a>
      <a href="register.html" class="nav-btn">Register</a>
    `;
  }
}

async function logoutUser() {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch (_) {
    // Token cleanup is client-owned, so logout can still complete offline.
  }
  clearStoredAuthToken();
  window.location.href = 'login.html';
}

function escapeSharedHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
document.addEventListener('DOMContentLoaded', () => {
  refreshCartBadge();
  refreshNavbarAuth();
  
  // Signal server that a page is open (cancels any pending shutdown from navigation)
  fetch(`${BASE_URL}/connect`, { method: 'POST', keepalive: true }).catch(() => {});
});

// Signal server when page closes (starts a brief shutdown timer)
window.addEventListener('pagehide', () => {
  if (navigator.sendBeacon) {
    navigator.sendBeacon(`${BASE_URL}/disconnect`);
  } else {
    fetch(`${BASE_URL}/disconnect`, { method: 'POST', keepalive: true }).catch(() => {});
  }
});
