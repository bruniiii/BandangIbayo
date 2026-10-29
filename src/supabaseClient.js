import { createClient, processLock } from '@supabase/supabase-js';

const supabaseUrl = 'https://renugdlntgybazpikmbu.supabase.co';
const supabaseAnonKey = 'sb_publishable_IaplUePHeDyuIpofBrNPTA_PRaBA-AR';

// A password reset link that landed on another page (Supabase sends people to
// the Site URL when /reset-password isn't in its Redirect URLs). Read before
// the client removes the sign-in details from the address.
export const openedFromResetLink =
  typeof window !== 'undefined' && /(^|[#&?])type=recovery(&|$)/.test(window.location.hash + window.location.search);

// Sign-in lock: one per browser tab (processLock) instead of the default
// cross-tab browser lock. With the default, a tab that holds the lock too long
// (a sleeping background tab, a slow connection) has it "stolen" by another,
// and every request waiting on it fails with "AbortError: Lock broken by
// another request with the 'steal' option" (seen on Reports).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { lock: processLock },
});
