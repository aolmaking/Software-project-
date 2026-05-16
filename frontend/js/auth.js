// auth.js

const AUTH_API_BASE = window.location.protocol.startsWith('http')
    ? `${window.location.origin}/api/auth`
    : 'http://localhost:5000/api/auth';

// --- 1. Token Priority Logic & Abstraction ---
function getAuthToken() {
    const sessionToken = sessionStorage.getItem('auth_token');
    const localToken = localStorage.getItem('auth_token');
    
    // Explicit Precedence Rule: Session wins over Local
    if (sessionToken && localToken) {
        localStorage.removeItem('auth_token'); // Purge stale token
        return sessionToken;
    }
    return sessionToken || localToken || null;
}

function setAuthToken(token, rememberMe = false) {
    clearAuthToken(); // clear any stale tokens first
    localStorage.setItem('auth_token', token);
}

function clearAuthToken() {
    sessionStorage.removeItem('auth_token');
    localStorage.removeItem('auth_token');
}

// --- 2. Protection & Routing ---
function enforceAuth() {
    const protectedRoutes = ['checkout.html'];
    const isProtected = protectedRoutes.some(route => window.location.pathname.endsWith(route));
    if (isProtected && !getAuthToken()) {
        window.location.replace('login.html');
    }
}
enforceAuth();

// --- 3. UI Helper Utilities ---
function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message; // Explicit XSS DOM Rule
        el.classList.add('visible');
        const input = document.getElementById(elementId.replace('Error', ''));
        if (input) input.setAttribute('aria-invalid', 'true');
    }
}

function clearErrors() {
    document.querySelectorAll('.error-text').forEach(el => {
        el.textContent = '';
        el.classList.remove('visible');
    });
    document.querySelectorAll('.form-control').forEach(el => {
        el.removeAttribute('aria-invalid');
    });
    const globalMsg = document.getElementById('globalMessage');
    if (globalMsg) {
        globalMsg.style.display = 'none';
        globalMsg.textContent = '';
        globalMsg.className = 'global-message';
    }
}

function showGlobalMessage(message, isError = true) {
    const globalMsg = document.getElementById('globalMessage');
    if (globalMsg) {
        globalMsg.textContent = message; // Explicit XSS DOM Rule
        globalMsg.className = `global-message ${isError ? 'error' : 'success'}`;
        globalMsg.style.display = 'block';
    }
}

function toggleButtonLoading(btn, isLoading) {
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn.classList.add('loading');
    } else {
        btn.disabled = false;
        btn.classList.remove('loading');
    }
}

// --- 4. Password Toggle ---
document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', function() {
        const input = this.previousElementSibling;
        if (input.type === 'password') {
            input.type = 'text';
            this.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
        } else {
            input.type = 'password';
            this.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
        }
    });
});

// --- 5. Fetch API Wrapper with Timeout (AbortController) ---
async function fetchWithTimeout(url, options = {}) {
    const timeout = 10000; // 10s ceiling
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    options.signal = controller.signal;

    try {
        const response = await fetch(url, options);
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error("Request timed out. Please check your connection.");
        }
        throw error; // Network error
    }
}

// --- 6. Form Handlers ---

// LOGIN
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();
        
        // Whitespace Sanitization
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const rememberMe = document.getElementById('rememberMe').checked;

        if (!email || !password) {
            showGlobalMessage("Email and password are required.");
            return;
        }

        const submitBtn = document.getElementById('submitBtn');
        toggleButtonLoading(submitBtn, true); // Double-submit prevention

        try {
            const response = await fetchWithTimeout(`${AUTH_API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, remember_me: rememberMe })
            });

            const data = await response.json();
            if (response.ok) {
                setAuthToken(data.token, rememberMe);
                window.location.replace('index.html'); // Destroy history
            } else {
                // Generic Login Error
                showGlobalMessage("Invalid email or password.");
            }
        } catch (error) {
            showGlobalMessage(error.message || "Network error occurred.");
        } finally {
            toggleButtonLoading(submitBtn, false);
        }
    });
}

// REGISTER
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();
        
        // Whitespace Sanitization
        const fullName = document.getElementById('fullName')?.value.trim() || '';
        const username = document.getElementById('username').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        let hasError = false;

        if (fullName.length < 1 || fullName.length > 80) {
            showError('fullNameError', "Full name is required.");
            hasError = true;
        }
        if (username.length < 3 || username.length > 30) {
            showError('usernameError', "Username must be 3-30 characters.");
            hasError = true;
        }
        if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            showError('emailError', "Please enter a valid email address.");
            hasError = true;
        }
        if (password !== confirmPassword) {
            showError('confirmPasswordError', "Passwords do not match.");
            hasError = true;
        }
        
        // Explicit Password Complexity
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[^\s]{8,128}$/;
        if (!passwordRegex.test(password)) {
            showError('passwordError', "Password must be 8+ chars with at least one letter, one number, and no spaces.");
            hasError = true;
        }

        if (hasError) return;

        const submitBtn = document.getElementById('submitBtn');
        toggleButtonLoading(submitBtn, true);

        let response;
        try {
            response = await fetchWithTimeout(`${AUTH_API_BASE}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_name: fullName, username, email, password })
            });

            const data = await response.json();
            if (response.ok) {
                // Success redirect flow (No auto-login)
                showGlobalMessage("Account created successfully. Please sign in.", false);
                setTimeout(() => {
                    window.location.replace('login.html');
                }, 1500);
            } else {
                showGlobalMessage(data.error || "Failed to create account.");
            }
        } catch (error) {
            showGlobalMessage(error.message || "Network error occurred.");
        } finally {
            if (!response || !response.ok) toggleButtonLoading(submitBtn, false);
        }
    });
}

// --- 7. Navbar Integration (Logout) ---
window.updateNavbar = function() {
    const navLinks = document.getElementById('nav-auth-slot') || document.getElementById('navAuthLinks');
    if (!navLinks) return;

    if (getAuthToken()) {
        navLinks.innerHTML = `
            <button onclick="logout()" class="nav-btn">Logout</button>
        `;
    } else {
        navLinks.innerHTML = `
            <a href="login.html" class="nav-btn">Login</a>
            <a href="register.html" class="nav-btn">Register</a>
        `;
    }
};

window.logout = async function() {
    try {
        await fetchWithTimeout(`${AUTH_API_BASE}/logout`, { method: 'POST' });
    } catch (_) {
        // Client-side token cleanup is enough to end the local session.
    }
    clearAuthToken();
    if (typeof window.updateNavbar === 'function') window.updateNavbar();
    window.location.replace('login.html'); // Destroy history
};
