// Standard PI print — the "Distribution Statement" format carried over
// from the old Google Sheets/Apps Script system (Cartoon / Item / Qty. /
// Total Ltr. / Rate / Amount), not a redesigned invoice. Shared by the
// Final PI Database and Order Register pages, so there is exactly one PI
// print layout in the app, not one per page.
//
// Callers must pass each line joined with its pack size's units-per-
// carton, e.g. .select('*, pack_sizes(units_per_carton)') on pi_lines —
// that is what drives the "Nug" (carton) column.
import { escapeHtml, fmtDate } from './ui.js';

const COMPANY = {
  name: 'RAUNAQ PAINT INDUSTRY',
  address: 'Lucknow–Sitapur Road, Village Navi Kot Nandana, Bakshi Ka Talab, Lucknow, UP 226201',
  phone: '9936108383, 9236027992',
};

function fmtPlainNum(n) {
  return (Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100).toString();
}

function fmtAmt(n) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtVol(n, unit) {
  return fmtPlainNum(n) + ' ' + (unit === 'kg' ? 'Kg.' : 'Ltr.');
}

function cartonCell(pcs, unitsPerCarton) {
  if (!unitsPerCarton || !pcs) return '—';
  return fmtPlainNum(Number(pcs) / Number(unitsPerCarton)) + ' Nug';
}

function itemLabel(name, group, shade, pack) {
  return `<div class="item-name">${escapeHtml(name || '—')}${group ? ` <span class="item-group">[${escapeHtml(group)}]</span>` : ''}</div>` +
    `<div class="item-sub">${[shade, pack].filter(Boolean).map(escapeHtml).join(' · ')}</div>`;
}

export function printPi(pi, lines) {
  let totalPcs = 0, totalVol = 0, grandTotal = 0;

  // A lot of historical (migrated) PIs carry leftover zero-qty/zero-amount
  // "empty slot" lines from the old Sheets import. They contribute nothing
  // and should never show up as a ghost "0 Pcs. — ₹0.00" row on a printed
  // document.
  const realLines = (lines || []).filter(l => Number(l.pcs || 0) !== 0 || Number(l.total_value || 0) !== 0);

  const rows = realLines.map(l => {
    totalPcs += Number(l.pcs || 0);
    totalVol += Number(l.litres || 0);
    grandTotal += Number(l.total_value || 0);
    const unitsPerCarton = l.pack_sizes?.units_per_carton;
    return `<tr>
      <td class="c">${cartonCell(l.pcs, unitsPerCarton)}</td>
      <td class="item">${itemLabel(l.product_text, l.group_label, l.shade_text, l.pack_text)}</td>
      <td class="r">${fmtPlainNum(l.pcs)} Pcs.</td>
      <td class="r">${fmtVol(l.litres, l.unit)}</td>
      <td class="r">${l.price ? fmtPlainNum(l.price) : '—'}</td>
      <td class="r">${fmtAmt(l.total_value)}</td>
    </tr>`;
  }).join('');

  const totalRow = `<tr class="sf-total">
    <td class="c"></td>
    <td class="item">TOTAL</td>
    <td class="r">${totalPcs.toLocaleString('en-IN')} Pcs.</td>
    <td class="r">${totalVol.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Ltr.</td>
    <td class="r"></td>
    <td class="r">${fmtAmt(grandTotal)}</td>
  </tr>`;

  const bodyHtml = `<div class="sf-page">
    <div class="sf-header">
      <div class="sf-company">${escapeHtml(COMPANY.name)}</div>
      <div class="sf-company-addr">${escapeHtml(COMPANY.address)} &nbsp;·&nbsp; Ph: ${escapeHtml(COMPANY.phone)}</div>
    </div>
    <div class="sf-title">Distribution Statement</div>
    <div class="sf-meta">
      <div><span class="sf-meta-label">Client</span><span class="sf-meta-value">${escapeHtml(pi.customers?.name || pi.customer_name_text || '—')}</span></div>
      <div><span class="sf-meta-label">Date</span><span class="sf-meta-value">${fmtDate(pi.pi_date)}</span></div>
      ${pi.salespeople?.name ? `<div><span class="sf-meta-label">Sales Person</span><span class="sf-meta-value">${escapeHtml(pi.salespeople.name)}</span></div>` : ''}
    </div>
    <table class="sf-table"><thead><tr>
      <th>Cartoon</th><th>Item</th><th>Qty.</th><th>Total Ltr.</th><th>Rate</th><th>Amount</th>
    </tr></thead><tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#888;">No lines.</td></tr>'}${rows ? totalRow : ''}</tbody></table>
    <div class="sf-signblock">
      <div class="sf-sign"><div class="sf-sign-line"></div><div class="sf-sign-label">Prepared By</div></div>
      <div class="sf-sign"><div class="sf-sign-line"></div><div class="sf-sign-label">Authorized Signatory</div></div>
    </div>
    <div class="sf-footer">This is a Distribution Statement for internal dispatch reference. Quantities subject to ±10% variance.</div>
  </div>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Distribution Statement — ${escapeHtml(pi.pi_number)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sf-page { display: flex; flex-direction: column; min-height: 100%; }
  .sf-header { text-align: center; border-bottom: 2px solid #1C1410; padding-bottom: 8px; margin-bottom: 10px; }
  .sf-company { font-size: 17pt; font-weight: 700; letter-spacing: 0.2px; }
  .sf-company-addr { font-size: 8.5pt; color: #444; margin-top: 2px; }
  .sf-title { text-align: center; font-size: 14pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 10px; }
  .sf-meta { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px 18px; background: #f5f3f0; border: 1px solid #ddd6cc; border-radius: 4px; padding: 8px 12px; margin-bottom: 12px; font-size: 9.5pt; }
  .sf-meta-label { text-transform: uppercase; letter-spacing: 0.4px; font-size: 7.5pt; color: #666; display: block; }
  .sf-meta-value { font-weight: 700; }
  table.sf-table { width: 100%; border-collapse: collapse; border: 1px solid #000; }
  table.sf-table th, table.sf-table td { border: 1px solid #000; padding: 6px 8px; font-size: 9pt; color: #000; vertical-align: top; }
  table.sf-table thead th { background: #dcdcdc; font-weight: 700; text-align: center; border-bottom: 2px solid #000; font-size: 8.5pt; }
  table.sf-table td.item { text-align: left; }
  table.sf-table td.c { text-align: center; }
  table.sf-table td.r { text-align: right; white-space: nowrap; }
  .item-name { font-weight: 700; }
  .item-group { font-weight: 600; color: #92400E; }
  .item-sub { font-size: 8pt; color: #555; margin-top: 1px; }
  table.sf-table tr.sf-total td { background: #f0f0f0; font-weight: 700; border-top: 2px solid #000; }
  .sf-signblock { display: flex; justify-content: space-between; gap: 40px; margin-top: auto; padding-top: 48px; }
  .sf-sign { flex: 1; text-align: center; }
  .sf-sign-line { border-top: 1px solid #000; margin-bottom: 4px; }
  .sf-sign-label { font-size: 8.5pt; color: #444; }
  .sf-footer { font-size: 7.5pt; color: #777; text-align: center; margin-top: 14px; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
${bodyHtml}
<div class="no-print" style="text-align:center;margin:22px 0;">
  <button onclick="window.print()" style="background:#1C1410;color:#fff;border:none;padding:10px 26px;border-radius:6px;font-size:12.5pt;cursor:pointer;font-weight:700;">🖨 Print</button>
  <button onclick="window.close()" style="background:#888;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-size:12.5pt;cursor:pointer;font-weight:700;margin-left:12px;">✕ Close</button>
</div>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) { alert('Please allow pop-ups to print the PI.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => { setTimeout(() => w.print(), 400); };
  w.onafterprint = () => { w.close(); };
}
