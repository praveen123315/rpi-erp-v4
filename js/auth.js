import { supabase } from './supabaseClient.js';

// The signed-in user's profile row (profiles table: username, display_name,
// role, is_active). Populated by initAuth() and refreshed on sign-in.
export const authState = {
  session: null,
  profile: null,
};

export function isAdmin() {
  return authState.profile?.role === 'admin';
}

export function currentUserLabel() {
  return authState.profile?.display_name || authState.profile?.username || authState.session?.user?.email || '';
}

async function loadProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) {
    console.error('Failed to load profile', error);
    return null;
  }
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  authState.session = data.session;
  authState.profile = await loadProfile(data.user.id);
  if (authState.profile && !authState.profile.is_active) {
    await supabase.auth.signOut();
    authState.session = null;
    authState.profile = null;
    throw new Error('This account has been deactivated. Contact an administrator.');
  }
  return authState.profile;
}

export async function signOut() {
  await supabase.auth.signOut();
  authState.session = null;
  authState.profile = null;
}

// Called once at boot. Returns true if there is a usable, active session.
export async function initAuth() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;
  authState.session = data.session;
  authState.profile = await loadProfile(data.session.user.id);
  if (!authState.profile || !authState.profile.is_active) {
    await supabase.auth.signOut();
    authState.session = null;
    authState.profile = null;
    return false;
  }
  return true;
}

export async function changeOwnPassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
