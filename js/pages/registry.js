// Single source of truth for navigation: sidebar sections/items AND the
// page router both read this list. A page not yet built gets a
// "stub" renderer automatically so the nav is always complete.

import { renderDashboard } from './dashboard.js';
import { renderCustomerMaster } from './customerMaster.js';
import { renderSalespersonMaster } from './salespersonMaster.js';
import { renderTransportMaster } from './transportMaster.js';
import { renderRmMaster } from './rmMaster.js';
import { renderShadesDb } from './shadesDb.js';
import { renderPriceList } from './priceList.js';
import { renderOrderEntry } from './orderEntry.js';
import { renderOrderRegister } from './orderRegister.js';
import { renderPiFinal } from './piFinal.js';
import { renderFormulationCosting } from './formulationCosting.js';
import { renderCostingMaster } from './costingMaster.js';
import { renderBomRecipes } from './bomRecipes.js';
import { renderRmPlanning } from './rmPlanning.js';
import { renderProductionSheet } from './productionSheet.js';
import { renderReports } from './reports.js';
import { renderSalespersonReport } from './salespersonReport.js';
import { renderCustomerPL } from './customerPL.js';
import { renderProfitLoss } from './profitLoss.js';
import { renderStockPlanner } from './stockPlanner.js';
import { renderCustomReports } from './customReports.js';
import { renderUsersAccess } from './usersAccess.js';
import { renderSystemOptions } from './systemOptions.js';
import { renderBulkImport } from './bulkImport.js';

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  fileAdd: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/>',
  fileCheck: '<path d="M9 12l2 2 4-4"/><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  checklist: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>',
  users: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  truck: '<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  user: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  shield: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
  bars: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  box: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  upload: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  doc: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  flask: '<path d="M9 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-3"/><path d="M9 7l3-5 3 5"/><path d="M9 7h6"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/>',
  book: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  droplet: '<circle cx="12" cy="12" r="4"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" opacity=".3"/><path d="M7 12h10M12 7v10"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>',
};

export function icon(name, color) {
  return `<svg width="16" height="16" fill="none" stroke="${color || 'currentColor'}" stroke-width="2" viewBox="0 0 24 24">${ICONS[name] || ICONS.grid}</svg>`;
}

// id, label, icon, renderer, adminOnly
export const NAV_STRUCTURE = [
  { section: null, items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid', render: renderDashboard, sub: "Overview of today's activity" },
    { id: 'create-pi', label: 'Create PI', icon: 'fileAdd', render: renderOrderEntry, sub: 'New order / proforma invoice entry' },
    { id: 'pi-final', label: 'Final PI Database', icon: 'fileCheck', render: renderPiFinal, sub: 'Registered proforma invoices' },
    { id: 'order-entry', label: 'Order Register', icon: 'checklist', render: renderOrderRegister, sub: 'Saved orders, edit & register to PI' },
  ]},
  { section: 'Masters', items: [
    { id: 'customer-master', label: 'Customer Master', icon: 'users', render: renderCustomerMaster, sub: 'Customers, pricing list, salesperson & transporter' },
    { id: 'price-list', label: 'Price List', icon: 'list', render: renderPriceList, sub: 'Price bands and pack rates', adminWrite: true },
    { id: 'transport-master', label: 'Transport Master', icon: 'truck', render: renderTransportMaster, sub: 'Transporters' },
    { id: 'salesperson-master', label: 'Salesperson Master', icon: 'user', render: renderSalespersonMaster, sub: 'Sales team' },
    { id: 'users-management', label: 'Users & Access', icon: 'shield', render: renderUsersAccess, sub: 'Manage roles and access for existing sign-ins', adminOnly: true },
  ]},
  { section: 'Analytics', items: [
    { id: 'reports', label: 'Reports', icon: 'bars', render: renderReports, sub: 'Sales and order summaries' },
    { id: 'custom-reports', label: 'Custom Reports', icon: 'grid', render: renderCustomReports, sub: 'Drag-and-drop pivot-style report builder' },
    { id: 'salesperson-report', label: 'SP Sales Report', icon: 'user', render: renderSalespersonReport, sub: 'Per-salesperson performance' },
    { id: 'customer-pl', label: 'Customer P&L', icon: 'trend', render: renderCustomerPL, sub: 'Profitability by customer' },
    { id: 'stock-planner', label: 'Stock Planner', icon: 'box', render: renderStockPlanner, sub: 'Projected stock requirement' },
    { id: 'bulk-import', label: 'Bulk Import', icon: 'upload', render: renderBulkImport, sub: 'CSV import for raw materials / customers', adminOnly: true },
  ]},
  { section: 'Production', items: [
    { id: 'production-sheet', label: 'Production Sheet', icon: 'doc', render: renderProductionSheet, sub: 'Daily production planning' },
    { id: 'rm-planning', label: 'RM Planning', icon: 'layers', render: renderRmPlanning, sub: 'Raw-material requirement from demand' },
  ]},
  { section: 'Costing', items: [
    { id: 'formulation-costing', label: 'Formulation Costing', icon: 'flask', render: renderFormulationCosting, sub: 'Build a costing from RM rows' },
    { id: 'costing-master', label: 'Costing Master', icon: 'doc', render: renderCostingMaster, sub: 'Saved costings' },
    { id: 'bom-recipes', label: 'BOM Recipes', icon: 'clipboard', render: renderBomRecipes, sub: 'Bill of materials per product/shade' },
    { id: 'rm-master', label: 'RM Master', icon: 'book', render: renderRmMaster, sub: 'Raw materials' },
    { id: 'shades-db', label: 'Shades Database', icon: 'droplet', render: renderShadesDb, sub: 'Shades and product linkage' },
  ]},
];

export const NAV_FOOT = [
  { id: 'profit-loss', label: 'P&L Dashboard', icon: 'trend', render: renderProfitLoss, sub: 'Company-wide profit & loss', accent: 'var(--green-accent)' },
  { id: 'system-options', label: 'System Options', icon: 'cog', render: renderSystemOptions, sub: 'App settings', adminOnly: true },
];

export function allNavItems() {
  return [...NAV_STRUCTURE.flatMap(s => s.items), ...NAV_FOOT];
}

export function findPage(id) {
  return allNavItems().find(i => i.id === id);
}
