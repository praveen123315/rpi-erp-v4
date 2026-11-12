// Reports — sales summary over a date range: totals, by-product and
// by-pack breakdowns, drawn from registered PI lines (actuals).
import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, fmtNum, toastError, emptyRow } from '../ui.js';

function monthStart() { return new Date().toISOString().slice(0, 7) + '-01'; }
function today() { return new Date().toISOString().slice(0, 10); }

export async function renderReports(container) {
  paint();

  function paint() {
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">Reports</h2><p class="section-sub">Sales summary from registered PIs, by date range</p></div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div class="form-grid">
          <div class="form-field"><label class="form-label">From</label><input class="form-input" type="date" id="rp-from" value="${monthStart()}"></div>
          <div class="form-field"><label class="form-label">To</label><input class="form-input" type="date" id="rp-to" value="${today()}"></div>
          <div class="form-field" style="justify-content:flex-end;flex-direction:row;align-items:flex-end;">
            <button class="btn btn-primary" id="rp-run">Run report</button>
          </div>
        </div>
      </div>
      <div id="rp-result"><div class="empty-state">Pick a date range and click "Run report".</div></div>
    `;
    document.getElementById('rp-run').addEventListener('click', run);
  }

  async function run() {
    const from = document.getElementById('rp-from').value;
    const to = document.getElementById('rp-to').value;
    const resultEl = document.getElementById('rp-result');
    resultEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Running…</div>`;
    try {
      const { data: pis, error } = await supabase
        .from('proforma_invoices')
        .select('id,pi_number,pi_date,pi_lines(product_text,pack_text,pcs,litres,total_value)')
        .gte('pi_date', from).lte('pi_date', to);
      if (error) throw error;

      let totalValue = 0, totalLitres = 0, totalPcs = 0;
      const byProduct = {};
      (pis || []).forEach(pi => {
        (pi.pi_lines || []).forEach(l => {
          totalValue += Number(l.total_value || 0);
          totalLitres += Number(l.litres || 0);
          totalPcs += Number(l.pcs || 0);
          const key = l.product_text || '—';
          if (!byProduct[key]) byProduct[key] = { pcs: 0, litres: 0, value: 0 };
          byProduct[key].pcs += Number(l.pcs || 0);
          byProduct[key].litres += Number(l.litres || 0);
          byProduct[key].value += Number(l.total_value || 0);
        });
      });
      const rows = Object.entries(byProduct).sort((a, b) => b[1].value - a[1].value);

      resultEl.innerHTML = `
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-number">${pis?.length || 0}</div><div class="stat-label">PIs in range</div></div>
          <div class="stat-card"><div class="stat-number">${fmtMoney(totalValue)}</div><div class="stat-label">Total Sales Value</div></div>
          <div class="stat-card"><div class="stat-number">${fmtNum(totalLitres)}</div><div class="stat-label">Total Litres</div></div>
          <div class="stat-card"><div class="stat-number">${fmtNum(totalPcs, 0)}</div><div class="stat-label">Total Pieces</div></div>
        </div>
        <div class="table-wrap">
          <div class="table-toolbar"><strong>By product</strong></div>
          <table class="erp-table"><thead><tr><th>Product</th><th>Pieces</th><th>Litres</th><th>Value</th></tr></thead>
          <tbody>${rows.map(([name, r]) => `<tr><td>${escapeHtml(name)}</td><td>${fmtNum(r.pcs, 0)}</td><td>${fmtNum(r.litres)}</td><td>${fmtMoney(r.value)}</td></tr>`).join('') || emptyRow(4, 'No sales in this range.')}</tbody></table>
        </div>`;
    } catch (err) {
      toastError(err, 'Could not run report');
      resultEl.innerHTML = `<div class="empty-state">Could not run report.</div>`;
    }
  }
}
