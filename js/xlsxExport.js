// Client-side Excel export — no server round-trip, no build step. Loads
// SheetJS lazily from a CDN only when an export is actually triggered, so
// it costs nothing on pages that never export.
//
// Cells are written as real numbers (not "₹1,234.00" strings), so the
// workbook is actually usable in Excel: sums, pivot tables and sorting
// all work on the exported columns, not just on-screen formatting.

let sheetJsPromise = null;
function loadSheetJs() {
  if (!sheetJsPromise) {
    sheetJsPromise = import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm')
      .then(mod => mod.default || mod);
  }
  return sheetJsPromise;
}

/**
 * Export one or more tables as a single .xlsx workbook.
 * @param {string} filename  e.g. "Sales-Report_2026-11-01_to_2026-11-12.xlsx"
 * @param {Array<{name: string, headers: string[], rows: Array<Array<string|number>>}>} sheets
 */
export async function exportWorkbook(filename, sheets) {
  const XLSX = await loadSheetJs();
  const wb = XLSX.utils.book_new();

  sheets.forEach(({ name, headers, rows }) => {
    const aoa = [headers, ...(rows || [])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Auto column widths from header + content length.
    ws['!cols'] = headers.map((h, i) => {
      let w = String(h ?? '').length;
      (rows || []).forEach(r => { w = Math.max(w, String(r[i] ?? '').length); });
      return { wch: Math.min(42, Math.max(9, w + 2)) };
    });

    // Header-row filter dropdowns — supported by SheetJS CE on write.
    const lastCol = XLSX.utils.encode_col(Math.max(0, headers.length - 1));
    const lastRow = Math.max(1, aoa.length);
    ws['!autofilter'] = { ref: `A1:${lastCol}${lastRow}` };

    XLSX.utils.book_append_sheet(wb, ws, String(name || 'Sheet').slice(0, 31));
  });

  XLSX.writeFile(wb, filename);
}
