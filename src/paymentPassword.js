import { supabase } from './supabaseClient';
import { confirmAdminPassword } from './authApi';
import { confirmDialog } from './ui/ConfirmDialog';
import { sendCustomEmail } from './Email';
import { toast } from './ui/toast';

// ─────────────────────────────────────────────
// Confirming a payment by hand (money!): the admin types their password, the
// server checks it and gives a one-time pass, then the database records the
// payment (admin_record_payment) and tells the main admin, who also gets an
// email. Returns true when it was recorded.
//   await recordPaymentWithPassword({ table: 'bookings', id, changes: { … }, what: 'BK-2026-00215 balance' })
// ─────────────────────────────────────────────
export const recordPaymentWithPassword = async ({ table, id, changes, what = 'this payment' }) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const password = await confirmDialog({
      title: 'Confirm with your password',
      message: `For security, type your admin password to confirm ${what}. The main admin is told about every payment confirmed by hand.`,
      passwordLabel: 'Your password',
      confirmLabel: 'Confirm Payment',
      cancelLabel: 'Cancel',
    });
    if (!password) return false;
    const check = await confirmAdminPassword(password);
    if (!check.ok) {
      toast.error("Couldn't confirm", check.error || 'Wrong password.');
      if (check.locked || /locked/i.test(check.error || '')) return false;
      continue;
    }
    const { data, error } = await supabase.rpc('admin_record_payment', { p_table: table, p_id: String(id), p_changes: changes, p_token: check.data.token });
    if (error) { toast.error("Couldn't record the payment", error.message); return false; }
    // An email record for the main admin(s).
    (data?.main_admin_ids || []).forEach((userId) => {
      sendCustomEmail({
        userId,
        subject: `Payment confirmed by hand: ${data.label || what}`,
        message: `A payment for ${data.label || what} was confirmed by hand (with the admin's password) on ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}. You can see it in Booking Management.`,
      }).catch(() => {});
    });
    return true;
  }
  return false;
};
