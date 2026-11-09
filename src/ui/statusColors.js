// ─────────────────────────────────────────────
// One color per request status, used everywhere (joiner and admin), so each
// status is easy to tell apart. Every pair passes WCAG AA contrast (4.5:1).
// ─────────────────────────────────────────────
export const STATUS_COLORS = {
  'For Approval':     { bg: '#FBE7CF', color: '#7A4410', dot: '#D98A2B' }, // amber: waiting
  Approved:           { bg: '#DDF0E4', color: '#1B5E3B', dot: '#2E9B5F' }, // green: yes
  'Tour Confirmed':   { bg: '#DCE8F5', color: '#1E4672', dot: '#3A78B8' }, // blue: package sent
  'Downpayment Paid': { bg: '#E6E0F3', color: '#4A3A7A', dot: '#7A64B8' }, // purple: half paid
  'Fully Paid':       { bg: '#1B5E3B', color: '#FFFFFF', dot: '#1B5E3B' }, // solid green: done
  Unpaid:             { bg: '#ECE6E1', color: '#4F4038', dot: '#8A7B70' }, // gray: lapsed
  Rejected:           { bg: '#F7DCD6', color: '#8C2F1C', dot: '#C0452B' }, // red: no
};

export const statusTone = (status) => STATUS_COLORS[status] || STATUS_COLORS['For Approval'];
