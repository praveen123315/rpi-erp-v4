// RM Planning — explode product demand through BOM recipes into raw
// material requirements, via the rm_requirement() RPC. Replaces the old
// broken RM Planning stub that read a pricePerKg field that never existed.
import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, fmtNum, toast, toastError } from '../ui.js';

let products = [];
let demandRows = [{ _key: 1, product_id: '', qty: 0 }];

async function loadProducts() {
  const { data } = await supabase.from('products').select('id,name').eq('is_active', true).order('sort_order');
  products = data || [];
}

export async function renderRmPlanning(container) {
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Loading…</div>`;
  try {
    await loadProducts();
  } catch (err) {
    toastError(err, 'Could not load products');
    container.innerHTML = `<div class="empty-state">Could not load RM planning.</div>`;
    return;
  }
  demandRows = [{ _key: 1, product_id: '', qty: 0 }];
  paint();

  function paint() {
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">RM Planning</h2><p class="section-sub">Raw-material requirement from product demand, exploded through BOM recipes</p></div>
      </div>
      <div class="table-wrap" style="margin-bottom:16px;">
        <div class="table-toolbar"><strong>Demand</strong><button class="btn btn-outline btn-sm" id="rmp-add">+ Add product</button></div>
        <div class="table-scroll" style="max-height:none;">
          <table class="erp-table">
            <thead><tr><th>Product</th><th>Quantity (litres)</th><th></th></tr></thead>
            <tbody id="rmp-demand-body"></tbody>
          </table>
        </div>
      </div>
      <button class="btn btn-primary" id="rmp-calc">Calculate requirement</button>
      <div id="rmp-result" style="margin-top:20px;"></div>
    `;
    document.getElementById('rmp-add').addEventListener('click', () => {
      demandRows.push({ _key: (demandRows.at(-1)?._key || 0) + 1, product_id: '', qty: 0 });
      renderDemand();
    });
    document.getElementById('rmp-calc').addEventListener('click', calculate);
    renderDemand();
  }

  function renderDemand() {
    const tbody = document.getElementById('rmp-demand-body');
    tbody.innerHTML = demandRows.map(r => `
      <tr data-key="${r._key}">
        <td><select class="form-select dm-product" data-k="${r._key}">
          <option value="">— Product —</option>
          ${products.map(p => `<option value="${p.id}" ${p.id === r.product_id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
        </select></td>
        <td><input class="form-input dm-qty" data-k="${r._key}" type="number" step="0.01" value="${r.qty}"></td>
        <td><button class="btn btn-ghost btn-sm dm-remove" data-k="${r._key}">✕</button></td>
      </tr>`).join('');
    tbody.querySelectorAll('.dm-product').forEach(el => el.addEventListener('change', e => {
      demandRows.find(r => String(r._key) === e.target.dataset.k).product_id = e.target.value;
    }));
    tbody.querySelectorAll('.dm-qty').forEach(el => el.addEventListener('input', e => {
      demandRows.find(r => String(r._key) === e.target.dataset.k).qty = Number(e.target.value || 0);
    }));
    tbody.querySelectorAll('.dm-remove').forEach(el => el.addEventListener('click', e => {
      demandRows = demandRows.filter(r => String(r._key) !== e.target.dataset.k);
      if (!demandRows.length) demandRows = [{ _key: 1, product_id: '', qty: 0 }];
      renderDemand();
    }));
  }

  async function calculate() {
    const valid = demandRows.filter(r => r.product_id && Number(r.qty) > 0);
    if (!valid.length) { toast('Add at least one product with a quantity', 'error'); return; }
    const resultEl = document.getElementById('rmp-result');
    resultEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Calculating…</div>`;
    try {
      const payload = valid.map(r => ({ product_id: r.product_id, qty: r.qty }));
      const { data, error } = await supabase.rpc('rm_requirement', { p_demand: payload });
      if (error) throw error;
      const rows = data || [];
      const totalCost = rows.reduce((s, r) => s + Number(r.est_cost || 0), 0);
      resultEl.innerHTML = `
        <div class="table-wrap">
          <div class="table-toolbar"><strong>Requirement</strong><span class="text-muted">${rows.length} raw material${rows.length === 1 ? '' : 's'}</span></div>
          <table class="erp-table">
            <thead><tr><th>Code</th><th>Name</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Est. Cost</th></tr></thead>
            <tbody>
              ${rows.map(r => `<tr>
                <td class="mono">${escapeHtml(r.rm_code)}</td>
                <td>${escapeHtml(r.rm_name)}</td>
                <td>${fmtNum(r.qty, 3)}</td>
                <td>${escapeHtml(r.unit || '')}</td>
                <td>${fmtMoney(r.price, 4)}</td>
                <td>${fmtMoney(r.est_cost)}</td>
              </tr>`).join('') || `<tr><td colspan="6" class="empty-state">No BOM recipe found for the selected product(s). Add one in BOM Recipes first.</td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="stat-card" style="margin-top:14px;max-width:260px;"><div class="stat-label">Total estimated cost</div><div class="stat-number">${fmtMoney(totalCost)}</div></div>
      `;
    } catch (err) {
      toastError(err, 'Could not calculate requirement');
      resultEl.innerHTML = `<div class="empty-state">Could not calculate requirement.</div>`;
    }
  }
}
