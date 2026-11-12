import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, fmtDate, toastError } from '../ui.js';

async function countRows(table, filters = {}) {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

export async function renderDashboard(container) {
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Loading dashboard…</div>`;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + '-01';

    const [
      ordersToday, ordersMonth, pisTotal,
      unregLines, recentOrders, recentPis, outstandingAgg,
    ] = await Promise.all([
      countRows('orders', { order_date: today }),
      supabase.from('orders').select('id', { count: 'exact', head: true }).gte('order_date', monthStart),
      countRows('proforma_invoices'),
      supabase.from('order_lines').select('id', { count: 'exact', head: true }).is('pi_line_id', null),
      supabase.from('orders').select('id,order_no,order_date,customer_name_text,customers(name),status').order('created_at', { ascending: false }).limit(8),
      supabase.from('proforma_invoices').select('id,pi_number,pi_date,customer_name_text,customers(name)').order('created_at', { ascending: false }).limit(8),
      supabase.from('customers').select('outstanding_amount'),
    ]);

    const ordersMonthCount = ordersMonth.count || 0;
    const unregCount = unregLines.count || 0;
    const totalOutstanding = (outstandingAgg.data || []).reduce((s, r) => s + Number(r.outstanding_amount || 0), 0);

    container.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-number">${ordersToday}</div><div class="stat-label">Orders today</div></div>
        <div class="stat-card"><div class="stat-number">${ordersMonthCount}</div><div class="stat-label">Orders this month</div></div>
        <div class="stat-card"><div class="stat-number">${pisTotal}</div><div class="stat-label">Total PIs registered</div></div>
        <div class="stat-card"><div class="stat-number">${unregCount}</div><div class="stat-label">Order lines awaiting PI</div></div>
        <div class="stat-card"><div class="stat-number" style="color:var(--red-accent);">${fmtMoney(totalOutstanding, 0)}</div><div class="stat-label">Total outstanding</div></div>
      </div>
      <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:20px;">
        <div class="table-wrap">
          <div class="table-toolbar"><strong>Recent orders</strong></div>
          <table class="erp-table"><tbody>
            ${(recentOrders.data || []).map(o => `
              <tr><td>#${o.order_no}</td><td>${fmtDate(o.order_date)}</td>
              <td>${escapeHtml(o.customers?.name || o.customer_name_text || '—')}</td>
              <td><span class="badge badge-saffron">${escapeHtml(o.status)}</span></td></tr>`).join('') || '<tr><td class="empty-state">No orders yet.</td></tr>'}
          </tbody></table>
        </div>
        <div class="table-wrap">
          <div class="table-toolbar"><strong>Recent PIs</strong></div>
          <table class="erp-table"><tbody>
            ${(recentPis.data || []).map(p => `
              <tr><td class="mono">${escapeHtml(p.pi_number)}</td><td>${fmtDate(p.pi_date)}</td>
              <td>${escapeHtml(p.customers?.name || p.customer_name_text || '—')}</td></tr>`).join('') || '<tr><td class="empty-state">No PIs yet.</td></tr>'}
          </tbody></table>
        </div>
      </div>`;
  } catch (err) {
    toastError(err, 'Could not load dashboard');
    container.innerHTML = `<div class="empty-state">Could not load dashboard data.</div>`;
  }
}
