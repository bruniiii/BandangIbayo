// What an admin (other than the main admin) may change. The main admin
// chooses in Admin Settings; the database refuses the rest (admin_can).
//   [key, name, what it covers]
export const PERMISSIONS = [
  ['payments', 'Bookings & payments', 'Approve or reject bookings and payments, change booking statuses'],
  ['refunds', 'Refunds', 'Prepare and record weather refunds'],
  ['tours', 'Tours & tracking', 'Create and edit tours, rates, expenses, drivers and tracking'],
  ['requests', 'Private & requested tours', 'Reply to and price private tours and tour requests'],
  ['joiners', 'Joiner accounts', 'Edit or archive joiner accounts and send them messages'],
  ['feed', 'Feed & reviews', 'Post on the Feed and manage reviews'],
  ['reports', 'Reports', 'See the Reports page (sales and expenses)'],
  ['maintenance', 'System Maintenance', 'Change booking rules, lists, suppliers, website content and other settings'],
];

export const permissionSummary = (perms) => {
  if (!Array.isArray(perms)) return 'Can do everything';
  if (!perms.length) return 'Can only look (no changes)';
  return `Can: ${PERMISSIONS.filter(([k]) => perms.includes(k)).map(([, n]) => n).join(', ')}`;
};
