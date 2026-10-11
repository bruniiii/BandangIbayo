import { formatDateRange } from './tourUtils';

// ─────────────────────────────────────────────
// PAYMENT RECEIPT (PDF) for a confirmed booking.
// Generated in the browser; jsPDF is loaded only when a joiner downloads one.
// Amounts use "PHP" because the PDF's built-in fonts have no peso sign.
// This acknowledges a GCash payment; it is not a BIR-registered official receipt.
// ─────────────────────────────────────────────

const php = (n) => `PHP ${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const receiptNumber = (booking) => `R-${booking.booking_number}`;

export const balanceRemaining = (booking) =>
  booking.payment_method === 'Downpayment' && !booking.balance_settled
    ? Math.max(0, (booking.total_price || 0) - (booking.amount_paid || 0))
    : 0;

export const downloadReceipt = async (booking, tour) => {
  const { jsPDF } = await import('jspdf');
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

  // Header
  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(26, 10, 0);
  doc.text('Bandang IBAYO', left, y);
  doc.setFontSize(12).setTextColor(196, 92, 38);
  doc.text('PAYMENT RECEIPT', right, y, { align: 'right' });
  y += 18;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(122, 58, 24);
  doc.text('Joiner tours across the Philippines · bandangibayo@gmail.com', left, y);
  y += 14;

  section('Receipt');
  line('Receipt number', receiptNumber(booking), { bold: true });
  line('Date issued', new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }));
  line('Booking number', booking.booking_number);
  line('Booked on', booking.created_at ? new Date(booking.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '—');

  section('Received from');
  line('Name', booking.full_name);
  line('Email', booking.email);
  line('Contact number', booking.contact_number);

  section('Tour');
  line('Tour', tour.title, { bold: true });
  line('Destination', tour.destination);
  line('Date', formatDateRange(tour.start_date, tour.duration));
  line('Joiners', `${booking.slots_booked} ${booking.slots_booked === 1 ? 'person' : 'persons'}`);
  if (booking.companions?.length) {
    line('Joining with', booking.companions.map((c) => c.full_name).join(', '));
  }

  section('Payment');
  line('Payment method', `GCash · ${booking.payment_method || '—'}`);
  if (booking.gcash_reference_no) line('GCash reference', booking.gcash_reference_no);
  line('Tour total', php(booking.total_price));
  line('Amount paid', php(booking.amount_paid ?? booking.total_price), { bold: true, size: 12 });
  const balance = balanceRemaining(booking);
  line('Balance', balance > 0 ? `${php(balance)} (due on or before the tour date)` : 'Paid in full', { bold: balance === 0 });

  y += 24;
  doc.setFont('helvetica', 'italic').setFontSize(8).setTextColor(122, 58, 24);
  doc.text(doc.splitTextToSize(
    'This receipt acknowledges payment received via GCash for the booking above, verified by Bandang IBAYO. '
    + 'All payments are non-refundable per our Terms & Conditions. This is not a BIR-registered official receipt.',
    right - left,
  ), left, y);

  doc.save(`receipt-${booking.booking_number}.pdf`);
};
