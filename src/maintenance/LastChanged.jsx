import { useEffect, useState } from 'react';
import { History, ChevronDown, Undo2, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from '../ui/toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import { useAdminMe } from '../adminMe';
import { CHANGES } from './sections';
import { when, spin, TABLE_NAMES } from './shared';

// "Last changed by Ana Cruz · Nov 19, 2026, 3:40 PM" under a System
// Maintenance section, from the Audit Trail (admin_activity), and "Recent
// changes": the last ones for this section, each with Undo (main admin). The
// database puts the old values back only if nothing changed it since.

// Changes the database can't undo here (Maintenance Mode is switched in its
// card; policies keep their own versions).
const NO_UNDO_KEYS = ['maintenance_mode'];
const NO_UNDO_TABLES = ['site_policies'];

const short = (v) => {
  if (v === null || v === undefined || v === '') return 'empty';
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (typeof v === 'object') return 'changed';
  const t = String(v);
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
};
const field = (k) => k.replace(/_/g, ' ');

const LastChanged = ({ section, onOpenAudit, onUndone = () => {} }) => {
  const what = CHANGES[section];
  const me = useAdminMe();
  const [list, setList] = useState(undefined); // undefined = loading
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = () => {
    const parts = [];
    if (what.tables?.length) parts.push(`table_name.in.(${what.tables.join(',')})`);
    if (what.keys?.length) parts.push(`and(table_name.eq.app_settings,row_id.in.(${what.keys.join(',')}))`);
    return supabase.from('admin_activity').select('id, admin_name, at, summary, action, changed, table_name, row_id, old_values, new_values')
      .or(parts.join(',')).order('at', { ascending: false }).limit(8)
      .then(({ data, error }) => setList(error ? [] : data || []));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loads when the section opens
  useEffect(() => { if (what) load(); }, [section]);

  if (!what || list === undefined) return null;
  const last = list[0];

  const canUndo = (a) => me.isMain && !NO_UNDO_TABLES.includes(a.table_name) && !(a.table_name === 'app_settings' && NO_UNDO_KEYS.includes(a.row_id))
    && ((a.action === 'changed' && a.old_values) || (a.action === 'added' && !['app_settings', 'booking_rules', 'notification_templates'].includes(a.table_name)));

  const undo = async (a) => {
    if (!(await confirmDialog({
      title: 'Undo this change?', confirmLabel: 'Undo', cancelLabel: 'Keep It',
      message: a.action === 'added' ? `${a.summary || 'It'} will be archived (you can restore it any time).` : `${a.summary || 'It'} goes back to how it was before ${when(a.at)}.`,
    }))) return;
    setBusy(a.id);
    const { data, error } = await supabase.rpc('undo_admin_change', { p_id: a.id });
    setBusy(null);
    if (error) { toast.error("Couldn't undo it", error.message); return; }
    toast.success(data === 'archived' ? 'Archived' : 'Change undone', a.summary || '');
    load();
    onUndone();
  };

  const linkBtn = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 3 };
  return (
    <div style={{ margin: '-6px 0 0' }}>
      <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, fontWeight: 700, color: 'var(--ib-rust, #7A3A18)' }}>
        <History size={13} />
        {last
          ? <>Last changed by <strong style={{ color: 'var(--ib-dark, #1A0A00)' }}>{last.admin_name || 'an admin'}</strong> · {when(last.at)}</>
          : 'No changes recorded yet.'}
        {list.length > 0 && (
          <button type="button" className="text-link" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={linkBtn}>
            Recent changes{me.isMain ? ' & undo' : ''} <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
        )}
        {onOpenAudit && <button type="button" className="text-link" onClick={onOpenAudit} style={linkBtn}>See all changes</button>}
      </p>
      {open && (
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {list.map((a) => (
            <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 12px', borderRadius: 12, border: '1px dashed rgba(var(--ib-accent-rgb, 180,81,30), 0.35)', background: 'var(--ib-surface, #FFFDF9)' }}>
              <div style={{ flex: '1 1 240px', minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ib-brown, #5C2A10)', lineHeight: 1.45 }}>
                <strong style={{ color: 'var(--ib-dark, #1A0A00)' }}>{a.admin_name || 'An admin'}</strong> {a.action} {TABLE_NAMES[a.table_name]?.toLowerCase() || 'item'} <strong style={{ color: 'var(--ib-dark, #1A0A00)' }}>{a.summary}</strong>
                <span style={{ display: 'block', fontSize: 11.5 }}>
                  {when(a.at)}
                  {a.action === 'changed' && a.changed?.length > 0 && ` · ${a.changed.slice(0, 3).map((k) => (a.old_values && k in a.old_values ? `${field(k)}: ${short(a.old_values[k])} → ${short(a.new_values?.[k])}` : field(k))).join(' · ')}${a.changed.length > 3 ? ` +${a.changed.length - 3} more` : ''}`}
                </span>
              </div>
              {canUndo(a) && (
                <button type="button" onClick={() => undo(a)} disabled={busy !== null}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px', borderRadius: 999, border: '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.35)', background: 'transparent', color: 'var(--ib-sienna, #A8481A)', fontFamily: 'inherit', fontSize: 11, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  {busy === a.id ? <Loader2 size={12} style={spin} /> : <Undo2 size={12} />} Undo
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default LastChanged;
