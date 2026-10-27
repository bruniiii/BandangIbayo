import { formatDateRange } from './tourUtils';
import { formatYmdRange } from './dateRange';
import { fetchTourExpenses, expenseItems } from './tourExpenses';

// ─────────────────────────────────────────────
// PAYMENT RECEIPT (PDF) for a confirmed booking.
// Generated in the browser; jsPDF is loaded only when a joiner downloads one.
// Amounts use "PHP" because the PDF's built-in fonts have no peso sign.
// This acknowledges a GCash payment; it is not a BIR-registered official receipt.
// ─────────────────────────────────────────────

// "October 21, 2026, 3:45 PM" in Philippine time.
const dateTime = (d) => new Date(d).toLocaleString('en-PH', {
  timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
});

const php = (n) => `PHP ${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const receiptNumber = (booking) => `R-${booking.booking_number}`;

export const balanceRemaining = (booking) =>
  booking.payment_method === 'Downpayment' && !booking.balance_settled
    ? Math.max(0, (booking.total_price || 0) - (booking.amount_paid || 0))
    : 0;

// A blank receipt with the Bandang IBAYO header, plus helpers to add rows.
const startReceipt = (jsPDF) => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const left = 56;
  const right = doc.internal.pageSize.getWidth() - 56;
  let y = 64;

  const line = (label, value, opts = {}) => {
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(122, 58, 24);
    doc.text(label, left, y);
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal').setFontSize(opts.size || 10).setTextColor(26, 10, 0);
    const lines = doc.splitTextToSize(String(value ?? '—'), right - left - 160);
    doc.text(lines, left + 160, y);
    y += 16 * lines.length + (opts.gap || 4);
  };
  const section = (title) => {
    y += 10;
    doc.setDrawColor(232, 210, 190).line(left, y, right, y);
    y += 20;
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(196, 92, 38);
    doc.text(title.toUpperCase(), left, y);
    y += 18;
  };
  const footer = (text) => {
    y += 24;
    doc.setFont('helvetica', 'italic').setFontSize(8).setTextColor(122, 58, 24);
    doc.text(doc.splitTextToSize(text, right - left), left, y);
  };

  // Header
  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(26, 10, 0);
  doc.text('Bandang IBAYO', left, y);
  doc.setFontSize(12).setTextColor(196, 92, 38);
  doc.text('PAYMENT RECEIPT', right, y, { align: 'right' });
  y += 18;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(122, 58, 24);
  doc.text('Joiner tours across the Philippines · bandangibayo@gmail.com', left, y);
  y += 14;

  return { doc, line, section, footer };
};

// Expense names only: joiners don't see what each item costs.
const addExpenses = (section, line, expenses) => {
  if (!expenses) return;
  section('Tour expenses (covered by your booking)');
  expenseItems(expenses).forEach((item) => line(item.label, 'Included'));
};

export const downloadReceipt = async (booking, tour) => {
  const [{ jsPDF }, expenses] = await Promise.all([import('jspdf'), fetchTourExpenses(booking.tour_id)]);
  const { doc, line, section, footer } = startReceipt(jsPDF);

  section('Receipt');
  line('Receipt number', receiptNumber(booking), { bold: true });
  line('Date & time issued', dateTime(new Date()));
  line('Booking number', booking.booking_number);
  line('Booked on', booking.created_at ? dateTime(booking.created_at) : '—');

  section('Received from');
  line('Name', booking.full_name);
  line('Email', booking.email);
  line('Contact number', booking.contact_number);

  section('Tour');
  line('Tour', tour.title, { bold: true });
  line('Destination', tour.destination);
  line('Date', formatDateRange(tour.start_date, tour.duration));
  line('Joiners', `${booking.slots_booked} ${booking.slots_booked === 1 ? 'person' : 'persons'}`);
  if (booking.pickup_point) line('Pickup point', booking.pickup_point);
  if (booking.companions?.length) {
    line('Joining with', booking.companions.map((c) => c.full_name).join(', '));
  }

  section('Payment');
  if (booking.paymongo_payment_id) {
    line('Payment method', `Online via PayMongo · ${booking.payment_method || '—'}`);
    line('Payment ID', booking.paymongo_payment_id);
    if (booking.paymongo_balance_payment_id) line('Balance payment ID', booking.paymongo_balance_payment_id);
  } else {
    line('Payment method', `GCash · ${booking.payment_method || '—'}`);
    if (booking.gcash_reference_no) line('GCash reference', booking.gcash_reference_no);
  }
  const paidAt = booking.paid_online_at || booking.updated_at;
  if (paidAt) line('Paid on', dateTime(paidAt));
  if (booking.balance_settled_at) line('Balance paid on', dateTime(booking.balance_settled_at));
  line('Tour total', php(booking.total_price));
  line('Amount paid', php(booking.amount_paid ?? booking.total_price), { bold: true, size: 12 });
  const balance = balanceRemaining(booking);
  line('Balance', balance > 0 ? `${php(balance)} (due on or before the tour date)` : 'Paid in full', { bold: balance === 0 });

  addExpenses(section, line, expenses);

  footer('This receipt acknowledges payment received for the booking above, verified by Bandang IBAYO. '
    + 'All payments are non-refundable per our Terms & Conditions. This is not a BIR-registered official receipt.');

  doc.save(`receipt-${booking.booking_number}.pdf`);
};

// Receipt for an exclusive tour (50% downpayment, then the balance).
export const exclusiveReceiptNumber = (request) => `R-EX-${String(request.id).slice(0, 8).toUpperCase()}`;

export const downloadExclusiveReceipt = async (request) => {
  const { jsPDF } = await import('jspdf');
  const { doc, line, section, footer } = startReceipt(jsPDF);
  const pkg = request.package_details || {};
  const price = Number(pkg.price) || 0;
  const paid = Number(request.amount_paid) || 0;
  const balance = request.balance_settled ? 0 : Math.max(0, price - paid);

  section('Receipt');
  line('Receipt number', exclusiveReceiptNumber(request), { bold: true });
  line('Date & time issued', dateTime(new Date()));
  line('Requested on', request.created_at ? dateTime(request.created_at) : '—');

  section('Received from');
  line('Name', request.full_name);
  line('Email', request.email);
  line('Contact number', request.contact_number);

  section('Exclusive tour');
  if (pkg.title) line('Tour', pkg.title, { bold: true });
  line('Destination', pkg.destination || request.destination, { bold: !pkg.title });
  const start = pkg.start_date || request.preferred_date;
  const end = pkg.end_date || request.preferred_end_date || start;
  line('Date', start ? formatYmdRange(start, end) : '—');
  line('Group size', request.group_size ? `${request.group_size} persons` : '—');
  if (pkg.accommodation) line('Accommodation', pkg.accommodation);

  section('Payment');
  line('Payment method', `${request.paymongo_payment_id ? 'Online via PayMongo' : 'Recorded by Bandang IBAYO'} · 50% downpayment`);
  if (request.paymongo_payment_id) line('Payment ID', request.paymongo_payment_id);
  if (request.balance_paymongo_payment_id) line('Balance payment ID', request.balance_paymongo_payment_id);
  if (request.paid_at) line('Downpayment paid on', dateTime(request.paid_at));
  if (request.balance_paid_at) line('Balance paid on', dateTime(request.balance_paid_at));
  line('Package price', php(price));
  line('Amount paid', php(paid), { bold: true, size: 12 });
  line('Balance', balance > 0 ? `${php(balance)} (due before the trip)` : 'Paid in full', { bold: balance === 0 });

  addExpenses(section, line, pkg.expenses);

  footer('This receipt acknowledges payment received for the exclusive tour above, verified by Bandang IBAYO. '
    + 'All payments are non-refundable per our Terms & Conditions. This is not a BIR-registered official receipt.');

  doc.save(`receipt-exclusive-${String(request.id).slice(0, 8)}.pdf`);
};
