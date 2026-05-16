const STATUS_API_BASE = window.location.protocol.startsWith("http")
  ? `${window.location.origin}/api`
  : "http://localhost:5000/api";

const STATUS_NEXT = {
  pending: "preparing",
  preparing: "ready",
  ready: "completed",
};

document.addEventListener("DOMContentLoaded", () => {
  loadOrders();
  setInterval(loadOrders, 30000);
});

async function loadOrders() {
  const container = document.getElementById("status-orders");
  const meta = document.getElementById("refresh-meta");

  try {
    const response = await fetch(`${STATUS_API_BASE}/status`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load orders.");
    }

    renderOrders(data.orders || []);
    if (meta) meta.textContent = `Last refreshed ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    if (container) {
      container.innerHTML = `<div class="empty-state"><p>${escapeHtml(error.message)}</p></div>`;
    }
    if (meta) meta.textContent = "Refresh failed";
  }
}

function renderOrders(orders) {
  const container = document.getElementById("status-orders");
  if (!container) return;

  if (!orders.length) {
    container.innerHTML = '<div class="empty-state"><p>No active orders.</p></div>';
    return;
  }

  container.innerHTML = orders.map(renderOrderCard).join("");
  container.querySelectorAll("[data-next-status]").forEach((button) => {
    button.addEventListener("click", () => updateStatus(button.dataset.orderId, button.dataset.nextStatus, button));
  });
}

function renderOrderCard(order) {
  const nextStatus = STATUS_NEXT[order.status];
  return `
    <article class="staff-card">
      <h2>Order #${escapeHtml(order.order_id)}</h2>
      <span class="status-pill">${escapeHtml(order.status)}</span>
      <dl>
        <dt>Customer</dt><dd>${escapeHtml(order.customer_name)}</dd>
        <dt>Total</dt><dd>EGP ${Number(order.total || 0).toFixed(2)}</dd>
        <dt>Placed</dt><dd>${formatTimestamp(order.created_at)}</dd>
      </dl>
      <button
        type="button"
        data-order-id="${escapeHtml(order.order_id)}"
        data-next-status="${escapeHtml(nextStatus || "")}"
        ${nextStatus ? "" : "disabled"}
      >${nextStatus ? `Mark ${escapeHtml(nextStatus)}` : "No action"}</button>
    </article>
  `;
}

async function updateStatus(orderId, status, button) {
  if (!orderId || !status) return;
  button.disabled = true;

  try {
    const response = await fetch(`${STATUS_API_BASE}/status/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not update order.");
    }

    await loadOrders();
  } catch (error) {
    alert(error.message);
    button.disabled = false;
  }
}

function formatTimestamp(value) {
  if (!value) return "Unknown";
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
