// BOM Recipes — bill of materials per product (+ optional shade), each
// with raw-material lines. Was a hidden, broken stub in the old app;
// this is a real module. No dedicated RPC exists for BOMs, so header +
// lines are written directly (replace-all-lines pattern, same as costing).
import { supabase } from '../supabaseClient.js';
import { isAdmin } from '../auth.js';
import { escapeHtml, fmtNum, toast, toastError, openModal, closeModal, confirmDialog, filterRows, emptyRow, debounce } from '../ui.js';

let boms = [], products = [], rawMaterials = [];

async function loadStatics() {
  const [b, p, rm] = await Promise.all([
    supabase.from('boms').select('*, products(name)').order('updated_at', { ascending: false }),
    supabase.from('products').select('id,name').eq('is_active', true).order('sort_order'),
    supabase.from('raw_materials').select('id,code,name,price,unit').eq('is_active', true).order('code'),
  ]);
  boms = b.data || []; products = p.data || []; rawMaterials = rm.data || [];
}

export async function renderBomRecipes(container) {
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Loading…</div>`;
  try {
    await loadStatics();
  } catch (err) {
    toastError(err, 'Could not load BOM Recipes');
    container.innerHTML = `<div class="empty-state">Could not load BOM recipes.</div>`;
    return;
  }
  paint();

  function paint() {
    const admin = isAdmin();
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">BOM Recipes</h2><p class="section-sub">${boms.length} recipe${boms.length === 1 ? '' : 's'}</p></div>
        ${admin ? `<button class="btn btn-primary" id="bom-add">+ New BOM</button>` : ''}
      </div>
      <div class="table-wrap">
        <div class="table-toolbar"><div class="search-box"><input class="form-input" id="bom-search" placeholder="Search product or shade…"></div></div>
        <div class="table-scroll">
          <table class="erp-table">
            <thead><tr><th>Product</th><th>Shade</th><th>Batch Size (kg)</th><th>RM Lines</th><th>Status</th><th></th></tr></thead>
            <tbody id="bom-tbody">${rowsHtml(boms)}</tbody>
          </table>
        </div>
      </div>`;
    document.getElementById('bom-add')?.addEventListener('click', () => openEditor(null));
    document.getElementById('bom-search').addEventListener('input', debounce((e) => {
      const filtered = filterRows(boms, e.target.value, ['product_name', 'shade_text']);
      document.getElementById('bom-tbody').innerHTML = rowsHtml(filtered);
      wireRows();
    }, 200));
    wireRows();
  }

  function rowsHtml(rows) {
    const admin = isAdmin();
    if (!rows.length) return emptyRow(6, 'No BOM recipes yet.');
    return rows.map(b => `
      <tr>
        <td>${escapeHtml(b.products?.name || b.product_name || '—')}</td>
        <td>${escapeHtml(b.shade_text || '—')}</td>
        <td>${fmtNum(b.batch_size)}</td>
        <td id="bom-lc-${b.id}">…</td>
        <td>${b.is_active === false ? '<span class="badge badge-gray">Inactive</span>' : '<span class="badge badge-green">Active</span>'}</td>
        <td><div class="row-actions">
          <button class="btn btn-outline btn-sm" data-edit="${b.id}">${admin ? 'Edit' : 'View'}</button>
        </div></td>
      </tr>`).join('');
  }

  function wireRows() {
    container.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openEditor(boms.find(x => x.id === b.dataset.edit))));
    boms.forEach(async b => {
      const el = document.getElementById(`bom-lc-${b.id}`);
      if (!el) return;
      const { count } = await supabase.from('bom_lines').select('id', { count: 'exact', head: true }).eq('bom_id', b.id);
      if (el) el.textContent = count ?? 0;
    });
  }

  async function openEditor(bom) {
    const admin = isAdmin();
    let rmLines = [];
    if (bom) {
      const { data } = await supabase.from('bom_lines').select('*').eq('bom_id', bom.id).order('line_no');
      rmLines = (data || []).map(l => ({ _key: l.line_no, raw_material_id: l.raw_material_id, qty: l.qty, unit: l.unit }));
    }
    if (!rmLines.length) rmLines = [{ _key: 1, raw_material_id: '', qty: 0, unit: 'kg' }];

    const body = `
      <div class="form-grid" style="margin-bottom:14px;">
        <div class="form-field span-2">
          <label class="form-label">Product <span class="req">*</span></label>
          <select class="form-select" id="bom-product" ${!admin ? 'disabled' : ''}>
            <option value="">— Select —</option>
            ${products.map(p => `<option value="${p.id}" ${p.id === bom?.product_id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-field"><label class="form-label">Shade (optional)</label><input class="form-input" id="bom-shade" value="${escapeHtml(bom?.shade_text || '')}" ${!admin ? 'disabled' : ''}></div>
        <div class="form-field"><label class="form-label">Batch Size (kg)</label><input class="form-input" id="bom-batch" type="number" step="0.001" value="${bom?.batch_size || 1000}" ${!admin ? 'disabled' : ''}></div>
      </div>
      <div class="table-wrap">
        <div class="table-toolbar"><strong>Raw material lines</strong>${admin ? `<button class="btn btn-outline btn-sm" id="bom-add-line">+ Add RM</button>` : ''}</div>
        <div class="table-scroll" style="max-height:320px;">
          <table class="erp-table"><thead><tr><th>Raw Material</th><th>Qty</th><th>Unit</th><th></th></tr></thead>
          <tbody id="bom-lines-body"></tbody></table>
        </div>
      </div>`;
    openModal({
      title: bom ? 'Edit BOM' : 'New BOM',
      bodyHtml: body,
      wide: true,
      footHtml: admin ? `<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save BOM</button>` : `<button class="btn btn-outline" data-cancel>Close</button>`,
    });
    renderLines();
    document.querySelector('[data-cancel]').addEventListener('click', closeModal);
    document.getElementById('bom-add-line')?.addEventListener('click', () => {
      rmLines.push({ _key: (rmLines.at(-1)?._key || 0) + 1, raw_material_id: '', qty: 0, unit: 'kg' });
      renderLines();
    });
    document.querySelector('[data-save]')?.addEventListener('click', () => saveBom(bom));

    function renderLines() {
      const tbody = document.getElementById('bom-lines-body');
      tbody.innerHTML = rmLines.map(l => `
        <tr data-key="${l._key}">
          <td><select class="form-select bl-rm" data-k="${l._key}" ${!admin ? 'disabled' : ''}>
            <option value="">— Select —</option>
            ${rawMaterials.map(rm => `<option value="${rm.id}" ${rm.id === l.raw_material_id ? 'selected' : ''}>${escapeHtml(rm.code)} — ${escapeHtml(rm.name)}</option>`).join('')}
          </select></td>
          <td><input class="form-input bl-qty" data-k="${l._key}" type="number" step="0.0001" value="${l.qty}" ${!admin ? 'disabled' : ''}></td>
          <td><input class="form-input bl-unit" data-k="${l._key}" value="${escapeHtml(l.unit)}" style="width:70px;" ${!admin ? 'disabled' : ''}></td>
          <td>${admin ? `<button class="btn btn-ghost btn-sm bl-remove" data-k="${l._key}">✕</button>` : ''}</td>
        </tr>`).join('');
      tbody.querySelectorAll('.bl-rm').forEach(el => el.addEventListener('change', e => {
        const line = rmLines.find(l => String(l._key) === e.target.dataset.k);
        line.raw_material_id = e.target.value;
      }));
      tbody.querySelectorAll('.bl-qty').forEach(el => el.addEventListener('input', e => {
        const line = rmLines.find(l => String(l._key) === e.target.dataset.k);
        line.qty = Number(e.target.value || 0);
      }));
      tbody.querySelectorAll('.bl-unit').forEach(el => el.addEventListener('input', e => {
        const line = rmLines.find(l => String(l._key) === e.target.dataset.k);
        line.unit = e.target.value;
      }));
      tbody.querySelectorAll('.bl-remove').forEach(el => el.addEventListener('click', e => {
        rmLines = rmLines.filter(l => String(l._key) !== e.target.dataset.k);
        if (!rmLines.length) rmLines = [{ _key: 1, raw_material_id: '', qty: 0, unit: 'kg' }];
        renderLines();
      }));
    }

    async function saveBom() {
      const productId = document.getElementById('bom-product').value;
      if (!productId) { toast('Select a product', 'error'); return; }
      const product = products.find(p => p.id === productId);
      const header = {
        product_id: productId,
        product_name: product?.name || '',
        shade_text: document.getElementById('bom-shade').value || '',
        batch_size: Number(document.getElementById('bom-batch').value || 1000),
      };
      try {
        let bomId = bom?.id;
        if (bomId) {
          const { error } = await supabase.from('boms').update(header).eq('id', bomId);
          if (error) throw error;
          await supabase.from('bom_lines').delete().eq('bom_id', bomId);
        } else {
          const { data, error } = await supabase.from('boms').insert(header).select().single();
          if (error) throw error;
          bomId = data.id;
        }
        const validLines = rmLines.filter(l => l.raw_material_id && Number(l.qty) > 0);
        if (validLines.length) {
          const rows = validLines.map((l, i) => ({
            bom_id: bomId, line_no: i + 1, raw_material_id: l.raw_material_id,
            rm_code: rawMaterials.find(rm => rm.id === l.raw_material_id)?.code || '',
            qty: Number(l.qty), unit: l.unit || 'kg',
          }));
          const { error } = await supabase.from('bom_lines').insert(rows);
          if (error) throw error;
        }
        toast('BOM saved', 'success');
        closeModal();
        await loadStatics();
        paint();
      } catch (err) {
        toastError(err, 'Could not save BOM');
      }
    }
  }
}
