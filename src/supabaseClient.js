import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://renugdlntgybazpikmbu.supabase.co';
const supabaseAnonKey = 'sb_publishable_IaplUePHeDyuIpofBrNPTA_PRaBA-AR';

// A password reset link that landed on another page (Supabase sends people to
// the Site URL when /reset-password isn't in its Redirect URLs). Read before
// the client removes the sign-in details from the address.
export const openedFromResetLink =
  typeof window !== 'undefined' && /(^|[#&?])type=recovery(&|$)/.test(window.location.hash + window.location.search);

export const supabase = createClient(supabaseUrl, supabaseAnonKey)