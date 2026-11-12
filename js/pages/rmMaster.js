import { renderSimpleMaster } from './_masterHelper.js';
import { fmtMoney } from '../ui.js';

export async function renderRmMaster(container) {
  return renderSimpleMaster(container, {
    table: 'raw_materials',
    title: 'Raw Material',
    orderBy: 'code',
    searchFields: ['code', 'name', 'supplier'],
    columns: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'price', label: 'Rate', render: r => fmtMoney(r.price, 4) + ' / ' + (r.unit || 'kg') },
      { key: 'supplier', label: 'Supplier' },
    ],
    formFields: [
      { key: 'code', label: 'Code', type: 'text', required: true },
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'price', label: 'Rate', type: 'number', step: '0.0001', required: true },
      { key: 'unit', label: 'Unit', type: 'text', default: 'kg' },
      { key: 'supplier', label: 'Supplier', type: 'text' },
    ],
    toRow: (v) => ({
      code: v.code.trim(),
      name: v.name.trim(),
      price: Number(v.price || 0),
      unit: v.unit || 'kg',
      supplier: v.supplier || '',
    }),
  });
}
