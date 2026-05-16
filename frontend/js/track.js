const TRACK_API_BASE = window.location.protocol.startsWith("http")
    ? `${window.location.origin}/api`
    : "http://localhost:5000/api";

const STATUSES = ["pending", "preparing", "ready", "completed"];

let pollTimer = null;
let activeOrderId = "";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("track-form");
    const input = document.getElementById("order-id-input");

    form?.addEventListener("submit", (event) => {
        event.preventDefault();
        const orderId = input.value.trim();
        if (orderId) startTracking(orderId);
    });

    const params = new URLSearchParams(window.location.search);
    const initialOrderId = params.get("order_id") || sessionStorage.getItem("last_order_id") || "";
    if (initialOrderId) {
        input.value = initialOrderId;
        startTracking(initialOrderId);
    }
});

function startTracking(orderId) {
    activeOrderId = orderId;
    sessionStorage.setItem("last_order_id", orderId);
    clearInterval(pollTimer);
    fetchTracking(orderId);
    pollTimer = setInterval(() => fetchTracking(orderId), 10000);
}

async function fetchTracking(orderId) {
    setMessage("Refreshing status...", false);

    try {
        const response = await fetch(`${TRACK_API_BASE}/track/${encodeURIComponent(orderId)}`);
        const data = await response.json();

        if (!response.ok) {
            clearInterval(pollTimer);
            renderEmpty();
            setMessage(data.error || "Order not found.", true);
            return;
        }

        renderTracking(data);
        setMessage(data.status === "completed" ? "Order completed." : "Live tracking is active.", false);

        if (data.status === "completed") {
            clearInterval(pollTimer);
        }
    } catch (error) {
        setMessage(error.message || "Could not load tracking data.", true);
    }
}

function renderTracking(order) {
    const container = document.getElementById("orders-container");
    if (!container) return;

    const currentIndex = Math.max(0, STATUSES.indexOf(order.status));
    const progress = Math.round((currentIndex / (STATUSES.length - 1)) * 100);
    const eventsByStatus = Object.fromEntries((order.timeline || []).map((event) => [event.status, event.timestamp]));

    container.innerHTML = `
        <article class="order-card expanded">
            <div class="card-main">
                <div class="order-info">
                    <div class="order-id">Order #${escapeHtml(order.order_id)}</div>
                    <div class="item-name">Current status: ${escapeHtml(titleCase(order.status))}</div>
                    <div class="placed-date">Last updated: ${formatTimestamp(order.last_updated)}</div>
                </div>
                <div class="status-badge ${badgeClass(order.status)}">
                    <i class="${statusIcon(order.status)}"></i>
                    <span>${escapeHtml(titleCase(order.status))}</span>
                </div>
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
                            <p><strong>Polling:</strong><br>${order.status === "completed" ? "Stopped" : "Every 10 seconds"}</p>
                        </div>
                    </div>
                </div>
            </div>
        </article>
    `;
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

function renderEmpty() {
    const container = document.getElementById("orders-container");
    if (container) container.innerHTML = "";
}

function setMessage(message, isError) {
    const el = document.getElementById("track-message");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("error", Boolean(isError));
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
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTimestamp(value) {
    if (!value) return "Not recorded";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return date.toLocaleString();
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
