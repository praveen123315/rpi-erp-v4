// P&L Dashboard — company-wide revenue vs. estimated cost, over a date
// range. Cost is estimated by matching each sold line's product to its
// most recent Formulation Costing (per_litre_cost x litres sold); lines
// for a product with no saved costing are counted as revenue only, and
// the dashboard says plainly how much of revenue has matched cost data
// rather than silently estimating a margin from partial coverage.
import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, fmtNum, toastError, emptyRow } from '../ui.js';
import { rangeCardHtml, wireRangeCard, enableExportButton, monthStartIso, todayIso, previousPeriod, pctChange, trendHtml, rangeLabel } from '../reportRange.js';

export async function renderProfitLoss(container) {
  paint();

  function paint() {
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">P&L Dashboard</h2><p class="section-sub">Revenue vs. estimated cost, matched against saved costings</p></div>
      </div>
      ${rangeCardHtml('pl', monthStartIso(), todayIso(), { compare: true })}
      <div id="pl-result"><div class="empty-state">Pick a date range and click "Run report".</div></div>
    `;
    wireRangeCard(container, 'pl', run);
  }

  async function fetchPL(from, to, latestCostByProduct) {
    const { data: pis, error } = await supabase
      .from('proforma_invoices').select('id,pi_lines(product_text,litres,total_value)')
      .gte('pi_date', from).lte('pi_date', to);
    if (error) throw error;

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
        const pName = l.product_text || '—';
        if (!byProduct[pName]) byProduct[pName] = { revenue: 0, cost: 0, hasCost };
        byProduct[pName].revenue += value;
        byProduct[pName].cost += cost;
        byProduct[pName].hasCost = hasCost;
      });
    });
    const grossMargin = matchedRevenue - estimatedCost;
    return { totalRevenue, matchedRevenue, estimatedCost, grossMargin, byProduct };
  }

  async function run(from, to, compare) {
    const resultEl = document.getElementById('pl-result');
    resultEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Running…</div>`;
    try {
      const { data: costings, error: e2 } = await supabase.from('costings').select('product_name,per_litre_cost,updated_at').order('updated_at', { ascending: false });
      if (e2) throw e2;
      const latestCostByProduct = {};
      (costings || []).forEach(c => {
        const key = (c.product_name || '').trim().toLowerCase();
        if (key && !(key in latestCostByProduct)) latestCostByProduct[key] = Number(c.per_litre_cost || 0);
      });

      const prev = previousPeriod(from, to);
      const [curr, prevData] = await Promise.all([
        fetchPL(from, to, latestCostByProduct),
        compare ? fetchPL(prev.from, prev.to, latestCostByProduct) : Promise.resolve(null),
      ]);

      const coveragePct = curr.totalRevenue > 0 ? (curr.matchedRevenue / curr.totalRevenue) * 100 : 0;
      const marginPct = curr.matchedRevenue > 0 ? (curr.grossMargin / curr.matchedRevenue) * 100 : 0;
      const rows = Object.entries(curr.byProduct).sort((a, b) => b[1].revenue - a[1].revenue);
      const missingCosting = rows.filter(([, r]) => !r.hasCost).sort((a, b) => b[1].revenue - a[1].revenue);

      resultEl.innerHTML = `
        <p class="text-muted" style="margin:-4px 0 14px;font-size:12.5px;">${rangeLabel(from, to)}${compare ? ` &nbsp;vs&nbsp; ${rangeLabel(prev.from, prev.to)}` : ''}</p>
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-number">${fmtMoney(curr.totalRevenue)}${compare ? trendHtml(pctChange(curr.totalRevenue, prevData?.totalRevenue)) : ''}</div><div class="stat-label">Total Revenue</div></div>
          <div class="stat-card"><div class="stat-number">${fmtMoney(curr.estimatedCost)}${compare ? trendHtml(pctChange(curr.estimatedCost, prevData?.estimatedCost)) : ''}</div><div class="stat-label">Estimated Cost (matched)</div></div>
          <div class="stat-card"><div class="stat-number" style="color:var(--green-accent);">${fmtMoney(curr.grossMargin)}${compare ? trendHtml(pctChange(curr.grossMargin, prevData?.grossMargin)) : ''}</div><div class="stat-label">Estimated Gross Margin</div></div>
          <div class="stat-card"><div class="stat-number">${fmtNum(marginPct, 1)}%</div><div class="stat-label">Margin % (on matched revenue)</div></div>
          <div class="stat-card"><div class="stat-number">${fmtNum(coveragePct, 1)}%</div><div class="stat-label">Revenue with cost data</div></div>
        </div>
        ${missingCosting.length ? `
        <div class="card" style="margin-bottom:16px;border-color:var(--red-accent);">
          <strong>${missingCosting.length} product${missingCosting.length === 1 ? '' : 's'} sold with no saved costing</strong>
          <p class="text-muted" style="font-size:12.5px;margin:4px 0 10px;">₹${fmtNum(missingCosting.reduce((s, [, r]) => s + r.revenue, 0), 0)} of revenue has no matched cost. Build these in Formulation Costing to close the gap, highest revenue first.</p>
          <table class="erp-table"><thead><tr><th>Product</th><th>Revenue (uncosted)</th></tr></thead>
          <tbody>${missingCosting.slice(0, 10).map(([name, r]) => `<tr><td>${escapeHtml(name)}</td><td>${fmtMoney(r.revenue)}</td></tr>`).join('')}</tbody></table>
        </div>` : ''}
        <div class="table-wrap">
          <div class="table-toolbar"><strong>By product</strong></div>
          <table class="erp-table"><thead><tr><th>Product</th><th>Revenue</th><th>Est. Cost</th><th>Margin</th><th>Cost data?</th></tr></thead>
          <tbody>${rows.map(([name, r]) => `<tr>
            <td>${escapeHtml(name)}</td><td>${fmtMoney(r.revenue)}</td><td>${r.hasCost ? fmtMoney(r.cost) : '<span class="text-muted">—</span>'}</td>
            <td>${r.hasCost ? fmtMoney(r.revenue - r.cost) : '<span class="text-muted">—</span>'}</td>
            <td>${r.hasCost ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-gray">No costing</span>'}</td>
          </tr>`).join('') || emptyRow(5, 'No sales in this range.')}</tbody></table>
        </div>`;

      enableExportButton(container, 'pl', () => ({
        filename: `PL-Dashboard_${from}_to_${to}.xlsx`,
        sheets: [
          { name: 'Summary', headers: ['Metric', 'Value'], rows: [
            ['Date range', rangeLabel(from, to)],
            ['Total Revenue', curr.totalRevenue],
            ['Estimated Cost (matched)', curr.estimatedCost],
            ['Estimated Gross Margin', curr.grossMargin],
            ['Margin % (on matched revenue)', marginPct],
            ['Revenue with cost data %', coveragePct],
          ] },
          { name: 'By Product', headers: ['Product', 'Revenue', 'Est. Cost', 'Margin', 'Has Costing'], rows: rows.map(([name, r]) => [name, r.revenue, r.hasCost ? r.cost : '', r.hasCost ? r.revenue - r.cost : '', r.hasCost ? 'Yes' : 'No']) },
          { name: 'Missing Costing', headers: ['Product', 'Revenue (uncosted)'], rows: missingCosting.map(([name, r]) => [name, r.revenue]) },
        ],
      }));
    } catch (err) {
      toastError(err, 'Could not run P&L report');
      resultEl.innerHTML = `<div class="empty-state">Could not run report.</div>`;
    }
  }
}
