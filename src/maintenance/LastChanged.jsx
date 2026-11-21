import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { CHANGES } from './sections';
import { when } from './shared';

// "Last changed by Ana Cruz · Nov 19, 2026, 3:40 PM" under a System
// Maintenance section, from the Audit Trail (admin_activity).
const LastChanged = ({ section, onOpenAudit }) => {
  const what = CHANGES[section];
  const [last, setLast] = useState(undefined); // undefined = loading, null = never

  useEffect(() => {
    if (!what) return undefined;
    let alive = true;
    const parts = [];
    if (what.tables?.length) parts.push(`table_name.in.(${what.tables.join(',')})`);
    if (what.keys?.length) parts.push(`and(table_name.eq.app_settings,row_id.in.(${what.keys.join(',')}))`);
    supabase.from('admin_activity').select('admin_name, at, summary').or(parts.join(',')).order('at', { ascending: false }).limit(1)
      .then(({ data, error }) => { if (alive) setLast(error ? null : data?.[0] || null); });
    return () => { alive = false; };
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!what || last === undefined) return null;
  return (
    <p style={{ margin: '-6px 0 0', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, fontWeight: 700, color: 'var(--ib-rust, #7A3A18)' }}>
      <History size={13} />
      {last
        ? <>Last changed by <strong style={{ color: 'var(--ib-dark, #1A0A00)' }}>{last.admin_name || 'an admin'}</strong> · {when(last.at)}</>
        : 'No changes recorded yet.'}
      {onOpenAudit && <button type="button" className="text-link" onClick={onOpenAudit} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800 }}>See all changes</button>}
    </p>
  );
};

export default LastChanged;
