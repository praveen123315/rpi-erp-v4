// Order Register — saved orders, with the ability to register
// unregistered lines to a Final PI via the register_pi() RPC.
import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, fmtDate, toast, toastError, openModal, closeModal, confirmDialog, filterRows, emptyRow, debounce } from '../ui.js';
import { printPi } from '../piPrint.js';

let orders = [];
let salespeople = [];
// Order ids with a Register-to-PI call in flight. Guards against a
// second click (double-click, or an impatient re-click while the first
// request is still on the wire) firing a second register_pi() call
// before the UI has re-rendered the order as registered.
const registering = new Set();
// Filter state, kept across re-renders of the table.
const filters = { search: '', salespersonId: '', from: '', to: '' };

async function loadOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*, customers(name,customer_code), salespeople(name), order_lines(id,pi_line_id,total_amount)')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return data || [];
}

async function loadSalespeople() {
  const { data, error } = await supabase.from('salespeople').select('id,name').order('name');
  if (error) throw error;
  return data || [];
}

function orderSummary(o) {
  const lines = o.order_lines || [];
  const total = lines.reduce((s, l) => s + Number(l.total_amount || 0), 0);
  const registered = lines.filter(l => l.pi_line_id).length;
  return { total, registered, count: lines.length };
}

export async function renderOrderRegister(container) {
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Loading…</div>`;
  try {
    [orders, salespeople] = await Promise.all([loadOrders(), loadSalespeople()]);
  } catch (err) {
    toastError(err, 'Could not load orders');
    container.innerHTML = `<div class="empty-state">Could not load orders.</div>`;
    return;
  }
  paint();

  function paint() {
    const filtered = applyFilters(orders);
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">Order Register</h2><p class="section-sub">${filtered.length} of ${orders.length} saved order${orders.length === 1 ? '' : 's'}</p></div>
      </div>
      <div class="table-wrap">
        <div class="table-toolbar" style="flex-wrap:wrap;gap:8px;">
          <div class="search-box"><input class="form-input" id="or-search" placeholder="Search by customer, order #…" value="${escapeHtml(filters.search)}"></div>
          <select class="form-input" id="or-sp" style="max-width:180px;">
            <option value="">All Salespersons</option>
            ${salespeople.map(sp => `<option value="${sp.id}" ${filters.salespersonId === sp.id ? 'selected' : ''}>${escapeHtml(sp.name)}</option>`).join('')}
          </select>
          <label style="font-size:12px;color:var(--ink-soft);display:flex;align-items:center;gap:4px;">From <input type="date" class="form-input" id="or-from" style="max-width:150px;" value="${filters.from}"></label>
          <label style="font-size:12px;color:var(--ink-soft);display:flex;align-items:center;gap:4px;">To <input type="date" class="form-input" id="or-to" style="max-width:150px;" value="${filters.to}"></label>
          <button class="btn btn-outline btn-sm" id="or-clear">Clear</button>
        </div>
        <div class="table-scroll">
          <table class="erp-table">
            <thead><tr><th>Order #</th><th>Date</th><th>Customer</th><th>Salesperson</th><th>Lines</th><th>Total</th><th>Status</th><th></th></tr></thead>
            <tbody id="or-tbody">${rowsHtml(filtered)}</tbody>
          </table>
        </div>
      </div>`;
    document.getElementById('or-search').addEventListener('input', debounce((e) => {
      filters.search = e.target.value;
      refreshTable();
    }, 200));
    document.getElementById('or-sp').addEventListener('change', (e) => { filters.salespersonId = e.target.value; refreshTable(); });
    document.getElementById('or-from').addEventListener('change', (e) => { filters.from = e.target.value; refreshTable(); });
    document.getElementById('or-to').addEventListener('change', (e) => { filters.to = e.target.value; refreshTable(); });
    document.getElementById('or-clear').addEventListener('click', () => {
      filters.search = ''; filters.salespersonId = ''; filters.from = ''; filters.to = '';
      paint();
    });
    wireRows();
  }

  // Re-render just the table body + count, without rebuilding the filter
  // bar (which would steal focus from whichever field the user is in).
  function refreshTable() {
    const filtered = applyFilters(orders);
    document.getElementById('or-tbody').innerHTML = rowsHtml(filtered);
    container.querySelector('.section-sub').textContent = `${filtered.length} of ${orders.length} saved order${orders.length === 1 ? '' : 's'}`;
    wireRows();
  }

  function applyFilters(rows) {
    return rows.filter(o => {
      if (filters.search) {
        const needle = filters.search.trim().toLowerCase();
        const hay = `${o.order_no} ${o.customers?.name || o.customer_name_text || ''} ${(o.order_lines || []).length ? '' : ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (filters.salespersonId && o.salesperson_id !== filters.salespersonId) return false;
      if (filters.from && o.order_date < filters.from) return false;
      if (filters.to && o.order_date > filters.to) return false;
      return true;
    });
  }

  function rowsHtml(rows) {
    if (!rows.length) return emptyRow(8, 'No orders yet.');
    return rows.map(o => {
      const s = orderSummary(o);
      const allReg = s.count > 0 && s.registered === s.count;
      return `<tr>
        <td>#${o.order_no}</td>
        <td>${fmtDate(o.order_date)}</td>
        <td>${escapeHtml(o.customers?.name || o.customer_name_text || '—')}</td>
        <td>${escapeHtml(o.salespeople?.name || '—')}</td>
        <td>${s.registered}/${s.count}</td>
        <td>${fmtMoney(s.total)}</td>
        <td>${allReg ? '<span class="badge badge-green">Registered</span>' : '<span class="badge badge-saffron">Open</span>'}</td>
        <td><div class="row-actions">
          <button class="btn btn-outline btn-sm" data-view="${o.id}">View</button>
          ${!allReg ? `<button class="btn btn-primary btn-sm" data-register="${o.id}" ${registering.has(o.id) ? 'disabled' : ''}>${registering.has(o.id) ? 'Registering…' : 'Register to PI'}</button>` : ''}
        </div></td>
      </tr>`;
    }).join('');
  }

  function wireRows() {
    container.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => viewOrder(b.dataset.view)));
    container.querySelectorAll('[data-register]').forEach(b => b.addEventListener('click', () => registerOrder(b.dataset.register)));
  }

  async function viewOrder(orderId) {
    const o = orders.find(x => x.id === orderId);
    const { data: lines, error } = await supabase.from('order_lines').select('*').eq('order_id', orderId).order('line_no');
    if (error) { toastError(error, 'Could not load order lines'); return; }
    const piIds = [...new Set((lines || []).map(l => l.pi_line_id).filter(Boolean))];
    // In the normal case an order registers to exactly one PI. Fetch the
    // PI header(s) so the modal can offer a proper Print PI button rather
    // than printing the raw order view.
    let pis = [];
    if (piIds.length) {
      const { data: plRows } = await supabase.from('pi_lines').select('pi_id').in('id', piIds);
      const distinctPiIds = [...new Set((plRows || []).map(r => r.pi_id))];
      const { data: piRows } = await supabase
        .from('proforma_invoices')
        .select('*, customers(name,customer_code), salespeople(name), pi_lines(*)')
        .in('id', distinctPiIds);
      pis = piRows || [];
    }
    const body = `
      <div style="margin-bottom:12px;font-size:13px;color:var(--ink-soft);">
        <strong>${escapeHtml(o.customers?.name || o.customer_name_text || '—')}</strong> — ${fmtDate(o.order_date)}<br>
        ${escapeHtml(o.address || '')}
      </div>
      <div class="table-scroll" style="max-height:360px;">
        <table class="erp-table">
          <thead><tr><th>Product</th><th>Shade</th><th>Pack</th><th>Qty</th><th>Rate</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>
            ${(lines || []).map(l => `<tr>
              <td>${escapeHtml(l.product_text)}</td>
              <td>${escapeHtml(l.shade_text)}</td>
              <td>${escapeHtml(l.pack_text)}</td>
              <td>${l.qty}</td>
              <td>${fmtMoney(l.final_rate)}</td>
              <td>${fmtMoney(l.total_amount)}</td>
              <td>${l.pi_line_id ? '<span class="badge badge-green">Registered</span>' : '<span class="badge badge-gray">Open</span>'}</td>
            </tr>`).join('') || emptyRow(7, 'No lines.')}
          </tbody>
        </table>
      </div>`;
    const printBtns = pis.map(p => `<button class="btn btn-primary" data-print="${p.id}">Print ${escapeHtml(p.pi_number)}</button>`).join(' ');
    openModal({ title: `Order #${o.order_no}`, bodyHtml: body, wide: true, footHtml: `<button class="btn btn-outline" data-cancel>Close</button> ${printBtns}` });
    document.querySelector('[data-cancel]').addEventListener('click', closeModal);
    pis.forEach(p => {
      document.querySelector(`[data-print="${p.id}"]`)?.addEventListener('click', () => printPi(p, p.pi_lines));
    });
  }

  async function registerOrder(orderId) {
    if (registering.has(orderId)) return; // already in flight — ignore the repeat click
    const o = orders.find(x => x.id === orderId);
    const ok = await confirmDialog(`Register all unregistered lines of Order #${o.order_no} to a new Final PI? This mints a new PI number and cannot be undone.`, { title: 'Register to PI', confirmLabel: 'Register' });
    if (!ok) return;
    registering.add(orderId);
    paint(); // re-render so the button shows "Registering…" and disables immediately
    try {
      const { data, error } = await supabase.rpc('register_pi', { p_order_id: orderId });
      if (error) throw error;
      toast(`Registered as ${data.pi_number}`, 'success');
      orders = await loadOrders();
    } catch (err) {
      toastError(err, 'Could not register to PI');
    } finally {
      registering.delete(orderId);
      paint();
    }
  }
}
