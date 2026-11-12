// Costing Master — saved costings, read-mostly with a detail view.
import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, fmtNum, fmtDate, toastError, openModal, closeModal, filterRows, emptyRow, debounce } from '../ui.js';

let costings = [];

async function loadCostings() {
  const { data, error } = await supabase.from('costings').select('*, products(name)').order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  return data || [];
}

export async function renderCostingMaster(container) {
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Loading…</div>`;
  try {
    costings = await loadCostings();
  } catch (err) {
    toastError(err, 'Could not load Costing Master');
    container.innerHTML = `<div class="empty-state">Could not load costings.</div>`;
    return;
  }
  paint();

  function paint() {
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">Costing Master</h2><p class="section-sub">${costings.length} saved costing${costings.length === 1 ? '' : 's'}</p></div>
      </div>
      <div class="table-wrap">
        <div class="table-toolbar"><div class="search-box"><input class="form-input" id="cm-search" placeholder="Search product or shade…"></div></div>
        <div class="table-scroll">
          <table class="erp-table">
            <thead><tr><th>Product</th><th>Shade</th><th>Version</th><th>Date</th><th>Total Cost</th><th>Per Litre</th><th></th></tr></thead>
            <tbody id="cm-tbody">${rowsHtml(costings)}</tbody>
          </table>
        </div>
      </div>`;
    document.getElementById('cm-search').addEventListener('input', debounce((e) => {
      const filtered = filterRows(costings, e.target.value, ['product_name', 'shade_text', 'version']);
      document.getElementById('cm-tbody').innerHTML = rowsHtml(filtered);
      wireRows();
    }, 200));
    wireRows();
  }

  function rowsHtml(rows) {
    if (!rows.length) return emptyRow(7, 'No costings yet. Build one in Formulation Costing.');
    return rows.map(c => `
      <tr>
        <td>${escapeHtml(c.products?.name || c.product_name || '—')}</td>
        <td>${escapeHtml(c.shade_text || '—')}</td>
        <td>${escapeHtml(c.version || '—')}</td>
        <td>${fmtDate(c.costing_date)}</td>
        <td>${fmtMoney(c.total_cost)}</td>
        <td>${fmtMoney(c.per_litre_cost, 4)}</td>
        <td><button class="btn btn-outline btn-sm" data-view="${c.id}">View</button></td>
      </tr>`).join('');
  }

  function wireRows() {
    container.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => viewCosting(b.dataset.view)));
  }

  async function viewCosting(id) {
    const c = costings.find(x => x.id === id);
    const [{ data: rmRows }, { data: packs }] = await Promise.all([
      supabase.from('costing_rm_rows').select('*').eq('costing_id', id).order('line_no'),
      supabase.from('costing_pack_costs').select('*, pack_sizes(label)').eq('costing_id', id),
    ]);
    const body = `
      <div class="stat-grid" style="margin-bottom:16px;">
        <div class="stat-card"><div class="stat-number">${fmtMoney(c.total_rm_cost)}</div><div class="stat-label">RM Cost</div></div>
        <div class="stat-card"><div class="stat-number">${fmtMoney(c.mfg_cost)}</div><div class="stat-label">Mfg Cost</div></div>
        <div class="stat-card"><div class="stat-number">${fmtMoney(c.total_cost)}</div><div class="stat-label">Total Cost</div></div>
        <div class="stat-card"><div class="stat-number">${fmtNum(c.total_litres)}</div><div class="stat-label">Litres</div></div>
      </div>
      <div class="table-wrap" style="margin-bottom:14px;">
        <div class="table-toolbar"><strong>Raw materials</strong></div>
        <table class="erp-table"><thead><tr><th>Code</th><th>Name</th><th>Rate</th><th>Qty</th><th>Amount</th></tr></thead>
        <tbody>${(rmRows || []).map(r => `<tr><td class="mono">${escapeHtml(r.rm_code)}</td><td>${escapeHtml(r.rm_name)}</td><td>${fmtMoney(r.price_per_kg, 4)}</td><td>${fmtNum(r.qty_kg, 3)}</td><td>${fmtMoney(r.amount)}</td></tr>`).join('') || emptyRow(5, 'No RM rows.')}</tbody></table>
      </div>
      <div class="table-wrap">
        <div class="table-toolbar"><strong>Pack costs</strong></div>
        <table class="erp-table"><thead><tr><th>Pack</th><th>Final Cost</th><th>Selling Price</th><th>Profit %</th></tr></thead>
        <tbody>${(packs || []).map(p => `<tr><td>${escapeHtml(p.pack_sizes?.label || '')}</td><td>${fmtMoney(p.final_pack_cost)}</td><td>${fmtMoney(p.selling_price)}</td><td>${fmtNum(p.profit_pct, 1)}%</td></tr>`).join('') || emptyRow(4, 'No pack costs.')}</tbody></table>
      </div>`;
    openModal({ title: `${c.products?.name || c.product_name} — ${c.shade_text || ''}`, bodyHtml: body, wide: true, footHtml: `<button class="btn btn-outline" data-cancel>Close</button>` });
    document.querySelector('[data-cancel]').addEventListener('click', closeModal);
  }
}
