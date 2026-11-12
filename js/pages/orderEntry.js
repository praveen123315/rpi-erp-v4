// Create PI — new order entry (header + multiple line items), saved via
// the save_order(p_order, p_lines) RPC. Rates come from lookup_rate().
import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, toast, toastError, debounce } from '../ui.js';

let customers = [], products = [], shades = [], packSizes = [], priceLists = [];
let shadesByProduct = {}; // product_id -> Set(shade_id)
let lines = []; // working line items
let lineSeq = 0;
let currentCustomer = null;
let editingOrderId = null;

function blankLine() {
  lineSeq += 1;
  return { _key: lineSeq, product_id: '', shade_id: '', price_group_id: '', pack_size_id: '', qty: 1, final_rate: 0 };
}

async function loadStatics() {
  const [cu, pr, sh, ps, pl, pshades] = await Promise.all([
    supabase.from('customers').select('id,name,customer_code,address,salesperson_id,price_list_id,transporter_id,freight').eq('is_active', true).order('name'),
    supabase.from('products').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('shades').select('id,name').eq('is_active', true).order('name'),
    supabase.from('pack_sizes').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('price_lists').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('product_shades').select('product_id,shade_id'),
  ]);
  customers = cu.data || []; products = pr.data || []; shades = sh.data || [];
  packSizes = ps.data || []; priceLists = pl.data || [];
  shadesByProduct = {};
  (pshades.data || []).forEach(r => { (shadesByProduct[r.product_id] ||= new Set()).add(r.shade_id); });
}

function shadeOptionsFor(productId) {
  const set = shadesByProduct[productId];
  const list = set && set.size ? shades.filter(s => set.has(s.id)) : shades;
  return list;
}

async function priceGroupsFor(productId, priceListId) {
  if (!productId || !priceListId) return [];
  const { data } = await supabase.from('price_groups').select('*').eq('product_id', productId).eq('price_list_id', priceListId).eq('is_active', true).order('sort_order');
  return data || [];
}

export async function renderOrderEntry(container) {
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Loading…</div>`;
  try {
    await loadStatics();
  } catch (err) {
    toastError(err, 'Could not load masters for order entry');
    container.innerHTML = `<div class="empty-state">Could not load order-entry data.</div>`;
    return;
  }
  editingOrderId = null;
  lines = [blankLine()];
  currentCustomer = null;

  paint();

  function paint() {
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">Create PI</h2><p class="section-sub">New order entry — save, then register to PI from Order Register</p></div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div class="form-grid">
          <div class="form-field span-2">
            <label class="form-label">Customer <span class="req">*</span></label>
            <select class="form-select" id="oe-customer">
              <option value="">— Select customer —</option>
              ${customers.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.customer_code ? ' (' + escapeHtml(c.customer_code) + ')' : ''}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label class="form-label">Order Date</label>
            <input class="form-input" type="date" id="oe-date" value="${new Date().toISOString().slice(0, 10)}">
          </div>
          <div class="form-field">
            <label class="form-label">Region</label>
            <select class="form-select" id="oe-region">
              <option value="normal">Normal</option>
              <option value="bihar">Bihar</option>
            </select>
          </div>
          <div class="form-field span-2">
            <label class="form-label">Address</label>
            <input class="form-input" id="oe-address">
          </div>
          <div class="form-field">
            <label class="form-label">Freight</label>
            <input class="form-input" type="number" step="0.01" id="oe-freight" value="0">
          </div>
          <div class="form-field">
            <label class="form-label">Freight Kind</label>
            <select class="form-select" id="oe-freight-kind">
              <option value="To Pay">To Pay</option>
              <option value="Paid">Paid</option>
              <option value="Included">Included</option>
            </select>
          </div>
          <div class="form-field span-2">
            <label class="form-label">Comment</label>
            <textarea class="form-textarea" id="oe-comment"></textarea>
          </div>
        </div>
      </div>

      <div class="table-wrap">
        <div class="table-toolbar"><strong>Line items</strong>
          <button class="btn btn-outline btn-sm" id="oe-add-line">+ Add line</button>
        </div>
        <div class="table-scroll" style="max-height:none;overflow-x:auto;">
          <table class="erp-table">
            <thead><tr>
              <th style="min-width:200px;">Product</th>
              <th style="min-width:160px;">Shade</th>
              <th style="min-width:160px;">Price Group</th>
              <th style="min-width:110px;">Pack</th>
              <th style="min-width:80px;">Qty</th>
              <th style="min-width:100px;">Rate</th>
              <th style="min-width:110px;">Total</th>
              <th></th>
            </tr></thead>
            <tbody id="oe-lines-body"></tbody>
          </table>
        </div>
      </div>

      <div class="flex-between" style="margin-top:16px;">
        <div class="stat-card" style="padding:12px 20px;"><div class="stat-label">Order Total</div><div class="stat-number" id="oe-grand-total" style="font-size:22px;">${fmtMoney(0)}</div></div>
        <div class="gap-2">
          <button class="btn btn-outline" id="oe-reset">Reset</button>
          <button class="btn btn-primary" id="oe-save">Save Order</button>
        </div>
      </div>
    `;

    document.getElementById('oe-customer').addEventListener('change', onCustomerChange);
    document.getElementById('oe-add-line').addEventListener('click', () => { lines.push(blankLine()); renderLines(); });
    document.getElementById('oe-reset').addEventListener('click', () => { lines = [blankLine()]; currentCustomer = null; paint(); });
    document.getElementById('oe-save').addEventListener('click', saveOrder);
    renderLines();
  }

  function onCustomerChange(e) {
    currentCustomer = customers.find(c => c.id === e.target.value) || null;
    document.getElementById('oe-address').value = currentCustomer?.address || '';
    document.getElementById('oe-freight').value = currentCustomer?.freight || 0;
    renderLines(); // price group options depend on customer's price list
  }

  async function renderLines() {
    const tbody = document.getElementById('oe-lines-body');
    tbody.innerHTML = lines.map(lineRowHtml).join('');
    for (const line of lines) {
      if (line.product_id) await populateGroupOptions(line);
    }
    wireLineEvents();
    recalcTotals();
  }

  function lineRowHtml(line) {
    const pack = packSizes.find(p => p.id === line.pack_size_id);
    const total = Number(line.qty || 0) * Number(line.final_rate || 0);
    return `<tr data-key="${line._key}">
      <td><select class="form-select ln-product" data-k="${line._key}">
        <option value="">— Product —</option>
        ${products.map(p => `<option value="${p.id}" ${p.id === line.product_id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
      </select></td>
      <td><select class="form-select ln-shade" data-k="${line._key}">
        <option value="">— Shade —</option>
        ${shadeOptionsFor(line.product_id).map(s => `<option value="${s.id}" ${s.id === line.shade_id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
      </select></td>
      <td><select class="form-select ln-group" data-k="${line._key}"><option value="">— Group —</option></select></td>
      <td><select class="form-select ln-pack" data-k="${line._key}">
        <option value="">— Pack —</option>
        ${packSizes.map(p => `<option value="${p.id}" ${p.id === line.pack_size_id ? 'selected' : ''}>${escapeHtml(p.label)}</option>`).join('')}
      </select></td>
      <td><input class="form-input ln-qty" data-k="${line._key}" type="number" step="0.01" value="${line.qty}"></td>
      <td><input class="form-input ln-rate" data-k="${line._key}" type="number" step="0.01" value="${line.final_rate}"></td>
      <td class="mono ln-total">${fmtMoney(total)}</td>
      <td><button class="btn btn-ghost btn-sm ln-remove" data-k="${line._key}">✕</button></td>
    </tr>`;
  }

  async function populateGroupOptions(line) {
    const priceListId = currentCustomer?.price_list_id || priceLists.find(p => p.code === 'master')?.id;
    const groups = await priceGroupsFor(line.product_id, priceListId);
    const sel = document.querySelector(`.ln-group[data-k="${line._key}"]`);
    if (!sel) return;
    sel.innerHTML = `<option value="">— Group —</option>` + groups.map(g => `<option value="${g.id}" ${g.id === line.price_group_id ? 'selected' : ''}>${escapeHtml(g.label)}</option>`).join('');
  }

  function findLine(key) { return lines.find(l => String(l._key) === String(key)); }

  function wireLineEvents() {
    const tbody = document.getElementById('oe-lines-body');
    tbody.querySelectorAll('.ln-product').forEach(el => el.addEventListener('change', async (e) => {
      const line = findLine(e.target.dataset.k);
      line.product_id = e.target.value;
      line.shade_id = ''; line.price_group_id = '';
      await renderLines();
    }));
    tbody.querySelectorAll('.ln-shade').forEach(el => el.addEventListener('change', (e) => {
      findLine(e.target.dataset.k).shade_id = e.target.value;
    }));
    tbody.querySelectorAll('.ln-group').forEach(el => el.addEventListener('change', async (e) => {
      const line = findLine(e.target.dataset.k);
      line.price_group_id = e.target.value;
      await autoRate(line);
    }));
    tbody.querySelectorAll('.ln-pack').forEach(el => el.addEventListener('change', async (e) => {
      const line = findLine(e.target.dataset.k);
      line.pack_size_id = e.target.value;
      await autoRate(line);
    }));
    tbody.querySelectorAll('.ln-qty').forEach(el => el.addEventListener('input', debounce((e) => {
      findLine(e.target.dataset.k).qty = Number(e.target.value || 0);
      updateRowTotal(e.target.dataset.k);
    }, 150)));
    tbody.querySelectorAll('.ln-rate').forEach(el => el.addEventListener('input', debounce((e) => {
      findLine(e.target.dataset.k).final_rate = Number(e.target.value || 0);
      updateRowTotal(e.target.dataset.k);
    }, 150)));
    tbody.querySelectorAll('.ln-remove').forEach(el => el.addEventListener('click', (e) => {
      lines = lines.filter(l => String(l._key) !== String(e.target.dataset.k));
      if (!lines.length) lines = [blankLine()];
      renderLines();
    }));
  }

  async function autoRate(line) {
    if (!line.product_id || !line.pack_size_id) return;
    const priceListCode = priceLists.find(p => p.id === (currentCustomer?.price_list_id))?.code || 'master';
    try {
      const { data, error } = await supabase.rpc('lookup_rate', {
        p_product_id: line.product_id,
        p_pack_size_id: line.pack_size_id,
        p_price_list: priceListCode,
        p_price_group_id: line.price_group_id || null,
      });
      if (!error && data !== null && data !== undefined) {
        line.final_rate = Number(data);
        const rateInput = document.querySelector(`.ln-rate[data-k="${line._key}"]`);
        if (rateInput) rateInput.value = line.final_rate;
        updateRowTotal(line._key);
      }
    } catch { /* leave manual rate */ }
  }

  function updateRowTotal(key) {
    const line = findLine(key);
    if (!line) return;
    const row = document.querySelector(`tr[data-key="${key}"] .ln-total`);
    if (row) row.textContent = fmtMoney(Number(line.qty || 0) * Number(line.final_rate || 0));
    recalcTotals();
  }

  function recalcTotals() {
    const grand = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.final_rate || 0), 0);
    const el = document.getElementById('oe-grand-total');
    if (el) el.textContent = fmtMoney(grand);
  }

  async function saveOrder() {
    const customerId = document.getElementById('oe-customer').value;
    if (!customerId) { toast('Select a customer', 'error'); return; }
    const validLines = lines.filter(l => l.product_id && l.pack_size_id && Number(l.qty) > 0);
    if (!validLines.length) { toast('Add at least one complete line item', 'error'); return; }

    const customer = customers.find(c => c.id === customerId);
    const orderPayload = {
      order_date: document.getElementById('oe-date').value,
      customer_id: customerId,
      customer_name_text: customer?.name || '',
      salesperson_id: customer?.salesperson_id || null,
      region: document.getElementById('oe-region').value,
      address: document.getElementById('oe-address').value,
      comment: document.getElementById('oe-comment').value,
      freight: Number(document.getElementById('oe-freight').value || 0),
      freight_kind: document.getElementById('oe-freight-kind').value,
      status: 'Saved',
    };
    const linesPayload = validLines.map(l => {
      const pack = packSizes.find(p => p.id === l.pack_size_id);
      const group = l.price_group_id;
      const litres = pack ? Number(pack.litres) * Number(l.qty) : 0;
      return {
        product_id: l.product_id,
        product_text: products.find(p => p.id === l.product_id)?.name || '',
        shade_id: l.shade_id || null,
        shade_text: shades.find(s => s.id === l.shade_id)?.name || '',
        price_group_id: group || null,
        group_label: '',
        pack_size_id: l.pack_size_id,
        pack_text: pack?.label || '',
        qty: Number(l.qty),
        litres,
        unit: pack?.family === 'putty' ? 'kg' : 'L',
        dpl_rate: Number(l.final_rate || 0),
        final_rate: Number(l.final_rate || 0),
        total_amount: Number(l.qty) * Number(l.final_rate || 0),
      };
    });

    const saveBtn = document.getElementById('oe-save');
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      const { data, error } = await supabase.rpc('save_order', { p_order: orderPayload, p_lines: linesPayload });
      if (error) throw error;
      toast(`Order #${data.order_no} saved`, 'success');
      lines = [blankLine()];
      currentCustomer = null;
      paint();
    } catch (err) {
      toastError(err, 'Could not save order');
    } finally {
      saveBtn.disabled = false; saveBtn.textContent = 'Save Order';
    }
  }
}
