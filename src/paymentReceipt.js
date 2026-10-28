import { formatDateRange } from './tourUtils';
import { formatYmdRange } from './dateRange';
import { fetchTourExpenses, expenseItems } from './tourExpenses';

// ─────────────────────────────────────────────
// PAYMENT RECEIPTS (PDF), in the style of a printed till receipt: narrow
// paper, a centered header, QTY / DESC / AMT lines, the amount paid in big
// type, totals and a barcode of the booking number.
// Generated in the browser; jsPDF is loaded only when a receipt is made.
// Amounts use "PHP" because the PDF's built-in fonts have no peso sign.
// This acknowledges a payment; it is not a BIR-registered official receipt.
// ─────────────────────────────────────────────

const php = (n) => `PHP ${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const manila = (d, opts) => new Date(d).toLocaleString('en-US', { timeZone: 'Asia/Manila', ...opts });
const dateOf = (d) => manila(d, { month: '2-digit', day: '2-digit', year: 'numeric' });
const timeOf = (d) => manila(d, { hour: '2-digit', minute: '2-digit', hour12: true });

export const receiptNumber = (booking) => `R-${booking.booking_number}`;

export const balanceRemaining = (booking) =>
  booking.payment_method === 'Downpayment' && !booking.balance_settled
    ? Math.max(0, (booking.total_price || 0) - (booking.amount_paid || 0))
    : 0;

// ── Code 128 (set B) barcode: bar/space widths for each symbol ──
const CODE128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const code128Widths = (text) => {
  const values = [104]; // Start B
  for (const ch of String(text)) {
    const v = ch.charCodeAt(0) - 32;
    if (v >= 0 && v < 95) values.push(v);
  }
  const check = values.reduce((sum, v, i) => sum + v * (i || 1), 0) % 103;
  return [...values, check, 106].map((v) => CODE128[v]).join('');
};

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
      doc.text(String(left), L, y);
      if (right != null && right !== '') doc.text(String(right), R, y, { align: 'right' });
      y += size + 6;
    },
    dashes() {
      doc.setDrawColor(...grey).setLineDashPattern([2, 2], 0).setLineWidth(0.8).line(L, y - 4, R, y - 4).setLineDashPattern([], 0);
      y += 8;
    },
    columns() {
      font(8);
      doc.text('QTY', L, y); doc.text('DESC', L + 30, y); doc.text('AMT', R, y, { align: 'right' });
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
      doc.text(String(value), L + 120, y);
      y += size + 7;
    },
    big(label, value) {
      font(15);
      doc.text(String(label), L + 30, y);
      doc.text(String(value), L + 82, y);
      y += 22;
    },
    barcode(text) {
      const widths = code128Widths(text);
      const units = [...widths].reduce((s, w) => s + Number(w), 0) + 20;
      const unit = Math.min(1.2, (R - L) / units);
      let x = (W - units * unit) / 2 + 10 * unit;
      doc.setFillColor(...grey);
      [...widths].forEach((w, i) => {
        const width = Number(w) * unit;
        if (i % 2 === 0) doc.rect(x, y, width, 40, 'F');
        x += width;
      });
      y += 52;
      font(7, false);
      doc.text(String(text), W / 2, y - 4, { align: 'center' });
      y += 6;
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

const footer = (pen, code, text) => {
  pen.gap(4);
  pen.barcode(code);
  pen.note(text);
  return pen.y;
};

// Expense names only: joiners don't see what each item costs.
const expenseLines = (pen, expenses) => {
  const items = expenseItems(expenses);
  if (!items.length) return;
  pen.gap(2);
  pen.pair('INCLUDED', '', 7.5);
  items.forEach((i) => pen.item('', i.label, 'Included'));
};

// ── Tour booking receipt ──────────────────────
const bookingReceipt = async (booking, tour, { expenses } = {}) => {
  const exp = expenses === undefined ? await fetchTourExpenses(booking.tour_id) : expenses;
  const paidAt = booking.balance_settled_at || booking.paid_online_at || booking.updated_at || booking.created_at || new Date();
  const pax = booking.slots_booked || 1;
  const discount = Number(booking.sale_discount) || 0;
  const total = Number(booking.total_price) || 0;
  const paid = Number(booking.amount_paid ?? total) || 0;
  const balance = balanceRemaining(booking);
  const companions = (booking.companions || []).map((c) => c.full_name).filter(Boolean);
  const method = booking.paymongo_payment_id ? 'ONLINE' : 'GCASH';

  return buildReceipt({
    filename: `receipt-${booking.booking_number}.pdf`,
    draw: (pen) => {
      header(pen);
      pen.pair(dateOf(paidAt), timeOf(paidAt));
      pen.pair(`BOOKING ${booking.booking_number || '—'}`, '');
      pen.pair(`JOINER ${String(booking.full_name || '—').toUpperCase()}`, '');
      pen.pair(`${method} · ${String(booking.payment_method || 'Full Payment').toUpperCase()}`, '');
      if (booking.paymongo_payment_id) pen.pair(`REF ${booking.paymongo_payment_id}`, '', 7);
      else if (booking.gcash_reference_no) pen.pair(`REF ${booking.gcash_reference_no}`, '', 7);
      pen.gap(4);
      pen.columns();
      pen.item(pax, `${tour?.title || 'Tour'} (${formatDateRange(tour?.start_date, tour?.duration)})`, php(total + discount));
      if (discount > 0) pen.item('', 'Sale discount (5%)', `- ${php(discount)}`);
      if (booking.pickup_point) pen.item('', `Pickup: ${booking.pickup_point}`, '');
      if (companions.length) pen.item('', `With: ${companions.join(', ')}`, '');
      expenseLines(pen, exp);
      pen.gap(10);
      pen.big('AMT', php(paid));
      pen.total('SUBTOTAL', php(total + discount));
      if (discount > 0) pen.total('DISCOUNT', `- ${php(discount)}`);
      pen.total('TOTAL', php(total));
      pen.total('PAID', php(paid));
      pen.total('BALANCE', balance > 0 ? php(balance) : 'PHP 0.00');
      if (balance > 0) pen.note('Balance due on or before the tour date.');
      return footer(pen, booking.booking_number || 'BANDANG IBAYO',
        `${receiptNumber(booking)} · Issued ${dateOf(new Date())} ${timeOf(new Date())}. Payments are non-refundable. Not a BIR-registered official receipt.`);
    },
  });
};

export const downloadReceipt = async (booking, tour) => {
  const { doc, filename } = await bookingReceipt(booking, tour);
  doc.save(filename);
};

// Admin "Print Receipt": the same receipt, opened in a new tab to print.
export const printReceipt = async (booking, tour) => {
  const win = window.open('', '_blank'); // opened now, so the browser doesn't block it
  const { doc } = await bookingReceipt(booking, tour);
  doc.autoPrint();
  const url = doc.output('bloburl');
  if (win) win.location.href = url; else window.open(url, '_blank');
};

// ── Exclusive tour receipt (50% downpayment, then the balance) ──
export const exclusiveReceiptNumber = (request) => `R-EX-${String(request.id).slice(0, 8).toUpperCase()}`;

export const downloadExclusiveReceipt = async (request) => {
  const pkg = request.package_details || {};
  const price = Number(pkg.price) || 0;
  const paid = Number(request.amount_paid) || 0;
  const balance = request.balance_settled ? 0 : Math.max(0, price - paid);
  const start = pkg.start_date || request.preferred_date;
  const end = pkg.end_date || request.preferred_end_date || start;
  const paidAt = request.balance_paid_at || request.paid_at || new Date();
  const code = exclusiveReceiptNumber(request);

  const { doc, filename } = await buildReceipt({
    filename: `receipt-exclusive-${String(request.id).slice(0, 8)}.pdf`,
    draw: (pen) => {
      header(pen);
      pen.pair(dateOf(paidAt), timeOf(paidAt));
      pen.pair('EXCLUSIVE TOUR', '');
      pen.pair(`JOINER ${String(request.full_name || '—').toUpperCase()}`, '');
      pen.pair(`${request.paymongo_payment_id ? 'ONLINE' : 'RECORDED'} · 50% DOWNPAYMENT`, '');
      if (request.paymongo_payment_id) pen.pair(`REF ${request.paymongo_payment_id}`, '', 7);
      pen.gap(4);
      pen.columns();
      pen.item(request.group_size || 1, `${pkg.title || pkg.destination || request.destination}${start ? ` (${formatYmdRange(start, end)})` : ''}`, php(price));
      if (pkg.accommodation) pen.item('', `Accommodation: ${pkg.accommodation}`, '');
      expenseLines(pen, pkg.expenses);
      pen.gap(10);
      pen.big('AMT', php(paid));
      pen.total('SUBTOTAL', php(price));
      pen.total('PAID', php(paid));
      pen.total('BALANCE', balance > 0 ? php(balance) : 'PHP 0.00');
      if (balance > 0) pen.note('Balance due before the trip.');
      return footer(pen, code,
        `${code} · Issued ${dateOf(new Date())} ${timeOf(new Date())}. Payments are non-refundable. Not a BIR-registered official receipt.`);
    },
  });
  doc.save(filename);
};
