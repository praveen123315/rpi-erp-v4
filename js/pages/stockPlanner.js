// Stock Planner — aggregates demand from open (not-yet-registered) order
// lines automatically, then explodes it through BOM recipes via the same
// rm_requirement() RPC RM Planning uses, so production can see what raw
// material the orders already on the books will need.
import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, fmtNum, toastError } from '../ui.js';

export async function renderStockPlanner(container) {
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Loading open demand…</div>`;
  try {
    await run();
  } catch (err) {
    toastError(err, 'Could not load Stock Planner');
    container.innerHTML = `<div class="empty-state">Could not load stock planner.</div>`;
  }

  async function run() {
    const { data: lines, error } = await supabase
      .from('order_lines')
      .select('product_id, product_text, qty')
      .is('pi_line_id', null);
    if (error) throw error;

    const demandByProduct = {};
    (lines || []).forEach(l => {
      if (!l.product_id) return;
      const key = l.product_id;
      if (!demandByProduct[key]) demandByProduct[key] = { name: l.product_text, qty: 0 };
      demandByProduct[key].qty += Number(l.qty || 0);
    });
    const demandEntries = Object.entries(demandByProduct);

    if (!demandEntries.length) {
      container.innerHTML = `
        <div class="page-head"><div><h2 class="section-heading">Stock Planner</h2><p class="section-sub">Raw-material requirement for all open (unregistered) orders</p></div></div>
        <div class="empty-state">No open order lines right now — everything on the books has been registered to a PI.</div>`;
      return;
    }

    const payload = demandEntries.map(([product_id, d]) => ({ product_id, qty: d.qty }));
    const { data: req, error: rErr } = await supabase.rpc('rm_requirement', { p_demand: payload });
    if (rErr) throw rErr;
    const rows = req || [];
    const totalCost = rows.reduce((s, r) => s + Number(r.est_cost || 0), 0);

    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">Stock Planner</h2><p class="section-sub">Raw-material requirement for ${demandEntries.length} product${demandEntries.length === 1 ? '' : 's'} with open orders</p></div>
        <button class="btn btn-outline" id="sp-refresh">Refresh</button>
      </div>
      <div class="table-wrap" style="margin-bottom:16px;">
        <div class="table-toolbar"><strong>Open demand by product</strong></div>
        <table class="erp-table"><thead><tr><th>Product</th><th>Qty (pieces/litres)</th></tr></thead>
        <tbody>${demandEntries.map(([, d]) => `<tr><td>${escapeHtml(d.name)}</td><td>${fmtNum(d.qty)}</td></tr>`).join('')}</tbody></table>
      </div>
      <div class="table-wrap">
        <div class="table-toolbar"><strong>Raw material required</strong></div>
        <table class="erp-table"><thead><tr><th>Code</th><th>Name</th><th>Qty</th><th>Unit</th><th>Est. Cost</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td class="mono">${escapeHtml(r.rm_code)}</td><td>${escapeHtml(r.rm_name)}</td><td>${fmtNum(r.qty, 3)}</td><td>${escapeHtml(r.unit || '')}</td><td>${fmtMoney(r.est_cost)}</td></tr>`).join('') || `<tr><td colspan="5" class="empty-state">No BOM recipes found for the products on open orders. Add recipes in BOM Recipes.</td></tr>`}</tbody></table>
      </div>
      <div class="stat-card" style="margin-top:14px;max-width:260px;"><div class="stat-label">Total estimated RM cost</div><div class="stat-number">${fmtMoney(totalCost)}</div></div>
    `;
    document.getElementById('sp-refresh').addEventListener('click', async () => {
      container.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Refreshing…</div>`;
      try { await run(); } catch (err) { toastError(err, 'Could not refresh'); }
    });
  }
}
