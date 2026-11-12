// Reports — sales summary over a date range: totals, by-product and
// by-pack breakdowns, drawn from registered PI lines (actuals).
import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, fmtNum, toastError, emptyRow } from '../ui.js';
import { rangeCardHtml, wireRangeCard, enableExportButton, monthStartIso, todayIso, previousPeriod, pctChange, trendHtml, rangeLabel } from '../reportRange.js';

export async function renderReports(container) {
  paint();

  function paint() {
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">Reports</h2><p class="section-sub">Sales summary from registered PIs, by date range</p></div>
      </div>
      ${rangeCardHtml('rp', monthStartIso(), todayIso(), { compare: true })}
      <div id="rp-result"><div class="empty-state">Pick a date range and click "Run report".</div></div>
    `;
    wireRangeCard(container, 'rp', run);
  }

  async function fetchTotals(from, to) {
    const { data: pis, error } = await supabase
      .from('proforma_invoices')
      .select('id,pi_lines(product_text,pack_text,pcs,litres,total_value)')
      .gte('pi_date', from).lte('pi_date', to);
    if (error) throw error;

    let totalValue = 0, totalLitres = 0, totalPcs = 0;
    const byProduct = {}, byPack = {};
    (pis || []).forEach(pi => {
      (pi.pi_lines || []).forEach(l => {
        const value = Number(l.total_value || 0), litres = Number(l.litres || 0), pcs = Number(l.pcs || 0);
        totalValue += value; totalLitres += litres; totalPcs += pcs;

        const pKey = l.product_text || '—';
        if (!byProduct[pKey]) byProduct[pKey] = { pcs: 0, litres: 0, value: 0 };
        byProduct[pKey].pcs += pcs; byProduct[pKey].litres += litres; byProduct[pKey].value += value;

        const packKey = l.pack_text || '—';
        if (!byPack[packKey]) byPack[packKey] = { pcs: 0, litres: 0, value: 0 };
        byPack[packKey].pcs += pcs; byPack[packKey].litres += litres; byPack[packKey].value += value;
      });
    });
    return { piCount: pis?.length || 0, totalValue, totalLitres, totalPcs, byProduct, byPack };
  }

  async function run(from, to, compare) {
    const resultEl = document.getElementById('rp-result');
    resultEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Running…</div>`;
    try {
      const prev = previousPeriod(from, to);
      const [curr, prevData] = await Promise.all([
        fetchTotals(from, to),
        compare ? fetchTotals(prev.from, prev.to) : Promise.resolve(null),
      ]);

      const avgPi = curr.piCount > 0 ? curr.totalValue / curr.piCount : 0;
      const prevAvgPi = prevData && prevData.piCount > 0 ? prevData.totalValue / prevData.piCount : null;

      const productRows = Object.entries(curr.byProduct).sort((a, b) => b[1].value - a[1].value);
      const packRows = Object.entries(curr.byPack).sort((a, b) => b[1].value - a[1].value);

      resultEl.innerHTML = `
        <p class="text-muted" style="margin:-4px 0 14px;font-size:12.5px;">${rangeLabel(from, to)}${compare ? ` &nbsp;vs&nbsp; ${rangeLabel(prev.from, prev.to)}` : ''}</p>
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-number">${curr.piCount}${compare ? trendHtml(pctChange(curr.piCount, prevData?.piCount)) : ''}</div><div class="stat-label">PIs in range</div></div>
          <div class="stat-card"><div class="stat-number">${fmtMoney(curr.totalValue)}${compare ? trendHtml(pctChange(curr.totalValue, prevData?.totalValue)) : ''}</div><div class="stat-label">Total Sales Value</div></div>
          <div class="stat-card"><div class="stat-number">${fmtNum(curr.totalLitres)}${compare ? trendHtml(pctChange(curr.totalLitres, prevData?.totalLitres)) : ''}</div><div class="stat-label">Total Litres</div></div>
          <div class="stat-card"><div class="stat-number">${fmtNum(curr.totalPcs, 0)}${compare ? trendHtml(pctChange(curr.totalPcs, prevData?.totalPcs)) : ''}</div><div class="stat-label">Total Pieces</div></div>
          <div class="stat-card"><div class="stat-number">${fmtMoney(avgPi)}${compare ? trendHtml(pctChange(avgPi, prevAvgPi)) : ''}</div><div class="stat-label">Avg PI Value</div></div>
        </div>
        <div class="table-wrap" style="margin-bottom:16px;">
          <div class="table-toolbar"><strong>By product</strong></div>
          <table class="erp-table"><thead><tr><th>Product</th><th>Pieces</th><th>Litres</th><th>Value</th><th>% of total</th></tr></thead>
          <tbody>${productRows.map(([name, r]) => `<tr><td>${escapeHtml(name)}</td><td>${fmtNum(r.pcs, 0)}</td><td>${fmtNum(r.litres)}</td><td>${fmtMoney(r.value)}</td><td>${curr.totalValue > 0 ? fmtNum(r.value / curr.totalValue * 100, 1) : '0'}%</td></tr>`).join('') || emptyRow(5, 'No sales in this range.')}</tbody></table>
        </div>
        <div class="table-wrap">
          <div class="table-toolbar"><strong>By pack size</strong></div>
          <table class="erp-table"><thead><tr><th>Pack</th><th>Pieces</th><th>Litres</th><th>Value</th></tr></thead>
          <tbody>${packRows.map(([name, r]) => `<tr><td>${escapeHtml(name)}</td><td>${fmtNum(r.pcs, 0)}</td><td>${fmtNum(r.litres)}</td><td>${fmtMoney(r.value)}</td></tr>`).join('') || emptyRow(4, 'No sales in this range.')}</tbody></table>
        </div>`;

      enableExportButton(container, 'rp', () => ({
        filename: `Sales-Report_${from}_to_${to}.xlsx`,
        sheets: [
          { name: 'Summary', headers: ['Metric', 'Value'], rows: [
            ['Date range', rangeLabel(from, to)],
            ['PIs in range', curr.piCount],
            ['Total Sales Value', curr.totalValue],
            ['Total Litres', curr.totalLitres],
            ['Total Pieces', curr.totalPcs],
            ['Avg PI Value', avgPi],
          ] },
          { name: 'By Product', headers: ['Product', 'Pieces', 'Litres', 'Value', '% of Total'], rows: productRows.map(([name, r]) => [name, r.pcs, r.litres, r.value, curr.totalValue > 0 ? r.value / curr.totalValue * 100 : 0]) },
          { name: 'By Pack Size', headers: ['Pack', 'Pieces', 'Litres', 'Value'], rows: packRows.map(([name, r]) => [name, r.pcs, r.litres, r.value]) },
        ],
      }));
    } catch (err) {
      toastError(err, 'Could not run report');
      resultEl.innerHTML = `<div class="empty-state">Could not run report.</div>`;
    }
  }
}
