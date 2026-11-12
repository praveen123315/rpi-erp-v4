// Production Sheet — new module (the old one generated/printed but saved
// nothing). Pick a product + batch size, optionally pull RM quantities
// from a saved costing scaled to the batch, save header + RM lines.
import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtDate, fmtNum, toast, toastError, openModal, closeModal, filterRows, emptyRow, debounce } from '../ui.js';

let products = [], rawMaterials = [], costings = [];
let sheets = [];
let rmLines = [{ _key: 1, raw_material_id: '', qty: 0, unit: 'kg' }];

async function loadStatics() {
  const [p, rm, c, s] = await Promise.all([
    supabase.from('products').select('id,name').eq('is_active', true).order('sort_order'),
    supabase.from('raw_materials').select('id,code,name').eq('is_active', true).order('code'),
    supabase.from('costings').select('id,product_name,shade_text,batch_size_kg').order('created_at', { ascending: false }).limit(200),
    supabase.from('production_sheets').select('*, products(name)').order('created_at', { ascending: false }).limit(200),
  ]);
  products = p.data || []; rawMaterials = rm.data || []; costings = c.data || []; sheets = s.data || [];
}

export async function renderProductionSheet(container) {
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Loading…</div>`;
  try {
    await loadStatics();
  } catch (err) {
    toastError(err, 'Could not load Production Sheet');
    container.innerHTML = `<div class="empty-state">Could not load production sheets.</div>`;
    return;
  }
  rmLines = [{ _key: 1, raw_material_id: '', qty: 0, unit: 'kg' }];
  paint();

  function paint() {
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">Production Sheet</h2><p class="section-sub">Daily production planning — saved records, unlike the old print-only sheet</p></div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div class="form-grid">
          <div class="form-field"><label class="form-label">Date</label><input class="form-input" type="date" id="ps-date" value="${new Date().toISOString().slice(0, 10)}"></div>
          <div class="form-field"><label class="form-label">Product</label>
            <select class="form-select" id="ps-product"><option value="">— Select —</option>
              ${products.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-field"><label class="form-label">Shade</label><input class="form-input" id="ps-shade"></div>
          <div class="form-field"><label class="form-label">Batch Size</label><input class="form-input" type="number" step="0.001" id="ps-batch" value="1000"></div>
          <div class="form-field span-2"><label class="form-label">Pull RM from a saved costing (optional)</label>
            <select class="form-select" id="ps-costing"><option value="">— None —</option>
              ${costings.map(c => `<option value="${c.id}">${escapeHtml(c.product_name)} ${c.shade_text ? '— ' + escapeHtml(c.shade_text) : ''} (batch ${c.batch_size_kg})</option>`).join('')}
            </select>
          </div>
          <div class="form-field span-2"><label class="form-label">Notes</label><textarea class="form-textarea" id="ps-notes"></textarea></div>
        </div>
      </div>
      <div class="table-wrap" style="margin-bottom:16px;">
        <div class="table-toolbar"><strong>Raw material lines</strong><button class="btn btn-outline btn-sm" id="ps-add-line">+ Add RM</button></div>
        <div class="table-scroll" style="max-height:none;"><table class="erp-table">
          <thead><tr><th>Raw Material</th><th>Qty</th><th>Unit</th><th></th></tr></thead>
          <tbody id="ps-lines-body"></tbody>
        </table></div>
      </div>
      <button class="btn btn-primary" id="ps-save">Save Production Sheet</button>

      <div class="table-wrap" style="margin-top:28px;">
        <div class="table-toolbar"><strong>Recent sheets</strong><div class="search-box"><input class="form-input" id="ps-search" placeholder="Search…"></div></div>
        <div class="table-scroll"><table class="erp-table">
          <thead><tr><th>Sheet #</th><th>Date</th><th>Product</th><th>Shade</th><th>Batch</th><th></th></tr></thead>
          <tbody id="ps-sheets-body">${sheetsRowsHtml(sheets)}</tbody>
        </table></div>
      </div>
    `;
    document.getElementById('ps-add-line').addEventListener('click', () => {
      rmLines.push({ _key: (rmLines.at(-1)?._key || 0) + 1, raw_material_id: '', qty: 0, unit: 'kg' });
      renderLines();
    });
    document.getElementById('ps-costing').addEventListener('change', pullFromCosting);
    document.getElementById('ps-save').addEventListener('click', saveSheet);
    document.getElementById('ps-search').addEventListener('input', debounce((e) => {
      const filtered = filterRows(sheets.map(s => ({ ...s, product_name: s.products?.name || s.product_text })), e.target.value, ['product_name', 'shade_text']);
      document.getElementById('ps-sheets-body').innerHTML = sheetsRowsHtml(filtered);
    }, 200));
    renderLines();
  }

  function sheetsRowsHtml(rows) {
    if (!rows.length) return emptyRow(6, 'No production sheets yet.');
    return rows.map(s => `<tr>
      <td>#${s.sheet_no}</td><td>${fmtDate(s.sheet_date)}</td>
      <td>${escapeHtml(s.products?.name || s.product_text || '—')}</td>
      <td>${escapeHtml(s.shade_text || '—')}</td>
      <td>${fmtNum(s.batch_size)}</td><td></td>
    </tr>`).join('');
  }

  function renderLines() {
    const tbody = document.getElementById('ps-lines-body');
    tbody.innerHTML = rmLines.map(l => `
      <tr data-key="${l._key}">
        <td><select class="form-select pl-rm" data-k="${l._key}">
          <option value="">— Select —</option>
          ${rawMaterials.map(rm => `<option value="${rm.id}" ${rm.id === l.raw_material_id ? 'selected' : ''}>${escapeHtml(rm.code)} — ${escapeHtml(rm.name)}</option>`).join('')}
        </select></td>
        <td><input class="form-input pl-qty" data-k="${l._key}" type="number" step="0.0001" value="${l.qty}"></td>
        <td><input class="form-input pl-unit" data-k="${l._key}" value="${escapeHtml(l.unit)}" style="width:70px;"></td>
        <td><button class="btn btn-ghost btn-sm pl-remove" data-k="${l._key}">✕</button></td>
      </tr>`).join('');
    tbody.querySelectorAll('.pl-rm').forEach(el => el.addEventListener('change', e => {
      rmLines.find(l => String(l._key) === e.target.dataset.k).raw_material_id = e.target.value;
    }));
    tbody.querySelectorAll('.pl-qty').forEach(el => el.addEventListener('input', e => {
      rmLines.find(l => String(l._key) === e.target.dataset.k).qty = Number(e.target.value || 0);
    }));
    tbody.querySelectorAll('.pl-unit').forEach(el => el.addEventListener('input', e => {
      rmLines.find(l => String(l._key) === e.target.dataset.k).unit = e.target.value;
    }));
    tbody.querySelectorAll('.pl-remove').forEach(el => el.addEventListener('click', e => {
      rmLines = rmLines.filter(l => String(l._key) !== e.target.dataset.k);
      if (!rmLines.length) rmLines = [{ _key: 1, raw_material_id: '', qty: 0, unit: 'kg' }];
      renderLines();
    }));
  }

  async function pullFromCosting(e) {
    const costingId = e.target.value;
    if (!costingId) return;
    const costing = costings.find(c => c.id === costingId);
    const { data: rows, error } = await supabase.from('costing_rm_rows').select('*').eq('costing_id', costingId).order('line_no');
    if (error) { toastError(error, 'Could not load costing RM rows'); return; }
    const batchSize = Number(document.getElementById('ps-batch').value || costing.batch_size_kg || 1);
    const scale = costing.batch_size_kg ? batchSize / Number(costing.batch_size_kg) : 1;
    rmLines = (rows || []).map((r, i) => ({ _key: i + 1, raw_material_id: r.raw_material_id, qty: Number(r.qty_kg) * scale, unit: 'kg' }));
    if (!rmLines.length) rmLines = [{ _key: 1, raw_material_id: '', qty: 0, unit: 'kg' }];
    renderLines();
    toast(`Pulled ${rows?.length || 0} RM lines, scaled to batch size`, 'success');
  }

  async function saveSheet() {
    const productId = document.getElementById('ps-product').value;
    if (!productId) { toast('Select a product', 'error'); return; }
    const product = products.find(p => p.id === productId);
    const header = {
      sheet_date: document.getElementById('ps-date').value,
      product_id: productId,
      product_text: product?.name || '',
      shade_text: document.getElementById('ps-shade').value || '',
      batch_size: Number(document.getElementById('ps-batch').value || 0),
      source_costing_id: document.getElementById('ps-costing').value || null,
      notes: document.getElementById('ps-notes').value || '',
    };
    const validLines = rmLines.filter(l => l.raw_material_id && Number(l.qty) > 0);
    const btn = document.getElementById('ps-save');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const { data: sheet, error } = await supabase.from('production_sheets').insert(header).select().single();
      if (error) throw error;
      if (validLines.length) {
        const rows = validLines.map((l, i) => ({
          sheet_id: sheet.id, line_no: i + 1, raw_material_id: l.raw_material_id,
          rm_code: rawMaterials.find(rm => rm.id === l.raw_material_id)?.code || '',
          rm_name: rawMaterials.find(rm => rm.id === l.raw_material_id)?.name || '',
          qty: Number(l.qty), unit: l.unit || 'kg',
        }));
        const { error: lineErr } = await supabase.from('production_sheet_lines').insert(rows);
        if (lineErr) throw lineErr;
      }
      toast(`Production Sheet #${sheet.sheet_no} saved`, 'success');
      await loadStatics();
      rmLines = [{ _key: 1, raw_material_id: '', qty: 0, unit: 'kg' }];
      paint();
    } catch (err) {
      toastError(err, 'Could not save production sheet');
    } finally {
      btn.disabled = false; btn.textContent = 'Save Production Sheet';
    }
  }
}
