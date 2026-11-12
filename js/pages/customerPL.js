// Customer P&L — revenue, order recency and outstanding by customer,
// over a date range. True product-cost-based profit needs a per-sale
// COGS link the schema doesn't carry yet, so this reports revenue,
// outstanding and recency per customer rather than a fabricated margin.
import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, fmtNum, fmtDate, toastError, emptyRow } from '../ui.js';
import { rangeCardHtml, wireRangeCard, enableExportButton, monthStartIso, todayIso, rangeLabel } from '../reportRange.js';

export async function renderCustomerPL(container) {
  let sortBy = 'value'; // 'value' | 'outstanding'
  let lastRows = [];
  let lastFrom = '', lastTo = '';

  paint();

  function paint() {
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">Customer P&L</h2><p class="section-sub">Sales value, order recency and outstanding by customer</p></div>
      </div>
      ${rangeCardHtml('cp', monthStartIso(), todayIso())}
      <div id="cp-result"><div class="empty-state">Pick a date range and click "Run report".</div></div>
    `;
    wireRangeCard(container, 'cp', run);
  }

  async function run(from, to) {
    const resultEl = document.getElementById('cp-result');
    resultEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Running…</div>`;
    try {
      const { data, error } = await supabase
        .from('proforma_invoices')
        .select('id,pi_date,customer_id,customer_name_text,customers(name,outstanding_amount),pi_lines(litres,total_value)')
        .gte('pi_date', from).lte('pi_date', to)
        .order('pi_date', { ascending: true });
      if (error) throw error;

      const byCust = {};
      (data || []).forEach(pi => {
        const name = pi.customers?.name || pi.customer_name_text || 'Unknown';
        const lines = pi.pi_lines || [];
        const value = lines.reduce((s, l) => s + Number(l.total_value || 0), 0);
        const litres = lines.reduce((s, l) => s + Number(l.litres || 0), 0);
        if (!byCust[name]) byCust[name] = { pis: 0, value: 0, litres: 0, outstanding: Number(pi.customers?.outstanding_amount || 0), lastOrder: null };
        byCust[name].pis += 1;
        byCust[name].value += value;
        byCust[name].litres += litres;
        if (!byCust[name].lastOrder || pi.pi_date > byCust[name].lastOrder) byCust[name].lastOrder = pi.pi_date;
      });

      lastRows = Object.entries(byCust);
      lastFrom = from; lastTo = to;
      renderTable(resultEl);

      enableExportButton(container, 'cp', () => ({
        filename: `Customer-PL_${from}_to_${to}.xlsx`,
        sheets: [
          { name: 'By Customer', headers: ['Customer', 'PIs', 'Litres', 'Sales Value', 'Avg Order Value', 'Last Order', 'Current Outstanding'], rows: sorted().map(([name, r]) => [name, r.pis, r.litres, r.value, r.pis > 0 ? r.value / r.pis : 0, r.lastOrder || '', r.outstanding]) },
        ],
      }));
    } catch (err) {
      toastError(err, 'Could not run report');
      resultEl.innerHTML = `<div class="empty-state">Could not run report.</div>`;
    }
  }

  function sorted() {
    return [...lastRows].sort((a, b) => sortBy === 'outstanding' ? b[1].outstanding - a[1].outstanding : b[1].value - a[1].value);
  }

  function renderTable(resultEl) {
    const rows = sorted();
    const today = new Date();
    resultEl.innerHTML = `
      <p class="text-muted" style="margin:-4px 0 14px;font-size:12.5px;">${rangeLabel(lastFrom, lastTo)}</p>
      <div class="table-wrap">
        <div class="table-toolbar">
          <strong>By customer</strong>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-outline btn-sm" id="cp-sort-value" style="${sortBy === 'value' ? 'border-color:var(--saffron);color:var(--saffron);' : ''}">Sort by sales value</button>
            <button class="btn btn-outline btn-sm" id="cp-sort-outstanding" style="${sortBy === 'outstanding' ? 'border-color:var(--saffron);color:var(--saffron);' : ''}">Sort by outstanding</button>
          </div>
        </div>
        <table class="erp-table"><thead><tr><th>Customer</th><th>PIs</th><th>Litres</th><th>Sales Value</th><th>Avg Order Value</th><th>Last Order</th><th>Days Since</th><th>Outstanding</th></tr></thead>
        <tbody>${rows.map(([name, r]) => {
          const avg = r.pis > 0 ? r.value / r.pis : 0;
          const daysSince = r.lastOrder ? Math.round((today - new Date(r.lastOrder)) / 86400000) : null;
          const highOutstanding = r.outstanding > r.value && r.outstanding > 0;
          return `<tr>
            <td>${escapeHtml(name)}</td><td>${fmtNum(r.pis, 0)}</td><td>${fmtNum(r.litres)}</td><td>${fmtMoney(r.value)}</td><td>${fmtMoney(avg)}</td>
            <td>${r.lastOrder ? fmtDate(r.lastOrder) : '—'}</td>
            <td>${daysSince === null ? '—' : daysSince > 45 ? `<span class="badge badge-red">${daysSince}d</span>` : `${daysSince}d`}</td>
            <td>${fmtMoney(r.outstanding)}${highOutstanding ? ' <span class="badge badge-red">High</span>' : ''}</td>
          </tr>`;
        }).join('') || emptyRow(8, 'No PIs in this range.')}</tbody></table>
      </div>`;
    document.getElementById('cp-sort-value').addEventListener('click', () => { sortBy = 'value'; renderTable(resultEl); });
    document.getElementById('cp-sort-outstanding').addEventListener('click', () => { sortBy = 'outstanding'; renderTable(resultEl); });
  }
}
