document.addEventListener("DOMContentLoaded", () => {
    fetchHistoryOrders();
});

async function fetchHistoryOrders() {
    try {
        const data = await apiFetch("/track/history");
        if (data && data.orders) {
            renderHistory(data.orders);
        }
    } catch (error) {
        showToast(error.message || "Failed to fetch history");
    }
}

function renderHistory(orders) {
    const container = document.getElementById("history-container");
    if (!container) return;

    if (orders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>You have no past orders.</p>
                <a href="index.html" class="nav-btn primary" style="margin-top: 10px; display: inline-block;">Order Now</a>
            </div>`;
        return;
    }

    let html = '<div class="orders-list">';
    orders.forEach(order => {
        let itemsHtml = '';
        order.items.forEach(item => {
            itemsHtml += `
                <tr>
                    <td>${item.quantity}x ${escapeHtml(item.name)}</td>
                    <td class="price">EGP ${(item.price * item.quantity).toFixed(2)}</td>
                </tr>
            `;
        });
        
        let timelineHtml = order.timeline.map(t => 
            `<span>${titleCase(t.status)}: ${formatTimestamp(t.timestamp)}</span>`
        ).join(' &rarr; ');

        html += `
            <article class="history-card" data-order-id="${order.order_id}">
                <div class="card-main" onclick="toggleAccordion('${order.order_id}')">
                    <div class="order-info">
                        <div class="order-id">RECEIPT #${order.order_id.split('-')[0].toUpperCase()}</div>
                        <div class="completed-date">Completed on ${formatTimestamp(order.updated_at)}</div>
                    </div>
                    <div style="font-weight: bold; color: var(--text-main);">
                        EGP ${order.total.toFixed(2)}
                    </div>
                    <i class="fa-solid fa-chevron-down toggle-icon"></i>
                </div>
                <div class="card-details">
                    <div class="card-details-inner">
                        <div class="receipt-body">
                            <table class="receipt-items">
                                <thead>
                                    <tr>
                                        <th>Item</th>
                                        <th class="price">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsHtml}
                                </tbody>
                            </table>
                            <div class="receipt-total">
                                <span>Total Paid</span>
                                <span>EGP ${order.total.toFixed(2)}</span>
                            </div>
                            <div class="timeline-mini">
                                ${timelineHtml}
                            </div>
                            <button class="reorder-btn" onclick="reorder('${order.order_id}')">Reorder Items</button>
                        </div>
                    </div>
                </div>
            </article>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

window.toggleAccordion = function(orderId) {
    const cards = document.querySelectorAll(".history-card");
    cards.forEach(card => {
        if (card.dataset.orderId === orderId) {
            card.classList.toggle("expanded");
        } else {
            card.classList.remove("expanded");
        }
    });
}

window.reorder = async function(orderId) {
    // For a real implementation, we would add the items back to the cart.
    // For now, let's just show a toast and redirect to menu.
    showToast("Reorder feature not fully implemented yet.");
    setTimeout(() => { window.location.href = "index.html"; }, 1500);
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
    return date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
