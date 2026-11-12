import { supabase } from '../supabaseClient.js';
import { isAdmin } from '../auth.js';
import { escapeHtml, toast, toastError, openModal, closeModal, confirmDialog, filterRows, emptyRow, debounce } from '../ui.js';

let allShades = [];
let allProducts = [];
let linkMap = {}; // shade_id -> Set(product_id)

async function loadAll() {
  const [{ data: shades, error: e1 }, { data: products, error: e2 }, { data: links, error: e3 }] = await Promise.all([
    supabase.from('shades').select('*').order('name'),
    supabase.from('products').select('id,name').eq('is_active', true).order('sort_order'),
    supabase.from('product_shades').select('product_id,shade_id'),
  ]);
  if (e1) throw e1; if (e2) throw e2; if (e3) throw e3;
  allShades = shades || [];
  allProducts = products || [];
  linkMap = {};
  (links || []).forEach(l => {
    if (!linkMap[l.shade_id]) linkMap[l.shade_id] = new Set();
    linkMap[l.shade_id].add(l.product_id);
  });
}

function productNames(shadeId) {
  const set = linkMap[shadeId];
  if (!set || !set.size) return '<span class="text-muted">— none —</span>';
  const names = allProducts.filter(p => set.has(p.id)).map(p => p.name);
  if (names.length > 2) return `${escapeHtml(names.slice(0, 2).join(', '))} <span class="badge badge-gray">+${names.length - 2}</span>`;
  return escapeHtml(names.join(', '));
}

function rowsHtml(rows) {
  const admin = isAdmin();
  if (!rows.length) return emptyRow(5, 'No shades yet.');
  return rows.map(r => `
    <tr>
      <td>${escapeHtml(r.name)}</td>
      <td>${r.is_custom ? '<span class="badge badge-saffron">Custom</span>' : '<span class="badge badge-gray">Standard</span>'}</td>
      <td>${productNames(r.id)}</td>
      <td>${r.is_active === false ? '<span class="badge badge-gray">Inactive</span>' : '<span class="badge badge-green">Active</span>'}</td>
      <td><div class="row-actions">
        ${admin ? `<button class="btn btn-outline btn-sm" data-link="${r.id}">Link products</button>
        <button class="btn btn-danger btn-sm" data-toggle="${r.id}">${r.is_active === false ? 'Reactivate' : 'Deactivate'}</button>` : ''}
      </div></td>
    </tr>`).join('');
}

export async function renderShadesDb(container) {
  try {
    await loadAll();
  } catch (err) {
    toastError(err, 'Could not load Shades Database');
    container.innerHTML = `<div class="empty-state">Could not load shades.</div>`;
    return;
  }

  function paint() {
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">Shades Database</h2><p class="section-sub">${allShades.length} shade${allShades.length === 1 ? '' : 's'}</p></div>
        <button class="btn btn-primary" id="sh-add-btn">+ Add Shade</button>
      </div>
      <div class="table-wrap">
        <div class="table-toolbar">
          <div class="search-box"><input class="form-input" id="sh-search" placeholder="Search shades…"></div>
        </div>
        <div class="table-scroll">
          <table class="erp-table">
            <thead><tr><th>Shade</th><th>Type</th><th>Linked products</th><th>Status</th><th></th></tr></thead>
            <tbody id="sh-tbody">${rowsHtml(allShades)}</tbody>
          </table>
        </div>
      </div>`;
    wire();
  }

  function wire() {
    document.getElementById('sh-add-btn').addEventListener('click', addShade);
    const search = document.getElementById('sh-search');
    search.addEventListener('input', debounce(() => {
      const filtered = filterRows(allShades, search.value, ['name']);
      document.getElementById('sh-tbody').innerHTML = rowsHtml(filtered);
      wireRows();
    }, 200));
    wireRows();
  }

  function wireRows() {
    container.querySelectorAll('[data-link]').forEach(b => b.addEventListener('click', () => linkProducts(b.dataset.link)));
    container.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => toggleActive(b.dataset.toggle)));
  }

  async function addShade() {
    openModal({
      title: 'Add Shade',
      bodyHtml: `<div class="form-field"><label class="form-label">Shade name <span class="req">*</span></label>
        <input class="form-input" id="sh-name" autofocus></div>`,
      footHtml: `<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Add</button>`,
    });
    document.querySelector('[data-cancel]').addEventListener('click', closeModal);
    document.querySelector('[data-save]').addEventListener('click', async () => {
      const name = document.getElementById('sh-name').value.trim();
      if (!name) { toast('Shade name is required', 'error'); return; }
      try {
        const { error } = await supabase.from('shades').insert({ name, is_custom: true });
        if (error) throw error;
        toast('Shade added', 'success');
        closeModal();
        await loadAll();
        paint();
      } catch (err) {
        toastError(err, 'Could not add shade');
      }
    });
  }

  async function toggleActive(id) {
    const row = allShades.find(s => s.id === id);
    if (!row) return;
    const next = !row.is_active;
    const ok = await confirmDialog(next ? `Reactivate "${row.name}"?` : `Deactivate "${row.name}"?`, { danger: !next, confirmLabel: next ? 'Reactivate' : 'Deactivate' });
    if (!ok) return;
    try {
      const { error } = await supabase.from('shades').update({ is_active: next }).eq('id', id);
      if (error) throw error;
      toast(next ? 'Reactivated' : 'Deactivated', 'success');
      await loadAll();
      paint();
    } catch (err) {
      toastError(err, 'Could not update shade');
    }
  }

  async function linkProducts(shadeId) {
    const linked = linkMap[shadeId] || new Set();
    const body = `<div style="max-height:360px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">
      ${allProducts.map(p => `
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
          <input type="checkbox" data-pid="${p.id}" ${linked.has(p.id) ? 'checked' : ''} style="width:16px;height:16px;">
          ${escapeHtml(p.name)}
        </label>`).join('')}
    </div>`;
    openModal({
      title: 'Link products to this shade',
      bodyHtml: body,
      wide: true,
      footHtml: `<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save links</button>`,
    });
    document.querySelector('[data-cancel]').addEventListener('click', closeModal);
    document.querySelector('[data-save]').addEventListener('click', async () => {
      const checked = Array.from(document.querySelectorAll('[data-pid]')).filter(c => c.checked).map(c => c.dataset.pid);
      try {
        await supabase.from('product_shades').delete().eq('shade_id', shadeId);
        if (checked.length) {
          const rows = checked.map(pid => ({ shade_id: shadeId, product_id: pid }));
          const { error } = await supabase.from('product_shades').insert(rows);
          if (error) throw error;
        }
        toast('Links saved', 'success');
        closeModal();
        await loadAll();
        paint();
      } catch (err) {
        toastError(err, 'Could not save links');
      }
    });
  }

  paint();
}
