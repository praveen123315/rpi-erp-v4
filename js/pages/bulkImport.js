// Bulk Import — paste a CSV to bulk-update Raw Materials (price/rate
// refresh is the common operational need) or Customers. Matches existing
// rows by their natural key (RM code / customer code) and updates them;
// unmatched rows are inserted as new.
import { supabase } from '../supabaseClient.js';
import { escapeHtml, toast, toastError, emptyRow } from '../ui.js';

const TARGETS = {
  raw_materials: {
    label: 'Raw Materials (code, name, price, unit, supplier)',
    headers: ['code', 'name', 'price', 'unit', 'supplier'],
    matchField: 'code',
    buildRow: (cols) => ({ code: cols.code, name: cols.name, price: Number(cols.price || 0), unit: cols.unit || 'kg', supplier: cols.supplier || '' }),
  },
  customers: {
    label: 'Customers (customer_code, name, phone, address)',
    headers: ['customer_code', 'name', 'phone', 'address'],
    matchField: 'customer_code',
    buildRow: (cols) => ({ customer_code: cols.customer_code, name: cols.name, phone: cols.phone || '', address: cols.address || '' }),
  },
};

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows = lines.slice(1).map(line => {
    const cells = line.split(',').map(c => c.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
}

export async function renderBulkImport(container) {
  paint();
  let parsed = null;

  function paint() {
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">Bulk Import</h2><p class="section-sub">Paste CSV data to bulk-update raw materials or customers (admin only)</p></div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div class="form-grid">
          <div class="form-field span-2">
            <label class="form-label">Target table</label>
            <select class="form-select" id="bi-target">
              ${Object.entries(TARGETS).map(([k, t]) => `<option value="${k}">${escapeHtml(t.label)}</option>`).join('')}
            </select>
          </div>
          <div class="form-field span-2">
            <label class="form-label">CSV (first row = headers, comma-separated)</label>
            <textarea class="form-textarea" id="bi-csv" style="min-height:160px;" placeholder="code,name,price,unit,supplier&#10;LIT-001,Litharge,185.5,kg,ABC Suppliers"></textarea>
          </div>
        </div>
        <div class="gap-2" style="margin-top:12px;">
          <button class="btn btn-outline" id="bi-preview">Preview</button>
          <button class="btn btn-primary" id="bi-import" disabled>Import</button>
        </div>
      </div>
      <div id="bi-preview-area"></div>
    `;
    document.getElementById('bi-preview').addEventListener('click', preview);
    document.getElementById('bi-import').addEventListener('click', doImport);
  }

  function preview() {
    const targetKey = document.getElementById('bi-target').value;
    const target = TARGETS[targetKey];
    const text = document.getElementById('bi-csv').value;
    parsed = parseCsv(text);
    const missing = target.headers.filter(h => !parsed.headers.includes(h));
    const area = document.getElementById('bi-preview-area');
    if (!parsed.rows.length) {
      area.innerHTML = `<div class="empty-state">Paste some CSV data first.</div>`;
      document.getElementById('bi-import').disabled = true;
      return;
    }
    if (missing.length) {
      area.innerHTML = `<div class="empty-state">Missing required column(s): ${missing.map(escapeHtml).join(', ')}</div>`;
      document.getElementById('bi-import').disabled = true;
      return;
    }
    area.innerHTML = `
      <div class="table-wrap">
        <div class="table-toolbar"><strong>Preview</strong><span class="text-muted">${parsed.rows.length} row(s)</span></div>
        <div class="table-scroll" style="max-height:320px;">
          <table class="erp-table"><thead><tr>${target.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody>${parsed.rows.slice(0, 50).map(r => `<tr>${target.headers.map(h => `<td>${escapeHtml(r[h] || '')}</td>`).join('')}</tr>`).join('') || emptyRow(target.headers.length, 'No rows.')}</tbody></table>
        </div>
      </div>`;
    document.getElementById('bi-import').disabled = false;
  }

  async function doImport() {
    const targetKey = document.getElementById('bi-target').value;
    const target = TARGETS[targetKey];
    if (!parsed || !parsed.rows.length) { toast('Preview first', 'error'); return; }
    const btn = document.getElementById('bi-import');
    btn.disabled = true; btn.textContent = 'Importing…';
    try {
      const { data: existing, error: fErr } = await supabase.from(targetKey).select(`id, ${target.matchField}`);
      if (fErr) throw fErr;
      const byKey = {};
      (existing || []).forEach(r => { byKey[String(r[target.matchField]).trim().toLowerCase()] = r.id; });

      let inserted = 0, updated = 0, skipped = 0;
      for (const row of parsed.rows) {
        const keyVal = (row[target.matchField] || '').trim();
        if (!keyVal) { skipped++; continue; }
        const payload = target.buildRow(row);
        const existingId = byKey[keyVal.toLowerCase()];
        if (existingId) {
          const { error } = await supabase.from(targetKey).update(payload).eq('id', existingId);
          if (error) throw error;
          updated++;
        } else {
          const { error } = await supabase.from(targetKey).insert(payload);
          if (error) throw error;
          inserted++;
        }
      }
      toast(`Import done: ${inserted} added, ${updated} updated${skipped ? `, ${skipped} skipped (no key)` : ''}`, 'success');
    } catch (err) {
      toastError(err, 'Import failed partway through — check the data and try again');
    } finally {
      btn.disabled = false; btn.textContent = 'Import';
    }
  }
}
