// Shared UI helpers: toasts, modal, formatting. No framework — just DOM.

export function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function fmtMoney(n, dec = 2) {
  const v = Number(n || 0);
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function fmtNum(n, dec = 2) {
  const v = Number(n || 0);
  return v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: dec });
}

export function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  return dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

let toastStack = null;
export function toast(message, type = 'info', ms = 3800) {
  if (!toastStack) {
    toastStack = document.getElementById('toast-stack');
  }
  if (!toastStack) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'success' ? ' success' : type === 'error' ? ' error' : '');
  el.textContent = message;
  toastStack.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function toastError(err, fallback = 'Something went wrong') {
  const msg = (err && (err.message || err.error_description || err.hint)) || fallback;
  toast(msg, 'error', 5500);
  console.error(err);
}

let modalBackdrop = null;
let modalResolve = null;

function ensureModalEl() {
  if (modalBackdrop) return modalBackdrop;
  modalBackdrop = document.getElementById('modal-backdrop');
  return modalBackdrop;
}

export function openModal({ title, bodyHtml, footHtml = '', wide = false, onMount = null }) {
  const backdrop = ensureModalEl();
  backdrop.innerHTML = `
    <div class="modal-box${wide ? ' wide' : ''}">
      <div class="modal-head">
        <h3>${escapeHtml(title)}</h3>
        <button class="modal-close-x" data-modal-close>&times;</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footHtml ? `<div class="modal-foot">${footHtml}</div>` : ''}
    </div>`;
  backdrop.classList.add('open');
  backdrop.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', closeModal));
  backdrop.onclick = (e) => { if (e.target === backdrop) closeModal(); };
  if (onMount) onMount(backdrop.querySelector('.modal-box'));
  return backdrop;
}

export function closeModal() {
  const backdrop = ensureModalEl();
  backdrop.classList.remove('open');
  backdrop.innerHTML = '';
}

export function confirmDialog(message, { title = 'Please confirm', confirmLabel = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    openModal({
      title,
      bodyHtml: `<p style="margin:0;font-size:13.5px;color:var(--ink-soft);">${escapeHtml(message)}</p>`,
      footHtml: `
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${escapeHtml(confirmLabel)}</button>`,
    });
    const backdrop = ensureModalEl();
    backdrop.querySelector('[data-cancel]').addEventListener('click', () => { closeModal(); resolve(false); });
    backdrop.querySelector('[data-confirm]').addEventListener('click', () => { closeModal(); resolve(true); });
  });
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Simple client-side search filter over a list of row objects, matching
// against a set of string fields. Returns the filtered list.
export function filterRows(rows, query, fields) {
  if (!query) return rows;
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(r => fields.some(f => String(r[f] ?? '').toLowerCase().includes(q)));
}

export function loadingRow(colspan = 6, label = 'Loading…') {
  return `<tr><td colspan="${colspan}" class="loading-row"><span class="spinner"></span> &nbsp;${escapeHtml(label)}</td></tr>`;
}

export function emptyRow(colspan = 6, html = 'No records yet.') {
  return `<tr><td colspan="${colspan}"><div class="empty-state">${html}</div></td></tr>`;
}
