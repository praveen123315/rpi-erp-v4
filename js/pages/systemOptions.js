// System Options — simple key/value app settings (admin-only writes).
import { supabase } from '../supabaseClient.js';
import { isAdmin } from '../auth.js';
import { escapeHtml, toast, toastError, openModal, closeModal, confirmDialog, emptyRow } from '../ui.js';

async function loadSettings() {
  const { data, error } = await supabase.from('app_settings').select('*').order('key');
  if (error) throw error;
  return data || [];
}

export async function renderSystemOptions(container) {
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Loading…</div>`;
  let settings;
  try {
    settings = await loadSettings();
  } catch (err) {
    toastError(err, 'Could not load system options');
    container.innerHTML = `<div class="empty-state">Could not load system options.</div>`;
    return;
  }
  paint();

  function paint() {
    const admin = isAdmin();
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">System Options</h2><p class="section-sub">Application-wide settings, stored as key/value pairs</p></div>
        ${admin ? `<button class="btn btn-primary" id="so-add">+ Add setting</button>` : ''}
      </div>
      <div class="table-wrap">
        <table class="erp-table">
          <thead><tr><th>Key</th><th>Value</th><th>Updated</th><th></th></tr></thead>
          <tbody id="so-tbody">${rowsHtml(settings)}</tbody>
        </table>
      </div>`;
    document.getElementById('so-add')?.addEventListener('click', () => openForm(null));
    wireRows();

    function rowsHtml(rows) {
      if (!rows.length) return emptyRow(4, 'No settings configured yet.');
      return rows.map(s => `<tr>
        <td class="mono">${escapeHtml(s.key)}</td>
        <td class="mono">${escapeHtml(JSON.stringify(s.value))}</td>
        <td class="text-muted">${new Date(s.updated_at).toLocaleString('en-IN')}</td>
        <td>${admin ? `<button class="btn btn-outline btn-sm" data-edit="${s.key}">Edit</button> <button class="btn btn-danger btn-sm" data-del="${s.key}">Delete</button>` : ''}</td>
      </tr>`).join('');
    }

    function wireRows() {
      container.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openForm(settings.find(s => s.key === b.dataset.edit))));
      container.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => removeSetting(b.dataset.del)));
    }
  }

  function openForm(existing) {
    openModal({
      title: existing ? `Edit ${existing.key}` : 'Add setting',
      bodyHtml: `
        <div class="form-grid">
          <div class="form-field span-2"><label class="form-label">Key</label><input class="form-input" id="so-key" value="${escapeHtml(existing?.key || '')}" ${existing ? 'disabled' : ''}></div>
          <div class="form-field span-2"><label class="form-label">Value (JSON)</label><textarea class="form-textarea" id="so-value">${escapeHtml(JSON.stringify(existing?.value ?? {}, null, 2))}</textarea></div>
        </div>`,
      footHtml: `<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save</button>`,
    });
    document.querySelector('[data-cancel]').addEventListener('click', closeModal);
    document.querySelector('[data-save]').addEventListener('click', async () => {
      const key = document.getElementById('so-key').value.trim();
      if (!key) { toast('Key is required', 'error'); return; }
      let value;
      try { value = JSON.parse(document.getElementById('so-value').value || '{}'); }
      catch { toast('Value must be valid JSON', 'error'); return; }
      try {
        const { error } = await supabase.from('app_settings').upsert({ key, value });
        if (error) throw error;
        toast('Setting saved', 'success');
        closeModal();
        settings = await loadSettings();
        paint();
      } catch (err) {
        toastError(err, 'Could not save setting');
      }
    });
  }

  async function removeSetting(key) {
    const ok = await confirmDialog(`Delete setting "${key}"?`, { danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      const { error } = await supabase.from('app_settings').delete().eq('key', key);
      if (error) throw error;
      toast('Setting deleted', 'success');
      settings = await loadSettings();
      paint();
    } catch (err) {
      toastError(err, 'Could not delete setting');
    }
  }
}
