import { supabase } from './supabaseClient';
import { confirmDialog } from './ui/ConfirmDialog';

// ─────────────────────────────────────────────
// An archived joiner decides whether to get their account back: after they
// log in with the right password (or Google), they're asked, and only their
// "yes" restores it. Admins don't restore joiners.
// ─────────────────────────────────────────────

const WHY = {
  deactivated: 'You deactivated this account.',
  deleted: 'You deleted this account.',
  inactive: "This account was archived because it hadn't been used for a long time.",
};

// true when the joiner chooses to restore the account.
export const askRestoreAccount = (reason) => confirmDialog({
  title: 'Welcome back! Restore your account?',
  message: `${WHY[reason] || 'This account is archived.'} Restore it to log in again and see your bookings, reviews and messages. Nothing was lost.`,
  confirmLabel: 'Restore My Account',
  cancelLabel: 'Not Now',
});

// An archived admin (right password): send the main admin a restore request?
export const askAdminRestore = () => confirmDialog({
  title: 'Ask to be restored as an admin?',
  message: 'Your admin account was archived. The main admin will get your request, and you can log in again once they approve it.',
  confirmLabel: 'Send Request',
  cancelLabel: 'Not Now',
});

// Restores the signed-in joiner's archived account (Sign in with Google).
export const restoreMyAccount = async () => {
  const { error } = await supabase.rpc('reactivate_my_account');
  return error ? error.message : null;
};
