// frontend/js/auth.js
const API_BASE = 'http://localhost:5000/api/auth';

// Utility for safe DOM updates
function setTextContent(elementId, text) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = text;
}

function clearErrors() {
    document.querySelectorAll('.error-text').forEach(el => {
        el.textContent = '';
        el.classList.remove('visible');
    });
    document.querySelectorAll('input').forEach(el => {
        el.removeAttribute('aria-invalid');
    });
    const globalError = document.getElementById('globalError');
    if (globalError) {
        globalError.textContent = '';
        globalError.classList.remove('visible');
    }
}

function showError(inputId, message) {
    const errorEl = document.getElementById(inputId + 'Error');
    const inputEl = document.getElementById(inputId);
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add('visible');
    }
    if (inputEl) {
        inputEl.setAttribute('aria-invalid', 'true');
    }
}

function showGlobalError(message) {
    const globalError = document.getElementById('globalError');
    if (globalError) {
        globalError.textContent = message;
        globalError.classList.add('visible');
    }
}

function showGlobalSuccess(message) {
    const globalSuccess = document.getElementById('globalSuccess');
    if (globalSuccess) {
        globalSuccess.textContent = message;
        globalSuccess.classList.add('visible');
    }
}

// Token Storage Abstraction
function getAuthToken() {
    const local = localStorage.getItem('auth_token');
    const session = sessionStorage.getItem('auth_token');
    
    // Clear stale duplicates if both exist, prioritize session
    if (local && session) {
        localStorage.removeItem('auth_token');
    }
    
    return session || local;
}

function setAuthToken(token, remember) {
    clearAuthToken();
    if (remember) {
        localStorage.setItem('auth_token', token);
    } else {
        sessionStorage.setItem('auth_token', token);
    }
}

function clearAuthToken() {
    localStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_token');
}

// Password visibility toggle
document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', function() {
        const input = this.previousElementSibling;
        const iconPath = this.querySelector('path');
        
        if (input.type === 'password') {
            input.type = 'text';
            iconPath.setAttribute('d', 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24');
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", "1");
            line.setAttribute("y1", "1");
            line.setAttribute("x2", "23");
            line.setAttribute("y2", "23");
            this.querySelector('svg').appendChild(line);
        } else {
            input.type = 'password';
            iconPath.setAttribute('d', 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z');
            const line = this.querySelector('line');
            if(line) line.remove();
        }
    });
});

// Validators
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validatePassword = (pw) => {
    if (pw.length < 8 || pw.length > 128) return false;
    if (/\s/.test(pw)) return false;
    if (!/[a-zA-Z]/.test(pw)) return false;
    if (!/[0-9]/.test(pw)) return false;
    return true;
};

// Handle Form Submissions
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const rememberMe = document.getElementById('rememberMe').checked;
        
        let isValid = true;
        if (!email || email.length > 255 || !validateEmail(email)) {
            showError('email', 'Please enter a valid email address');
            isValid = false;
        }
        if (!password || password.length > 128) {
            showError('password', 'Please enter your password');
            isValid = false;
        }
        
        if (!isValid) return;
        
        const btn = document.getElementById('submitBtn');
        btn.disabled = true;
        btn.classList.add('loading');
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const res = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, remember_me: rememberMe }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            const data = await res.json();
            if (!res.ok) {
                if (data.code === 'INVALID_CREDENTIALS') {
                    showGlobalError('Invalid email or password.');
                } else {
                    showGlobalError(data.error || 'Login failed.');
                }
            } else {
                setAuthToken(data.token, rememberMe);
                window.location.replace('index.html');
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                showGlobalError('Request timed out. Please check your connection.');
            } else {
                showGlobalError('A network error occurred. Please try again later.');
            }
        } finally {
            btn.disabled = false;
            btn.classList.remove('loading');
        }
    });
}

let successTimeoutId;

const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();
        
        const username = document.getElementById('username').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        let isValid = true;
        
        if (username.length < 3 || username.length > 30) {
            showError('username', 'Username must be between 3 and 30 characters');
            isValid = false;
        }
        if (!validateEmail(email) || email.length > 255) {
            showError('email', 'Please enter a valid email address');
            isValid = false;
        }
        if (!validatePassword(password)) {
            showError('password', 'Password must contain at least 8 characters, one letter, one number, and no spaces.');
            isValid = false;
        }
        if (password !== confirmPassword) {
            showError('confirmPassword', 'Passwords do not match');
            isValid = false;
        }
        
        if (!isValid) return;
        
        const btn = document.getElementById('submitBtn');
        btn.disabled = true;
        btn.classList.add('loading');
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const res = await fetch(`${API_BASE}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, username, password, full_name: username }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            const data = await res.json();
            
            if (!res.ok) {
                if (data.code === 'DUPLICATE_RESOURCE') {
                    showGlobalError(data.error);
                } else if (data.code === 'VALIDATION_ERROR') {
                    showGlobalError(data.error);
                } else {
                    showGlobalError('Registration failed. Please try again.');
                }
            } else {
                showGlobalSuccess("Account created successfully. Please sign in.");
                btn.classList.remove('loading');
                btn.textContent = "Success!";
                
                successTimeoutId = setTimeout(() => {
                    window.location.replace('login.html');
                }, 2500);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                showGlobalError('Request timed out. Please check your connection.');
            } else {
                showGlobalError('A network error occurred. Please try again later.');
            }
        } finally {
            btn.disabled = false;
            btn.classList.remove('loading');
        }
    });
}

// Cleanup timeout if user leaves early
window.addEventListener('beforeunload', () => {
    if (successTimeoutId) {
        clearTimeout(successTimeoutId);
    }
});

// Global Logout function accessible to other pages
window.logout = function() {
    clearAuthToken();
    window.location.replace('login.html');
}

// Ensure protected routes like history.html redirect to login if not authenticated
function enforceAuth() {
    const isProtected = window.location.pathname.endsWith('history.html'); // add more if needed
    const token = getAuthToken();
    
    if (isProtected && !token) {
        window.location.replace('login.html');
    }
}
enforceAuth();

// Expose updateNavbar utility
window.updateNavbar = function() {
    const token = getAuthToken();
    const authLinksContainer = document.getElementById('navAuthLinks');
    if (!authLinksContainer) return;
    
    // Clear and build securely
    authLinksContainer.innerHTML = '';
    
    if (token) {
        // Authenticated State
        const historyLink = document.createElement('a');
        historyLink.href = 'history.html';
        historyLink.textContent = 'History';
        
        const logoutBtn = document.createElement('button');
        logoutBtn.className = 'btn-logout';
        logoutBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg> Logout';
        logoutBtn.onclick = window.logout;
        
        authLinksContainer.appendChild(historyLink);
        authLinksContainer.appendChild(logoutBtn);
    } else {
        // Guest State
        const loginLink = document.createElement('a');
        loginLink.href = 'login.html';
        loginLink.textContent = 'Sign In';
        
        const regLink = document.createElement('a');
        regLink.href = 'register.html';
        regLink.textContent = 'Sign Up';
        
        authLinksContainer.appendChild(loginLink);
        authLinksContainer.appendChild(regLink);
    }
}
