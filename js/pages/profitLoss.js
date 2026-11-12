// P&L Dashboard — company-wide revenue vs. estimated cost, over a date
// range. Cost is estimated by matching each sold line's product to its
// most recent Formulation Costing (per_litre_cost x litres sold); lines
// for a product with no saved costing are counted as revenue only, and
// the dashboard says plainly how much of revenue has matched cost data
// rather than silently estimating a margin from partial coverage.
import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, fmtNum, toastError, emptyRow } from '../ui.js';

function monthStart() { return new Date().toISOString().slice(0, 7) + '-01'; }
function today() { return new Date().toISOString().slice(0, 10); }

export async function renderProfitLoss(container) {
  paint();

  function paint() {
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">P&L Dashboard</h2><p class="section-sub">Revenue vs. estimated cost, matched against saved costings</p></div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div class="form-grid">
          <div class="form-field"><label class="form-label">From</label><input class="form-input" type="date" id="pl-from" value="${monthStart()}"></div>
          <div class="form-field"><label class="form-label">To</label><input class="form-input" type="date" id="pl-to" value="${today()}"></div>
          <div class="form-field" style="justify-content:flex-end;flex-direction:row;align-items:flex-end;"><button class="btn btn-primary" id="pl-run">Run report</button></div>
        </div>
      </div>
      <div id="pl-result"><div class="empty-state">Pick a date range and click "Run report".</div></div>
    `;
    document.getElementById('pl-run').addEventListener('click', run);
  }

  async function run() {
    const from = document.getElementById('pl-from').value;
    const to = document.getElementById('pl-to').value;
    const resultEl = document.getElementById('pl-result');
    resultEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Running…</div>`;
    try {
      const [{ data: pis, error: e1 }, { data: costings, error: e2 }] = await Promise.all([
        supabase.from('proforma_invoices').select('id,pi_lines(product_text,litres,total_value)').gte('pi_date', from).lte('pi_date', to),
        supabase.from('costings').select('product_name,per_litre_cost,updated_at').order('updated_at', { ascending: false }),
      ]);
      if (e1) throw e1; if (e2) throw e2;

      const latestCostByProduct = {};
      (costings || []).forEach(c => {
        const key = (c.product_name || '').trim().toLowerCase();
        if (key && !(key in latestCostByProduct)) latestCostByProduct[key] = Number(c.per_litre_cost || 0);
      });

      let totalRevenue = 0, matchedRevenue = 0, estimatedCost = 0;
      const byProduct = {};
      (pis || []).forEach(pi => {
        (pi.pi_lines || []).forEach(l => {
          const value = Number(l.total_value || 0);
          totalRevenue += value;
          const key = (l.product_text || '').trim().toLowerCase();
          const costPerLitre = latestCostByProduct[key];
          const hasCost = costPerLitre !== undefined;
          const cost = hasCost ? costPerLitre * Number(l.litres || 0) : 0;
          if (hasCost) { matchedRevenue += value; estimatedCost += cost; }
          if (!byProduct[l.product_text || '—']) byProduct[l.product_text || '—'] = { revenue: 0, cost: 0, hasCost };
          byProduct[l.product_text || '—'].revenue += value;
          byProduct[l.product_text || '—'].cost += cost;
          byProduct[l.product_text || '—'].hasCost = hasCost;
        });
      });
      const coveragePct = totalRevenue > 0 ? (matchedRevenue / totalRevenue) * 100 : 0;
      const grossMargin = matchedRevenue - estimatedCost;
      const marginPct = matchedRevenue > 0 ? (grossMargin / matchedRevenue) * 100 : 0;
      const rows = Object.entries(byProduct).sort((a, b) => b[1].revenue - a[1].revenue);

      resultEl.innerHTML = `
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-number">${fmtMoney(totalRevenue)}</div><div class="stat-label">Total Revenue</div></div>
          <div class="stat-card"><div class="stat-number">${fmtMoney(estimatedCost)}</div><div class="stat-label">Estimated Cost (matched)</div></div>
          <div class="stat-card"><div class="stat-number" style="color:var(--green-accent);">${fmtMoney(grossMargin)}</div><div class="stat-label">Estimated Gross Margin</div></div>
          <div class="stat-card"><div class="stat-number">${fmtNum(marginPct, 1)}%</div><div class="stat-label">Margin % (on matched revenue)</div></div>
          <div class="stat-card"><div class="stat-number">${fmtNum(coveragePct, 1)}%</div><div class="stat-label">Revenue with cost data</div></div>
        </div>
        <div class="table-wrap">
          <div class="table-toolbar"><strong>By product</strong></div>
          <table class="erp-table"><thead><tr><th>Product</th><th>Revenue</th><th>Est. Cost</th><th>Margin</th><th>Cost data?</th></tr></thead>
          <tbody>${rows.map(([name, r]) => `<tr>
            <td>${escapeHtml(name)}</td><td>${fmtMoney(r.revenue)}</td><td>${r.hasCost ? fmtMoney(r.cost) : '<span class="text-muted">—</span>'}</td>
            <td>${r.hasCost ? fmtMoney(r.revenue - r.cost) : '<span class="text-muted">—</span>'}</td>
            <td>${r.hasCost ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-gray">No costing</span>'}</td>
          </tr>`).join('') || emptyRow(5, 'No sales in this range.')}</tbody></table>
        </div>`;
    } catch (err) {
      toastError(err, 'Could not run P&L report');
      resultEl.innerHTML = `<div class="empty-state">Could not run report.</div>`;
    }
  }
}
