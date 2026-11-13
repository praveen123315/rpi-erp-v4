// Final PI Database — registered proforma invoices, read-mostly.
import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, fmtDate, toastError, openModal, closeModal, filterRows, emptyRow, debounce } from '../ui.js';
import { printPi } from '../piPrint.js';

let pis = [];
let salespeople = [];
const filters = { search: '', salespersonId: '', from: '', to: '' };

async function loadPis() {
  const { data, error } = await supabase
    .from('proforma_invoices')
    .select('*, customers(name,customer_code), salespeople(name), pi_lines(id,pcs,total_value)')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return data || [];
}

// A lot of historical (migrated) PIs carry leftover zero-qty/zero-amount
// "empty slot" lines from the old Sheets import — don't count or show
// these as real line items.
function realLines(pi) {
  return (pi.pi_lines || []).filter(l => Number(l.pcs || 0) !== 0 || Number(l.total_value || 0) !== 0);
}

async function loadSalespeople() {
  const { data, error } = await supabase.from('salespeople').select('id,name').order('name');
  if (error) throw error;
  return data || [];
}

function piTotal(p) {
  return (p.pi_lines || []).reduce((s, l) => s + Number(l.total_value || 0), 0);
}

function piLineCount(p) {
  return realLines(p).length;
}

export async function renderPiFinal(container) {
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Loading…</div>`;
  try {
    [pis, salespeople] = await Promise.all([loadPis(), loadSalespeople()]);
  } catch (err) {
    toastError(err, 'Could not load Final PI database');
    container.innerHTML = `<div class="empty-state">Could not load proforma invoices.</div>`;
    return;
  }
  paint();

  function paint() {
    const filtered = applyFilters(pis);
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">Final PI Database</h2><p class="section-sub">${filtered.length} of ${pis.length} proforma invoice${pis.length === 1 ? '' : 's'}</p></div>
      </div>
      <div class="table-wrap">
        <div class="table-toolbar" style="flex-wrap:wrap;gap:8px;">
          <div class="search-box"><input class="form-input" id="pf-search" placeholder="Search PI number or customer…" value="${escapeHtml(filters.search)}"></div>
          <select class="form-input" id="pf-sp" style="max-width:180px;">
            <option value="">All Salespersons</option>
            ${salespeople.map(sp => `<option value="${sp.id}" ${filters.salespersonId === sp.id ? 'selected' : ''}>${escapeHtml(sp.name)}</option>`).join('')}
          </select>
          <label style="font-size:12px;color:var(--ink-soft);display:flex;align-items:center;gap:4px;">From <input type="date" class="form-input" id="pf-from" style="max-width:150px;" value="${filters.from}"></label>
          <label style="font-size:12px;color:var(--ink-soft);display:flex;align-items:center;gap:4px;">To <input type="date" class="form-input" id="pf-to" style="max-width:150px;" value="${filters.to}"></label>
          <button class="btn btn-outline btn-sm" id="pf-clear">Clear</button>
        </div>
        <div class="table-scroll">
          <table class="erp-table">
            <thead><tr><th>PI Number</th><th>Date</th><th>Customer</th><th>Salesperson</th><th>Lines</th><th>Total</th><th>Source</th><th></th></tr></thead>
            <tbody id="pf-tbody">${rowsHtml(filtered)}</tbody>
          </table>
        </div>
      </div>`;
    document.getElementById('pf-search').addEventListener('input', debounce((e) => {
      filters.search = e.target.value;
      refreshTable();
    }, 200));
    document.getElementById('pf-sp').addEventListener('change', (e) => { filters.salespersonId = e.target.value; refreshTable(); });
    document.getElementById('pf-from').addEventListener('change', (e) => { filters.from = e.target.value; refreshTable(); });
    document.getElementById('pf-to').addEventListener('change', (e) => { filters.to = e.target.value; refreshTable(); });
    document.getElementById('pf-clear').addEventListener('click', () => {
      filters.search = ''; filters.salespersonId = ''; filters.from = ''; filters.to = '';
      paint();
    });
    wireRows();
  }

  function refreshTable() {
    const filtered = applyFilters(pis);
    document.getElementById('pf-tbody').innerHTML = rowsHtml(filtered);
    container.querySelector('.section-sub').textContent = `${filtered.length} of ${pis.length} proforma invoice${pis.length === 1 ? '' : 's'}`;
    wireRows();
  }

  function applyFilters(rows) {
    return rows.filter(p => {
      if (filters.search) {
        const needle = filters.search.trim().toLowerCase();
        const hay = `${p.pi_number} ${p.customers?.name || p.customer_name_text || ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (filters.salespersonId && p.salesperson_id !== filters.salespersonId) return false;
      if (filters.from && p.pi_date < filters.from) return false;
      if (filters.to && p.pi_date > filters.to) return false;
      return true;
    });
  }

  function rowsHtml(rows) {
    if (!rows.length) return emptyRow(8, 'No proforma invoices yet.');
    return rows.map(p => `
      <tr>
        <td class="mono">${escapeHtml(p.pi_number)}</td>
        <td>${fmtDate(p.pi_date)}</td>
        <td>${escapeHtml(p.customers?.name || p.customer_name_text || '—')}</td>
        <td>${escapeHtml(p.salespeople?.name || '—')}</td>
        <td>${piLineCount(p)}</td>
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
    const { data: rawLines, error } = await supabase.from('pi_lines').select('*, pack_sizes(units_per_carton)').eq('pi_id', piId).order('line_no');
    if (error) { toastError(error, 'Could not load PI lines'); return; }
    // Historical imports left zero-qty/zero-amount "empty slot" lines on
    // many PIs — don't show those as if they were ordered.
    const lines = (rawLines || []).filter(l => Number(l.pcs || 0) !== 0 || Number(l.total_value || 0) !== 0);
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
    openModal({ title: p.pi_number, bodyHtml: body, wide: true, footHtml: `<button class="btn btn-outline" data-cancel>Close</button> <button class="btn btn-primary" data-print>Print PI</button>` });
    document.querySelector('[data-cancel]').addEventListener('click', closeModal);
    document.querySelector('[data-print]').addEventListener('click', () => printPi(p, lines));
  }
}
