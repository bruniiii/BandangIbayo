import React, { useEffect, useRef, useState } from 'react';
import { Search, X, Ticket, Map, User, Shield, Loader2 } from 'lucide-react';
import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────
// Admin top bar: one search box for a booking number, a joiner's name or
// phone, a tour, or a private tour/request. Picking a result opens it
// (onOpen(page, id)). On phones it's a search button that opens the box.
// ─────────────────────────────────────────────

const clean = (q) => q.replace(/[%,()]/g, ' ').trim();

const AdminSearch = ({ onOpen, wide = false }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  // (The latest onOpen, so typing doesn't search again on every redraw.)
  const openRef = useRef(onOpen);
  useEffect(() => { openRef.current = onOpen; });
  const go = (...args) => openRef.current?.(...args);

  useEffect(() => {
    const term = clean(q);
    if (term.length < 2) { const t = setTimeout(() => setResults(null), 0); return () => clearTimeout(t); }
    let alive = true;
    const t = setTimeout(async () => {
      setBusy(true);
      const like = `%${term}%`;
      const [b, tours, people, reqs] = await Promise.all([
        supabase.from('bookings').select('id, booking_number, full_name, contact_number, tours ( title )')
          .or(`booking_number.ilike.${like},full_name.ilike.${like},contact_number.ilike.${like}`).order('created_at', { ascending: false }).limit(5),
        supabase.from('tours').select('id, title, destination, start_date, is_archived').or(`title.ilike.${like},destination.ilike.${like}`).order('start_date', { ascending: false }).limit(5),
        supabase.from('profiles').select('id, first_name, last_name, username, email, phone_number').not('role', 'in', '(admin,archived_admin)')
          .or(`first_name.ilike.${like},last_name.ilike.${like},username.ilike.${like},email.ilike.${like},phone_number.ilike.${like}`).limit(5),
        supabase.from('exclusive_requests').select('id, request_type, full_name, destination').or(`full_name.ilike.${like},destination.ilike.${like}`).order('created_at', { ascending: false }).limit(5),
      ]);
      if (!alive) return;
      setBusy(false);
      setResults([
        ...(b.data || []).map((r) => ({ key: `b${r.id}`, icon: Ticket, group: 'Booking', title: `${r.booking_number} · ${r.full_name || ''}`, sub: r.tours?.title || r.contact_number, open: () => go('Booking Management', r.id) })),
        ...(people.data || []).map((r) => ({ key: `p${r.id}`, icon: User, group: 'Joiner', title: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.username, sub: r.email || r.phone_number, open: () => go('Joiner Accounts', r.id) })),
        ...(tours.data || []).map((r) => ({ key: `t${r.id}`, icon: Map, group: 'Tour', title: r.title, sub: `${r.destination || ''}${r.start_date ? ` · ${r.start_date}` : ''}${r.is_archived ? ' · archived' : ''}`, open: () => go('Tour Management', r.id) })),
        ...(reqs.data || []).map((r) => ({ key: `r${r.id}`, icon: Shield, group: r.request_type === 'request' ? 'Requested tour' : 'Private tour', title: r.destination, sub: r.full_name, open: () => go(r.request_type === 'request' ? 'Requested Tours' : 'Private Tours', r.id) })),
      ]);
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  useEffect(() => {
    const close = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (r) => { r.open(); setOpen(false); setQ(''); };

  return (
    <div ref={wrapRef} className={wide ? 'admin-search-wide' : 'admin-search'} style={{ position: 'relative' }}>
      <div className="admin-search-box" style={{ position: 'relative' }}>
        <Search size={15} color="#7A3A18" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' && results?.[0]) pick(results[0]); }}
          placeholder="Search bookings, joiners, tours…" aria-label="Search everything"
          style={{ width: wide ? '100%' : 260, maxWidth: '100%', boxSizing: 'border-box', height: 42, padding: '0 34px 0 34px', borderRadius: 14, border: '1px solid rgba(180,81,30,0.22)', background: '#F2E4D0', fontFamily: 'inherit', fontSize: 13, color: '#1A0A00' }} />
        {q && <button type="button" onClick={() => { setQ(''); setResults(null); }} aria-label="Clear search" className="no-touch-size" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', padding: 4 }}><X size={14} /></button>}
      </div>
      {open && clean(q).length >= 2 && (
        <div role="listbox" aria-label="Search results" style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: wide ? '100%' : 360, maxWidth: 'calc(100vw - 24px)', maxHeight: 420, overflowY: 'auto', zIndex: 70,
          background: '#FFFDF9', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 16, boxShadow: '0 18px 40px rgba(26,10,0,0.2)', padding: 6,
        }}>
          {busy && !results && <p style={{ margin: 10, display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: '#5C2A10' }}><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Searching…</p>}
          {results && results.length === 0 && <p style={{ margin: 10, fontSize: 12.5, fontWeight: 700, color: '#5C2A10' }}>Nothing found for "{clean(q)}".</p>}
          {(results || []).map((r) => {
            const Icon = r.icon;
            return (
              <button key={r.key} type="button" role="option" aria-selected="false" onClick={() => pick(r)} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'none', border: 'none', borderRadius: 10,
                padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F2E4D0'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: '#1A0A00', color: '#E8A265', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={14} /></span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#1A0A00', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#5C2A10', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.group}{r.sub ? ` · ${r.sub}` : ''}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminSearch;
