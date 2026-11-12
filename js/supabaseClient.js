// Supabase client — single shared instance for the whole app.
//
// The anon/publishable key is safe to ship in this static bundle: RLS
// policies (see supabase/migrations/20261103120700_rls.sql) are what
// actually gate access, not this key. Never put the service-role key
// here or in any file that reaches the browser.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export const SUPABASE_URL = 'https://ppjhhgzgshddpylbrnpe.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_-KWLoHqFauBehqSjzTpyYQ_56D-9Y-N';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
