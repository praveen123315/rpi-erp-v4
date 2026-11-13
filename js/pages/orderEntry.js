// Create PI — new order entry (header + multiple line items), saved via
// the save_order(p_order, p_lines) RPC. Rates come from lookup_rate().
import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, toast, toastError, debounce, openModal, closeModal } from '../ui.js';

let customers = [], products = [], shades = [], packSizes = [], priceLists = [];
let lines = []; // working line items
let lineSeq = 0;
let currentCustomer = null;

// Caches price_groups lookups by `${productId}|${priceListId}` so that
// adding several lines for the same product (the common case — many line
// items in the same price group) doesn't re-fetch from Supabase for every
// single row. Also makes the per-row populate below effectively
// synchronous after the first line of a given product.
const groupsCache = new Map();

function blankLine() {
  lineSeq += 1;
  return { _key: lineSeq, product_id: '', shade_id: '', shade_text: '', price_group_id: '', group_label: '', pack_size_id: '', qty: 1, final_rate: 0 };
}

async function loadStatics() {
  const [cu, pr, sh, ps, pl] = await Promise.all([
    supabase.from('customers').select('id,name,customer_code,address,salesperson_id,price_list_id,transporter_id,freight').eq('is_active', true).order('name'),
    supabase.from('products').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('shades').select('id,name').eq('is_active', true).order('name'),
    supabase.from('pack_sizes').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('price_lists').select('*').eq('is_active', true).order('sort_order'),
  ]);
  customers = cu.data || []; products = pr.data || []; shades = sh.data || [];
  packSizes = ps.data || []; priceLists = pl.data || [];
}

async function priceGroupsFor(productId, priceListId) {
  if (!productId || !priceListId) return [];
  const cacheKey = `${productId}|${priceListId}`;
  if (groupsCache.has(cacheKey)) return groupsCache.get(cacheKey);
  const { data } = await supabase.from('price_groups').select('*').eq('product_id', productId).eq('price_list_id', priceListId).eq('is_active', true).order('sort_order');
  const groups = data || [];
  groupsCache.set(cacheKey, groups);
  return groups;
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
  lines = [blankLine()];
  currentCustomer = null;
  groupsCache.clear();

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
              <th style="min-width:180px;">Shade</th>
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
    document.getElementById('oe-add-line').addEventListener('click', addLine);
    document.getElementById('oe-reset').addEventListener('click', () => {
      lines = [blankLine()]; currentCustomer = null; groupsCache.clear(); paint();
    });
    document.getElementById('oe-save').addEventListener('click', saveOrder);
    const tbody = document.getElementById('oe-lines-body');
    tbody.innerHTML = lines.map(lineRowHtml).join('');
    lines.forEach(wireLineRow);
    lines.forEach(line => { if (line.product_id) populateGroupOptions(line); });
    recalcTotals();
  }

  // Appends exactly one new row to the table, without touching any
  // existing row — this is what keeps adding the 9th, 10th, Nth line
  // item fast and free of the "last line's dropdown doesn't respond"
  // symptom that a full-table rebuild + re-fetch-everything approach
  // used to cause.
  function addLine() {
    const line = blankLine();
    lines.push(line);
    const tbody = document.getElementById('oe-lines-body');
    tbody.insertAdjacentHTML('beforeend', lineRowHtml(line));
    wireLineRow(line);
    recalcTotals();
  }

  function onCustomerChange(e) {
    currentCustomer = customers.find(c => c.id === e.target.value) || null;
    document.getElementById('oe-address').value = currentCustomer?.address || '';
    document.getElementById('oe-freight').value = currentCustomer?.freight || 0;
    // The price list (and therefore every line's valid price groups)
    // depends on the customer, so every line's group selection is reset
    // and its options reloaded — this is the one case that legitimately
    // touches every row, not just the one that changed.
    groupsCache.clear();
    lines.forEach(l => { l.price_group_id = ''; l.group_label = ''; });
    lines.forEach(updateLineRow);
  }

  function lineRowHtml(line) {
    const total = Number(line.qty || 0) * Number(line.final_rate || 0);
    return `<tr data-key="${line._key}">
      <td><select class="form-select ln-product" data-k="${line._key}">
        <option value="">— Product —</option>
        ${products.map(p => `<option value="${p.id}" ${p.id === line.product_id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
      </select></td>
      <td><button type="button" class="form-input ln-shade-btn" data-k="${line._key}" style="text-align:left;cursor:pointer;">${line.shade_text ? escapeHtml(line.shade_text) : '<span style="color:var(--ink-muted);">— Select shade —</span>'}</button></td>
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

  // Re-renders exactly one line's <tr> in place (used after a product
  // change or a customer change, where that row's valid shade/group/pack
  // selection may no longer apply) and re-wires + re-populates just that
  // row — never the whole table.
  function updateLineRow(line) {
    const row = document.querySelector(`tr[data-key="${line._key}"]`);
    if (!row) return;
    row.outerHTML = lineRowHtml(line);
    wireLineRow(line);
    if (line.product_id) populateGroupOptions(line);
    updateRowTotal(line._key);
  }

  // Resolves the current price list's groups for this one line and fills
  // its <select>. Guarded by a per-line sequence number: if the product
  // (or customer) changes again before this fetch lands, the stale
  // result is discarded instead of overwriting a newer selection.
  async function populateGroupOptions(line) {
    const mySeq = (line._groupSeq = (line._groupSeq || 0) + 1);
    const priceListId = currentCustomer?.price_list_id || priceLists.find(p => p.code === 'master')?.id;
    const groups = await priceGroupsFor(line.product_id, priceListId);
    if (line._groupSeq !== mySeq) return; // superseded by a later change
    const sel = document.querySelector(`.ln-group[data-k="${line._key}"]`);
    if (!sel) return;
    sel.innerHTML = `<option value="">— Group —</option>` + groups.map(g => `<option value="${g.id}" ${g.id === line.price_group_id ? 'selected' : ''}>${escapeHtml(g.label)}</option>`).join('');
  }

  function findLine(key) { return lines.find(l => String(l._key) === String(key)); }

  function wireLineRow(line) {
    const row = document.querySelector(`tr[data-key="${line._key}"]`);
    if (!row) return;
    row.querySelector('.ln-product').addEventListener('change', (e) => {
      line.product_id = e.target.value;
      line.shade_id = ''; line.shade_text = ''; line.price_group_id = ''; line.group_label = '';
      updateLineRow(line);
    });
    row.querySelector('.ln-shade-btn').addEventListener('click', () => openShadePicker(line));
    row.querySelector('.ln-group').addEventListener('change', (e) => {
      line.price_group_id = e.target.value;
      line.group_label = e.target.selectedOptions[0]?.textContent || '';
      autoRate(line);
    });
    row.querySelector('.ln-pack').addEventListener('change', (e) => {
      line.pack_size_id = e.target.value;
      autoRate(line);
    });
    row.querySelector('.ln-qty').addEventListener('input', debounce((e) => {
      line.qty = Number(e.target.value || 0);
      updateRowTotal(line._key);
    }, 150));
    row.querySelector('.ln-rate').addEventListener('input', debounce((e) => {
      line.final_rate = Number(e.target.value || 0);
      updateRowTotal(line._key);
    }, 150));
    row.querySelector('.ln-remove').addEventListener('click', () => {
      lines = lines.filter(l => String(l._key) !== String(line._key));
      row.remove();
      if (!lines.length) addLine();
      recalcTotals();
    });
  }

  // Shade picker — a searchable modal list rather than a 140+ option
  // <select>, and not restricted to a per-product subset (that mapping
  // was incomplete, which is why shades used to go missing here).
  function openShadePicker(line) {
    const body = `
      <input class="form-input" id="shade-search" placeholder="Search shade…" autocomplete="off" style="margin-bottom:10px;">
      <div class="table-scroll" style="max-height:320px;border:1px solid var(--stone);border-radius:var(--radius-sm);">
        <div id="shade-list"></div>
      </div>`;
    openModal({ title: 'Select Shade', bodyHtml: body, footHtml: `<button class="btn btn-outline" data-cancel>Close</button>` });
    document.querySelector('[data-cancel]').addEventListener('click', closeModal);
    const listEl = document.getElementById('shade-list');
    function renderList(q) {
      const needle = (q || '').trim().toLowerCase();
      const filtered = needle ? shades.filter(s => s.name.toLowerCase().includes(needle)) : shades;
      listEl.innerHTML = filtered.length
        ? filtered.map(s => `<div class="shade-opt" data-id="${s.id}" style="padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--stone-light);">${escapeHtml(s.name)}</div>`).join('')
        : `<div class="empty-state">No matching shade.</div>`;
      listEl.querySelectorAll('.shade-opt').forEach(el => {
        el.addEventListener('mouseenter', () => { el.style.background = 'var(--stone-light)'; });
        el.addEventListener('mouseleave', () => { el.style.background = ''; });
        el.addEventListener('click', () => {
          line.shade_id = el.dataset.id;
          line.shade_text = shades.find(s => s.id === el.dataset.id)?.name || '';
          closeModal();
          const btn = document.querySelector(`.ln-shade-btn[data-k="${line._key}"]`);
          if (btn) btn.innerHTML = escapeHtml(line.shade_text);
        });
      });
    }
    renderList('');
    document.getElementById('shade-search').addEventListener('input', (e) => renderList(e.target.value));
    document.getElementById('shade-search').focus();
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
      const litres = pack ? Number(pack.litres) * Number(l.qty) : 0;
      return {
        product_id: l.product_id,
        product_text: products.find(p => p.id === l.product_id)?.name || '',
        shade_id: l.shade_id || null,
        shade_text: l.shade_text || '',
        price_group_id: l.price_group_id || null,
        group_label: l.group_label || '',
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
      groupsCache.clear();
      paint();
    } catch (err) {
      toastError(err, 'Could not save order');
    } finally {
      saveBtn.disabled = false; saveBtn.textContent = 'Save Order';
    }
  }
}
