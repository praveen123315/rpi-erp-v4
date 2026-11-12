import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, fmtNum, toastError, emptyRow } from '../ui.js';

function monthStart() { return new Date().toISOString().slice(0, 7) + '-01'; }
function today() { return new Date().toISOString().slice(0, 10); }

export async function renderSalespersonReport(container) {
  paint();

  function paint() {
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">SP Sales Report</h2><p class="section-sub">Registered PI value by salesperson, over a date range</p></div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div class="form-grid">
          <div class="form-field"><label class="form-label">From</label><input class="form-input" type="date" id="sr-from" value="${monthStart()}"></div>
          <div class="form-field"><label class="form-label">To</label><input class="form-input" type="date" id="sr-to" value="${today()}"></div>
          <div class="form-field" style="justify-content:flex-end;flex-direction:row;align-items:flex-end;"><button class="btn btn-primary" id="sr-run">Run report</button></div>
        </div>
      </div>
      <div id="sr-result"><div class="empty-state">Pick a date range and click "Run report".</div></div>
    `;
    document.getElementById('sr-run').addEventListener('click', run);
  }

  async function run() {
    const from = document.getElementById('sr-from').value;
    const to = document.getElementById('sr-to').value;
    const resultEl = document.getElementById('sr-result');
    resultEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Running…</div>`;
    try {
      const { data, error } = await supabase
        .from('proforma_invoices')
        .select('id,salespeople(name),pi_lines(total_value)')
        .gte('pi_date', from).lte('pi_date', to);
      if (error) throw error;
      const bySp = {};
      (data || []).forEach(pi => {
        const name = pi.salespeople?.name || 'Unassigned';
        const value = (pi.pi_lines || []).reduce((s, l) => s + Number(l.total_value || 0), 0);
        if (!bySp[name]) bySp[name] = { pis: 0, value: 0 };
        bySp[name].pis += 1;
        bySp[name].value += value;
      });
      const rows = Object.entries(bySp).sort((a, b) => b[1].value - a[1].value);
      const grandTotal = rows.reduce((s, [, r]) => s + r.value, 0);
      resultEl.innerHTML = `
        <div class="table-wrap">
          <div class="table-toolbar"><strong>By salesperson</strong><span class="text-muted">Total: ${fmtMoney(grandTotal)}</span></div>
          <table class="erp-table"><thead><tr><th>Salesperson</th><th>PIs</th><th>Value</th><th>Share</th></tr></thead>
          <tbody>${rows.map(([name, r]) => `<tr>
            <td>${escapeHtml(name)}</td><td>${fmtNum(r.pis, 0)}</td><td>${fmtMoney(r.value)}</td>
            <td>${grandTotal > 0 ? fmtNum(r.value / grandTotal * 100, 1) : '0'}%</td>
          </tr>`).join('') || emptyRow(4, 'No PIs in this range.')}</tbody></table>
        </div>`;
    } catch (err) {
      toastError(err, 'Could not run report');
      resultEl.innerHTML = `<div class="empty-state">Could not run report.</div>`;
    }
  }
}
