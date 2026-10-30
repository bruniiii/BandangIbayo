import { formatDateRange, bookingDownpayment } from './tourUtils';
import { formatYmdRange } from './dateRange';
import { fetchTourExpenses, expenseItems } from './tourExpenses';

// ─────────────────────────────────────────────
// PAYMENT RECEIPTS (PDF), in the style of a printed till receipt: narrow
// paper, a centered header, QTY / DESC / AMOUNT lines, the amount paid in big
// type, totals and the booking's check-in QR.
// A downpayment gets its own receipt (with the remaining balance), and once
// the balance is paid there's a second receipt for that payment.
// Generated in the browser; jsPDF is loaded only when a receipt is made.
// Amounts use "PHP" because the PDF's built-in fonts have no peso sign.
// This acknowledges a payment; it is not a BIR-registered official receipt.
// ─────────────────────────────────────────────

const php = (n) => `PHP ${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const manila = (d, opts) => new Date(d).toLocaleString('en-US', { timeZone: 'Asia/Manila', ...opts });
const dateOf = (d) => manila(d, { month: '2-digit', day: '2-digit', year: 'numeric' });
const timeOf = (d) => manila(d, { hour: '2-digit', minute: '2-digit', hour12: true });

export const receiptNumber = (booking, part = 'payment') => `R-${booking.booking_number}${part === 'balance' ? '-BAL' : ''}`;

export const balanceRemaining = (booking) =>
  booking.payment_method === 'Downpayment' && !booking.balance_settled
    ? Math.max(0, (booking.total_price || 0) - (booking.amount_paid || 0))
    : 0;

// A QR code image (PNG data URL) for the receipt.
const qrImage = async (text) => {
  const { default: QRCode } = await import('qrcode');
  return QRCode.toDataURL(String(text), { width: 360, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#464646', light: '#FFFFFF' } });
};
// The same check-in QR as in My Bookings (CheckInQr.jsx). Bookings without a
// check-in code get their booking number, which Check-in also accepts.
const checkinQrText = (booking) => (booking.checkin_code
  ? `BANDANGIBAYO-CHECKIN:${booking.checkin_code}`
  : booking.booking_number || 'BANDANG IBAYO');

// Lays out a receipt twice: once to measure its height, once to draw it on a
// page of exactly that height (like a roll of receipt paper).
const buildReceipt = async ({ draw, filename }) => {
  const { jsPDF } = await import('jspdf');
  const W = 240; // ~85 mm wide
  const measure = new jsPDF({ unit: 'pt', format: [W, 2000] });
  const height = draw(makePen(measure, W)) + 24;
  const doc = new jsPDF({ unit: 'pt', format: [W, Math.max(height, 300)] });
  draw(makePen(doc, W));
  return { doc, filename };
};

// Drawing helpers for one receipt page.
const makePen = (doc, W) => {
  const L = 16;
  const R = W - 16;
  const grey = [70, 70, 70];
  let y = 30;
  const font = (size, bold = true) => doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(...grey);
  const wrap = (text, width) => doc.splitTextToSize(String(text ?? ''), width);
  return {
    get y() { return y; },
    gap(n) { y += n; },
    center(text, size = 9, bold = true) {
      font(size, bold);
      for (const line of wrap(text, R - L)) { doc.text(line, W / 2, y, { align: 'center' }); y += size + 4; }
    },
    pair(left, right, size = 8.5, bold = true) {
      font(size, bold);
      if (right == null || right === '') {
        // Nothing on the right: long text (e.g. a name) wraps onto the next line.
        for (const line of wrap(String(left), R - L)) { doc.text(line, L, y); y += size + 3; }
        y += 3;
        return;
      }
      doc.text(String(left), L, y);
      doc.text(String(right), R, y, { align: 'right' });
      y += size + 6;
    },
    dashes() {
      doc.setDrawColor(...grey).setLineDashPattern([2, 2], 0).setLineWidth(0.8).line(L, y - 4, R, y - 4).setLineDashPattern([], 0);
      y += 8;
    },
    columns() {
      font(8);
      doc.text('QTY', L, y); doc.text('DESC', L + 30, y); doc.text('AMOUNT', R, y, { align: 'right' });
      y += 6;
      this.dashes();
    },
    // One item: quantity, a description that wraps, the amount on the right.
    item(qty, desc, amount) {
      font(8.5);
      doc.text(String(qty ?? ''), L, y);
      if (amount != null && amount !== '') doc.text(String(amount), R, y, { align: 'right' });
      const lines = wrap(desc, R - L - 30 - 70);
      doc.text(lines, L + 30, y);
      y += 13 * lines.length + 3;
    },
    // A total line, indented like the sample (label, then the value).
    total(label, value, size = 8.5) {
      font(size);
      doc.text(String(label), L + 30, y);
      doc.text(String(value), R, y, { align: 'right' });
      y += size + 7;
    },
    big(label, value) {
      font(13);
      doc.text(String(label), L, y);
      doc.text(String(value), R, y, { align: 'right' });
      y += 22;
    },
    qr(dataUrl, caption) {
      const size = 120;
      doc.addImage(dataUrl, 'PNG', (W - size) / 2, y, size, size);
      y += size + 12;
      font(7, false);
      doc.text(String(caption), W / 2, y - 2, { align: 'center' });
      y += 8;
    },
    note(text) {
      font(6.5, false);
      for (const line of wrap(text, R - L)) { doc.text(line, W / 2, y, { align: 'center' }); y += 9; }
    },
  };
};

const header = (pen) => {
  pen.center('BANDANG IBAYO', 15);
  pen.center('Joiner tours across the Philippines', 7.5, false);
  pen.center('bandangibayo@gmail.com', 7.5, false);
  pen.gap(6);
};

const footer = (pen, qr, caption, text) => {
  pen.gap(4);
  pen.qr(qr, caption);
  pen.note(text);
  return pen.y;
};

// Expense names only: joiners don't see what each item costs.
const expenseLines = (pen, expenses) => {
  const items = expenseItems(expenses);
  if (!items.length) return;
  pen.gap(2);
  pen.pair('INCLUSION', '', 7.5);
  items.forEach((i) => pen.item('', i.label, ''));
};

// Who processed the payment: the admin who recorded or verified it, or
// "Online (PayMongo)" when the joiner paid online and no admin was involved.
const processedBy = (adminName, paidOnline) =>
  String(adminName || '').trim() || (paidOnline ? 'Online (PayMongo)' : 'Bandang IBAYO');

// ── Tour booking receipt ──────────────────────
// The downpayment a booking started with (as charged: 50%, or 40% for older bookings).
const downpaymentOf = (booking) => bookingDownpayment(booking);
// Whether a booking has a second receipt for its paid balance.
export const hasBalanceReceipt = (booking) => booking.payment_method === 'Downpayment' && !!booking.balance_settled;

// part: 'payment' (the full payment or the downpayment) or 'balance' (the
// remaining balance, once it's paid).
const bookingReceipt = async (booking, tour, { expenses, part = 'payment' } = {}) => {
  const exp = expenses === undefined ? await fetchTourExpenses(booking.tour_id) : expenses;
  const pax = booking.slots_booked || 1;
  const discount = Number(booking.sale_discount) || 0;
  const total = Number(booking.total_price) || 0;
  const isDown = booking.payment_method === 'Downpayment';
  const settled = isDown && !!booking.balance_settled;
  const isBalance = part === 'balance' && settled;
  // What this receipt is for, and what was still owed after it.
  const down = isDown ? (settled ? downpaymentOf(booking) : Number(booking.amount_paid ?? 0) || 0) : 0;
  const paidNow = isBalance ? Math.max(0, total - down) : isDown ? down : Number(booking.amount_paid ?? total) || 0;
  const paidSoFar = isBalance ? total : paidNow;
  const remaining = isBalance ? 0 : isDown ? Math.max(0, total - down) : 0;
  const paidAt = isBalance
    ? (booking.balance_settled_at || new Date())
    : (booking.paid_online_at || booking.updated_at || booking.created_at || new Date());
  const companions = (booking.companions || []).map((c) => c.full_name).filter(Boolean);
  // Paid online through PayMongo, or recorded by the agency (a balance paid on the day).
  const method = (isBalance ? booking.paymongo_balance_payment_id : booking.paymongo_payment_id) ? 'ONLINE'
    : isBalance ? 'PAID ON THE DAY' : 'GCASH';
  const kind = isBalance ? 'BALANCE PAYMENT' : String(booking.payment_method || 'Full Payment').toUpperCase();
  const qr = await qrImage(checkinQrText(booking));

  return buildReceipt({
    filename: `receipt-${booking.booking_number}${isBalance ? '-balance' : ''}.pdf`,
    draw: (pen) => {
      header(pen);
      if (isBalance) pen.center('BALANCE RECEIPT', 9);
      pen.pair(dateOf(paidAt), timeOf(paidAt));
      pen.pair(`BOOKING ${booking.booking_number || '—'}`, '');
      pen.pair(`JOINER ${String(booking.full_name || '—').toUpperCase()}`, '');
      pen.pair(`${method} · ${kind}`, '');
      if (!isBalance && booking.paymongo_payment_id) pen.pair(`REF ${booking.paymongo_payment_id}`, '', 7);
      else if (isBalance && booking.paymongo_balance_payment_id) pen.pair(`REF ${booking.paymongo_balance_payment_id}`, '', 7);
      else if (!isBalance && booking.gcash_reference_no) pen.pair(`REF ${booking.gcash_reference_no}`, '', 7);
      pen.pair(`PROCESSED BY ${processedBy(isBalance ? booking.balance_processed_by_name : booking.processed_by_name, method === 'ONLINE').toUpperCase()}`, '', 7);
      pen.gap(4);
      pen.columns();
      pen.item(pax, `${tour?.title || 'Tour'} (${formatDateRange(tour?.start_date, tour?.duration)})`, php(total + discount));
      if (discount > 0) pen.item('', 'Sale discount (5%)', `- ${php(discount)}`);
      if (booking.accommodation) pen.item('', `Accommodation: ${booking.accommodation}`, '');
      if (booking.pickup_point) pen.item('', `Pickup: ${booking.pickup_point}`, '');
      if (companions.length) pen.item('', `With: ${companions.join(', ')}`, '');
      expenseLines(pen, exp);
      pen.gap(10);
      pen.big('AMOUNT', php(paidNow));
      pen.total('SUBTOTAL', php(total + discount));
      if (discount > 0) pen.total('DISCOUNT', `- ${php(discount)}`);
      pen.total('TOTAL', php(total));
      if (isBalance) pen.total('DOWNPAYMENT', php(down));
      pen.total(isBalance ? 'BALANCE PAID' : 'PAID', php(paidNow));
      if (isBalance) pen.total('TOTAL PAID', php(paidSoFar));
      if (remaining > 0) pen.total('REMAINING BALANCE', php(remaining));
      if (remaining > 0) pen.note(settled ? `Balance paid on ${dateOf(booking.balance_settled_at || new Date())}. See the balance receipt.` : 'Balance due on or before the tour date.');
      else if (isBalance) pen.note('Fully paid. Thank you!');
      return footer(pen, qr, 'Show this QR at check-in on the tour day',
        `${receiptNumber(booking, isBalance ? 'balance' : 'payment')} · Issued ${dateOf(new Date())} ${timeOf(new Date())}. Payments are non-refundable. Not a BIR-registered official receipt.`);
    },
  });
};

export const downloadReceipt = async (booking, tour, part = 'payment') => {
  const { doc, filename } = await bookingReceipt(booking, tour, { part });
  doc.save(filename);
};

// Admin "Print Receipt": the same receipt, opened in a new tab to print.
export const printReceipt = async (booking, tour, part = 'payment') => {
  const win = window.open('', '_blank'); // opened now, so the browser doesn't block it
  const { doc } = await bookingReceipt(booking, tour, { part });
  doc.autoPrint();
  const url = doc.output('bloburl');
  if (win) win.location.href = url; else window.open(url, '_blank');
};

// ── Exclusive tour receipt (50% downpayment, then the balance) ──
export const exclusiveReceiptNumber = (request) => `R-EX-${String(request.id).slice(0, 8).toUpperCase()}`;

// part: 'payment' (the 50% downpayment) or 'balance' (the rest, once paid).
export const downloadExclusiveReceipt = async (request, part = 'payment') => {
  const pkg = request.package_details || {};
  const price = Number(pkg.price) || 0;
  const isBalance = part === 'balance' && !!request.balance_settled;
  const down = Number(request.downpayment_amount) || Math.round(price * 50) / 100;
  const paidNow = isBalance ? (Number(request.balance_amount) || Math.max(0, price - down)) : down;
  const remaining = isBalance ? 0 : Math.max(0, price - down);
  const start = pkg.start_date || request.preferred_date;
  const end = pkg.end_date || request.preferred_end_date || start;
  const paidAt = (isBalance ? request.balance_paid_at : request.paid_at) || new Date();
  const code = `${exclusiveReceiptNumber(request)}${isBalance ? '-BAL' : ''}`;
  const qr = await qrImage(code);
  const ref = isBalance ? request.balance_paymongo_payment_id : request.paymongo_payment_id;

  const { doc, filename } = await buildReceipt({
    filename: `receipt-exclusive-${String(request.id).slice(0, 8)}${isBalance ? '-balance' : ''}.pdf`,
    draw: (pen) => {
      header(pen);
      if (isBalance) pen.center('BALANCE RECEIPT', 9);
      pen.pair(dateOf(paidAt), timeOf(paidAt));
      pen.pair('EXCLUSIVE TOUR', '');
      pen.pair(`JOINER ${String(request.full_name || '—').toUpperCase()}`, '');
      pen.pair(`${ref ? 'ONLINE' : 'RECORDED'} · ${isBalance ? 'BALANCE PAYMENT' : '50% DOWNPAYMENT'}`, '');
      if (ref) pen.pair(`REF ${ref}`, '', 7);
      pen.pair(`PROCESSED BY ${processedBy(isBalance ? request.balance_processed_by_name : request.processed_by_name, !!ref).toUpperCase()}`, '', 7);
      pen.gap(4);
      pen.columns();
      pen.item(request.group_size || 1, `${pkg.title || pkg.destination || request.destination}${start ? ` (${formatYmdRange(start, end)})` : ''}`, php(price));
      const room = request.accommodation || pkg.accommodation;
      if (room) pen.item('', `Accommodation: ${room}`, '');
      expenseLines(pen, pkg.expenses);
      pen.gap(10);
      pen.big('AMOUNT', php(paidNow));
      pen.total('SUBTOTAL', php(price));
      if (isBalance) pen.total('DOWNPAYMENT', php(down));
      pen.total(isBalance ? 'BALANCE PAID' : 'PAID', php(paidNow));
      if (isBalance) pen.total('TOTAL PAID', php(down + paidNow));
      if (remaining > 0) pen.total('REMAINING BALANCE', php(remaining));
      if (remaining > 0) pen.note(request.balance_settled ? `Balance paid on ${dateOf(request.balance_paid_at || new Date())}. See the balance receipt.` : 'Balance due before the trip.');
      else if (isBalance) pen.note('Fully paid. Thank you!');
      return footer(pen, qr, code,
        `${code} · Issued ${dateOf(new Date())} ${timeOf(new Date())}. Payments are non-refundable. Not a BIR-registered official receipt.`);
    },
  });
  doc.save(filename);
};
