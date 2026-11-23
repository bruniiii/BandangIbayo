import { Activity, Database, History, Power, Scale, Truck, Bus, MapPin, FileText, Mail, ShieldBan, Building2, Map as MapIcon, ListChecks, LayoutTemplate, Timer, Wrench, ShieldCheck, CreditCard } from 'lucide-react';
import { FIELDS } from './ruleFields';

// ─────────────────────────────────────────────
// System Maintenance's sections, in 4 groups, and what its search box finds.
//   [key, name, icon, what's in it (for search)]
// ─────────────────────────────────────────────

export const GROUPS = [
  ['Bookings', [
    ['rules', 'Booking Rules', Scale, 'cancellation cutoff downpayment payment hold refund sale discount reminder private tour request rates slots seats vans'],
    ['payments', 'Payments', CreditCard, 'payment methods gcash maya card grabpay paymongo pause online payments'],
  ]],
  ['Trips', [
    ['suppliers', 'Suppliers', Truck, 'van rental tour guide food hotel resort entrance fee bag tag supplier contact rating cost'],
    ['fleet', 'Drivers & Vehicles', Bus, 'driver van vehicle plate number license id photo seats car color'],
    ['destinations', 'Destinations', MapIcon, 'destination place province region mountain beach island'],
    ['pickup', 'Pickup Points', MapPin, 'pickup meetup point map location route terminal'],
  ]],
  ['Website & messages', [
    ['site', 'Home Page & Banner', LayoutTemplate, 'announcement banner landing page home page headline hero photo no-tour dates blackout holiday link preview share facebook messenger'],
    ['policies', 'Terms & Policies', FileText, 'terms and conditions privacy policy refund policy waiver version'],
    ['lists', 'Lists & FAQ', ListChecks, 'cancellation reasons weather reasons rejection reasons accommodation difficulty help faq questions'],
    ['templates', 'Notification Templates', Mail, 'email template subject message booking confirmed payment reminder'],
    ['chat', 'Chat Filter', ShieldBan, 'bad words blocked words profanity group chat feed'],
    ['agency', 'Contact Details', Building2, 'agency name logo email phone address facebook instagram tiktok social links gcash contact'],
  ]],
  ['System', [
    ['overview', 'Status Overview', Activity, 'system status health errors last backup outdated'],
    ['settings', 'Maintenance Mode & Emails', Power, 'maintenance mode we\'ll be back soon plan schedule planned email switches turn off emails'],
    ['health', 'Jobs & Emails', Timer, 'scheduled jobs cron email failures sent emails'],
    ['data', 'Cleanups', Wrench, 'cleanup outdated archive old tours expired holds'],
    ['security', 'Security', ShieldCheck, 'security admins passwords sign in'],
    ['audit', 'Audit Trail', History, 'activity log history who changed audit'],
    ['backup', 'Backup & Export', Database, 'backup export csv download data checks restore anonymize'],
  ]],
];

export const SECTIONS = GROUPS.flatMap(([group, list]) => list.map(([key, label, icon, words]) => ({ key, label, icon, words, group })));
export const SECTION = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));

// Older section names (saved in a browser, or used by links) → today's.
export const OLD_SECTIONS = { status: 'overview', activity: 'audit', database: 'backup' };

// What the search box finds: every section, and every booking rule.
export const SEARCH = [
  ...SECTIONS.map((s) => ({ id: s.key, tab: s.key, label: s.label, where: s.group, words: `${s.label} ${s.words}`.toLowerCase() })),
  ...FIELDS.map((f) => ({ id: `rule-${f.key}`, tab: 'rules', rule: f.label, label: f.label, where: `Booking Rules · ${f.group}`, words: `${f.label} ${f.help} ${f.group} ${f.unit}`.toLowerCase() })),
];

export const searchSections = (text) => {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return SEARCH
    .map((e) => {
      if (!words.every((w) => e.words.includes(w))) return null;
      // Names that match come first.
      const score = words.reduce((n, w) => n + (e.label.toLowerCase().includes(w) ? 2 : 1), 0) + (e.rule ? 0 : 0.5);
      return { ...e, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
};

// What each section changes (for "Last changed by …"): tables, and app_settings keys.
export const CHANGES = {
  rules: { tables: ['booking_rules'] },
  payments: { keys: ['payment_settings'] },
  suppliers: { tables: ['suppliers'] },
  fleet: { tables: ['fleet_drivers', 'fleet_vans'] },
  destinations: { tables: ['destinations'] },
  pickup: { tables: ['pickup_spots'] },
  site: { tables: ['blackout_dates'], keys: ['announcement', 'landing_content', 'share_preview'] },
  policies: { tables: ['site_policies'] },
  lists: { tables: ['option_lists', 'help_faqs'] },
  templates: { tables: ['notification_templates'] },
  chat: { tables: ['chat_filter_words'] },
  agency: { keys: ['agency_info'] },
  settings: { keys: ['maintenance_mode', 'email_settings'] },
};
