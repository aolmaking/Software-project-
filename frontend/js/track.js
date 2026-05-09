// js/track.js

const statuses = ["pending", "brewing", "delivering", "done"];

const statusMessages = {
    "pending": "We received your order ☕",
    "brewing": "Your coffee is being brewed ☕",
    "delivering": "Your order is on the way 🚚",
    "done": "Your order is ready 🎉"
};

let pollInterval;

// Elements
const orderTitleEl = document.getElementById("order-title");
const statusMessageEl = document.getElementById("status-message");
const errorTextEl = document.getElementById("error-message");
const progressFillEl = document.getElementById("progress-fill");
const stepEls = document.querySelectorAll(".step");
const orderMadeEl = document.getElementById("order-made");
const mockWarningEl = document.getElementById("mock-warning");
const progressWrapperEl = document.querySelector(".progress-wrapper");

function getOrderId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("order");
}

function init() {
    const orderId = getOrderId();
    if (!orderId) {
        showError("Invalid order. Please go back and try again.");
        return;
    }

    orderTitleEl.textContent = `Order #${orderId}`;
    
    // Fetch immediately, then poll
    fetchStatus(orderId);
    pollInterval = setInterval(() => fetchStatus(orderId), 10000);
}

async function fetchStatus(orderId) {
    try {
        const response = await fetch(`http://127.0.0.1:5000/api/track/${orderId}`);
        if (!response.ok) {
            throw new Error('API not reachable');
        }
        const data = await response.json();
        
        mockWarningEl.style.display = "none";
        
        if (!orderMadeEl.textContent) {
            const madeTime = new Date(Date.now() - (data.elapsed_minutes * 60000));
            orderMadeEl.textContent = `Order made: ${madeTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }

        updateUI(data.status);
    } catch (error) {
        console.warn("Backend not available, using mock data.", error);
        mockWarningEl.style.display = "inline-block";
        
        // Mock fallback simulates time dynamically based on first visit
        let mockCreatedAt = localStorage.getItem(`mock_order_${orderId}_time`);
        if (!mockCreatedAt) {
            mockCreatedAt = Date.now();
            localStorage.setItem(`mock_order_${orderId}_time`, mockCreatedAt);
        }
        
        const elapsedMinutes = (Date.now() - parseInt(mockCreatedAt, 10)) / 60000;
        let mockStatus = "pending";
        if (elapsedMinutes >= 2) mockStatus = "brewing";
        if (elapsedMinutes >= 4) mockStatus = "delivering";
        if (elapsedMinutes >= 6) mockStatus = "done";

        const mockData = {
            order_id: orderId,
            status: mockStatus
        };

        if (!orderMadeEl.textContent) {
            const madeTime = new Date(parseInt(mockCreatedAt, 10));
            orderMadeEl.textContent = `Order made: ${madeTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }

        updateUI(mockData.status);
    }
}

function updateUI(currentStatus) {
    if (!statuses.includes(currentStatus)) {
        console.error("Unknown status:", currentStatus);
        return;
    }

    // 1. Update text
    statusMessageEl.textContent = statusMessages[currentStatus];
    
    // 2. Update progress UI
    const currentIndex = statuses.indexOf(currentStatus);
    
    // Calculate progress bar width based on dots (3 segments between 4 dots)
    // Indexes: 0=0%, 1=33%, 2=66%, 3=100%
    const progressPercent = (currentIndex / (statuses.length - 1)) * 100;
    progressFillEl.style.width = `${progressPercent}%`;

    // If done, add special class for green styling
    if (currentStatus === "done") {
        progressWrapperEl.classList.add("is-done");
    } else {
        progressWrapperEl.classList.remove("is-done");
    }

    // Update dots
    stepEls.forEach((stepEl, index) => {
        // Reset classes
        stepEl.classList.remove("completed", "active", "done");
        
        if (index < currentIndex) {
            stepEl.classList.add("completed");
        } else if (index === currentIndex) {
            if (currentStatus === "done") {
                stepEl.classList.add("done", "completed");
            } else {
                stepEl.classList.add("active");
            }
        }
    });
}

function showError(msg) {
    statusMessageEl.style.display = "none";
    errorTextEl.textContent = msg;
    errorTextEl.style.display = "block";
    progressWrapperEl.style.opacity = "0.3";
    progressWrapperEl.style.pointerEvents = "none";
}

// Start
document.addEventListener("DOMContentLoaded", init);
