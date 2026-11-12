// Customer P&L — revenue and outstanding by customer, over a date range.
// True product-cost-based profit needs a per-sale COGS link the schema
// doesn't carry yet, so this reports revenue, outstanding and line count
// per customer rather than a fabricated margin.
import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, fmtNum, toastError, emptyRow } from '../ui.js';

function monthStart() { return new Date().toISOString().slice(0, 7) + '-01'; }
function today() { return new Date().toISOString().slice(0, 10); }

export async function renderCustomerPL(container) {
  paint();

  function paint() {
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">Customer P&L</h2><p class="section-sub">Sales value and outstanding by customer, over a date range</p></div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div class="form-grid">
          <div class="form-field"><label class="form-label">From</label><input class="form-input" type="date" id="cp-from" value="${monthStart()}"></div>
          <div class="form-field"><label class="form-label">To</label><input class="form-input" type="date" id="cp-to" value="${today()}"></div>
          <div class="form-field" style="justify-content:flex-end;flex-direction:row;align-items:flex-end;"><button class="btn btn-primary" id="cp-run">Run report</button></div>
        </div>
      </div>
      <div id="cp-result"><div class="empty-state">Pick a date range and click "Run report".</div></div>
    `;
    document.getElementById('cp-run').addEventListener('click', run);
  }

  async function run() {
    const from = document.getElementById('cp-from').value;
    const to = document.getElementById('cp-to').value;
    const resultEl = document.getElementById('cp-result');
    resultEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Running…</div>`;
    try {
      const { data, error } = await supabase
        .from('proforma_invoices')
        .select('id,customer_id,customer_name_text,customers(name,outstanding_amount),pi_lines(total_value)')
        .gte('pi_date', from).lte('pi_date', to);
      if (error) throw error;
      const byCust = {};
      (data || []).forEach(pi => {
        const name = pi.customers?.name || pi.customer_name_text || 'Unknown';
        const value = (pi.pi_lines || []).reduce((s, l) => s + Number(l.total_value || 0), 0);
        if (!byCust[name]) byCust[name] = { pis: 0, value: 0, outstanding: Number(pi.customers?.outstanding_amount || 0) };
        byCust[name].pis += 1;
        byCust[name].value += value;
      });
      const rows = Object.entries(byCust).sort((a, b) => b[1].value - a[1].value);
      resultEl.innerHTML = `
        <div class="table-wrap">
          <div class="table-toolbar"><strong>By customer</strong></div>
          <table class="erp-table"><thead><tr><th>Customer</th><th>PIs</th><th>Sales Value</th><th>Current Outstanding</th></tr></thead>
          <tbody>${rows.map(([name, r]) => `<tr><td>${escapeHtml(name)}</td><td>${fmtNum(r.pis, 0)}</td><td>${fmtMoney(r.value)}</td><td>${fmtMoney(r.outstanding)}</td></tr>`).join('') || emptyRow(4, 'No PIs in this range.')}</tbody></table>
        </div>`;
    } catch (err) {
      toastError(err, 'Could not run report');
      resultEl.innerHTML = `<div class="empty-state">Could not run report.</div>`;
    }
  }
}
