// track.js

// Generate relative dates for realistic mock progression
const now = new Date();
const pendingDate = new Date(now.getTime() - (0.5 * 60 * 1000));  // 0.5 mins ago
const preparingDate = new Date(now.getTime() - (2.5 * 60 * 1000)); // 2.5 mins ago
const readyDate = new Date(now.getTime() - (4.5 * 60 * 1000));   // 4.5 mins ago
const completedDate = new Date(now.getTime() - (7 * 60 * 1000));   // 7 mins ago

let mockOrders = [
    {
        orderId: "f3a8c7e2",
        placedAt: pendingDate.toISOString(),
        items: [
            { name: "Latte", quantity: 2, price: 85 },
            { name: "Croissant", quantity: 1, price: 55 }
        ],
        imageUrl: "https://images.unsplash.com/photo-1551030173-122aabc4489c?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80",
    },
    {
        orderId: "a1b2c3d4",
        placedAt: preparingDate.toISOString(),
        items: [
            { name: "Chocolate Cake", quantity: 1, price: 90 },
            { name: "Espresso", quantity: 1, price: 40 }
        ],
        imageUrl: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80",
    },
    {
        orderId: "d5e6f7g8",
        placedAt: readyDate.toISOString(),
        items: [
            { name: "Butter Croissant", quantity: 2, price: 55 }
        ],
        imageUrl: "https://images.unsplash.com/photo-1555507036-ab1f40ce88cb?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80",
    },
    {
        orderId: "c9x8z7y6",
        placedAt: completedDate.toISOString(),
        items: [
            { name: "Iced Americano", quantity: 1, price: 60 }
        ],
        imageUrl: "https://images.unsplash.com/photo-1517701550927-30cfcb64c5ed?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80",
    }
];

let expandedOrderId = mockOrders.length > 0 ? mockOrders[0].orderId : null;

function toggleCard(orderId) {
    if (expandedOrderId === orderId) {
        expandedOrderId = null; // collapse if already expanded
    } else {
        expandedOrderId = orderId; // expand new one, collapses others
    }
    updateDOM(); // updates classes for accordion
}

function getStatusBadgeConfig(status) {
    switch (status) {
        case 'preparing':
            return { class: 'status-preparing', text: 'Preparing', icon: 'fa-solid fa-fire-burner' };
        case 'ready':
            return { class: 'status-ready', text: 'Ready', icon: 'fa-solid fa-bell' };
        case 'completed':
            return { class: 'status-completed', text: 'Completed', icon: 'fa-solid fa-check-circle' };
        default:
            return { class: 'status-pending', text: 'Pending', icon: 'fa-solid fa-clipboard-list' };
    }
}

function formatDateTime(isoString) {
    const date = new Date(isoString);
    const optionsDate = { day: 'numeric', month: 'short', year: 'numeric' };
    const optionsTime = { hour: '2-digit', minute: '2-digit', hour12: true };
    return `${date.toLocaleDateString('en-GB', optionsDate)} at ${date.toLocaleTimeString('en-US', optionsTime)}`;
}

// 0-2 min pending, 2-4 min preparing, 4-6 min ready, 6+ min completed
function computeStatus(placedAt) {
    const elapsedMs = Date.now() - new Date(placedAt).getTime();
    const elapsedMinutes = elapsedMs / (1000 * 60);
    
    if (elapsedMinutes < 2) return 'pending';
    if (elapsedMinutes < 4) return 'preparing';
    if (elapsedMinutes < 6) return 'ready';
    return 'completed';
}

function calculateTotal(items) {
    return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

function applyLevelToDOM(cardEl, currentLevel) {
    for (let i = 0; i <= 3; i++) {
        const stepEl = cardEl.querySelector(`.step-${i}`);
        if (stepEl) {
            stepEl.classList.remove('completed', 'current');
            if (currentLevel > i || currentLevel === 3) stepEl.classList.add('completed');
            else if (currentLevel === i) stepEl.classList.add('current');
        }
        
        if (i < 3) {
            const connectorFill = cardEl.querySelector(`.connector-${i} .fill`);
            if (connectorFill) {
                connectorFill.style.width = (currentLevel > i) ? '100%' : '0%';
            }
        }
    }
}

function animateLevelTransition(cardEl, fromLevel, toLevel, order) {
    order.isAnimating = true;

    // 1. Fill the connecting line slowly
    const connectorFill = cardEl.querySelector(`.connector-${fromLevel} .fill`);
    if (connectorFill) {
        connectorFill.style.width = '100%';
    }
    
    // 2. Wait 1000ms for the CSS transition (width 1s) to finish before activating nodes
    setTimeout(() => {
        // Update previous node to completed
        const prevStep = cardEl.querySelector(`.step-${fromLevel}`);
        if (prevStep) {
            prevStep.classList.remove('current');
            prevStep.classList.add('completed');
        }
        
        // Update new node
        const nextStep = cardEl.querySelector(`.step-${fromLevel + 1}`);
        if (nextStep) {
            if (fromLevel + 1 === 3) { // Completed step
                nextStep.classList.add('completed');
                for(let k=0; k<=3; k++) {
                   const step = cardEl.querySelector(`.step-${k}`);
                   if(step) { step.classList.remove('current'); step.classList.add('completed'); }
                }
            } else {
                nextStep.classList.add('current');
            }
        }
        
        order.renderedLevel = fromLevel + 1;
        
        // If we still haven't reached toLevel (e.g. fast-forward), recurse
        if (order.renderedLevel < toLevel) {
            animateLevelTransition(cardEl, order.renderedLevel, toLevel, order);
        } else {
            order.isAnimating = false;
            // Update the badge dynamically only after timeline animation completes to stay perfectly in sync
            updateBadgeUI(cardEl, order.status);
        }
    }, 1000); 
}

function updateBadgeUI(cardEl, status) {
    const badge = getStatusBadgeConfig(status);
    const badgeEl = cardEl.querySelector('.status-badge');
    badgeEl.className = `status-badge ${badge.class}`;
    
    // Use robust query selectors
    const iconEl = badgeEl.querySelector('i');
    if (iconEl) iconEl.className = badge.icon;
    
    const textEl = badgeEl.querySelector('span');
    if (textEl) textEl.textContent = badge.text;
    
    const metaStatusEl = cardEl.querySelector('.meta-status');
    if (metaStatusEl) metaStatusEl.textContent = status;
}

function updateDOM() {
    const container = document.getElementById('orders-container');
    if (!container) return;

    mockOrders.forEach(order => {
        order.status = computeStatus(order.placedAt);
        
        // Auto remove completed orders (5 mins after completed = 6 + 5 = 11 mins)
        const elapsedMs = Date.now() - new Date(order.placedAt).getTime();
        const elapsedMinutes = elapsedMs / (1000 * 60);
        
        if (elapsedMinutes >= 11) {
            if (!order.removed) {
                order.removed = true;
                const cardEl = document.getElementById(`order-card-${order.orderId}`);
                if (cardEl) {
                    cardEl.classList.add('fade-out');
                    setTimeout(() => {
                        cardEl.remove();
                        mockOrders = mockOrders.filter(o => o.orderId !== order.orderId);
                    }, 800);
                }
            }
        }
        
        if (order.removed) return;

        let cardEl = document.getElementById(`order-card-${order.orderId}`);
        
        if (!cardEl) {
            // First time render for this card
            cardEl = createCardElement(order);
            container.appendChild(cardEl);
        }
        
        // Update the card
        updateCardElement(cardEl, order);
    });
}

function createCardElement(order) {
    const card = document.createElement('div');
    card.id = `order-card-${order.orderId}`;
    card.className = 'order-card';
    
    const itemsHtml = order.items.map(item => `
        <tr>
            <td>${item.name}</td>
            <td>${item.quantity}</td>
            <td>${item.price * item.quantity}</td>
        </tr>
    `).join('');
    
    const mainItemName = order.items.length > 0 ? order.items[0].name : "Custom Order";
    const additionalItemsCount = order.items.length - 1;
    const itemSummary = additionalItemsCount > 0 ? `${mainItemName} + ${additionalItemsCount} more` : mainItemName;
    const orderTotal = calculateTotal(order.items);
    const placedFormatted = formatDateTime(order.placedAt);

    card.innerHTML = `
        <div class="card-main" onclick="toggleCard('${order.orderId}')">
            <img src="${order.imageUrl}" alt="${mainItemName}" class="item-image" onerror="this.src='https://via.placeholder.com/150?text=Coffee'">
            
            <div class="order-info">
                <div class="order-id">Order #${order.orderId}</div>
                <div class="item-name">${itemSummary}</div>
                <div class="placed-date">Placed on <span class="placed-date-val">${placedFormatted}</span></div>
            </div>
            
            <div class="status-badge">
                <i></i> <span></span>
            </div>
            
            <div class="toggle-icon">
                <i class="fa-solid fa-chevron-down"></i>
            </div>
        </div>
        
        <div class="card-details">
            <div class="card-details-inner">
                <div class="timeline-container">
                    <div class="timeline-steps">
                        
                        <div class="timeline-step step-0">
                            <div class="step-icon"><i class="fa-solid fa-clipboard-list"></i></div>
                            <div class="step-info"><div class="step-name">Pending</div></div>
                        </div>
                        
                        <div class="timeline-connector connector-0"><div class="fill"></div></div>
                        
                        <div class="timeline-step step-1">
                            <div class="step-icon"><i class="fa-solid fa-fire-burner"></i></div>
                            <div class="step-info"><div class="step-name">Preparing</div></div>
                        </div>
                        
                        <div class="timeline-connector connector-1"><div class="fill"></div></div>
                        
                        <div class="timeline-step step-2">
                            <div class="step-icon"><i class="fa-solid fa-bell"></i></div>
                            <div class="step-info"><div class="step-name">Ready</div></div>
                        </div>

                        <div class="timeline-connector connector-2"><div class="fill"></div></div>

                        <div class="timeline-step step-3">
                            <div class="step-icon"><i class="fa-solid fa-check"></i></div>
                            <div class="step-info"><div class="step-name">Completed</div></div>
                        </div>
                        
                    </div>
                </div>

                <div class="expanded-info-grid">
                    <div class="ordered-items-section">
                        <h3>Ordered Items</h3>
                        <table class="items-table">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Quantity</th>
                                    <th>Price</th>
                                </tr>
                            </thead>
                            <tbody>${itemsHtml}</tbody>
                            <tfoot>
                                <tr>
                                    <td colspan="2" class="total-label">Total:</td>
                                    <td class="total-value">${orderTotal} EGP</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <div class="order-metadata-section">
                        <h3>Order Metadata</h3>
                        <p><strong>Placed on:</strong> <br><span class="meta-placed">${placedFormatted}</span></p>
                        <p><strong>Current status:</strong> <br><span class="meta-status" style="text-transform: capitalize;"></span></p>
                    </div>
                </div>
            </div>
        </div>
    `;
    return card;
}

function updateCardElement(cardEl, order) {
    // Accordion Expansion
    if (expandedOrderId === order.orderId) {
        cardEl.classList.add('expanded');
    } else {
        cardEl.classList.remove('expanded');
    }

    // Timeline Logic
    const levels = { 'pending': 0, 'preparing': 1, 'ready': 2, 'completed': 3 };
    const currentLevel = levels[order.status];
    
    if (order.renderedLevel === undefined) {
        // First render, snap instantly without animation
        order.renderedLevel = currentLevel;
        applyLevelToDOM(cardEl, currentLevel);
        updateBadgeUI(cardEl, order.status);
    } else if (order.renderedLevel < currentLevel && !order.isAnimating) {
        // State advanced! Start sequential animation. Badge will update when animation finishes.
        animateLevelTransition(cardEl, order.renderedLevel, currentLevel, order);
    } else if (!order.isAnimating) {
        // Just keep badge in sync if not animating
        updateBadgeUI(cardEl, order.status);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateDOM();
    setInterval(updateDOM, 1000);
});
