// Formulation Costing — build a costing (RM rows + pack costs), saved via
// the save_costing(p_costing, p_rm_rows, p_packs) RPC.
import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, fmtNum, toast, toastError, debounce } from '../ui.js';

let products = [], rawMaterials = [], packSizes = [], packaging = {};
let rmRows = [{ _key: 1, raw_material_id: '', qty_kg: 0 }];
let selectedPacks = new Set();
let editingId = null;

async function loadStatics() {
  const [p, rm, ps, pk] = await Promise.all([
    supabase.from('products').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('raw_materials').select('*').eq('is_active', true).order('code'),
    supabase.from('pack_sizes').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('packaging').select('*'),
  ]);
  products = p.data || []; rawMaterials = rm.data || []; packSizes = ps.data || [];
  packaging = {}; (pk.data || []).forEach(r => { packaging[r.pack_size_id] = r; });
}

function rmPrice(id) { return Number(rawMaterials.find(r => r.id === id)?.price || 0); }

export async function renderFormulationCosting(container) {
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Loading…</div>`;
  try {
    await loadStatics();
  } catch (err) {
    toastError(err, 'Could not load costing masters');
    container.innerHTML = `<div class="empty-state">Could not load formulation costing.</div>`;
    return;
  }
  reset();
  paint();

  function reset() {
    editingId = null;
    rmRows = [{ _key: 1, raw_material_id: '', qty_kg: 0 }];
    selectedPacks = new Set();
  }

  function paint() {
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">Formulation Costing</h2><p class="section-sub">Build RM cost, manufacturing cost and pack-wise selling price</p></div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div class="form-grid">
          <div class="form-field span-2">
            <label class="form-label">Product</label>
            <select class="form-select" id="fc-product">
              <option value="">— Select / free text below —</option>
              ${products.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-field"><label class="form-label">Shade</label><input class="form-input" id="fc-shade"></div>
          <div class="form-field"><label class="form-label">Version</label><input class="form-input" id="fc-version"></div>
          <div class="form-field"><label class="form-label">Batch Size (kg)</label><input class="form-input" id="fc-batch" type="number" step="0.001" value="1000"></div>
          <div class="form-field"><label class="form-label">Weight / Litre (kg)</label><input class="form-input" id="fc-weight" type="number" step="0.0001" value="1.3"></div>
          <div class="form-field"><label class="form-label">Discount % (for selling price)</label><input class="form-input" id="fc-discount" type="number" step="0.1" value="35"></div>
          <div class="form-field" style="flex-direction:row;align-items:center;gap:8px;padding-top:18px;">
            <input type="checkbox" id="fc-mfg-override" style="width:16px;height:16px;">
            <label class="form-label" style="margin:0;" for="fc-mfg-override">Override mfg cost %</label>
          </div>
          <div class="form-field"><label class="form-label">Mfg Cost % (if overridden)</label><input class="form-input" id="fc-mfg-pct" type="number" step="0.01" value="7"></div>
        </div>
      </div>

      <div class="table-wrap" style="margin-bottom:16px;">
        <div class="table-toolbar"><strong>Raw materials</strong><button class="btn btn-outline btn-sm" id="fc-add-rm">+ Add RM</button></div>
        <div class="table-scroll" style="max-height:none;">
          <table class="erp-table"><thead><tr><th>Raw Material</th><th>Rate / kg</th><th>Qty (kg)</th><th>Amount</th><th></th></tr></thead>
          <tbody id="fc-rm-body"></tbody></table>
        </div>
      </div>

      <div class="stat-grid" id="fc-summary"></div>

      <div class="table-wrap" style="margin-bottom:16px;">
        <div class="table-toolbar"><strong>Pack-wise selling price</strong></div>
        <div style="padding:14px 16px;display:flex;flex-wrap:wrap;gap:10px;" id="fc-pack-picker"></div>
        <div class="table-scroll" style="max-height:none;" id="fc-pack-table"></div>
      </div>

      <button class="btn btn-primary" id="fc-save">Save Costing</button>
    `;

    document.getElementById('fc-add-rm').addEventListener('click', () => {
      rmRows.push({ _key: (rmRows.at(-1)?._key || 0) + 1, raw_material_id: '', qty_kg: 0 });
      renderRmRows();
    });
    ['fc-batch', 'fc-weight', 'fc-discount', 'fc-mfg-pct'].forEach(id =>
      document.getElementById(id).addEventListener('input', debounce(recalc, 150)));
    document.getElementById('fc-mfg-override').addEventListener('change', recalc);
    document.getElementById('fc-save').addEventListener('click', saveCosting);

    renderRmRows();
    renderPackPicker();
    recalc();
  }

  function renderRmRows() {
    const tbody = document.getElementById('fc-rm-body');
    tbody.innerHTML = rmRows.map(r => {
      const amount = rmPrice(r.raw_material_id) * Number(r.qty_kg || 0);
      return `<tr data-key="${r._key}">
        <td><select class="form-select rm-select" data-k="${r._key}">
          <option value="">— Select —</option>
          ${rawMaterials.map(rm => `<option value="${rm.id}" ${rm.id === r.raw_material_id ? 'selected' : ''}>${escapeHtml(rm.code)} — ${escapeHtml(rm.name)}</option>`).join('')}
        </select></td>
        <td class="mono">${fmtMoney(rmPrice(r.raw_material_id), 4)}</td>
        <td><input class="form-input rm-qty" data-k="${r._key}" type="number" step="0.0001" value="${r.qty_kg}"></td>
        <td class="mono rm-amount">${fmtMoney(amount)}</td>
        <td><button class="btn btn-ghost btn-sm rm-remove" data-k="${r._key}">✕</button></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('.rm-select').forEach(el => el.addEventListener('change', e => {
      rmRows.find(r => String(r._key) === e.target.dataset.k).raw_material_id = e.target.value;
      renderRmRows(); recalc();
    }));
    tbody.querySelectorAll('.rm-qty').forEach(el => el.addEventListener('input', debounce(e => {
      rmRows.find(r => String(r._key) === e.target.dataset.k).qty_kg = Number(e.target.value || 0);
      recalc();
    }, 150)));
    tbody.querySelectorAll('.rm-remove').forEach(el => el.addEventListener('click', e => {
      rmRows = rmRows.filter(r => String(r._key) !== e.target.dataset.k);
      if (!rmRows.length) rmRows = [{ _key: 1, raw_material_id: '', qty_kg: 0 }];
      renderRmRows(); recalc();
    }));
  }

  function renderPackPicker() {
    const el = document.getElementById('fc-pack-picker');
    el.innerHTML = packSizes.map(ps => `
      <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;border:1px solid var(--stone);padding:6px 10px;border-radius:8px;cursor:pointer;">
        <input type="checkbox" class="pack-pick" data-id="${ps.id}" ${selectedPacks.has(ps.id) ? 'checked' : ''} style="width:14px;height:14px;">
        ${escapeHtml(ps.label)}
      </label>`).join('');
    el.querySelectorAll('.pack-pick').forEach(cb => cb.addEventListener('change', e => {
      if (e.target.checked) selectedPacks.add(e.target.dataset.id); else selectedPacks.delete(e.target.dataset.id);
      recalc();
    }));
  }

  function computeTotals() {
    const totalRmCost = rmRows.reduce((s, r) => s + rmPrice(r.raw_material_id) * Number(r.qty_kg || 0), 0);
    const batchSize = Number(document.getElementById('fc-batch')?.value || 0);
    const weightPerLitre = Number(document.getElementById('fc-weight')?.value || 0) || 1;
    const totalLitres = weightPerLitre > 0 ? batchSize / weightPerLitre : 0;
    const override = document.getElementById('fc-mfg-override')?.checked;
    const mfgPctInput = Number(document.getElementById('fc-mfg-pct')?.value || 0);
    let mfgCost;
    if (override) {
      mfgCost = totalRmCost * (mfgPctInput / 100);
    } else {
      mfgCost = Math.min(totalRmCost * 0.07, 10 * totalLitres);
    }
    const totalCost = totalRmCost + mfgCost;
    const perLitreCost = totalLitres > 0 ? totalCost / totalLitres : 0;
    const discountPct = Number(document.getElementById('fc-discount')?.value || 0);
    return { totalRmCost, mfgCost, totalCost, totalLitres, perLitreCost, discountPct, batchSize, weightPerLitre };
  }

  function recalc() {
    const t = computeTotals();
    document.querySelectorAll('.rm-amount').forEach((el, i) => {
      const r = rmRows[i];
      if (r) el.textContent = fmtMoney(rmPrice(r.raw_material_id) * Number(r.qty_kg || 0));
    });
    document.getElementById('fc-summary').innerHTML = `
      <div class="stat-card"><div class="stat-number">${fmtMoney(t.totalRmCost)}</div><div class="stat-label">Total RM Cost</div></div>
      <div class="stat-card"><div class="stat-number">${fmtMoney(t.mfgCost)}</div><div class="stat-label">Mfg Cost</div></div>
      <div class="stat-card"><div class="stat-number">${fmtMoney(t.totalCost)}</div><div class="stat-label">Total Cost</div></div>
      <div class="stat-card"><div class="stat-number">${fmtNum(t.totalLitres)}</div><div class="stat-label">Total Litres</div></div>
      <div class="stat-card"><div class="stat-number">${fmtMoney(t.perLitreCost, 4)}</div><div class="stat-label">Per Litre Cost</div></div>
    `;
    const packTable = document.getElementById('fc-pack-table');
    const selected = packSizes.filter(ps => selectedPacks.has(ps.id));
    if (!selected.length) {
      packTable.innerHTML = `<div class="empty-state">Pick one or more pack sizes above.</div>`;
      return;
    }
    packTable.innerHTML = `<table class="erp-table">
      <thead><tr><th>Pack</th><th>Paint Cost</th><th>Container</th><th>Carton/Unit</th><th>Final Cost</th><th>Selling Price</th><th>Profit</th><th>Profit %</th></tr></thead>
      <tbody>${selected.map(ps => {
        const pk = packaging[ps.id] || { container_cost: 0, carton_cost: 0, units_per_carton: 1 };
        const paintCost = t.perLitreCost * Number(ps.litres);
        const cartonPerUnit = Number(pk.carton_cost || 0) / (Number(pk.units_per_carton) || 1);
        const finalCost = paintCost + Number(pk.container_cost || 0) + cartonPerUnit;
        const sellingPrice = t.discountPct < 100 ? finalCost / (1 - t.discountPct / 100) : finalCost;
        const profit = sellingPrice - finalCost;
        const profitPct = finalCost > 0 ? (profit / finalCost) * 100 : 0;
        return `<tr data-pack="${ps.id}">
          <td>${escapeHtml(ps.label)}</td>
          <td class="mono">${fmtMoney(paintCost)}</td>
          <td class="mono">${fmtMoney(pk.container_cost)}</td>
          <td class="mono">${fmtMoney(cartonPerUnit)}</td>
          <td class="mono">${fmtMoney(finalCost)}</td>
          <td class="mono">${fmtMoney(sellingPrice)}</td>
          <td class="mono">${fmtMoney(profit)}</td>
          <td class="mono">${fmtNum(profitPct, 1)}%</td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }

  async function saveCosting() {
    const t = computeTotals();
    const productId = document.getElementById('fc-product').value;
    const product = products.find(p => p.id === productId);
    const costingPayload = {
      product_id: productId || null,
      product_name: product?.name || '',
      category: product?.category || 'other',
      shade_text: document.getElementById('fc-shade').value || '',
      version: document.getElementById('fc-version').value || '',
      batch_size_kg: t.batchSize,
      weight_per_litre: t.weightPerLitre,
      mfg_manual_override: document.getElementById('fc-mfg-override').checked,
      mfg_cost_pct: Number(document.getElementById('fc-mfg-pct').value || 0),
      total_rm_cost: t.totalRmCost,
      mfg_cost: t.mfgCost,
      total_cost: t.totalCost,
      total_litres: t.totalLitres,
      per_litre_cost: t.perLitreCost,
      discount_pct_used: t.discountPct,
    };
    const rmPayload = rmRows.filter(r => r.raw_material_id && Number(r.qty_kg) > 0).map(r => ({
      raw_material_id: r.raw_material_id,
      rm_code: rawMaterials.find(rm => rm.id === r.raw_material_id)?.code || '',
      rm_name: rawMaterials.find(rm => rm.id === r.raw_material_id)?.name || '',
      price_per_kg: rmPrice(r.raw_material_id),
      qty_kg: Number(r.qty_kg),
      amount: rmPrice(r.raw_material_id) * Number(r.qty_kg),
    }));
    if (!rmPayload.length) { toast('Add at least one raw material', 'error'); return; }
    const packRows = Array.from(document.querySelectorAll('#fc-pack-table tr[data-pack]')).map(tr => {
      const psId = tr.dataset.pack;
      const cells = tr.querySelectorAll('td');
      return {
        pack_size_id: psId,
        paint_cost: parseFloat(cells[1].textContent.replace(/[^0-9.-]/g, '')) || 0,
        container_cost: parseFloat(cells[2].textContent.replace(/[^0-9.-]/g, '')) || 0,
        carton_cost_per_unit: parseFloat(cells[3].textContent.replace(/[^0-9.-]/g, '')) || 0,
        final_pack_cost: parseFloat(cells[4].textContent.replace(/[^0-9.-]/g, '')) || 0,
        selling_price: parseFloat(cells[5].textContent.replace(/[^0-9.-]/g, '')) || 0,
        profit: parseFloat(cells[6].textContent.replace(/[^0-9.-]/g, '')) || 0,
        profit_pct: parseFloat(cells[7].textContent.replace(/[^0-9.-]/g, '')) || 0,
      };
    });

    const btn = document.getElementById('fc-save');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      if (editingId) costingPayload.id = editingId;
      const { data, error } = await supabase.rpc('save_costing', { p_costing: costingPayload, p_rm_rows: rmPayload, p_packs: packRows });
      if (error) throw error;
      editingId = data.id;
      toast('Costing saved', 'success');
    } catch (err) {
      toastError(err, 'Could not save costing');
    } finally {
      btn.disabled = false; btn.textContent = 'Save Costing';
    }
  }
}
