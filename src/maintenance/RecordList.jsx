import { useState } from 'react';
import { Search, Archive, RotateCcw, Loader2, Pencil } from 'lucide-react';
import StatusFilter from '../ui/StatusFilter';
import Pager from '../ui/Pager';
import { paginate } from '../ui/paginate';
import { btn, input, hint, spin } from './shared';

// ─────────────────────────────────────────────
// The list used by the System Maintenance tabs: search, Active / Archived /
// All, pages, and Edit / Archive / Restore on each card (nothing is ever
// deleted). The database decides what can be archived (and says why not).
//   items: the records; textOf(item): what search looks in; render(item): the card's content.
// ─────────────────────────────────────────────

const STATUSES = ['Active', 'Archived', 'All'];

const RecordList = ({
  items, textOf, render, onEdit = null, onArchive = null, onRestore = null, canEdit = true,
  placeholder = 'Search…', empty = 'Nothing here yet.', pageSize = 12, toolbar = null, isActive = (x) => x.is_active !== false,
}) => {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Active');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(null);
  const q = query.trim().toLowerCase();
  const matches = (x, st) => (st === 'All' || (st === 'Active' ? isActive(x) : !isActive(x))) && (!q || textOf(x).toLowerCase().includes(q));
  const shown = (items || []).filter((x) => matches(x, status));
  const { visible, pages, current } = paginate(shown, page, pageSize);
  const run = async (x, fn) => { setBusy(x.id); try { await fn(x); } finally { setBusy(null); } };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <label style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#7A3A18' }} />
          <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder={placeholder} aria-label={placeholder} style={{ ...input, paddingLeft: 34 }} />
        </label>
        {toolbar}
      </div>
      <StatusFilter statuses={STATUSES} value={status} onChange={(v) => { setStatus(v); setPage(1); }} count={(st) => (items || []).filter((x) => matches(x, st)).length} style={{ marginBottom: 12 }} />
      {!items ? (
        <p style={{ ...hint, display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={15} style={spin} /> Loading…</p>
      ) : visible.length === 0 ? (
        <p style={{ ...hint, margin: 0 }}>{items.length === 0 ? empty : 'Nothing matches.'}</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 10 }}>
          {visible.map((x) => {
            const active = isActive(x);
            return (
              <div key={x.id} style={{ background: active ? '#F2E4D0' : 'rgba(242,228,208,0.5)', borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {render(x)}
                {!active && <p style={{ margin: 0, fontSize: 10.5, fontWeight: 900, letterSpacing: '0.12em', color: '#8C2F1C' }}>ARCHIVED</p>}
                {canEdit && (onEdit || onArchive || onRestore) && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    {onEdit && active && <button type="button" style={btn(false)} onClick={() => onEdit(x)}><Pencil size={13} /> Edit</button>}
                    {active && onArchive && <button type="button" style={btn(false)} disabled={busy === x.id} onClick={() => run(x, onArchive)}>{busy === x.id ? <Loader2 size={13} style={spin} /> : <Archive size={13} />} Archive</button>}
                    {!active && onRestore && <button type="button" style={btn(true)} disabled={busy === x.id} onClick={() => run(x, onRestore)}>{busy === x.id ? <Loader2 size={13} style={spin} /> : <RotateCcw size={13} />} Restore</button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Pager page={current} pages={pages} onPage={setPage} />
    </div>
  );
};

export default RecordList;
