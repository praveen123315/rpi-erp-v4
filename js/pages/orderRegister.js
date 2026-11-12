// Order Register — saved orders, with the ability to register
// unregistered lines to a Final PI via the register_pi() RPC.
import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, fmtDate, toast, toastError, openModal, closeModal, confirmDialog, filterRows, emptyRow, debounce } from '../ui.js';

let orders = [];

async function loadOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*, customers(name,customer_code), salespeople(name), order_lines(id,pi_line_id,total_amount)')
    .order('created_at', { ascending: false })
    .limit(300);
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
    orders = await loadOrders();
  } catch (err) {
    toastError(err, 'Could not load orders');
    container.innerHTML = `<div class="empty-state">Could not load orders.</div>`;
    return;
  }
  paint();

  function paint() {
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">Order Register</h2><p class="section-sub">${orders.length} saved order${orders.length === 1 ? '' : 's'}</p></div>
      </div>
      <div class="table-wrap">
        <div class="table-toolbar">
          <div class="search-box"><input class="form-input" id="or-search" placeholder="Search by customer, order #…"></div>
        </div>
        <div class="table-scroll">
          <table class="erp-table">
            <thead><tr><th>Order #</th><th>Date</th><th>Customer</th><th>Salesperson</th><th>Lines</th><th>Total</th><th>Status</th><th></th></tr></thead>
            <tbody id="or-tbody">${rowsHtml(orders)}</tbody>
          </table>
        </div>
      </div>`;
    document.getElementById('or-search').addEventListener('input', debounce((e) => {
      const filtered = filterRowsCustom(orders, e.target.value);
      document.getElementById('or-tbody').innerHTML = rowsHtml(filtered);
      wireRows();
    }, 200));
    wireRows();
  }

  function filterRowsCustom(rows, q) {
    if (!q) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter(o =>
      String(o.order_no).includes(needle) ||
      (o.customers?.name || o.customer_name_text || '').toLowerCase().includes(needle));
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
          ${!allReg ? `<button class="btn btn-primary btn-sm" data-register="${o.id}">Register to PI</button>` : ''}
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
    openModal({ title: `Order #${o.order_no}`, bodyHtml: body, wide: true, footHtml: `<button class="btn btn-outline" data-cancel>Close</button>` });
    document.querySelector('[data-cancel]').addEventListener('click', closeModal);
  }

  async function registerOrder(orderId) {
    const o = orders.find(x => x.id === orderId);
    const ok = await confirmDialog(`Register all unregistered lines of Order #${o.order_no} to a new Final PI? This mints a new PI number and cannot be undone.`, { title: 'Register to PI', confirmLabel: 'Register' });
    if (!ok) return;
    try {
      const { data, error } = await supabase.rpc('register_pi', { p_order_id: orderId });
      if (error) throw error;
      toast(`Registered as ${data.pi_number}`, 'success');
      orders = await loadOrders();
      paint();
    } catch (err) {
      toastError(err, 'Could not register to PI');
    }
  }
}
