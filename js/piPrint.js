// Standard PI print — opens a clean, letterhead-style proforma invoice in
// a new tab and triggers the browser's print dialog. Shared by the Final
// PI Database and Order Register pages, so there is exactly one PI print
// layout in the app, not one per page.
import { escapeHtml, fmtMoney, fmtDate } from './ui.js';

const COMPANY = {
  name: 'RAUNAQ PAINT INDUSTRY',
  address: 'Lucknow–Sitapur Road, Village Navi Kot Nandana, Bakshi Ka Talab, Lucknow, UP 226201',
  phone: '9936108383, 9236027992',
  email: 'raunaqpaintind@gmail.com',
};

export function printPi(pi, lines) {
  const rows = (lines || []).map((l, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(l.product_text)}</td>
      <td>${escapeHtml(l.shade_text || '—')}</td>
      <td>${escapeHtml(l.pack_text || '—')}</td>
      <td class="num">${l.pcs ?? ''}</td>
      <td class="num">${l.litres ? Number(l.litres).toFixed(2) : ''}</td>
      <td class="num">${fmtMoney(l.price)}</td>
      <td class="num">${fmtMoney(l.total_value)}</td>
    </tr>`).join('');
  const grandTotal = (lines || []).reduce((s, l) => s + Number(l.total_value || 0), 0);
  const totalLitres = (lines || []).reduce((s, l) => s + Number(l.litres || 0), 0);

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(pi.pi_number)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 28px; font-size: 13px; }
  .head { text-align: center; border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; margin-bottom: 16px; }
  .head h1 { margin: 0 0 4px; font-size: 20px; letter-spacing: 0.5px; }
  .head .sub { font-size: 12px; color: #444; }
  .title { text-align: center; font-size: 15px; font-weight: bold; letter-spacing: 1px; margin: 14px 0; text-decoration: underline; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 16px; }
  .meta .block { width: 48%; }
  .meta .label { font-size: 10px; text-transform: uppercase; color: #666; margin-bottom: 2px; }
  .meta .value { font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  th, td { border: 1px solid #999; padding: 6px 8px; font-size: 12px; text-align: left; }
  th { background: #f0f0f0; }
  td.num, th.num { text-align: right; }
  tfoot td { font-weight: bold; background: #f7f7f7; }
  .footer { margin-top: 24px; font-size: 11px; color: #555; display: flex; justify-content: space-between; }
  .sign { margin-top: 50px; text-align: right; font-size: 12px; }
  @media print { body { margin: 10mm; } }
</style>
</head>
<body>
  <div class="head">
    <h1>${escapeHtml(COMPANY.name)}</h1>
    <div class="sub">${escapeHtml(COMPANY.address)}</div>
    <div class="sub">Phone: ${escapeHtml(COMPANY.phone)} &nbsp;•&nbsp; Email: ${escapeHtml(COMPANY.email)}</div>
  </div>
  <div class="title">PROFORMA INVOICE</div>
  <div class="meta">
    <div class="block">
      <div class="label">Bill To</div>
      <div class="value">${escapeHtml(pi.customers?.name || pi.customer_name_text || '—')}</div>
      <div>${escapeHtml(pi.address || '')}</div>
    </div>
    <div class="block" style="text-align:right;">
      <div class="label">PI Number</div>
      <div class="value">${escapeHtml(pi.pi_number)}</div>
      <div class="label" style="margin-top:8px;">Date</div>
      <div class="value">${fmtDate(pi.pi_date)}</div>
      ${pi.salespeople?.name ? `<div class="label" style="margin-top:8px;">Salesperson</div><div class="value">${escapeHtml(pi.salespeople.name)}</div>` : ''}
    </div>
  </div>
  <table>
    <thead>
      <tr><th>#</th><th>Product</th><th>Shade</th><th>Pack</th><th class="num">Pcs</th><th class="num">Litres</th><th class="num">Rate</th><th class="num">Total</th></tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="8" style="text-align:center;color:#888;">No lines.</td></tr>'}</tbody>
    <tfoot>
      <tr><td colspan="5"></td><td class="num">${totalLitres ? totalLitres.toFixed(2) : ''}</td><td class="num">Grand Total</td><td class="num">${fmtMoney(grandTotal)}</td></tr>
    </tfoot>
  </table>
  <div class="sign">Authorised Signatory</div>
  <div class="footer">
    <span>This is a system-generated proforma invoice.</span>
    <span>Printed ${new Date().toLocaleDateString('en-IN')}</span>
  </div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Please allow pop-ups to print the PI.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
