// Generic CRUD scaffold shared by the simple master-data pages
// (Salesperson, Transport, RM, Shades, Customer masters). Each page
// supplies: table name, columns to show/edit, and how to turn a form
// into a save payload. RLS permission model (see rls.sql): any active
// user can SELECT/INSERT; only admin can UPDATE/DELETE — so "Add" is
// always offered, "Edit"/"Deactivate" only to admins.
import { supabase } from '../supabaseClient.js';
import { isAdmin } from '../auth.js';
import { escapeHtml, toast, toastError, openModal, closeModal, confirmDialog, filterRows, loadingRow, emptyRow, debounce } from '../ui.js';

export function renderSimpleMaster(container, opts) {
  const {
    table,            // db table name
    title,            // page heading
    selectCols = '*', // select string (can include joins via !inner / fk(name))
    orderBy = 'name',
    searchFields = ['name'],
    columns,          // [{key, label, render?(row), width?}]
    formFields,       // [{key, label, type:'text'|'number'|'select'|'checkbox'|'textarea', options?: async ()=>[{value,label}] or array, required?}]
    toRow,            // (formValues) => object to insert/update
    emptyLabel = 'No records yet.',
    extraActions = null, // (row) => html for extra per-row buttons
  } = opts;

  let allRows = [];
  let optionCache = {};

  async function loadOptions() {
    optionCache = {};
    for (const f of (formFields || [])) {
      if (f.type === 'select' && typeof f.options === 'function') {
        optionCache[f.key] = await f.options();
      }
    }
  }

  async function fetchRows() {
    const { data, error } = await supabase.from(table).select(selectCols).order(orderBy);
    if (error) throw error;
    return data || [];
  }

  function fieldInputHtml(f, value = '') {
    const id = `mf_${f.key}`;
    if (f.type === 'select') {
      const opts = optionCache[f.key] || [];
      return `<select class="form-select" id="${id}" ${f.required ? 'required' : ''}>
        <option value="">${f.placeholder || '— Select —'}</option>
        ${opts.map(o => `<option value="${escapeHtml(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
      </select>`;
    }
    if (f.type === 'checkbox') {
      return `<input type="checkbox" id="${id}" ${value ? 'checked' : ''} style="width:18px;height:18px;">`;
    }
    if (f.type === 'textarea') {
      return `<textarea class="form-textarea" id="${id}">${escapeHtml(value)}</textarea>`;
    }
    return `<input class="form-input" id="${id}" type="${f.type === 'number' ? 'number' : 'text'}" step="${f.step || 'any'}" value="${escapeHtml(value)}" ${f.required ? 'required' : ''}>`;
  }

  async function openForm(existing) {
    await loadOptions();
    const body = `<div class="form-grid">
      ${formFields.map(f => `
        <div class="form-field${f.span2 ? ' span-2' : ''}">
          <label class="form-label">${escapeHtml(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</label>
          ${fieldInputHtml(f, existing ? existing[f.key] : (f.default ?? ''))}
        </div>`).join('')}
    </div>`;
    openModal({
      title: existing ? `Edit ${title}` : `Add ${title}`,
      bodyHtml: body,
      footHtml: `<button class="btn btn-outline" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-save>${existing ? 'Save changes' : 'Add'}</button>`,
    });
    document.querySelector('[data-cancel]').addEventListener('click', closeModal);
    document.querySelector('[data-save]').addEventListener('click', async () => {
      const values = {};
      for (const f of formFields) {
        const el = document.getElementById(`mf_${f.key}`);
        if (f.type === 'checkbox') values[f.key] = el.checked;
        else values[f.key] = el.value;
      }
      for (const f of formFields) {
        if (f.required && !values[f.key]) { toast(`${f.label} is required`, 'error'); return; }
      }
      try {
        const payload = toRow(values, existing);
        if (existing) {
          const { error } = await supabase.from(table).update(payload).eq('id', existing.id);
          if (error) throw error;
          toast('Saved', 'success');
        } else {
          const { error } = await supabase.from(table).insert(payload);
          if (error) throw error;
          toast('Added', 'success');
        }
        closeModal();
        await refresh();
      } catch (err) {
        toastError(err, 'Could not save');
      }
    });
  }

  async function toggleActive(row) {
    const next = !row.is_active;
    const ok = await confirmDialog(
      next ? `Reactivate "${row.name}"?` : `Deactivate "${row.name}"? It will stop showing up as an option elsewhere.`,
      { title: next ? 'Reactivate' : 'Deactivate', confirmLabel: next ? 'Reactivate' : 'Deactivate', danger: !next }
    );
    if (!ok) return;
    try {
      const { error } = await supabase.from(table).update({ is_active: next }).eq('id', row.id);
      if (error) throw error;
      toast(next ? 'Reactivated' : 'Deactivated', 'success');
      await refresh();
    } catch (err) {
      toastError(err, 'Could not update');
    }
  }

  function renderTable(rows) {
    const admin = isAdmin();
    const theadCols = columns.map(c => `<th${c.width ? ` style="width:${c.width}"` : ''}>${escapeHtml(c.label)}</th>`).join('');
    const bodyRows = rows.length
      ? rows.map(r => {
          const tds = columns.map(c => `<td>${c.render ? c.render(r) : escapeHtml(r[c.key] ?? '')}</td>`).join('');
          const extra = extraActions ? extraActions(r) : '';
          return `<tr>
            ${tds}
            <td>${r.is_active === false ? '<span class="badge badge-gray">Inactive</span>' : '<span class="badge badge-green">Active</span>'}</td>
            <td><div class="row-actions">
              ${extra}
              ${admin ? `<button class="btn btn-outline btn-sm" data-edit="${r.id}">Edit</button>
              <button class="btn btn-danger btn-sm" data-toggle="${r.id}">${r.is_active === false ? 'Reactivate' : 'Deactivate'}</button>` : ''}
            </div></td>
          </tr>`;
        }).join('')
      : emptyRow(columns.length + 2, emptyLabel);

    return `
      <div class="page-head">
        <div><h2 class="section-heading">${escapeHtml(title)}</h2><p class="section-sub">${rows.length} record${rows.length === 1 ? '' : 's'}</p></div>
        <button class="btn btn-primary" id="mf-add-btn">+ Add ${escapeHtml(title)}</button>
      </div>
      <div class="table-wrap">
        <div class="table-toolbar">
          <div class="search-box"><input class="form-input" id="mf-search" placeholder="Search…"></div>
        </div>
        <div class="table-scroll">
          <table class="erp-table">
            <thead><tr>${theadCols}<th>Status</th><th></th></tr></thead>
            <tbody id="mf-tbody">${bodyRows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function wire(container, rows) {
    document.getElementById('mf-add-btn').addEventListener('click', () => openForm(null));
    const searchEl = document.getElementById('mf-search');
    searchEl.addEventListener('input', debounce(() => {
      const filtered = filterRows(allRows, searchEl.value, searchFields);
      document.getElementById('mf-tbody').outerHTML = renderTbodyOnly(filtered);
      wireRowButtons();
    }, 200));
    wireRowButtons();

    function wireRowButtons() {
      container.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
        const row = allRows.find(r => r.id === b.dataset.edit);
        if (row) openForm(row);
      }));
      container.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
        const row = allRows.find(r => r.id === b.dataset.toggle);
        if (row) toggleActive(row);
      }));
    }
  }

  function renderTbodyOnly(rows) {
    const admin = isAdmin();
    const bodyRows = rows.length
      ? rows.map(r => {
          const tds = columns.map(c => `<td>${c.render ? c.render(r) : escapeHtml(r[c.key] ?? '')}</td>`).join('');
          const extra = extraActions ? extraActions(r) : '';
          return `<tr>
            ${tds}
            <td>${r.is_active === false ? '<span class="badge badge-gray">Inactive</span>' : '<span class="badge badge-green">Active</span>'}</td>
            <td><div class="row-actions">
              ${extra}
              ${admin ? `<button class="btn btn-outline btn-sm" data-edit="${r.id}">Edit</button>
              <button class="btn btn-danger btn-sm" data-toggle="${r.id}">${r.is_active === false ? 'Reactivate' : 'Deactivate'}</button>` : ''}
            </div></td>
          </tr>`;
        }).join('')
      : emptyRow(columns.length + 2, emptyLabel);
    return `<tbody id="mf-tbody">${bodyRows}</tbody>`;
  }

  async function refresh() {
    try {
      allRows = await fetchRows();
      container.innerHTML = renderTable(allRows);
      wire(container, allRows);
    } catch (err) {
      toastError(err, `Could not load ${title}`);
      container.innerHTML = `<div class="empty-state">Could not load ${escapeHtml(title)}.</div>`;
    }
  }

  return refresh();
}
