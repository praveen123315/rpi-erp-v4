// Price List master. ADMIN-only table per RLS: any active user can view,
// only admin can create/edit groups, shades-per-group, or prices.
import { supabase } from '../supabaseClient.js';
import { isAdmin } from '../auth.js';
import { escapeHtml, toast, toastError, openModal, closeModal, fmtMoney, debounce } from '../ui.js';

let priceLists = [], products = [], packSizes = [];
let currentListId = null, currentProductId = null;
let groups = [], shadesByGroup = {}, pricesByGroup = {}, allShades = [];

async function loadStatics() {
  const [pl, pr, ps, sh] = await Promise.all([
    supabase.from('price_lists').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('products').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('pack_sizes').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('shades').select('id,name').eq('is_active', true).order('name'),
  ]);
  priceLists = pl.data || []; products = pr.data || []; packSizes = ps.data || []; allShades = sh.data || [];
}

async function loadGroupsFor(listId, productId) {
  const { data: gs, error } = await supabase.from('price_groups')
    .select('*').eq('price_list_id', listId).eq('product_id', productId).order('sort_order');
  if (error) throw error;
  groups = gs || [];
  shadesByGroup = {}; pricesByGroup = {};
  if (!groups.length) return;
  const groupIds = groups.map(g => g.id);
  const [{ data: gshades }, { data: prices }] = await Promise.all([
    supabase.from('price_group_shades').select('price_group_id,shade_id').in('price_group_id', groupIds),
    supabase.from('prices').select('*').in('price_group_id', groupIds),
  ]);
  (gshades || []).forEach(r => { (shadesByGroup[r.price_group_id] ||= new Set()).add(r.shade_id); });
  (prices || []).forEach(r => { (pricesByGroup[r.price_group_id] ||= {})[r.pack_size_id] = r; });
}

export async function renderPriceList(container) {
  try {
    await loadStatics();
  } catch (err) {
    toastError(err, 'Could not load Price List');
    container.innerHTML = `<div class="empty-state">Could not load price list data.</div>`;
    return;
  }
  currentListId = priceLists[0]?.id || null;
  currentProductId = products[0]?.id || null;

  async function paint() {
    const admin = isAdmin();
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">Price List</h2><p class="section-sub">Price bands and pack rates by product</p></div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div class="form-grid">
          <div class="form-field">
            <label class="form-label">Price List</label>
            <select class="form-select" id="pl-list">${priceLists.map(p => `<option value="${p.id}" ${p.id === currentListId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select>
          </div>
          <div class="form-field">
            <label class="form-label">Product</label>
            <select class="form-select" id="pl-product">${products.map(p => `<option value="${p.id}" ${p.id === currentProductId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select>
          </div>
        </div>
      </div>
      <div id="pl-groups-wrap"></div>
      ${admin ? `<button class="btn btn-outline" id="pl-add-group" style="margin-top:12px;">+ Add price group</button>` : ''}
    `;
    document.getElementById('pl-list').addEventListener('change', async (e) => { currentListId = e.target.value; await refreshGroups(); });
    document.getElementById('pl-product').addEventListener('change', async (e) => { currentProductId = e.target.value; await refreshGroups(); });
    document.getElementById('pl-add-group')?.addEventListener('click', addGroup);
    await refreshGroups();
  }

  async function refreshGroups() {
    const wrap = document.getElementById('pl-groups-wrap');
    wrap.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Loading…</div>`;
    try {
      await loadGroupsFor(currentListId, currentProductId);
    } catch (err) {
      toastError(err, 'Could not load price groups');
      wrap.innerHTML = `<div class="empty-state">Could not load price groups.</div>`;
      return;
    }
    wrap.innerHTML = groupsHtml();
    wireGroupRows();
  }

  function groupsHtml() {
    const admin = isAdmin();
    if (!groups.length) return `<div class="empty-state">No price groups for this product yet.${admin ? ' Click "Add price group" to create one.' : ''}</div>`;
    return groups.map(g => {
      const shadeSet = shadesByGroup[g.id] || new Set();
      const shadeNames = allShades.filter(s => shadeSet.has(s.id)).map(s => s.name);
      const shadeLabel = shadeNames.length ? escapeHtml(shadeNames.slice(0, 4).join(', ')) + (shadeNames.length > 4 ? ` <span class="badge badge-gray">+${shadeNames.length - 4}</span>` : '') : '<span class="text-muted">All / unspecified</span>';
      const priceCells = packSizes.map(ps => {
        const existing = (pricesByGroup[g.id] || {})[ps.id];
        const val = existing && existing.price !== null && existing.price !== undefined ? existing.price : '';
        return `<td style="min-width:90px;">
          <input class="form-input price-cell" data-group="${g.id}" data-pack="${ps.id}" type="number" step="0.01"
            value="${val}" placeholder="—" ${admin ? '' : 'disabled'} style="padding:6px 8px;font-size:12.5px;">
        </td>`;
      }).join('');
      return `
        <div class="card" style="margin-bottom:14px;">
          <div class="flex-between" style="margin-bottom:10px;">
            <div>
              <strong>${escapeHtml(g.label)}</strong> <span class="badge badge-saffron">${escapeHtml(g.code)}</span>
              <div class="text-muted" style="font-size:12px;margin-top:4px;">Shades: ${shadeLabel}</div>
            </div>
            ${admin ? `<button class="btn btn-outline btn-sm" data-manage-shades="${g.id}">Manage shades</button>` : ''}
          </div>
          <div class="table-scroll" style="max-height:none;">
            <table class="erp-table">
              <thead><tr>${packSizes.map(ps => `<th style="min-width:90px;">${escapeHtml(ps.label)}</th>`).join('')}</tr></thead>
              <tbody><tr>${priceCells}</tr></tbody>
            </table>
          </div>
        </div>`;
    }).join('');
  }

  function wireGroupRows() {
    container.querySelectorAll('.price-cell').forEach(input => {
      input.addEventListener('change', debounce(() => savePrice(input), 250));
    });
    container.querySelectorAll('[data-manage-shades]').forEach(b => b.addEventListener('click', () => manageShades(b.dataset.manageShades)));
  }

  async function savePrice(input) {
    const groupId = input.dataset.group, packId = input.dataset.pack;
    const raw = input.value;
    const price = raw === '' ? null : Number(raw);
    try {
      const { error } = await supabase.from('prices')
        .upsert({ price_group_id: groupId, pack_size_id: packId, price }, { onConflict: 'price_group_id,pack_size_id' });
      if (error) throw error;
      toast('Price saved', 'success');
    } catch (err) {
      toastError(err, 'Could not save price');
    }
  }

  async function addGroup() {
    openModal({
      title: 'Add price group',
      bodyHtml: `
        <div class="form-grid">
          <div class="form-field"><label class="form-label">Code <span class="req">*</span></label><input class="form-input" id="pg-code" placeholder="I, A, OTHER…"></div>
          <div class="form-field"><label class="form-label">Label <span class="req">*</span></label><input class="form-input" id="pg-label" placeholder="Group I"></div>
        </div>`,
      footHtml: `<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Add</button>`,
    });
    document.querySelector('[data-cancel]').addEventListener('click', closeModal);
    document.querySelector('[data-save]').addEventListener('click', async () => {
      const code = document.getElementById('pg-code').value.trim();
      const label = document.getElementById('pg-label').value.trim();
      if (!code || !label) { toast('Code and label are required', 'error'); return; }
      try {
        const { error } = await supabase.from('price_groups').insert({
          price_list_id: currentListId, product_id: currentProductId, code, label,
        });
        if (error) throw error;
        toast('Price group added', 'success');
        closeModal();
        await refreshGroups();
      } catch (err) {
        toastError(err, 'Could not add price group');
      }
    });
  }

  async function manageShades(groupId) {
    const linked = shadesByGroup[groupId] || new Set();
    const body = `<div style="max-height:360px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">
      ${allShades.map(s => `
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
          <input type="checkbox" data-sid="${s.id}" ${linked.has(s.id) ? 'checked' : ''} style="width:16px;height:16px;">
          ${escapeHtml(s.name)}
        </label>`).join('')}
    </div>`;
    openModal({
      title: 'Shades in this price group',
      bodyHtml: body,
      wide: true,
      footHtml: `<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save</button>`,
    });
    document.querySelector('[data-cancel]').addEventListener('click', closeModal);
    document.querySelector('[data-save]').addEventListener('click', async () => {
      const checked = Array.from(document.querySelectorAll('[data-sid]')).filter(c => c.checked).map(c => c.dataset.sid);
      try {
        await supabase.from('price_group_shades').delete().eq('price_group_id', groupId);
        if (checked.length) {
          const rows = checked.map(sid => ({ price_group_id: groupId, shade_id: sid }));
          const { error } = await supabase.from('price_group_shades').insert(rows);
          if (error) throw error;
        }
        toast('Shades saved', 'success');
        closeModal();
        await refreshGroups();
      } catch (err) {
        toastError(err, 'Could not save shades');
      }
    });
  }

  await paint();
}
