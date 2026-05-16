// frontend/js/order.js
// =====================================================================
// Order Placement — Member 3 (Frontend)
// Wires checkout.html to POST /api/order per contracts/order.yaml.
// Requirements: F-ORD-01 through F-ORD-06, EC-01, EC-03, EC-06.
// =====================================================================

const API_BASE = window.location.protocol.startsWith("http")
    ? window.location.origin
    : "http://localhost:5000";

// ── Contract-defined regex for customer_name (F-ORD-06, EC-03) ──
// Only Unicode letters, spaces, apostrophes, hyphens, and dots. 1–60 chars.
const NAME_REGEX = /^[\p{L}\s'\-.]{1,60}$/u;

// =====================================================================
// 1. Fetch wrapper with AbortController timeout (mirrors auth.js)
// =====================================================================
async function fetchWithTimeout(url, options = {}) {
    const TIMEOUT_MS = 10000;
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    options.signal = controller.signal;

    try {
        const response = await fetch(url, options);
        clearTimeout(timerId);
        return response;
    } catch (err) {
        clearTimeout(timerId);
        if (err.name === "AbortError") {
            throw new Error("Request timed out. Please check your connection.");
        }
        throw err;
    }
}

// =====================================================================
// 2. UI Helpers
// =====================================================================

function showGlobalMessage(message, isError = true) {
    const el = document.getElementById("globalMessage");
    if (!el) return;
    el.textContent = message; // textContent — XSS-safe
    el.className = `global-message ${isError ? "error" : "success"}`;
    el.style.display = "block";
}

function clearGlobalMessage() {
    const el = document.getElementById("globalMessage");
    if (!el) return;
    el.textContent = "";
    el.style.display = "none";
    el.className = "global-message";
}

function showFieldError(fieldId, message) {
    const errorEl = document.getElementById(fieldId + "Error");
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add("visible");
    }
    const input = document.getElementById(fieldId);
    if (input) input.setAttribute("aria-invalid", "true");
}

function clearFieldErrors() {
    document.querySelectorAll(".error-text").forEach((el) => {
        el.textContent = "";
        el.classList.remove("visible");
    });
    document.querySelectorAll(".form-control").forEach((el) => {
        el.removeAttribute("aria-invalid");
    });
}

function toggleButtonLoading(btn, isLoading) {
    if (!btn) return;
    btn.disabled = isLoading;
    btn.classList.toggle("loading", isLoading);
}

// =====================================================================
// 3. Load cart summary from backend (GET /api/cart)
// =====================================================================

async function loadCartSummary() {
    const summaryItems = document.getElementById("summaryItems");
    const summaryDivider = document.getElementById("summaryDivider");
    const summaryTotal = document.getElementById("summaryTotal");
    const totalAmount = document.getElementById("totalAmount");
    const placeOrderBtn = document.getElementById("placeOrderBtn");
    const emptyCartMsg = document.getElementById("emptyCartMsg");

    try {
        const resp = await fetchWithTimeout(`${API_BASE}/api/cart`, {
            method: "GET",
            credentials: "include",
        });

        if (!resp.ok) {
            // If cart endpoint is not yet implemented, show empty state
            emptyCartMsg.style.display = "block";
            placeOrderBtn.disabled = true;
            return;
        }

        const data = await resp.json();
        const items = data.items || [];

        if (items.length === 0) {
            emptyCartMsg.style.display = "block";
            placeOrderBtn.disabled = true;
            return;
        }

        // Hide empty state, show summary
        emptyCartMsg.style.display = "none";
        summaryDivider.style.display = "block";
        summaryTotal.style.display = "flex";
        placeOrderBtn.disabled = false;

        // Render each item
        let total = 0;
        const fragment = document.createDocumentFragment();

        items.forEach((item) => {
            const lineTotal = item.price * item.quantity;
            total += lineTotal;

            const row = document.createElement("div");
            row.className = "summary-item";
            row.innerHTML = `
                <div class="summary-item-info">
                    <span class="summary-item-name">${escapeHtml(item.name)}</span>
                    <span class="summary-item-qty">Qty: ${item.quantity}</span>
                </div>
                <span class="summary-item-price">EGP ${lineTotal.toFixed(2)}</span>
            `;
            fragment.appendChild(row);
        });

        // Clear previous rendered items (keep emptyCartMsg)
        const existing = summaryItems.querySelectorAll(".summary-item");
        existing.forEach((el) => el.remove());

        summaryItems.appendChild(fragment);
        totalAmount.textContent = `EGP ${total.toFixed(2)}`;
    } catch {
        // Cart endpoint not available — allow order anyway (backend validates)
        emptyCartMsg.style.display = "none";
        placeOrderBtn.disabled = false;
    }
}

// Simple HTML escape (XSS protection for dynamic content)
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================================
// 4. Place order (POST /api/order)
// =====================================================================

async function placeOrder(customerName) {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    if (!token) {
        window.location.replace("login.html");
        return { success: false, message: "Please sign in before placing an order." };
    }

    const resp = await fetchWithTimeout(`${API_BASE}/api/order`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({ customer_name: customerName }),
    });

    const data = await resp.json();

    if (resp.ok) {
        // resp.status is 201 (new order) or 200 (idempotent hit)
        return { success: true, data };
    }

    if (resp.status === 401) {
        localStorage.removeItem("auth_token");
        sessionStorage.removeItem("auth_token");
        window.location.replace("login.html");
        return { success: false, message: "Please sign in again." };
    }

    // Map contract error codes to user-friendly messages
    const errorMap = {
        EMPTY_CART: "Your cart is empty. Please add items before placing an order.",
        INVALID_INPUT: data.error || "Please enter a valid name.",
        ITEM_UNAVAILABLE: data.error || "An item in your cart is no longer available.",
    };

    const message = errorMap[data.code] || data.error || "Something went wrong. Please try again.";
    return { success: false, message, code: data.code };
}

// =====================================================================
// 5. Form submission handler
// =====================================================================

document.addEventListener("DOMContentLoaded", () => {
    // Load cart summary on page load
    loadCartSummary();

    const form = document.getElementById("checkoutForm");
    const placeOrderBtn = document.getElementById("placeOrderBtn");

    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearFieldErrors();
        clearGlobalMessage();

        // ── A. Client-side validation (mirrors backend regex) ──
        const customerName = document.getElementById("customerName").value.trim();

        if (!customerName) {
            showFieldError("customerName", "Please enter your name.");
            return;
        }

        if (!NAME_REGEX.test(customerName)) {
            showFieldError("customerName", "Name can only contain letters, spaces, hyphens, dots, and apostrophes.");
            return;
        }

        // ── B. Disable button / show spinner (double-submit prevention) ──
        toggleButtonLoading(placeOrderBtn, true);

        try {
            const result = await placeOrder(customerName);

            if (result.success) {
                const orderId = result.data.order_id;

                // ── EC-06: Persist order_id to sessionStorage IMMEDIATELY ──
                sessionStorage.setItem("last_order_id", orderId);

                // Show success overlay
                showSuccessOverlay(orderId);
            } else {
                showGlobalMessage(result.message);
            }
        } catch (err) {
            showGlobalMessage(err.message || "Network error. Please try again.");
        } finally {
            toggleButtonLoading(placeOrderBtn, false);
        }
    });
});

// =====================================================================
// 6. Success overlay
// =====================================================================

function showSuccessOverlay(orderId) {
    const overlay = document.getElementById("successOverlay");
    const orderIdDisplay = document.getElementById("successOrderId");
    const trackBtn = document.getElementById("trackOrderBtn");

    if (orderIdDisplay) orderIdDisplay.textContent = orderId;

    if (overlay) overlay.classList.add("active");

    if (trackBtn) {
        trackBtn.addEventListener("click", () => {
            window.location.href = `track.html?order_id=${encodeURIComponent(orderId)}`;
        });
    }
}
