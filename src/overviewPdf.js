// ─────────────────────────────────────────────
// Overview → Download PDF: today's numbers and each module's snapshot on one
// A4 page, in the same look as the Reports PDF. Built in the browser with
// jsPDF (loaded only when downloading).
// ─────────────────────────────────────────────

const DARK = [26, 10, 0];
const ORANGE = [180, 81, 30];
const MUTED = [122, 58, 24];
const PANEL = [242, 228, 208];
const INK = [40, 30, 24];

const peso = (n) => `PHP ${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const downloadOverviewPDF = async ({ stats, snippets }) => {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 44;
  let y = 0;

  // Header band
  doc.setFillColor(...DARK); doc.rect(0, 0, W, 86, 'F');
  doc.setFillColor(...ORANGE); doc.rect(0, 86, W, 4, 'F');
  doc.setTextColor(232, 162, 101); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('BANDANG IBAYO  ·  OPERATIONS OVERVIEW', M, 34);
  doc.setTextColor(253, 246, 238); doc.setFontSize(18);
  doc.text(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), M, 60);
  y = 118;

  // KPI boxes
  const kpis = [
    ['Revenue this month', peso(stats.revenueThisMonth)],
    ['Total bookings', String(stats.totalBookings)],
    ['Bookings this month', String(stats.bookingsThisMonth)],
    ['Total joiners', String(stats.totalJoiners)],
    ['New joiners this week', String(stats.joinersThisWeek)],
    ['Tours next month', String(stats.toursNextMonth)],
  ];
  const bw = (W - M * 2 - 20) / 3;
  kpis.forEach(([label, value], i) => {
    const x = M + (i % 3) * (bw + 10);
    const by = y + Math.floor(i / 3) * 62;
    doc.setFillColor(...PANEL); doc.roundedRect(x, by, bw, 52, 6, 6, 'F');
    doc.setTextColor(...MUTED); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    doc.text(label.toUpperCase(), x + 10, by + 17);
    doc.setTextColor(...DARK); doc.setFontSize(14);
    doc.text(value, x + 10, by + 39);
  });
  y += 140;

  const section = (title, rows) => {
    if (y > 760) { doc.addPage(); y = 50; }
    doc.setTextColor(...ORANGE); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(title.toUpperCase(), M, y);
    doc.setDrawColor(226, 214, 200); doc.line(M, y + 6, W - M, y + 6);
    y += 22;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...INK);
    if (!rows.length) { doc.setTextColor(118, 108, 100); doc.text('Nothing to show.', M, y); y += 22; return; }
    rows.forEach(([left, right]) => {
      if (y > 790) { doc.addPage(); y = 50; }
      doc.setTextColor(...INK);
      doc.text(doc.splitTextToSize(String(left), W - M * 2 - 140)[0], M, y);
      if (right) { doc.setTextColor(...MUTED); doc.text(String(right), W - M, y, { align: 'right' }); }
      y += 16;
    });
    y += 12;
  };

  section('Upcoming tours', (snippets.tours || []).map((t) => [t.title, `${t.booked ?? t.current_booked ?? 0}/${t.group_size} booked · ${t.start_date || ''}`]));
  section('Payments waiting for verification', (snippets.pendingBookings || []).map((b) => [`${b.booking_number || ''} · ${b.full_name || ''}`, peso(b.total_price)]));
  section('Private & requested tours waiting for approval', (snippets.pendingExclusiveRequests || []).map((r) => [`${r.full_name || ''} · ${r.destination || ''}`, r.request_type === 'request' ? 'Request' : 'Private']));
  section('Newest joiners', (snippets.recentJoiners || []).map((p) => [[p.first_name, p.last_name].filter(Boolean).join(' ') || p.username || 'Joiner', new Date(p.created_at).toLocaleDateString('en-PH')]));
  section('Reviews', [[`Average rating: ${snippets.avgRating ? snippets.avgRating.toFixed(1) : '—'} of 5`, `${snippets.reviewCount || 0} reviews`],
    ...(snippets.ratingBreakdown || []).map((r) => [`${r.stars} star${r.stars === 1 ? '' : 's'}`, String(r.count)])]);

  doc.setTextColor(118, 108, 100); doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleString('en-PH')} · Bandang IBAYO admin dashboard`, M, doc.internal.pageSize.getHeight() - 24);
  doc.save(`bandang-ibayo-overview-${new Date().toISOString().slice(0, 10)}.pdf`);
};
