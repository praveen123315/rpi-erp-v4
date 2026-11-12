import { NAV_STRUCTURE, NAV_FOOT, findPage, icon } from './pages/registry.js';
import { isAdmin } from './auth.js';
import { toastError } from './ui.js';

const renderedOnce = new Set();
let currentPageId = null;

function itemAllowed(item) {
  if (item.adminOnly && !isAdmin()) return false;
  return true;
}

function navItemHtml(item) {
  return `<a class="nav-item" data-nav="${item.id}" href="javascript:void(0)" ${item.accent ? `style="background:rgba(45,106,79,0.1);"` : ''}>
    ${icon(item.icon, item.accent)}
    <span ${item.accent ? `style="color:${item.accent};"` : ''}>${item.label}</span>
  </a>`;
}

export function buildSidebar(sidebarEl) {
  let html = `
    <div class="brand-block">
      <div class="brand-name">Raunaq Paint Industry</div>
      <div class="brand-tagline">ERP System v4</div>
    </div>`;

  for (const group of NAV_STRUCTURE) {
    if (group.section) html += `<div class="nav-section">${group.section}</div>`;
    for (const item of group.items) {
      if (!itemAllowed(item)) continue;
      html += navItemHtml(item);
    }
  }

  html += `<div class="nav-spacer"></div><div class="nav-foot">`;
  for (const item of NAV_FOOT) {
    if (!itemAllowed(item)) continue;
    html += navItemHtml(item);
  }
  html += `</div>`;

  sidebarEl.innerHTML = html;

  sidebarEl.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => showPage(el.dataset.nav));
  });
}

export async function showPage(pageId) {
  const item = findPage(pageId);
  if (!item) return;
  if (item.adminOnly && !isAdmin()) return;

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-nav="${pageId}"]`)?.classList.add('active');

  document.getElementById('page-title').textContent = item.label;
  document.getElementById('page-sub').textContent = item.sub || '';

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  let pageEl = document.getElementById('page-' + pageId);
  if (!pageEl) {
    pageEl = document.createElement('div');
    pageEl.id = 'page-' + pageId;
    pageEl.className = 'page';
    document.getElementById('page-container').appendChild(pageEl);
  }
  pageEl.classList.add('active');
  currentPageId = pageId;

  try {
    pageEl.innerHTML = '<div class="loading-row"><span class="spinner"></span> &nbsp;Loading…</div>';
    await item.render(pageEl);
  } catch (err) {
    toastError(err, `Could not load ${item.label}`);
    pageEl.innerHTML = `<div class="empty-state">Could not load this page. Try again or check the console for details.</div>`;
  }
}

export function refreshCurrentPage() {
  if (currentPageId) showPage(currentPageId);
}

export function getCurrentPageId() {
  return currentPageId;
}
