import { initAuth, signIn, signOut, authState, currentUserLabel, isAdmin } from './auth.js';
import { buildSidebar, showPage } from './nav.js';
import { toast } from './ui.js';

const loginScreen = document.getElementById('login-screen');
const appShell = document.getElementById('app-shell');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginSubmit = document.getElementById('login-submit');

function showApp() {
  loginScreen.style.display = 'none';
  appShell.classList.add('ready');
  document.getElementById('user-name').textContent = currentUserLabel();
  document.getElementById('user-role').textContent = authState.profile?.role || '';
  document.getElementById('user-avatar').textContent = (currentUserLabel() || '?').trim().charAt(0).toUpperCase();
  buildSidebar(document.getElementById('sidebar'));
  showPage('dashboard');
}

function showLogin() {
  appShell.classList.remove('ready');
  loginScreen.style.display = 'flex';
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.style.display = 'none';
  loginSubmit.disabled = true;
  loginSubmit.textContent = 'Signing in…';
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    await signIn(email, password);
    showApp();
  } catch (err) {
    loginError.textContent = err.message || 'Sign-in failed. Check your email and password.';
    loginError.style.display = 'block';
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = 'Sign in';
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await signOut();
  toast('Signed out', 'info');
  showLogin();
});

(async function boot() {
  const hasSession = await initAuth();
  if (hasSession) {
    showApp();
  } else {
    showLogin();
  }
})();

// Exposed for inline onclick handlers inside page modules that need
// cross-page navigation without importing nav.js themselves.
window.__erpShowPage = showPage;
