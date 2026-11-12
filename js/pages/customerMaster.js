import { supabase } from '../supabaseClient.js';
import { renderSimpleMaster } from './_masterHelper.js';
import { fmtMoney } from '../ui.js';

async function salespeopleOptions() {
  const { data } = await supabase.from('salespeople').select('id,name').eq('is_active', true).order('name');
  return (data || []).map(s => ({ value: s.id, label: s.name }));
}
async function transporterOptions() {
  const { data } = await supabase.from('transporters').select('id,name').eq('is_active', true).order('name');
  return (data || []).map(t => ({ value: t.id, label: t.name }));
}
async function priceListOptions() {
  const { data } = await supabase.from('price_lists').select('id,name').eq('is_active', true).order('sort_order');
  return (data || []).map(p => ({ value: p.id, label: p.name }));
}

export async function renderCustomerMaster(container) {
  return renderSimpleMaster(container, {
    table: 'customers',
    title: 'Customer',
    selectCols: '*, salespeople(name), transporters(name), price_lists(name)',
    orderBy: 'name',
    searchFields: ['name', 'customer_code', 'phone', 'address', 'alias'],
    columns: [
      { key: 'customer_code', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'salesperson', label: 'Salesperson', render: r => r.salespeople?.name || '<span class="text-muted">—</span>' },
      { key: 'transporter', label: 'Transporter', render: r => r.transporters?.name || '<span class="text-muted">—</span>' },
      { key: 'outstanding_amount', label: 'Outstanding', render: r => fmtMoney(r.outstanding_amount) },
    ],
    formFields: [
      { key: 'customer_code', label: 'Customer Code', type: 'text' },
      { key: 'name', label: 'Name', type: 'text', required: true, span2: true },
      { key: 'alias', label: 'Alias', type: 'text' },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'address', label: 'Address', type: 'textarea', span2: true },
      { key: 'salesperson_id', label: 'Salesperson', type: 'select', options: salespeopleOptions },
      { key: 'price_list_id', label: 'Price List', type: 'select', options: priceListOptions },
      { key: 'transporter_id', label: 'Transporter', type: 'select', options: transporterOptions },
      { key: 'transport_details', label: 'Transport Details', type: 'text' },
      { key: 'freight', label: 'Freight', type: 'number' },
      { key: 'credit_terms', label: 'Credit Terms (days)', type: 'number' },
      { key: 'comments', label: 'Comments', type: 'textarea', span2: true },
    ],
    toRow: (v) => ({
      customer_code: v.customer_code || null,
      name: v.name.trim(),
      alias: v.alias || '',
      phone: v.phone || '',
      address: v.address || '',
      salesperson_id: v.salesperson_id || null,
      price_list_id: v.price_list_id || null,
      transporter_id: v.transporter_id || null,
      transport_details: v.transport_details || '',
      freight: Number(v.freight || 0),
      credit_terms: Number(v.credit_terms || 0),
      comments: v.comments || '',
    }),
  });
}
