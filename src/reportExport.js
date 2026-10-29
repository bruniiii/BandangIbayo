// ─────────────────────────────────────────────
// REPORT PDF (admin Reports page: Download PDF)
// One A4 document with everything on the Reports page: key figures, insights,
// Sales Summary, Income per Tour, the monthly comparison and forecast, booking
// status and payment splits, tour performance, joiner reviews, cancellations,
// customers, seasonal trends and the full booking list.
// Built in the browser with jsPDF (loaded only when downloading). Amounts use
// "PHP" because the PDF's built-in fonts have no peso sign.
// ─────────────────────────────────────────────

const fileDate = () => new Date().toISOString().slice(0, 10);
const php = (n) => `PHP ${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (n) => `${n > 0 ? '+' : ''}${n}%`;

// The built-in PDF fonts only cover basic Latin characters.
const pdfText = (s) => String(s ?? '').replace(/[ñÑ]/g, (c) => (c === 'ñ' ? 'n' : 'N')).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—·]/g, '-').replace(/₱/g, 'PHP ').replace(/[^\x20-\x7E]/g, '');

const BRAND = [26, 10, 0];       // espresso
const ACCENT = [180, 81, 30];    // burnt sienna
const MUTED = [122, 58, 24];     // rust
const PANEL = [242, 228, 208];   // parchment
const STRIPE = [253, 246, 238];  // cream

export const downloadReportPDF = async (report) => {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = 40;
  const right = pageW - 40;
  const width = right - left;
  const top = 64;
  const bottom = pageH - 50;
  let y = 0;

  const font = (size, style = 'normal', color = BRAND) => doc.setFont('helvetica', style).setFontSize(size).setTextColor(...color);
  const newPage = () => {
    doc.addPage();
    y = top;
  };
  const ensure = (space) => { if (y + space > bottom) newPage(); };

  // Every page but the cover: a thin header; every page: the footer.
  const decorate = () => {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      if (i > 1) {
        font(8, 'bold', ACCENT);
        doc.text('BANDANG IBAYO', left, 34);
        font(8, 'normal', MUTED);
        doc.text('Business Report', right, 34, { align: 'right' });
        doc.setDrawColor(...PANEL).setLineWidth(0.8).line(left, 42, right, 42);
      }
      doc.setDrawColor(...PANEL).setLineWidth(0.8).line(left, pageH - 36, right, pageH - 36);
      font(7.5, 'normal', MUTED);
      doc.text(pdfText(`Generated ${report.generatedAt} - Confidential, for Bandang IBAYO admins`), left, pageH - 24);
      doc.text(`Page ${i} of ${pages}`, right, pageH - 24, { align: 'right' });
    }
  };

  // Section title with a numbered accent bar.
  let sectionNo = 0;
  const heading = (title, note) => {
    ensure(60);
    y += 14;
    sectionNo += 1;
    doc.setFillColor(...ACCENT).rect(left, y - 11, 4, 16, 'F');
    font(12, 'bold');
    doc.text(pdfText(`${sectionNo}. ${title}`), left + 12, y + 1);
    if (note) { font(8, 'normal', MUTED); doc.text(pdfText(note), right, y + 1, { align: 'right' }); }
    y += 18;
  };
  // keepWithNext: room for what follows too (a table's title stays with its table).
  const para = (text, size = 9, color = BRAND, keepWithNext = 0) => {
    font(size, 'normal', color);
    const lines = doc.splitTextToSize(pdfText(text), width);
    ensure(lines.length * (size + 3) + 4 + keepWithNext);
    doc.text(lines, left, y);
    y += lines.length * (size + 3) + 4;
  };

  // Table: columns = [{ label, width (share of the page), align }]; rows = arrays.
  const table = (columns, rows, { emptyText = 'No data yet', totalRow = null } = {}) => {
    const total = columns.reduce((s, c) => s + c.width, 0);
    const cols = columns.map((c) => ({ ...c, w: (c.width / total) * width }));
    const rowH = 17;
    const drawHeader = () => {
      doc.setFillColor(...BRAND).rect(left, y - 12, width, rowH, 'F');
      font(7.5, 'bold', [253, 246, 238]);
      let x = left;
      cols.forEach((c) => {
        const tx = c.align === 'right' ? x + c.w - 6 : x + 6;
        doc.text(pdfText(c.label.toUpperCase()), tx, y, c.align === 'right' ? { align: 'right' } : undefined);
        x += c.w;
      });
      y += rowH;
    };
    const drawRow = (row, i, bold = false) => {
      if (y + rowH > bottom) { newPage(); drawHeader(); }
      if (bold) doc.setFillColor(...PANEL).rect(left, y - 12, width, rowH, 'F');
      else if (i % 2 === 1) doc.setFillColor(...STRIPE).rect(left, y - 12, width, rowH, 'F');
      font(8, bold ? 'bold' : 'normal');
      let x = left;
      row.forEach((cell, ci) => {
        const c = cols[ci];
        const fitted = doc.splitTextToSize(pdfText(cell), c.w - 12)[0] || '';
        const tx = c.align === 'right' ? x + c.w - 6 : x + 6;
        doc.text(fitted, tx, y, c.align === 'right' ? { align: 'right' } : undefined);
        x += c.w;
      });
      y += rowH;
    };
    y += 6;
    ensure(rowH * 3);
    drawHeader();
    if (!rows.length) drawRow([emptyText, ...cols.slice(1).map(() => '')], 0);
    rows.forEach((row, i) => drawRow(row, i));
    if (totalRow) drawRow(totalRow, 0, true);
    doc.setDrawColor(...PANEL).setLineWidth(0.6).line(left, y - 12, right, y - 12);
    y += 8;
  };

  // A row of figure cards.
  const cards = (items, perRow = 4) => {
    const gap = 10;
    const w = (width - gap * (perRow - 1)) / perRow;
    const h = 52;
    for (let i = 0; i < items.length; i += perRow) {
      ensure(h + 10);
      items.slice(i, i + perRow).forEach(([label, value, sub], j) => {
        const x = left + j * (w + gap);
        doc.setFillColor(...STRIPE).setDrawColor(...PANEL).setLineWidth(0.8).roundedRect(x, y, w, h, 6, 6, 'FD');
        doc.setFillColor(...ACCENT).rect(x, y + 8, 2.5, h - 16, 'F');
        font(7, 'bold', MUTED);
        // One line only: a long label is shortened so it never runs into the value.
        const lines = doc.splitTextToSize(pdfText(String(label).toUpperCase()), w - 16);
        doc.text(lines.length > 1 ? `${lines[0].replace(/\s*\S*$/, '')}...` : lines[0] || '', x + 10, y + 15);
        font(12.5, 'bold');
        doc.text(doc.splitTextToSize(pdfText(value), w - 16)[0] || '', x + 10, y + 32);
        if (sub) { font(7, 'normal', MUTED); doc.text(doc.splitTextToSize(pdfText(sub), w - 16)[0] || '', x + 10, y + 44); }
      });
      y += h + 10;
    }
  };

  // A simple horizontal bar list (label, value, bar).
  const bars = (items, { money = false, color = ACCENT } = {}) => {
    const max = Math.max(1, ...items.map(([, v]) => Number(v) || 0));
    const labelW = width * 0.38;
    const barW = width * 0.44;
    items.forEach(([label, value]) => {
      ensure(16);
      font(8.5);
      doc.text(doc.splitTextToSize(pdfText(label), labelW - 8)[0] || '', left, y);
      doc.setFillColor(...PANEL).rect(left + labelW, y - 7, barW, 8, 'F');
      doc.setFillColor(...color).rect(left + labelW, y - 7, Math.max(1, (barW * (Number(value) || 0)) / max), 8, 'F');
      font(8.5, 'bold');
      doc.text(pdfText(money ? php(value) : String(value)), right, y, { align: 'right' });
      y += 15;
    });
    y += 4;
  };

  // ── Cover ──
  doc.setFillColor(...BRAND).rect(0, 0, pageW, 150, 'F');
  doc.setFillColor(...ACCENT).rect(0, 150, pageW, 5, 'F');
  font(26, 'bold', [253, 246, 238]);
  doc.text('Bandang IBAYO', left, 66);
  font(11, 'bold', [232, 162, 101]);
  doc.text('BUSINESS REPORT', left, 88);
  font(9, 'normal', [232, 210, 190]);
  doc.text(pdfText(`Period: ${report.rangeLabel}`), left, 110);
  doc.text(pdfText(`Generated: ${report.generatedAt}`), left, 124);
  doc.text(pdfText(`Filters: ${report.filtersLabel}`), right, 110, { align: 'right' });
  y = 186;

  const fig = Object.fromEntries(report.summary.map(([label, value, isMoney]) => [label, isMoney ? php(value) : String(value)]));
  heading('Key Figures');
  cards(report.summary.map(([label, value, isMoney]) => [label, isMoney ? php(value) : String(value)]));

  if (report.insights.length) {
    heading('Highlights');
    report.insights.forEach((line) => para(`-  ${line}`));
  }

  if (report.alerts?.length) {
    heading('Needs Attention');
    report.alerts.forEach((line) => para(`-  ${line}`));
  }

  heading('Payments');
  table(
    [{ label: 'Item', width: 3 }, { label: 'Amount', width: 2, align: 'right' }],
    report.payments.map(([label, value]) => [label, php(value)]),
  );

  // ── Sales Summary (from the Sales Summary card) ──
  const sales = report.sales;
  if (sales) {
    heading('Sales Summary', sales.monthLabel);
    cards([
      [`Collected (${sales.monthLabel})`, php(sales.collected), sales.exclusiveCollected ? `${php(sales.toursCollected)} tours, ${php(sales.exclusiveCollected)} exclusive` : 'From tour bookings'],
      ['Paid bookings', String(sales.bookings), `${sales.pax} joiner${sales.pax === 1 ? '' : 's'}`],
      ['At Regular Rate', php(sales.regularTotal), 'Regular Rate x joiners'],
      ['Unpaid balances', php(sales.balanceTotal), `${sales.balances.length} booking${sales.balances.length === 1 ? '' : 's'}, all months`],
    ]);
    table(
      [{ label: 'Tour', width: 4 }, { label: 'Tour date', width: 2 }, { label: 'Bookings', width: 1.3, align: 'right' }, { label: 'Joiners', width: 1.3, align: 'right' }, { label: 'Collected', width: 2.2, align: 'right' }, { label: 'Balance due', width: 2.2, align: 'right' }],
      sales.perTour.map((t) => [t.title, t.start || '-', String(t.bookings), String(t.pax), php(t.collected), php(t.balance)]),
      { emptyText: `No paid bookings in ${sales.monthLabel}` },
    );
    if (sales.balances.length) {
      para(`Unpaid balances (${sales.balances.length})`, 9, MUTED, 60);
      table(
        [{ label: 'Name', width: 3 }, { label: 'Reference', width: 2.4 }, { label: 'Tour', width: 3 }, { label: 'Tour date', width: 1.8 }, { label: 'Balance', width: 2, align: 'right' }],
        sales.balances.map((r) => [r.name, r.ref, r.what, r.date || '-', php(r.amount)]),
      );
    }
  }

  // ── Income per Tour (from the Income per Tour card) ──
  const income = report.income;
  if (income) {
    heading('Income per Tour', income.monthLabel);
    table(
      [{ label: 'Tour', width: 4 }, { label: 'Joiners', width: 1.2, align: 'right' }, { label: 'Joiner fees', width: 2.2, align: 'right' }, { label: 'Expenses', width: 2.2, align: 'right' }, { label: 'Income', width: 2.2, align: 'right' }],
      income.rows.map((r) => [r.tour.title, String(r.pax), php(r.fees), php(r.expTotal), php(r.income)]),
      {
        emptyText: `No tours with paid joiners in ${income.monthLabel}`,
        totalRow: income.rows.length ? ['Total', '', php(income.totals.fees), php(income.totals.exp), php(income.totals.income)] : null,
      },
    );
  }

  // ── This month vs last month, and the forecast ──
  if (report.comparison) {
    const c = report.comparison;
    heading('Monthly Comparison', `${c.lastLabel} vs ${c.thisLabel}`);
    table(
      [{ label: 'Measure', width: 3 }, { label: c.lastLabel, width: 2, align: 'right' }, { label: `${c.thisLabel} (so far)`, width: 2, align: 'right' }, { label: 'Change', width: 1.5, align: 'right' }],
      c.rows.map((r) => [r.label, r.isMoney ? php(r.last) : String(r.last), r.isMoney ? php(r.now) : String(r.now), signed(r.change)]),
    );
  }
  if (report.forecast) {
    const f = report.forecast;
    heading('Forecast', `Next month (${f.nextLabel})`);
    cards([
      ['Expected bookings', String(f.expectedBookings), 'Weighted average of the last 3 months'],
      ['Expected revenue', php(f.expectedRevenue), 'Average of the last 3 months'],
    ], 2);
    table(
      [{ label: 'Month', width: 2 }, { label: 'Bookings', width: 2, align: 'right' }, { label: 'Revenue', width: 3, align: 'right' }],
      f.history.map((h) => [h.label, String(h.bookings), php(h.revenue)]),
    );
  }

  if (report.statusBreakdown?.length || report.methodSplit?.length) {
    heading('Bookings at a Glance');
    if (report.statusBreakdown?.length) { para('Booking status', 9, MUTED, 40); bars(report.statusBreakdown); }
    if (report.methodSplit?.length) { para('Payment method', 9, MUTED, 40); bars(report.methodSplit); }
  }

  heading('Tour Performance');
  table(
    [{ label: 'Tour', width: 4.2 }, { label: 'Bookings', width: 1.3, align: 'right' }, { label: 'Joiners', width: 1.2, align: 'right' }, { label: 'Revenue', width: 2.4, align: 'right' }, { label: 'Confirmed', width: 1.4, align: 'right' }, { label: 'Rating', width: 1.1, align: 'right' }],
    report.tours.map((t) => [t.title, String(t.bookingsCount), String(t.pax), php(t.revenue), `${t.completionPct}%`, t.rating ? t.rating.toFixed(1) : '-']),
    { emptyText: 'No bookings yet' },
  );

  // ── Joiner reviews ──
  const rv = report.reviews;
  if (rv) {
    heading('Joiner Reviews', rv.count ? `${rv.average.toFixed(1)} average from ${rv.count} review${rv.count === 1 ? '' : 's'}` : '');
    if (!rv.count) para('No reviews yet.', 9, MUTED);
    else {
      bars(rv.stars.map((s) => [s.label, s.value]), { color: [232, 162, 101] });
      table(
        [{ label: 'Joiner', width: 2.2 }, { label: 'Tour', width: 2.6 }, { label: 'Stars', width: 0.9, align: 'right' }, { label: 'Review', width: 5.2 }, { label: 'Date', width: 1.7 }],
        rv.latest.map((r) => [r.name, r.tour, String(r.rating), r.comment || '-', r.date]),
      );
    }
  }

  if (report.cancellations?.total) {
    heading('Cancellations', `${report.cancellations.total} cancelled`);
    bars(report.cancellations.breakdown.map((r) => [r.label, r.value]), { color: [140, 47, 28] });
  }

  if (report.customers) {
    const cu = report.customers;
    heading('Customers');
    cards([
      ['New joiners', String(cu.newCount), 'Booked once'],
      ['Returning joiners', String(cu.returningCount), 'Booked more than once'],
    ], 2);
    if (cu.topCustomers.length) {
      para('Top customers', 9, MUTED, 60);
      table(
        [{ label: 'Joiner', width: 4 }, { label: 'Tours', width: 1.2, align: 'right' }, { label: 'Spent', width: 2.4, align: 'right' }],
        cu.topCustomers.map((c) => [c.name, String(c.tours), php(c.spend)]),
      );
    }
    if (cu.topLocations.length) { para('Top locations', 9, MUTED, 40); bars(cu.topLocations.map((l) => [l.label, l.value])); }
  }

  if (report.seasonal) {
    heading('Seasonal Trends', 'All-time bookings by calendar month');
    bars(report.seasonal.data.map((d) => [d.label, d.value]), { color: MUTED });
    para(`Peak season: ${report.seasonal.peak.join(', ') || '-'}.  Low season: ${report.seasonal.low.join(', ') || '-'}.`, 9, MUTED);
  }

  heading(`All Bookings (${report.bookings.length})`);
  table(
    [{ label: 'Booking No.', width: 1.9 }, { label: 'Date', width: 1.8 }, { label: 'Joiner', width: 2.3 }, { label: 'Tour', width: 2.6 }, { label: 'Pax', width: 0.7, align: 'right' }, { label: 'Total', width: 1.9, align: 'right' }, { label: 'Paid', width: 1.9, align: 'right' }, { label: 'Status', width: 1.7 }],
    report.bookings.map((b) => [b.number, b.date, b.joiner, b.tour, String(b.pax), php(b.total).replace('PHP ', ''), php(b.paid).replace('PHP ', ''), b.status]),
    { emptyText: 'No bookings yet' },
  );

  // The headline numbers on the cover.
  if (fig['Total revenue']) {
    doc.setPage(1);
    font(8, 'bold', [232, 162, 101]);
    doc.text(pdfText(`Total revenue ${fig['Total revenue']}  |  ${fig['Total bookings'] || 0} bookings`), right, 124, { align: 'right' });
  }

  decorate();
  doc.save(`bandang-ibayo-report-${fileDate()}.pdf`);
};
