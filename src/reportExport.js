// ─────────────────────────────────────────────
// REPORT DOWNLOADS (admin Reports page)
// Both files hold the same report the admin is looking at: the selected
// date range and filters, the summary figures, payments, tour performance,
// insights and the booking list.
//   - CSV: one file with titled sections; amounts are plain numbers with
//     2 decimals so Excel / Google Sheets can add them up.
//   - PDF: an A4 document built in the browser with jsPDF (loaded only when
//     downloading). Amounts use "PHP" because the PDF's built-in fonts have
//     no peso sign.
// ─────────────────────────────────────────────

const fileDate = () => new Date().toISOString().slice(0, 10);
const money = (n) => (Number(n) || 0).toFixed(2);
const php = (n) => `PHP ${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ── CSV ─────────────────────────────────────────
const csvCell = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
const csvRow = (cells) => cells.map(csvCell).join(',');

export const downloadReportCSV = (report) => {
  const lines = [
    csvRow(['Bandang IBAYO — Business Report']),
    csvRow(['Period', report.rangeLabel]),
    csvRow(['Filters', report.filtersLabel]),
    csvRow(['Generated', report.generatedAt]),
    '',
    csvRow(['SUMMARY']),
    csvRow(['Metric', 'Value']),
    ...report.summary.map(([label, value, isMoney]) => csvRow([label, isMoney ? money(value) : value])),
    '',
    csvRow(['PAYMENTS']),
    csvRow(['Item', 'Amount (PHP)']),
    ...report.payments.map(([label, value]) => csvRow([label, money(value)])),
    '',
    csvRow(['TOUR PERFORMANCE']),
    csvRow(['Tour', 'Bookings', 'Joiners', 'Revenue (PHP)', 'Confirmed %', 'Average Rating']),
    ...report.tours.map((t) => csvRow([t.title, t.bookingsCount, t.pax, money(t.revenue), `${t.completionPct}%`, t.rating ? t.rating.toFixed(1) : '—'])),
    '',
  ];
  if (report.insights.length) {
    lines.push(csvRow(['INSIGHTS']), ...report.insights.map((line) => csvRow([line])), '');
  }
  lines.push(
    csvRow(['BOOKINGS']),
    csvRow(['Booking No.', 'Booked On', 'Joiner', 'Tour', 'Destination', 'Pax', 'Total (PHP)', 'Paid (PHP)', 'Payment', 'Status']),
    ...report.bookings.map((b) => csvRow([b.number, b.date, b.joiner, b.tour, b.destination, b.pax, money(b.total), money(b.paid), b.method, b.status])),
  );
  // The BOM makes Excel read the file as UTF-8 (names with ñ, the em dash).
  saveBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }), `bandang-ibayo-report-${fileDate()}.csv`);
};

// ── PDF ─────────────────────────────────────────
// The built-in PDF fonts only cover basic Latin characters.
const pdfText = (s) => String(s ?? '').replace(/[ñÑ]/g, (c) => (c === 'ñ' ? 'n' : 'N')).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—·]/g, '-').replace(/₱/g, 'PHP ').replace(/[^\x20-\x7E]/g, '');

export const downloadReportPDF = async (report) => {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = 40;
  const right = pageW - 40;
  let y = 52;

  const footer = () => {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(94, 106, 90);
      doc.text(pdfText(`Bandang IBAYO · Business Report · ${report.rangeLabel}`), left, pageH - 24);
      doc.text(`Page ${i} of ${pages}`, right, pageH - 24, { align: 'right' });
    }
  };
  const ensure = (space) => {
    if (y + space > pageH - 48) { doc.addPage(); y = 52; }
  };
  const heading = (title) => {
    ensure(40);
    y += 8;
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(181, 81, 27);
    doc.text(title.toUpperCase(), left, y);
    y += 6;
    doc.setDrawColor(226, 229, 221).line(left, y, right, y);
    y += 16;
  };

  // Simple table: columns = [{ label, width, align }]; rows = arrays of strings.
  const table = (columns, rows) => {
    const rowH = 16;
    const drawHeader = () => {
      doc.setFillColor(241, 242, 238).rect(left, y - 11, right - left, rowH, 'F');
      doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(94, 106, 90);
      let x = left + 4;
      columns.forEach((c) => {
        doc.text(c.label, c.align === 'right' ? x + c.width - 8 : x, y, c.align === 'right' ? { align: 'right' } : undefined);
        x += c.width;
      });
      y += rowH;
    };
    ensure(rowH * 3);
    drawHeader();
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(14, 15, 11);
    rows.forEach((row, ri) => {
      if (y + rowH > pageH - 48) {
        doc.addPage(); y = 52; drawHeader();
        doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(14, 15, 11);
      }
      if (ri % 2 === 1) doc.setFillColor(246, 247, 243).rect(left, y - 11, right - left, rowH, 'F');
      let x = left + 4;
      row.forEach((cell, ci) => {
        const c = columns[ci];
        const fitted = doc.splitTextToSize(pdfText(cell), c.width - 8)[0] || '';
        doc.text(fitted, c.align === 'right' ? x + c.width - 8 : x, y, c.align === 'right' ? { align: 'right' } : undefined);
        x += c.width;
      });
      y += rowH;
    });
    y += 6;
  };

  // Title block
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(14, 15, 11);
  doc.text('Bandang IBAYO', left, y);
  doc.setFontSize(11).setTextColor(181, 81, 27);
  doc.text('BUSINESS REPORT', right, y, { align: 'right' });
  y += 18;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(94, 106, 90);
  doc.text(pdfText(`Period: ${report.rangeLabel}`), left, y); y += 13;
  doc.text(doc.splitTextToSize(pdfText(`Filters: ${report.filtersLabel}`), right - left), left, y); y += 13;
  doc.text(pdfText(`Generated: ${report.generatedAt}`), left, y); y += 10;

  heading('Summary');
  const half = (right - left) / 2;
  table(
    [{ label: 'Metric', width: half }, { label: 'Value', width: half, align: 'right' }],
    report.summary.map(([label, value, isMoney]) => [label, isMoney ? php(value) : String(value)]),
  );

  heading('Payments');
  table(
    [{ label: 'Item', width: half }, { label: 'Amount', width: half, align: 'right' }],
    report.payments.map(([label, value]) => [label, php(value)]),
  );

  heading('Tour performance');
  table(
    [
      { label: 'Tour', width: 215 },
      { label: 'Bookings', width: 55, align: 'right' },
      { label: 'Joiners', width: 50, align: 'right' },
      { label: 'Revenue', width: 95, align: 'right' },
      { label: 'Confirmed', width: 55, align: 'right' },
      { label: 'Rating', width: right - left - 470, align: 'right' },
    ],
    report.tours.length
      ? report.tours.map((t) => [t.title, String(t.bookingsCount), String(t.pax), php(t.revenue), `${t.completionPct}%`, t.rating ? t.rating.toFixed(1) : '-'])
      : [['No bookings in this period', '', '', '', '', '']],
  );

  if (report.insights.length) {
    heading('Insights');
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(14, 15, 11);
    report.insights.forEach((line) => {
      const wrapped = doc.splitTextToSize(pdfText(`- ${line}`), right - left);
      ensure(12 * wrapped.length + 4);
      doc.text(wrapped, left, y);
      y += 12 * wrapped.length + 2;
    });
    y += 6;
  }

  heading(`Bookings (${report.bookings.length})`);
  table(
    [
      { label: 'Booking No.', width: 78 },
      { label: 'Date', width: 58 },
      { label: 'Joiner', width: 100 },
      { label: 'Tour', width: 120 },
      { label: 'Pax', width: 28, align: 'right' },
      { label: 'Total (PHP)', width: 70, align: 'right' },
      { label: 'Status', width: right - left - 454 },
    ],
    report.bookings.length
      ? report.bookings.map((b) => [b.number, b.date, b.joiner, b.tour, String(b.pax), php(b.total).replace('PHP ', ''), b.status])
      : [['No bookings in this period', '', '', '', '', '', '']],
  );

  footer();
  doc.save(`bandang-ibayo-report-${fileDate()}.pdf`);
};
