const TRACK_API_BASE = window.location.protocol.startsWith("http")
    ? `${window.location.origin}/api`
    : "http://localhost:5000/api";

const STATUSES = ["pending", "preparing", "ready", "completed"];

let pollTimer = null;
let activeOrders = [];

document.addEventListener("DOMContentLoaded", () => {
    fetchActiveOrders();
    pollTimer = setInterval(fetchActiveOrders, 10000);
});

async function fetchActiveOrders() {
    try {
        const data = await apiFetch("/track/active");
        if (data && data.orders) {
            renderOrders(data.orders);
        }
    } catch (error) {
        showToast(error.message || "Failed to fetch orders");
    }
}

function renderOrders(orders) {
    const container = document.getElementById("orders-container");
    if (!container) return;

    if (orders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>You have no active orders.</p>
                <a href="index.html" class="nav-btn primary" style="margin-top: 10px; display: inline-block;">Order Now</a>
            </div>`;
        return;
    }

    // Keep track of which accordion is open
    const openCardId = document.querySelector(".order-card.expanded")?.dataset.orderId;

    let html = '<div class="orders-list">';
    orders.forEach(order => {
        const isExpanded = openCardId === order.order_id ? "expanded" : "";
        const currentIndex = Math.max(0, STATUSES.indexOf(order.status));
        const progress = Math.round((currentIndex / (STATUSES.length - 1)) * 100);
        const eventsByStatus = Object.fromEntries((order.timeline || []).map((event) => [event.status, event.timestamp]));

        html += `
            <article class="order-card ${isExpanded}" data-order-id="${order.order_id}">
                <div class="card-main" onclick="toggleAccordion('${order.order_id}')">
                    <div class="order-info">
                        <div class="order-id">Order #${order.order_id.split('-')[0]}</div>
                        <div class="item-name">${escapeHtml(order.item_summary)}</div>
                        <div class="placed-date">EGP ${order.total.toFixed(2)} • Placed: ${formatTimestamp(order.created_at)}</div>
                    </div>
                    <div class="status-badge ${badgeClass(order.status)}">
                        <i class="${statusIcon(order.status)}"></i>
                        <span>${escapeHtml(titleCase(order.status))}</span>
                    </div>
                    <i class="fa-solid fa-chevron-down toggle-icon"></i>
                </div>
                <div class="card-details">
                    <div class="card-details-inner">
                        <div class="timeline-container">
                            <div class="progress-shell" aria-label="Order progress">
                                <div class="progress-fill" style="width:${progress}%"></div>
                            </div>
                            <div class="timeline-steps">
                                ${STATUSES.map((status, index) => renderStep(status, index, currentIndex, eventsByStatus[status])).join("")}
                            </div>
                        </div>
                        <div class="expanded-info-grid">
                            <div class="order-metadata-section">
                                <h3>Tracking Details</h3>
                                <p><strong>Estimated wait:</strong><br>${order.estimated_wait_minutes} minutes</p>
                            </div>
                        </div>
                    </div>
                </div>
            </article>
        `;
    });
    html += '</div>';
    
    // Only update innerHTML if it has meaningfully changed to avoid interrupting animations,
    // or just use a smart diffing approach. Since it's a simple app, we can just replace it,
    // but replacing it breaks CSS transitions for expansion.
    // Instead of replacing the whole container, let's update individual cards.
    
    updateDOM(orders, openCardId);
}

function updateDOM(orders, openCardId) {
    const container = document.getElementById("orders-container");
    let listElement = container.querySelector(".orders-list");
    if (!listElement) {
        listElement = document.createElement("div");
        listElement.className = "orders-list";
        container.innerHTML = "";
        container.appendChild(listElement);
    }

    const existingCards = Array.from(listElement.querySelectorAll(".order-card"));
    const existingIds = existingCards.map(c => c.dataset.orderId);
    
    // Remove completed orders with fade out
    existingCards.forEach(card => {
        if (!orders.find(o => o.order_id === card.dataset.orderId)) {
            card.classList.add("fade-out");
            setTimeout(() => card.remove(), 800);
        }
    });

    // Add or update active orders
    orders.forEach(order => {
        let card = listElement.querySelector(`.order-card[data-order-id="${order.order_id}"]`);
        const currentIndex = Math.max(0, STATUSES.indexOf(order.status));
        const progress = Math.round((currentIndex / (STATUSES.length - 1)) * 100);
        const eventsByStatus = Object.fromEntries((order.timeline || []).map((event) => [event.status, event.timestamp]));

        if (!card) {
            // Create new card
            card = document.createElement("article");
            card.className = "order-card";
            card.dataset.orderId = order.order_id;
            listElement.appendChild(card);
        }

        // Only update content if status or something changed to avoid resetting animations
        // For simplicity, we can just update the innerHTML but keep the expanded state
        const isExpanded = card.classList.contains("expanded") || openCardId === order.order_id;
        if (isExpanded) card.classList.add("expanded");

        card.innerHTML = `
            <div class="card-main" onclick="toggleAccordion('${order.order_id}')">
                <div class="order-info">
                    <div class="order-id">Order #${order.order_id.split('-')[0]}</div>
                    <div class="item-name">${escapeHtml(order.item_summary)}</div>
                    <div class="placed-date">EGP ${order.total.toFixed(2)} • Placed: ${formatTimestamp(order.created_at)}</div>
                </div>
                <div class="status-badge ${badgeClass(order.status)}">
                    <i class="${statusIcon(order.status)}"></i>
                    <span>${escapeHtml(titleCase(order.status))}</span>
                </div>
                <i class="fa-solid fa-chevron-down toggle-icon"></i>
            </div>
            <div class="card-details">
                <div class="card-details-inner">
                    <div class="timeline-container">
                        <div class="progress-shell" aria-label="Order progress">
                            <div class="progress-fill" style="width:${progress}%"></div>
                        </div>
                        <div class="timeline-steps">
                            ${STATUSES.map((status, index) => renderStep(status, index, currentIndex, eventsByStatus[status])).join("")}
                        </div>
                    </div>
                    <div class="expanded-info-grid">
                        <div class="order-metadata-section">
                            <h3>Tracking Details</h3>
                            <p><strong>Estimated wait:</strong><br>${order.estimated_wait_minutes} minutes</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
}

window.toggleAccordion = function(orderId) {
    const cards = document.querySelectorAll(".order-card");
    cards.forEach(card => {
        if (card.dataset.orderId === orderId) {
            card.classList.toggle("expanded");
        } else {
            card.classList.remove("expanded");
        }
    });
}

function renderStep(status, index, currentIndex, timestamp) {
    const className = index < currentIndex || currentIndex === STATUSES.length - 1
        ? "completed"
        : index === currentIndex
            ? "current"
            : "";

    return `
        <div class="timeline-step ${className}">
            <div class="step-icon"><i class="${statusIcon(status)}"></i></div>
            <div class="step-info">
                <div class="step-name">${escapeHtml(titleCase(status))}</div>
                <div class="step-time">${timestamp ? formatTimestamp(timestamp) : "Pending"}</div>
            </div>
        </div>
    `;
}

function badgeClass(status) {
    return {
        pending: "status-pending",
        preparing: "status-preparing",
        ready: "status-ready",
        completed: "status-completed",
    }[status] || "status-pending";
}

function statusIcon(status) {
    return {
        pending: "fa-solid fa-clipboard-list",
        preparing: "fa-solid fa-fire-burner",
        ready: "fa-solid fa-bell",
        completed: "fa-solid fa-check-circle",
    }[status] || "fa-solid fa-clipboard-list";
}

function titleCase(value) {
    return String(value || "")
        .replace(/_/g, " ")
        .replace(/\\b\\w/g, (letter) => letter.toUpperCase());
}

function formatTimestamp(value) {
    if (!value) return "Not recorded";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
