// SP Sales Report — registered PI value by salesperson, over a date
// range, with growth vs the previous period and a per-salesperson
// top-products drill-down.
import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, fmtNum, toastError, emptyRow, openModal, closeModal } from '../ui.js';
import { rangeCardHtml, wireRangeCard, enableExportButton, monthStartIso, todayIso, previousPeriod, pctChange, trendHtml, rangeLabel } from '../reportRange.js';

export async function renderSalespersonReport(container) {
  paint();

  function paint() {
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">SP Sales Report</h2><p class="section-sub">Registered PI value by salesperson, over a date range</p></div>
      </div>
      ${rangeCardHtml('sr', monthStartIso(), todayIso(), { compare: true })}
      <div id="sr-result"><div class="empty-state">Pick a date range and click "Run report".</div></div>
    `;
    wireRangeCard(container, 'sr', run);
  }

  async function fetchBySp(from, to) {
    const { data, error } = await supabase
      .from('proforma_invoices')
      .select('id,salespeople(name),pi_lines(product_text,litres,total_value)')
      .gte('pi_date', from).lte('pi_date', to);
    if (error) throw error;
    const bySp = {};
    (data || []).forEach(pi => {
      const name = pi.salespeople?.name || 'Unassigned';
      const lines = pi.pi_lines || [];
      const value = lines.reduce((s, l) => s + Number(l.total_value || 0), 0);
      const litres = lines.reduce((s, l) => s + Number(l.litres || 0), 0);
      if (!bySp[name]) bySp[name] = { pis: 0, value: 0, litres: 0, byProduct: {} };
      bySp[name].pis += 1;
      bySp[name].value += value;
      bySp[name].litres += litres;
      lines.forEach(l => {
        const pKey = l.product_text || '—';
        if (!bySp[name].byProduct[pKey]) bySp[name].byProduct[pKey] = { litres: 0, value: 0 };
        bySp[name].byProduct[pKey].litres += Number(l.litres || 0);
        bySp[name].byProduct[pKey].value += Number(l.total_value || 0);
      });
    });
    return bySp;
  }

  async function run(from, to, compare) {
    const resultEl = document.getElementById('sr-result');
    resultEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Running…</div>`;
    try {
      const prev = previousPeriod(from, to);
      const [bySp, prevBySp] = await Promise.all([
        fetchBySp(from, to),
        compare ? fetchBySp(prev.from, prev.to) : Promise.resolve(null),
      ]);
      const rows = Object.entries(bySp).sort((a, b) => b[1].value - a[1].value);
      const grandTotal = rows.reduce((s, [, r]) => s + r.value, 0);

      resultEl.innerHTML = `
        <p class="text-muted" style="margin:-4px 0 14px;font-size:12.5px;">${rangeLabel(from, to)}${compare ? ` &nbsp;vs&nbsp; ${rangeLabel(prev.from, prev.to)}` : ''}</p>
        <div class="table-wrap">
          <div class="table-toolbar"><strong>By salesperson</strong><span class="text-muted">Total: ${fmtMoney(grandTotal)} — click a row for top products</span></div>
          <table class="erp-table"><thead><tr><th>Salesperson</th><th>PIs</th><th>Litres</th><th>Value</th><th>Avg PI Value</th><th>Share</th>${compare ? '<th>vs prev.</th>' : ''}</tr></thead>
          <tbody id="sr-tbody">${rows.map(([name, r]) => {
            const avg = r.pis > 0 ? r.value / r.pis : 0;
            const prevVal = prevBySp ? prevBySp[name]?.value : null;
            return `<tr class="clickable-row" data-sp="${escapeHtml(name)}">
              <td>${escapeHtml(name)}</td><td>${fmtNum(r.pis, 0)}</td><td>${fmtNum(r.litres)}</td><td>${fmtMoney(r.value)}</td><td>${fmtMoney(avg)}</td>
              <td>${grandTotal > 0 ? fmtNum(r.value / grandTotal * 100, 1) : '0'}%</td>
              ${compare ? `<td>${trendHtml(pctChange(r.value, prevVal))}</td>` : ''}
            </tr>`;
          }).join('') || emptyRow(compare ? 7 : 6, 'No PIs in this range.')}</tbody></table>
        </div>`;

      container.querySelectorAll('[data-sp]').forEach(tr => {
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => showTopProducts(tr.dataset.sp, bySp[tr.dataset.sp]));
      });

      enableExportButton(container, 'sr', () => ({
        filename: `SP-Sales-Report_${from}_to_${to}.xlsx`,
        sheets: [
          { name: 'By Salesperson', headers: ['Salesperson', 'PIs', 'Litres', 'Value', 'Avg PI Value', 'Share %'], rows: rows.map(([name, r]) => [name, r.pis, r.litres, r.value, r.pis > 0 ? r.value / r.pis : 0, grandTotal > 0 ? r.value / grandTotal * 100 : 0]) },
        ],
      }));
    } catch (err) {
      toastError(err, 'Could not run report');
      resultEl.innerHTML = `<div class="empty-state">Could not run report.</div>`;
    }
  }

  function showTopProducts(name, r) {
    const rows = Object.entries(r.byProduct).sort((a, b) => b[1].value - a[1].value).slice(0, 10);
    openModal({
      title: `${name} — top products`,
      bodyHtml: `
        <table class="erp-table"><thead><tr><th>Product</th><th>Litres</th><th>Value</th></tr></thead>
        <tbody>${rows.map(([p, v]) => `<tr><td>${escapeHtml(p)}</td><td>${fmtNum(v.litres)}</td><td>${fmtMoney(v.value)}</td></tr>`).join('') || emptyRow(3, 'No lines.')}</tbody></table>`,
      footHtml: `<button class="btn btn-outline" data-cancel>Close</button>`,
    });
    document.querySelector('[data-cancel]').addEventListener('click', closeModal);
  }
}
