// Shared date-range UI for report pages: a From/To pair, one-click quick
// presets (so nobody has to hand-type the same "this month" dates every
// time), an optional "compare to previous period" toggle for growth %
// figures, and the Export-to-Excel button wiring.
import { escapeHtml, fmtDate, toastError } from './ui.js';

function pad(n) { return String(n).padStart(2, '0'); }
function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

export function todayIso() { return iso(new Date()); }
export function monthStartIso() { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); }

export function presetRanges() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const qStartMonth = Math.floor(m / 3) * 3;
  return [
    { label: 'Today', from: iso(now), to: iso(now) },
    { label: 'Last 7 days', from: iso(addDays(now, -6)), to: iso(now) },
    { label: 'This month', from: iso(new Date(y, m, 1)), to: iso(now) },
    { label: 'Last month', from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) },
    { label: 'This quarter', from: iso(new Date(y, qStartMonth, 1)), to: iso(now) },
    { label: 'This year', from: iso(new Date(y, 0, 1)), to: iso(now) },
  ];
}

// The period of equal length immediately before `from`..`to`, for
// period-over-period comparison.
export function previousPeriod(from, to) {
  const f = new Date(from + 'T00:00:00'), t = new Date(to + 'T00:00:00');
  const days = Math.max(1, Math.round((t - f) / 86400000) + 1);
  const prevTo = addDays(f, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  return { from: iso(prevFrom), to: iso(prevTo) };
}

export function rangeLabel(from, to) { return `${fmtDate(from)} – ${fmtDate(to)}`; }

// Percent change helper for comparison stat cards: null when there's no
// baseline to compare against (avoids a meaningless "+Infinity%").
export function pctChange(curr, prev) {
  if (!prev) return curr ? null : 0;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export function trendHtml(pct) {
  if (pct === null || pct === undefined || !isFinite(pct)) return '';
  const up = pct >= 0;
  const color = up ? 'var(--green-accent)' : 'var(--red-accent)';
  const arrow = up ? '▲' : '▼';
  return `<span style="color:${color};font-size:11.5px;font-weight:600;margin-left:6px;">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
}

export function rangeCardHtml(idPrefix, from, to, { compare = false } = {}) {
  const presets = presetRanges();
  return `
    <div class="card" style="margin-bottom:16px;">
      <div class="form-grid">
        <div class="form-field"><label class="form-label">From</label><input class="form-input" type="date" id="${idPrefix}-from" value="${from}"></div>
        <div class="form-field"><label class="form-label">To</label><input class="form-input" type="date" id="${idPrefix}-to" value="${to}"></div>
        <div class="form-field" style="justify-content:flex-end;flex-direction:row;align-items:flex-end;gap:8px;">
          <button class="btn btn-primary" id="${idPrefix}-run">Run report</button>
          <button type="button" class="btn btn-outline" id="${idPrefix}-export" style="display:none;">Export to Excel</button>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;">
        ${presets.map(p => `<button type="button" class="btn btn-outline btn-sm" data-range-preset data-from="${p.from}" data-to="${p.to}">${escapeHtml(p.label)}</button>`).join('')}
      </div>
      ${compare ? `
      <label style="display:flex;align-items:center;gap:7px;margin-top:12px;font-size:12.5px;color:var(--ink-soft);cursor:pointer;">
        <input type="checkbox" id="${idPrefix}-compare"> Compare to the previous period of equal length
      </label>` : ''}
    </div>`;
}

// Wires the From/To inputs, preset buttons and Run button inside
// `container`. `onRun(from, to, compare)` is called on Run and on every
// preset click. Returns the current values on demand via getRange().
export function wireRangeCard(container, idPrefix, onRun) {
  const fromEl = container.querySelector(`#${idPrefix}-from`);
  const toEl = container.querySelector(`#${idPrefix}-to`);
  const compareEl = container.querySelector(`#${idPrefix}-compare`);
  const runBtn = container.querySelector(`#${idPrefix}-run`);

  function getRange() { return { from: fromEl.value, to: toEl.value, compare: compareEl ? compareEl.checked : false }; }
  function run() { const r = getRange(); onRun(r.from, r.to, r.compare); }

  runBtn.addEventListener('click', run);
  container.querySelectorAll('[data-range-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      fromEl.value = btn.dataset.from;
      toEl.value = btn.dataset.to;
      run();
    });
  });
  return { run, getRange };
}

// Reveals the Export to Excel button and wires it to lazily build the
// workbook at click time via getSheets() => { filename, sheets }.
export function enableExportButton(container, idPrefix, getSheets) {
  const btn = container.querySelector(`#${idPrefix}-export`);
  if (!btn) return;
  btn.style.display = '';
  btn.onclick = async () => {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Preparing…';
    try {
      const { filename, sheets } = getSheets();
      const { exportWorkbook } = await import('./xlsxExport.js');
      await exportWorkbook(filename, sheets);
    } catch (err) {
      toastError(err, 'Could not export to Excel');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  };
}
