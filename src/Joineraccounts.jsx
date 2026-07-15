import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import {
  Search, Loader2, Users, Mail, Phone, Calendar, MapPin,
  ShieldAlert, X, Compass, ChevronRight,
} from 'lucide-react';

// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #C45C26  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light bg)
// #7A3A18  rust mid-tone
// #F2E4D0  parchment (section bg)
// ---------------------------------------------------------

const fullName = (p) => {
  const combo = `${p?.first_name || ''} ${p?.last_name || ''}`.trim();
  if (combo) return combo;
  if (p?.username) return p.username;
  return 'Unnamed Joiner';
};

const initialsOf = (p) => {
  const first = (p?.first_name || '').trim();
  const last = (p?.last_name || '').trim();
  if (first || last) return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || first.charAt(0).toUpperCase();
  if (p?.username) return p.username.charAt(0).toUpperCase();
  return '?';
};

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const JoinerAccounts = () => {
  const [joiners, setJoiners] = useState([]);
  const [bookingCounts, setBookingCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  const fetchJoiners = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('role', 'admin')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching joiner accounts:', error.message);
      setLoading(false);
      return;
    }

    setJoiners(data || []);

    const ids = (data || []).map(p => p.id);
    if (ids.length) {
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('user_id')
        .in('user_id', ids);
      if (bookingsError) {
        console.error('Error fetching booking counts:', bookingsError.message);
      } else {
        const counts = {};
        (bookings || []).forEach(b => { counts[b.user_id] = (counts[b.user_id] || 0) + 1; });
        setBookingCounts(counts);
      }
    }
    setLoading(false);
  };

  useEffect(() => { fetchJoiners(); }, []);

  // Live updates — new registrations / edited profiles appear without a manual refresh.
  useEffect(() => {
    const channel = supabase
      .channel('joiner-accounts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchJoiners())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return joiners;
    return joiners.filter(p => {
      const haystack = `${p.first_name || ''} ${p.last_name || ''} ${p.username || ''} ${p.email || ''} ${p.phone_number || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [joiners, query]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h2 style={{ fontWeight: 900, fontSize: 20, letterSpacing: '-0.02em', color: '#1A0A00', margin: 0 }}>
            Joiner Accounts
          </h2>
          <p style={{ fontSize: 12.5, color: '#7A3A18', opacity: 0.7, margin: '4px 0 0' }}>
            {loading ? 'Loading registered joiners…' : `${joiners.length} registered joiner${joiners.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(122,58,24,0.4)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, username, email, phone…"
            style={{
              paddingLeft: 38, paddingRight: 16, paddingTop: 10, paddingBottom: 10,
              background: '#FDF6EE', border: '1px solid rgba(196,92,38,0.18)',
              borderRadius: 999, fontSize: 12.5, fontWeight: 600, color: '#1A0A00',
              fontFamily: 'inherit', outline: 'none', width: 280, boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* table */}
      <div style={{
        background: '#FDF6EE', borderRadius: 20,
        border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
        overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', color: 'rgba(122,58,24,0.4)' }}>
            <Loader2 size={20} style={{ marginRight: 10, animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading joiners…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '4rem 0', color: 'rgba(122,58,24,0.3)',
          }}>
            <Users size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0 }}>
              {query ? 'No matching joiners' : 'No joiners registered yet'}
            </p>
          </div>
        ) : (
          <div className="responsive-table-wrapper">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(196,92,38,0.14)' }}>
                  {['Joiner', 'Contact', 'Address', 'Bookings', 'Joined', ''].map((h) => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '14px 20px', fontSize: 10, fontWeight: 800,
                      letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.7,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setSelected(p)}
                    style={{ borderBottom: '1px solid rgba(196,92,38,0.08)', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(196,92,38,0.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                          background: '#1A0A00', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#E8A265', fontWeight: 900, fontSize: 13,
                        }}>
                          {p.avatar_url ? (
                            <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : initialsOf(p)}
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 800, color: '#1A0A00', margin: 0 }}>{fullName(p)}</p>
                          {p.username && (
                            <p style={{ fontSize: 11, color: '#7A3A18', opacity: 0.6, margin: '2px 0 0' }}>@{p.username}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <p style={{ fontSize: 12, color: '#1A0A00', margin: 0 }}>{p.email || '—'}</p>
                      <p style={{ fontSize: 11.5, color: '#7A3A18', opacity: 0.7, margin: '2px 0 0' }}>{p.phone_number || '—'}</p>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <p style={{ fontSize: 12, color: '#1A0A00', opacity: 0.85, margin: 0 }}>{p.address || '—'}</p>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        minWidth: 26, height: 26, padding: '0 8px', borderRadius: 999,
                        background: '#F2E4D0', color: '#7A3A18', fontSize: 12, fontWeight: 800,
                      }}>
                        {bookingCounts[p.id] || 0}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.7, margin: 0 }}>
                        {formatDate(p.created_at)}
                      </p>
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      <ChevronRight size={16} color="rgba(122,58,24,0.4)" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* detail modal */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(26,10,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '2rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="responsive-modal-padding"
            style={{
              background: '#FDF6EE', borderRadius: 24, padding: '2rem',
              width: '100%', maxWidth: 460, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
              borderTop: '6px solid #C45C26', position: 'relative', maxHeight: '85vh', overflowY: 'auto',
            }}
          >
            <button
              onClick={() => setSelected(null)}
              style={{
                position: 'absolute', top: 18, right: 18, background: 'none', border: 'none',
                cursor: 'pointer', color: 'rgba(122,58,24,0.5)',
              }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                background: '#1A0A00', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#E8A265', fontWeight: 900, fontSize: 22,
              }}>
                {selected.avatar_url ? (
                  <img src={selected.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : initialsOf(selected)}
              </div>
              <div>
                <p style={{ fontWeight: 900, fontSize: 17, color: '#1A0A00', margin: 0 }}>{fullName(selected)}</p>
                {selected.username && (
                  <p style={{ fontSize: 12, color: '#7A3A18', opacity: 0.65, margin: '3px 0 0' }}>@{selected.username}</p>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <DetailRow icon={<Mail size={14} />} label="Email" value={selected.email} />
              <DetailRow icon={<Phone size={14} />} label="Phone Number" value={selected.phone_number} />
              <DetailRow icon={<Calendar size={14} />} label="Date of Birth" value={formatDate(selected.date_of_birth)} />
              <DetailRow icon={<MapPin size={14} />} label="Address" value={selected.address} />
              <DetailRow icon={<ShieldAlert size={14} />} label="Emergency Contact" value={selected.emergency_contact_number} />
              <DetailRow icon={<Compass size={14} />} label="Total Bookings" value={String(bookingCounts[selected.id] || 0)} />
              <DetailRow icon={<Calendar size={14} />} label="Registered On" value={formatDate(selected.created_at)} />
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

const DetailRow = ({ icon, label, value }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
    <span style={{ color: '#C45C26', opacity: 0.7, marginTop: 2, flexShrink: 0 }}>{icon}</span>
    <div>
      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.7, margin: 0 }}>
        {label}
      </p>
      <p style={{ fontSize: 13, fontWeight: 600, color: '#1A0A00', margin: '3px 0 0' }}>
        {value || '—'}
      </p>
    </div>
  </div>
);

export default JoinerAccounts;