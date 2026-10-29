// ─────────────────────────────────────────────
// REPORT PDF (admin Reports page: Download PDF)
// One A4 document with everything on the Reports page: a branded cover with
// the headline figures, highlights, payments, Sales Summary, Income per Tour, the monthly comparison and forecast, booking
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

const BRAND = [26, 10, 0];       // espresso (headings, cover)
const ACCENT = [180, 81, 30];    // burnt sienna (markers only)
const MUTED = [122, 58, 24];     // rust (secondary text)
const PANEL = [242, 228, 208];   // parchment
const STRIPE = [253, 249, 244];  // very light cream (zebra rows)
const INK = [40, 30, 24];        // body text
const GREY = [118, 108, 100];    // notes, captions
const RULE = [226, 214, 200];    // hairlines
const AMBER = [232, 162, 101];

// The logo as a data URL for jsPDF (null if it can't be loaded).
const loadLogo = async () => {
  try {
    const { default: url } = await import('./assets/adminLogo.png');
    const blob = await (await fetch(url)).blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export const downloadReportPDF = async (report) => {
  const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), loadLogo()]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = 48;
  const right = pageW - 48;
  const width = right - left;
  const top = 76;
  const bottom = pageH - 56;
  let y = 0;

  const font = (size, style = 'normal', color = INK) => doc.setFont('helvetica', style).setFontSize(size).setTextColor(...color);
  const hair = (x1, y1, x2, y2, color = RULE, w = 0.6) => doc.setDrawColor(...color).setLineWidth(w).line(x1, y1, x2, y2);
  const newPage = () => {
    doc.addPage();
    y = top;
  };
  const ensure = (space) => { if (y + space > bottom) newPage(); };

  // Every page but the cover: a running header; every page: the footer.
  const decorate = () => {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      if (i > 1) {
        if (logo) doc.addImage(logo, 'PNG', left, 26, 18, 18);
        font(8.5, 'bold', BRAND);
        doc.text('Bandang IBAYO', left + (logo ? 24 : 0), 38);
        font(8, 'normal', GREY);
        doc.text(pdfText(`Business Report  |  ${report.rangeLabel}`), right, 38, { align: 'right' });
        hair(left, 52, right, 52);
      }
      hair(left, pageH - 40, right, pageH - 40);
      font(7.5, 'normal', GREY);
      doc.text(pdfText(`Confidential - for Bandang IBAYO admins only. Generated ${report.generatedAt}.`), left, pageH - 26);
      font(7.5, 'bold', BRAND);
      doc.text(`Page ${i} of ${pages}`, right, pageH - 26, { align: 'right' });
    }
  };

  // Section title: a small numbered accent block, the title, an optional note
  // on the right, and a hairline under it. It always starts with room for
  // some content after it, so a title is never left alone at a page bottom.
  let sectionNo = 0;
  // need: how much room the section's first part takes (default: a few lines).
  const heading = (title, note, need = 120) => {
    ensure(need);
    y += 18;
    sectionNo += 1;
    doc.setFillColor(...ACCENT).roundedRect(left, y - 12, 18, 16, 2, 2, 'F');
    font(8.5, 'bold', [253, 246, 238]);
    doc.text(String(sectionNo).padStart(2, '0'), left + 9, y - 1, { align: 'center' });
    font(13, 'bold', BRAND);
    doc.text(pdfText(title), left + 26, y);
    if (note) { font(8, 'normal', GREY); doc.text(pdfText(note), right, y, { align: 'right' }); }
    hair(left, y + 8, right, y + 8);
    y += 26;
  };
  // A small label above a sub-part of a section (a table or a chart).
  const subhead = (text, keepWithNext = 50) => {
    y += 6;
    ensure(24 + keepWithNext);
    font(7.5, 'bold', MUTED);
    doc.text(pdfText(text.toUpperCase()), left, y);
    y += 16;
  };
  // keepWithNext: room for what follows too (a table's title stays with its table).
  const para = (text, size = 9, color = INK, keepWithNext = 0) => {
    font(size, 'normal', color);
    const lines = doc.splitTextToSize(pdfText(text), width);
    ensure(lines.length * (size + 3.5) + 4 + keepWithNext);
    doc.text(lines, left, y);
    y += lines.length * (size + 3.5) + 4;
  };

  // Table: columns = [{ label, width (share of the page), align }]; rows = arrays.
  // A light header, hairlines between rows, faint zebra stripes, and a bold total.
  const table = (columns, rows, { emptyText = 'No data yet', totalRow = null } = {}) => {
    const total = columns.reduce((s, c) => s + c.width, 0);
    const cols = columns.map((c) => ({ ...c, w: (c.width / total) * width }));
    const rowH = 18;
    const drawHeader = () => {
      doc.setFillColor(...PANEL).rect(left, y - 12, width, rowH, 'F');
      hair(left, y - 12, right, y - 12, ACCENT, 1.2);
      font(7, 'bold', BRAND);
      let x = left;
      cols.forEach((c) => {
        const tx = c.align === 'right' ? x + c.w - 7 : x + 7;
        doc.text(pdfText(c.label.toUpperCase()), tx, y, c.align === 'right' ? { align: 'right' } : undefined);
        x += c.w;
      });
      y += rowH;
    };
    const drawRow = (row, i, bold = false) => {
      if (y + rowH > bottom) { newPage(); drawHeader(); }
      if (bold) {
        hair(left, y - 12, right, y - 12, BRAND, 0.9);
      } else if (i % 2 === 1) {
        doc.setFillColor(...STRIPE).rect(left, y - 12, width, rowH, 'F');
      }
      font(8, bold ? 'bold' : 'normal', bold ? BRAND : INK);
      let x = left;
      row.forEach((cell, ci) => {
        const c = cols[ci];
        const fitted = doc.splitTextToSize(pdfText(cell), c.w - 14)[0] || '';
        const tx = c.align === 'right' ? x + c.w - 7 : x + 7;
        doc.text(fitted, tx, y, c.align === 'right' ? { align: 'right' } : undefined);
        x += c.w;
      });
      if (!bold) hair(left, y + 6, right, y + 6, RULE, 0.4);
      y += rowH;
    };
    y += 6;
    ensure(rowH * 3);
    drawHeader();
    if (!rows.length) {
      font(8, 'italic', GREY);
      doc.text(pdfText(emptyText), left + 7, y);
      hair(left, y + 6, right, y + 6, RULE, 0.4);
      y += rowH;
    }
    rows.forEach((row, i) => drawRow(row, i));
    if (totalRow) drawRow(totalRow, 0, true);
    y += 10;
  };

  // A row of figure tiles: white, hairline border, an accent line on top.
  const cards = (items, perRow = 4) => {
    const gap = 10;
    const w = (width - gap * (perRow - 1)) / perRow;
    const h = 56;
    for (let i = 0; i < items.length; i += perRow) {
      ensure(h + 12);
      items.slice(i, i + perRow).forEach(([label, value, sub], j) => {
        const x = left + j * (w + gap);
        doc.setFillColor(255, 255, 255).setDrawColor(...RULE).setLineWidth(0.7).rect(x, y, w, h, 'FD');
        doc.setFillColor(...ACCENT).rect(x, y, w, 2.2, 'F');
        font(6.8, 'bold', GREY);
        // One line only: a long label is shortened so it never runs into the value.
        const lines = doc.splitTextToSize(pdfText(String(label).toUpperCase()), w - 18);
        doc.text(lines.length > 1 ? `${lines[0].replace(/\s*\S*$/, '')}...` : lines[0] || '', x + 9, y + 16);
        font(13, 'bold', BRAND);
        doc.text(doc.splitTextToSize(pdfText(value), w - 18)[0] || '', x + 9, y + 34);
        if (sub) { font(6.8, 'normal', GREY); doc.text(doc.splitTextToSize(pdfText(sub), w - 18)[0] || '', x + 9, y + 46); }
      });
      y += h + 12;
    }
  };

  // A simple horizontal bar list (label, bar, value).
  const bars = (items, { money = false, color = ACCENT } = {}) => {
    const max = Math.max(1, ...items.map(([, v]) => Number(v) || 0));
    const labelW = width * 0.32;
    const barW = width * 0.5;
    items.forEach(([label, value]) => {
      ensure(16);
      font(8.5, 'normal', INK);
      doc.text(doc.splitTextToSize(pdfText(label), labelW - 8)[0] || '', left, y);
      doc.setFillColor(...STRIPE).setDrawColor(...RULE).setLineWidth(0.4).rect(left + labelW, y - 7.5, barW, 9, 'FD');
      if (Number(value) > 0) doc.setFillColor(...color).rect(left + labelW, y - 7.5, (barW * (Number(value) || 0)) / max, 9, 'F');
      font(8.5, 'bold', BRAND);
      doc.text(pdfText(money ? php(value) : String(value)), right, y, { align: 'right' });
      y += 16;
    });
    y += 6;
  };

  // ── Cover: the brand band, then the report details ──
  const fig = Object.fromEntries(report.summary.map(([label, value, isMoney]) => [label, isMoney ? php(value) : String(value)]));
  doc.setFillColor(...BRAND).rect(0, 0, pageW, 168, 'F');
  doc.setFillColor(...ACCENT).rect(0, 168, pageW, 4, 'F');
  if (logo) doc.addImage(logo, 'PNG', left, 40, 46, 46);
  const tx = left + (logo ? 60 : 0);
  font(22, 'bold', [253, 246, 238]);
  doc.text('Bandang IBAYO', tx, 62);
  font(9, 'bold', AMBER);
  doc.setCharSpace(2);
  doc.text('BUSINESS REPORT', tx, 80);
  doc.setCharSpace(0);
  font(8.5, 'normal', [232, 210, 190]);
  doc.text('Your budget travel partner', tx, 96);
  // Headline figures on the right of the band.
  if (fig['Total revenue']) {
    font(7, 'bold', [232, 210, 190]);
    doc.text('TOTAL REVENUE', right, 56, { align: 'right' });
    font(18, 'bold', [253, 246, 238]);
    doc.text(pdfText(fig['Total revenue']), right, 76, { align: 'right' });
    font(8.5, 'normal', AMBER);
    const n = Number(fig['Total bookings']) || 0;
    doc.text(`${n} booking${n === 1 ? '' : 's'}`, right, 92, { align: 'right' });
  }
  // Report details: two columns under the band.
  const meta = [['Reporting period', report.rangeLabel], ['Generated', report.generatedAt]];
  const colW = width / meta.length;
  meta.forEach(([label, value], i) => {
    const x = left + i * colW;
    font(6.8, 'bold', [200, 160, 125]);
    doc.text(label.toUpperCase(), x, 132);
    font(9, 'bold', [253, 246, 238]);
    doc.text(doc.splitTextToSize(pdfText(value), colW - 14)[0] || '', x, 146);
  });
  y = 204;

  // Highlights: a boxed summary at the top of the report.
  if (report.insights.length) {
    heading('Highlights');
    font(9, 'normal', INK);
    const lines = report.insights.map((line) => doc.splitTextToSize(pdfText(line), width - 40));
    const boxH = lines.reduce((h, l) => h + l.length * 12.5 + 5, 0) + 16;
    ensure(boxH + 6);
    doc.setFillColor(...STRIPE).setDrawColor(...RULE).setLineWidth(0.6).rect(left, y - 8, width, boxH, 'FD');
    doc.setFillColor(...ACCENT).rect(left, y - 8, 3, boxH, 'F');
    let ly = y + 8;
    lines.forEach((l) => {
      doc.setFillColor(...ACCENT).circle(left + 18, ly - 3, 1.8, 'F');
      font(9, 'normal', INK);
      doc.text(l, left + 28, ly);
      ly += l.length * 12.5 + 5;
    });
    y += boxH + 8;
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
      subhead(`Unpaid balances (${sales.balances.length})`, 60);
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
    if (report.statusBreakdown?.length) { subhead('Booking status', 40); bars(report.statusBreakdown); }
    if (report.methodSplit?.length) { subhead('Payment method', 40); bars(report.methodSplit); }
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
    if (!rv.count) para('No reviews yet.', 9, GREY);
    else {
      bars(rv.stars.map((s) => [s.label, s.value]), { color: AMBER });
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
      subhead('Top customers', 60);
      table(
        [{ label: 'Joiner', width: 4 }, { label: 'Tours', width: 1.2, align: 'right' }, { label: 'Spent', width: 2.4, align: 'right' }],
        cu.topCustomers.map((c) => [c.name, String(c.tours), php(c.spend)]),
      );
    }
    if (cu.topLocations.length) { subhead('Top locations', 40); bars(cu.topLocations.map((l) => [l.label, l.value])); }
  }

  if (report.seasonal) {
    heading('Seasonal Trends', 'All-time bookings by calendar month', 70 + report.seasonal.data.length * 16);
    para(`Peak season: ${report.seasonal.peak.join(', ') || '-'}.  Low season: ${report.seasonal.low.join(', ') || '-'}.`, 9, GREY, report.seasonal.data.length * 16 + 10);
    y += 4;
    bars(report.seasonal.data.map((d) => [d.label, d.value]), { color: MUTED });
  }

  heading(`All Bookings (${report.bookings.length})`);
  table(
    [{ label: 'Booking No.', width: 1.9 }, { label: 'Date', width: 1.8 }, { label: 'Joiner', width: 2.3 }, { label: 'Tour', width: 2.6 }, { label: 'Pax', width: 0.7, align: 'right' }, { label: 'Total', width: 1.9, align: 'right' }, { label: 'Paid', width: 1.9, align: 'right' }, { label: 'Status', width: 1.7 }],
    report.bookings.map((b) => [b.number, b.date, b.joiner, b.tour, String(b.pax), php(b.total).replace('PHP ', ''), php(b.paid).replace('PHP ', ''), b.status]),
    { emptyText: 'No bookings yet' },
  );

  decorate();
  doc.save(`bandang-ibayo-report-${fileDate()}.pdf`);
};
