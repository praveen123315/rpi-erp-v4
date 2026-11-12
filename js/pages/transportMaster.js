import { renderSimpleMaster } from './_masterHelper.js';

export async function renderTransportMaster(container) {
  return renderSimpleMaster(container, {
    table: 'transporters',
    title: 'Transporter',
    orderBy: 'name',
    searchFields: ['name', 'phone', 'address'],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'address', label: 'Address' },
    ],
    formFields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'address', label: 'Address', type: 'textarea', span2: true },
    ],
    toRow: (v) => ({ name: v.name.trim(), phone: v.phone || '', address: v.address || '' }),
  });
}
