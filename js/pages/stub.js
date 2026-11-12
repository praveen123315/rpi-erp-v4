// Placeholder renderer for modules not yet rebuilt. Keeps the full nav
// structure visible and honest about what's still pending, rather than
// hiding unfinished pages.
export function stubPage(title, blurb) {
  return async function render(container) {
    container.innerHTML = `
      <div class="card" style="max-width:560px;text-align:center;padding:48px 32px;margin:40px auto;">
        <div style="width:48px;height:48px;border-radius:50%;background:var(--saffron-pale);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
          <svg width="22" height="22" fill="none" stroke="var(--saffron-dark)" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h3 style="margin:0 0 8px;">${title}</h3>
        <p class="text-muted" style="font-size:13px;margin:0;">${blurb} — this module is next up in the rebuild and isn't wired to Supabase yet.</p>
      </div>`;
  };
}
