// Custom Reports — a drag-and-drop, pivot-table-style report builder over
// Final PI (registered sales) data. The user drags Dimension fields into
// Rows/Columns and Measure fields into Values, then "Generate Report"
// groups and aggregates the underlying PI lines accordingly — same idea
// as an Excel pivot table, just built from scratch in plain JS/DOM
// (no pivot library in this stack).
//
// Data source: proforma_invoices joined with pi_lines, filtered to a
// date range. Zero-qty/zero-amount historical "phantom" lines are
// dropped before aggregation, same as everywhere else in the app.
import { supabase } from '../supabaseClient.js';
import { escapeHtml, fmtMoney, fmtNum, fmtDate, toastError, toast } from '../ui.js';
import { rangeCardHtml, wireRangeCard, monthStartIso, todayIso, rangeLabel } from '../reportRange.js';

const DIMENSIONS = [
  { key: 'customer', label: 'Customer' },
  { key: 'salesperson', label: 'Salesperson' },
  { key: 'product', label: 'Product' },
  { key: 'shade', label: 'Shade' },
  { key: 'pack', label: 'Pack Size' },
  { key: 'source', label: 'Source' },
  { key: 'day', label: 'Date (Day)' },
  { key: 'month', label: 'Date (Month)' },
  { key: 'year', label: 'Date (Year)' },
];

const MEASURES = [
  { key: 'amount', label: 'Amount (₹)', fmt: (n) => fmtMoney(n) },
  { key: 'pcs', label: 'Quantity (Pcs)', fmt: (n) => fmtNum(n, 0) },
  { key: 'litres', label: 'Quantity (Ltr)', fmt: (n) => fmtNum(n) },
  { key: 'piCount', label: 'Count of PIs', fmt: (n) => fmtNum(n, 0) },
];

function dimLabel(key) { return DIMENSIONS.find(d => d.key === key)?.label || key; }
function measureByKey(key) { return MEASURES.find(m => m.key === key); }

function monthLabel(ym) {
  if (!ym || ym === '—') return '—';
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

// How a raw field value should be *displayed* in a row/column header —
// most fields are already display-ready strings, dates need reformatting.
function displayValue(field, value) {
  if (field === 'day') return value === '—' ? '—' : fmtDate(value);
  if (field === 'month') return monthLabel(value);
  return value;
}

function pad(n) { return String(n).padStart(2, '0'); }

async function loadRecords(from, to) {
  const { data: pis, error } = await supabase
    .from('proforma_invoices')
    .select('id, pi_date, source, customer_name_text, customers(name), salespeople(name), pi_lines(product_text,shade_text,pack_text,pcs,litres,total_value)')
    .gte('pi_date', from).lte('pi_date', to)
    .limit(5000);
  if (error) throw error;

  const records = [];
  (pis || []).forEach(pi => {
    const d = pi.pi_date ? new Date(pi.pi_date + 'T00:00:00') : null;
    const day = pi.pi_date || '—';
    const month = d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : '—';
    const year = d ? String(d.getFullYear()) : '—';
    const customer = pi.customers?.name || pi.customer_name_text || '—';
    const salesperson = pi.salespeople?.name || '—';
    const source = pi.source === 'historical' ? 'Historical' : 'Sales';
    (pi.pi_lines || []).forEach(l => {
      const pcs = Number(l.pcs || 0), amount = Number(l.total_value || 0);
      // Historical-migration "empty slot" lines — never real sales.
      if (pcs === 0 && amount === 0) return;
      records.push({
        customer, salesperson, source, day, month, year,
        product: l.product_text || '—', shade: l.shade_text || '—', pack: l.pack_text || '—',
        pcs, litres: Number(l.litres || 0), amount,
        piId: pi.id,
      });
    });
  });
  return records;
}

function keyFor(fields, rec) {
  if (!fields.length) return '__all__';
  return fields.map(f => String(rec[f])).join('\u0001');
}

function partsFor(fields, rec, fallback) {
  if (!fields.length) return [fallback];
  return fields.map(f => displayValue(f, rec[f]));
}

function aggregateRecords(records, measureKeys) {
  const out = {};
  measureKeys.forEach(m => { out[m] = m === 'piCount' ? new Set() : 0; });
  records.forEach(rec => {
    measureKeys.forEach(m => {
      if (m === 'piCount') out[m].add(rec.piId);
      else out[m] += Number(rec[m] || 0);
    });
  });
  measureKeys.forEach(m => { if (m === 'piCount') out[m] = out[m].size; });
  return out;
}

function buildPivot(records, rowFields, colFields, measureKeys) {
  const rowBuckets = new Map();
  const colLabelMap = new Map();
  records.forEach(rec => {
    const rk = keyFor(rowFields, rec);
    if (!rowBuckets.has(rk)) rowBuckets.set(rk, { parts: partsFor(rowFields, rec, 'All'), records: [] });
    rowBuckets.get(rk).records.push(rec);
    const ck = keyFor(colFields, rec);
    if (!colLabelMap.has(ck)) colLabelMap.set(ck, partsFor(colFields, rec, 'Total').join(' / '));
  });

  const colKeys = [...colLabelMap.keys()].sort((a, b) => a.localeCompare(b));

  const rows = [...rowBuckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([rk, bucket]) => {
      const byCol = new Map();
      colKeys.forEach(ck => {
        const inCol = bucket.records.filter(r => keyFor(colFields, r) === ck);
        byCol.set(ck, aggregateRecords(inCol, measureKeys));
      });
      return { key: rk, parts: bucket.parts, byCol, total: aggregateRecords(bucket.records, measureKeys) };
    });

  const colTotals = new Map(colKeys.map(ck => [ck, aggregateRecords(records.filter(r => keyFor(colFields, r) === ck), measureKeys)]));
  const grandTotal = aggregateRecords(records, measureKeys);

  return { rows, colKeys, colLabelMap, colTotals, grandTotal };
}

export async function renderCustomReports(container) {
  // Drag-drop state. Each array holds field keys, in drop order.
  const zones = { rows: [], cols: [], values: [] };
  let rangeApi = null;

  paint();

  function paint() {
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">Custom Reports</h2><p class="section-sub">Drag fields into Rows / Columns / Values to build your own pivot-style report from sales data</p></div>
      </div>
      ${rangeCardHtml('cr', monthStartIso(), todayIso())}
      <div class="card" style="margin-bottom:16px;">
        <div class="crb-builder">
          <div class="crb-palette">
            <div class="crb-group">
              <div class="crb-group-title">Dimensions — drag into Rows or Columns</div>
              ${DIMENSIONS.map(d => `<div class="crb-pill" draggable="true" data-field="${d.key}" data-kind="dim">${escapeHtml(d.label)}</div>`).join('')}
            </div>
            <div class="crb-group">
              <div class="crb-group-title">Measures — drag into Values</div>
              ${MEASURES.map(m => `<div class="crb-pill is-measure" draggable="true" data-field="${m.key}" data-kind="measure">${escapeHtml(m.label)}</div>`).join('')}
            </div>
          </div>
          <div class="crb-zones">
            <div class="crb-zone"><div class="crb-zone-title">Rows</div><div class="crb-zone-body" id="crb-rows" data-zone="rows"></div></div>
            <div class="crb-zone"><div class="crb-zone-title">Columns</div><div class="crb-zone-body" id="crb-cols" data-zone="cols"></div></div>
            <div class="crb-zone"><div class="crb-zone-title">Values</div><div class="crb-zone-body" id="crb-values" data-zone="values"></div></div>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="cr-generate">Generate Report</button>
          <button type="button" class="btn btn-outline" id="cr-reset-fields">Reset Fields</button>
          <button type="button" class="btn btn-outline" id="cr-export" style="display:none;">Export to Excel</button>
        </div>
      </div>
      <div id="cr-result"><div class="empty-state">Pick a date range, drag some fields in, then click "Generate Report".</div></div>
    `;
    // "Run report" + the preset buttons on the date card, and this page's
    // own "Generate Report" button, both just call generate() with
    // whatever From/To is currently set.
    rangeApi = wireRangeCard(container, 'cr', (from, to) => generate(from, to));
    wireBuilder();
    document.getElementById('cr-generate').addEventListener('click', () => {
      const { from, to } = rangeApi.getRange();
      generate(from, to);
    });
    document.getElementById('cr-reset-fields').addEventListener('click', () => {
      zones.rows = []; zones.cols = []; zones.values = [];
      renderZones();
    });
    renderZones();
  }

  function wireBuilder() {
    container.querySelectorAll('.crb-pill').forEach(pill => {
      pill.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ field: pill.dataset.field, kind: pill.dataset.kind }));
      });
    });
    container.querySelectorAll('.crb-zone-body').forEach(zoneEl => {
      zoneEl.addEventListener('dragover', (e) => { e.preventDefault(); zoneEl.classList.add('drag-over'); });
      zoneEl.addEventListener('dragleave', () => zoneEl.classList.remove('drag-over'));
      zoneEl.addEventListener('drop', (e) => {
        e.preventDefault();
        zoneEl.classList.remove('drag-over');
        let payload;
        try { payload = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
        onDrop(zoneEl.dataset.zone, payload.field, payload.kind);
      });
    });
  }

  function onDrop(zoneName, field, kind) {
    const zoneWantsDim = zoneName === 'rows' || zoneName === 'cols';
    if (zoneWantsDim && kind !== 'dim') { toast('Rows and Columns take dimension fields (the saffron pills), not a value field.', 'error'); return; }
    if (zoneName === 'values' && kind !== 'measure') { toast('Values takes measure fields (the blue pills), not a dimension field.', 'error'); return; }

    if (zoneWantsDim) {
      // A dimension lives in exactly one of Rows/Columns at a time.
      zones.rows = zones.rows.filter(k => k !== field);
      zones.cols = zones.cols.filter(k => k !== field);
      zones[zoneName].push(field);
    } else {
      if (!zones.values.includes(field)) zones.values.push(field);
    }
    renderZones();
  }

  function removeField(zoneName, field) {
    zones[zoneName] = zones[zoneName].filter(k => k !== field);
    renderZones();
  }

  function renderZones() {
    const label = (zoneName, key) => zoneName === 'values' ? measureByKey(key)?.label || key : dimLabel(key);
    ['rows', 'cols', 'values'].forEach(zoneName => {
      const el = document.getElementById(`crb-${zoneName}`);
      const fields = zones[zoneName];
      el.innerHTML = fields.length
        ? fields.map(f => `<span class="crb-chip" data-field="${f}">${escapeHtml(label(zoneName, f))} <button type="button" data-remove="${f}" aria-label="Remove">×</button></span>`).join('')
        : `<span class="crb-zone-empty">Drop fields here…</span>`;
      el.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', () => removeField(zoneName, btn.dataset.remove)));
    });
  }

  async function generate(from, to) {
    if (!from || !to) { toast('Pick a From and To date first.', 'error'); return; }
    if (!zones.values.length) { toast('Drag at least one field into Values — that is what gets totalled.', 'error'); return; }

    const resultEl = document.getElementById('cr-result');
    resultEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Building report…</div>`;
    try {
      const records = await loadRecords(from, to);
      if (!records.length) {
        resultEl.innerHTML = `<div class="empty-state">No sales lines in ${escapeHtml(rangeLabel(from, to))}.</div>`;
        document.getElementById('cr-export').style.display = 'none';
        return;
      }
      const pivot = buildPivot(records, zones.rows, zones.cols, zones.values);
      renderPivot(resultEl, pivot, from, to);
    } catch (err) {
      toastError(err, 'Could not build report');
      resultEl.innerHTML = `<div class="empty-state">Could not build report.</div>`;
    }
  }

  function renderPivot(resultEl, pivot, from, to) {
    const { rows, colKeys, colLabelMap, colTotals, grandTotal } = pivot;
    const measures = zones.values.map(measureByKey);
    const rowFieldLabels = zones.rows.length ? zones.rows.map(dimLabel) : ['All'];
    const hasCols = zones.cols.length > 0;

    let theadHtml;
    if (hasCols) {
      const groupHeaders = colKeys.map(ck => `<th colspan="${measures.length}" style="text-align:center;">${escapeHtml(colLabelMap.get(ck))}</th>`).join('');
      const measureHeadersPerGroup = colKeys.map(() => measures.map(m => `<th class="text-right">${escapeHtml(m.label)}</th>`).join('')).join('');
      const totalGroupHeader = `<th colspan="${measures.length}" style="text-align:center;">Grand Total</th>`;
      const totalMeasureHeaders = measures.map(m => `<th class="text-right">${escapeHtml(m.label)}</th>`).join('');
      theadHtml = `
        <tr>${rowFieldLabels.map(l => `<th rowspan="2">${escapeHtml(l)}</th>`).join('')}${groupHeaders}${totalGroupHeader}</tr>
        <tr>${measureHeadersPerGroup}${totalMeasureHeaders}</tr>`;
    } else {
      theadHtml = `<tr>${rowFieldLabels.map(l => `<th>${escapeHtml(l)}</th>`).join('')}${measures.map(m => `<th class="text-right">${escapeHtml(m.label)}</th>`).join('')}</tr>`;
    }

    const cellHtml = (agg, m) => `<td class="text-right">${m.fmt(agg[m.key] || 0)}</td>`;

    const bodyRows = rows.map(r => {
      const rowCells = r.parts.map(p => `<td>${escapeHtml(String(p))}</td>`).join('');
      if (hasCols) {
        const colCells = colKeys.map(ck => measures.map(m => cellHtml(r.byCol.get(ck), m)).join('')).join('');
        const totalCells = measures.map(m => cellHtml(r.total, m)).join('');
        return `<tr>${rowCells}${colCells}${totalCells}</tr>`;
      }
      return `<tr>${rowCells}${measures.map(m => cellHtml(r.total, m)).join('')}</tr>`;
    }).join('');

    let footRow = '';
    if (rows.length > 1) {
      const leadCells = `<td colspan="${rowFieldLabels.length}" style="font-weight:700;">Grand Total</td>`;
      if (hasCols) {
        const colCells = colKeys.map(ck => measures.map(m => cellHtml(colTotals.get(ck), m)).join('')).join('');
        const totalCells = measures.map(m => cellHtml(grandTotal, m)).join('');
        footRow = `<tr style="background:var(--stone-light);font-weight:700;">${leadCells}${colCells}${totalCells}</tr>`;
      } else {
        footRow = `<tr style="background:var(--stone-light);font-weight:700;">${leadCells}${measures.map(m => cellHtml(grandTotal, m)).join('')}</tr>`;
      }
    }

    resultEl.innerHTML = `
      <p class="text-muted" style="margin:-4px 0 14px;font-size:12.5px;">${escapeHtml(rangeLabel(from, to))} &nbsp;·&nbsp; ${rows.length} row${rows.length === 1 ? '' : 's'}</p>
      <div class="table-wrap">
        <div class="table-scroll">
          <table class="erp-table">
            <thead>${theadHtml}</thead>
            <tbody>${bodyRows}${footRow}</tbody>
          </table>
        </div>
      </div>`;

    const exportBtn = document.getElementById('cr-export');
    exportBtn.style.display = '';
    exportBtn.onclick = async () => {
      const original = exportBtn.textContent;
      exportBtn.disabled = true; exportBtn.textContent = 'Preparing…';
      try {
        const headers = [...rowFieldLabels, ...(hasCols ? colKeys.flatMap(ck => measures.map(m => `${colLabelMap.get(ck)} — ${m.label}`)) : measures.map(m => m.label)), ...(hasCols ? measures.map(m => `Grand Total — ${m.label}`) : [])];
        const dataRows = rows.map(r => {
          const lead = r.parts.map(String);
          if (hasCols) {
            const colVals = colKeys.flatMap(ck => measures.map(m => r.byCol.get(ck)[m.key] || 0));
            const totVals = measures.map(m => r.total[m.key] || 0);
            return [...lead, ...colVals, ...totVals];
          }
          return [...lead, ...measures.map(m => r.total[m.key] || 0)];
        });
        const { exportWorkbook } = await import('../xlsxExport.js');
        await exportWorkbook(`Custom-Report_${from}_to_${to}.xlsx`, [{ name: 'Report', headers, rows: dataRows }]);
      } catch (err) {
        toastError(err, 'Could not export to Excel');
      } finally {
        exportBtn.disabled = false; exportBtn.textContent = original;
      }
    };
  }
}
