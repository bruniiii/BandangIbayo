import { supabase } from './supabaseClient';
import { confirmDialog } from './ui/ConfirmDialog';
import { toast } from './ui/toast';

// A deactivated joiner who logs in is asked whether to reactivate their
// account. Yes → it's active again (true). No → they're logged out (false).
// Asked once even if several places check at the same time.
let pending = null;
export const askToReactivate = () => {
  if (!pending) pending = ask().finally(() => { pending = null; });
  return pending;
};

const ask = async () => {
  const yes = await confirmDialog({
    title: 'Reactivate your account?',
    message: 'Your account is deactivated. Reactivate it to use Bandang IBAYO again. Your profile, bookings and reviews are just as you left them.',
    confirmLabel: 'Reactivate Account',
    cancelLabel: 'Not Now',
  });
  if (yes) {
    const { error } = await supabase.rpc('reactivate_my_account');
    if (!error) {
      toast.success('Welcome back!', 'Your account is active again.');
      return true;
    }
    toast.error("Couldn't reactivate your account", error.message);
  }
  await supabase.auth.signOut();
  return false;
};
