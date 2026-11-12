import { renderSimpleMaster } from './_masterHelper.js';

export async function renderSalespersonMaster(container) {
  return renderSimpleMaster(container, {
    table: 'salespeople',
    title: 'Salesperson',
    orderBy: 'name',
    searchFields: ['name', 'phone', 'region'],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'region', label: 'Region' },
    ],
    formFields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'region', label: 'Region', type: 'text' },
    ],
    toRow: (v) => ({ name: v.name.trim(), phone: v.phone || '', region: v.region || '' }),
  });
}
