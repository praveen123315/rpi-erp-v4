// Users & Access — admin manages role/active status of existing sign-ins.
// New accounts can't be created from here: creating an auth user needs
// the Supabase service-role Admin API, which must never reach the
// frontend (see supabaseClient.js). New users are created from the
// Supabase dashboard; this page is read for everyone, edit for admins.
import { supabase } from '../supabaseClient.js';
import { isAdmin } from '../auth.js';
import { escapeHtml, toast, toastError, openModal, closeModal, filterRows, emptyRow, debounce } from '../ui.js';

let profiles = [];

async function loadProfiles() {
  const { data, error } = await supabase.from('profiles').select('*').order('username');
  if (error) throw error;
  return data || [];
}

export async function renderUsersAccess(container) {
  container.innerHTML = `<div class="loading-row"><span class="spinner"></span> &nbsp;Loading…</div>`;
  try {
    profiles = await loadProfiles();
  } catch (err) {
    toastError(err, 'Could not load users');
    container.innerHTML = `<div class="empty-state">Could not load users.</div>`;
    return;
  }
  paint();

  function paint() {
    const admin = isAdmin();
    container.innerHTML = `
      <div class="page-head">
        <div><h2 class="section-heading">Users & Access</h2><p class="section-sub">${profiles.length} account${profiles.length === 1 ? '' : 's'} — new sign-ins are created in the Supabase dashboard, roles are managed here</p></div>
      </div>
      <div class="table-wrap">
        <div class="table-toolbar"><div class="search-box"><input class="form-input" id="ua-search" placeholder="Search username or email…"></div></div>
        <div class="table-scroll">
          <table class="erp-table">
            <thead><tr><th>Username</th><th>Display Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody id="ua-tbody">${rowsHtml(profiles)}</tbody>
          </table>
        </div>
      </div>`;
    document.getElementById('ua-search').addEventListener('input', debounce((e) => {
      const filtered = filterRows(profiles, e.target.value, ['username', 'email', 'display_name']);
      document.getElementById('ua-tbody').innerHTML = rowsHtml(filtered);
      wireRows();
    }, 200));
    wireRows();

    function rowsHtml(rows) {
      if (!rows.length) return emptyRow(6, 'No users found.');
      return rows.map(p => `<tr>
        <td>${escapeHtml(p.username)}</td>
        <td>${escapeHtml(p.display_name || '—')}</td>
        <td>${escapeHtml(p.email || '—')}</td>
        <td><span class="badge ${p.role === 'admin' ? 'badge-saffron' : 'badge-gray'}">${escapeHtml(p.role)}</span></td>
        <td>${p.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Deactivated</span>'}</td>
        <td>${admin ? `<button class="btn btn-outline btn-sm" data-edit="${p.id}">Edit</button>` : ''}</td>
      </tr>`).join('');
    }

    function wireRows() {
      container.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editUser(b.dataset.edit)));
    }
  }

  function editUser(id) {
    const p = profiles.find(x => x.id === id);
    openModal({
      title: `Edit ${p.username}`,
      bodyHtml: `
        <div class="form-grid">
          <div class="form-field"><label class="form-label">Display Name</label><input class="form-input" id="ua-display" value="${escapeHtml(p.display_name || '')}"></div>
          <div class="form-field"><label class="form-label">Role</label>
            <select class="form-select" id="ua-role">
              <option value="user" ${p.role === 'user' ? 'selected' : ''}>User</option>
              <option value="data_entry" ${p.role === 'data_entry' ? 'selected' : ''}>Data Entry</option>
              <option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
          </div>
          <div class="form-field" style="flex-direction:row;align-items:center;gap:8px;">
            <input type="checkbox" id="ua-active" ${p.is_active ? 'checked' : ''} style="width:16px;height:16px;">
            <label class="form-label" style="margin:0;" for="ua-active">Active (can sign in)</label>
          </div>
        </div>`,
      footHtml: `<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save</button>`,
    });
    document.querySelector('[data-cancel]').addEventListener('click', closeModal);
    document.querySelector('[data-save]').addEventListener('click', async () => {
      try {
        const { error } = await supabase.from('profiles').update({
          display_name: document.getElementById('ua-display').value || '',
          role: document.getElementById('ua-role').value,
          is_active: document.getElementById('ua-active').checked,
        }).eq('id', id);
        if (error) throw error;
        toast('User updated', 'success');
        closeModal();
        profiles = await loadProfiles();
        paint();
      } catch (err) {
        toastError(err, 'Could not update user');
      }
    });
  }
}
