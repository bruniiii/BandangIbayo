// ─────────────────────────────────────────────
// CSV downloads that open in Excel or Google Sheets (with the UTF-8 mark so
// "₱" and "ñ" show correctly). rows: array of objects; columns: [key, header].
// ─────────────────────────────────────────────
const cell = (v) => {
  if (v == null) return '';
  const s = Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const downloadCsv = (filename, columns, rows) => {
  const lines = [columns.map(([, h]) => cell(h)).join(',')];
  rows.forEach((r) => lines.push(columns.map(([k]) => cell(typeof k === 'function' ? k(r) : r[k])).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};
