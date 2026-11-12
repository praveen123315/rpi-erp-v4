// Final PI Database — registered proforma invoices, read-mostly.
import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, fmtDate, toastError, openModal, closeModal, filterRows, emptyRow, debounce } from '../ui.js';

let pis = [];

async function loadPis() {
  const { data, error } = await supabase
    .from('proforma_invoices')
    .select('*, customers(name,customer_code), salespeople(name), pi_lines(id,total_value)')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return data || [];
}

function piTotal(p) {
  return (p.pi_lines || []).reduce((s, l) => s + Number(l.total_value || 0), 0);
}

export async function renderPiFinal(container) {
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Loading…</div>`;
  try {
    pis = await loadPis();
  } catch (err) {
    toastError(err, 'Could not load Final PI database');
    container.innerHTML = `<div class="empty-state">Could not load proforma invoices.</div>`;
    return;
  }
  paint();

  function paint() {
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">Final PI Database</h2><p class="section-sub">${pis.length} proforma invoice${pis.length === 1 ? '' : 's'}</p></div>
      </div>
      <div class="table-wrap">
        <div class="table-toolbar">
          <div class="search-box"><input class="form-input" id="pf-search" placeholder="Search PI number or customer…"></div>
        </div>
        <div class="table-scroll">
          <table class="erp-table">
            <thead><tr><th>PI Number</th><th>Date</th><th>Customer</th><th>Salesperson</th><th>Lines</th><th>Total</th><th>Source</th><th></th></tr></thead>
            <tbody id="pf-tbody">${rowsHtml(pis)}</tbody>
          </table>
        </div>
      </div>`;
    document.getElementById('pf-search').addEventListener('input', debounce((e) => {
      const needle = e.target.value.trim().toLowerCase();
      const filtered = !needle ? pis : pis.filter(p =>
        p.pi_number.toLowerCase().includes(needle) ||
        (p.customers?.name || p.customer_name_text || '').toLowerCase().includes(needle));
      document.getElementById('pf-tbody').innerHTML = rowsHtml(filtered);
      wireRows();
    }, 200));
    wireRows();
  }

  function rowsHtml(rows) {
    if (!rows.length) return emptyRow(8, 'No proforma invoices yet.');
    return rows.map(p => `
      <tr>
        <td class="mono">${escapeHtml(p.pi_number)}</td>
        <td>${fmtDate(p.pi_date)}</td>
        <td>${escapeHtml(p.customers?.name || p.customer_name_text || '—')}</td>
        <td>${escapeHtml(p.salespeople?.name || '—')}</td>
        <td>${(p.pi_lines || []).length}</td>
        <td>${fmtMoney(piTotal(p))}</td>
        <td>${p.source === 'historical' ? '<span class="badge badge-gray">Historical</span>' : '<span class="badge badge-saffron">Sales</span>'}</td>
        <td><button class="btn btn-outline btn-sm" data-view="${p.id}">View</button></td>
      </tr>`).join('');
  }

  function wireRows() {
    container.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => viewPi(b.dataset.view)));
  }

  async function viewPi(piId) {
    const p = pis.find(x => x.id === piId);
    const { data: lines, error } = await supabase.from('pi_lines').select('*').eq('pi_id', piId).order('line_no');
    if (error) { toastError(error, 'Could not load PI lines'); return; }
    const body = `
      <div style="margin-bottom:12px;font-size:13px;color:var(--ink-soft);">
        <strong>${escapeHtml(p.customers?.name || p.customer_name_text || '—')}</strong> — ${fmtDate(p.pi_date)}<br>
        ${escapeHtml(p.address || '')}
      </div>
      <div class="table-scroll" style="max-height:360px;">
        <table class="erp-table">
          <thead><tr><th>#</th><th>Product</th><th>Shade</th><th>Pack</th><th>Pcs</th><th>Rate</th><th>Total</th></tr></thead>
          <tbody>
            ${(lines || []).map(l => `<tr>
              <td>${l.line_no}</td>
              <td>${escapeHtml(l.product_text)}</td>
              <td>${escapeHtml(l.shade_text)}</td>
              <td>${escapeHtml(l.pack_text)}</td>
              <td>${l.pcs}</td>
              <td>${fmtMoney(l.price)}</td>
              <td>${fmtMoney(l.total_value)}</td>
            </tr>`).join('') || emptyRow(7, 'No lines.')}
          </tbody>
        </table>
      </div>`;
    openModal({ title: p.pi_number, bodyHtml: body, wide: true, footHtml: `<button class="btn btn-outline" data-cancel>Close</button> <button class="btn btn-primary" data-print>Print</button>` });
    document.querySelector('[data-cancel]').addEventListener('click', closeModal);
    document.querySelector('[data-print]').addEventListener('click', () => window.print());
  }
}
