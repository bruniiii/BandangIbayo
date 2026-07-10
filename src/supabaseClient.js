import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://renugdlntgybazpikmbu.supabase.co';
const supabaseAnonKey = 'sb_publishable_IaplUePHeDyuIpofBrNPTA_PRaBA-AR';

export const supabase = createClient(supabaseUrl, supabaseAnonKey)