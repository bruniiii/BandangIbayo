import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import EmptyState from './ui/EmptyState';
import { SearchX } from 'lucide-react';
import { confirmDialog } from './ui/ConfirmDialog';
import { sendCustomEmail } from './Email';
import { notifyUser } from './notifications';
import { logAdminMessages } from './adminMessages';
import SentMessages from './ui/SentMessages';
import {
  Search, Loader2, Users, Mail, Phone, Calendar, MapPin,
  ShieldAlert, X, Compass, ChevronRight, Send, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { SkeletonRows, Skel } from './ui/Skeleton';
import { reportError } from './ui/toast';

// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #A8481A  burnt sienna (accent)
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

// Joiners are archived when they haven't logged in for 2 years, or when they
// deleted their account (see joiner_login_activity and archived_accounts).
const JoinerAccounts = () => {
  const [view, setView] = useState('active'); // 'active' | 'archived'
  const [activity, setActivity] = useState({}); // id → { last_sign_in_at, inactive }
  const [deletedAccounts, setDeletedAccounts] = useState([]);
  const [joiners, setJoiners] = useState([]);
  const [bookingCounts, setBookingCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [showBulk, setShowBulk] = useState(false); // "Message a Joiner" picker

  // ── manual email composer (inside the detail modal) ──
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [alsoNotify, setAlsoNotify] = useState(true);
  const [sending, setSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null); // { type: 'success' | 'error', text }
  const [sentVersion, setSentVersion] = useState(0); // reloads the sent-messages list after sending
  const [showAllSent, setShowAllSent] = useState(false); // every message sent, all joiners

  // Opens (or closes, with null) a joiner's details, with a clean composer.
  const openJoiner = (joiner) => {
    setSelected(joiner);
    setComposing(false);
    setSubject('');
    setBody('');
    setAlsoNotify(true);
    setSending(false);
    setEmailStatus(null);
  };

  const handleSendEmail = async () => {
    if (!selected?.email) return;
    if (!subject.trim() || !body.trim()) {
      setEmailStatus({ type: 'error', text: 'Please enter both a subject and a message.' });
      return;
    }
    setSending(true);
    setEmailStatus(null);

    const { ok, error } = await sendCustomEmail({
      userId: selected.id,
      subject: subject.trim(),
      message: body.trim(),
    });

    if (!ok) {
      setSending(false);
      setEmailStatus({ type: 'error', text: `Email failed to send: ${error}` });
      return;
    }

    if (alsoNotify) {
      await notifyUser(selected.id, { title: subject.trim(), message: body.trim() });
    }
    await logAdminMessages([{ userId: selected.id, subject: subject.trim(), message: body.trim(), source: 'email', emailed: true }]);
    setSentVersion((v) => v + 1);

    setSending(false);
    setSubject('');
    setBody('');
    setComposing(false);
    setEmailStatus({ type: 'success', text: `Email sent to ${selected.email}.` });
  };

  // Loads quietly after the first time (the page starts in its loading state).
  const fetchJoiners = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .not('role', 'in', '(admin,archived_admin)')
      .order('created_at', { ascending: false });

    if (error) {
      reportError("Couldn't load joiner accounts", error.message);
      setLoading(false);
      return;
    }

    setJoiners(data || []);

    // Login activity (for the 2-year rule) and deleted accounts.
    const [{ data: logins, error: loginError }, { data: deleted, error: deletedError }] = await Promise.all([
      supabase.rpc('joiner_login_activity'),
      supabase.from('archived_accounts').select('*').order('archived_at', { ascending: false }),
    ]);
    if (loginError) reportError("Couldn't load login activity", loginError.message);
    else setActivity(Object.fromEntries((logins || []).map((a) => [a.id, a])));
    if (deletedError) reportError("Couldn't load archived accounts", deletedError.message);
    else setDeletedAccounts(deleted || []);

    const ids = (data || []).map(p => p.id);
    if (ids.length) {
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('user_id')
        .in('user_id', ids);
      if (bookingsError) {
        reportError("Couldn't load booking counts", bookingsError.message);
      } else {
        const counts = {};
        (bookings || []).forEach(b => { counts[b.user_id] = (counts[b.user_id] || 0) + 1; });
        setBookingCounts(counts);
      }
    }
    setLoading(false);
  };

  // Loads data when the page opens; its state updates happen after the request returns.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchJoiners(); }, []);

  // Live updates — new registrations / edited profiles appear without a manual refresh.
  useEffect(() => {
    const channel = supabase
      .channel('joiner-accounts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchJoiners())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const activeJoiners = useMemo(() => joiners.filter((p) => !activity[p.id]?.inactive), [joiners, activity]);
  // Archived: inactive for 2 years (still have an account), then deleted accounts.
  const archived = useMemo(() => [
    ...joiners.filter((p) => activity[p.id]?.inactive).map((p) => ({ ...p, archiveReason: 'inactive', last_sign_in_at: activity[p.id]?.last_sign_in_at })),
    ...deletedAccounts.map((a) => ({
      id: `deleted-${a.id}`, first_name: a.full_name || '', last_name: '', username: a.username, email: a.email,
      created_at: a.registered_at, last_sign_in_at: a.last_sign_in_at, archived_at: a.archived_at, archiveReason: 'deleted',
    })),
  ], [joiners, activity, deletedAccounts]);

  const filtered = useMemo(() => {
    const list = view === 'archived' ? archived : activeJoiners;
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(p => {
      const haystack = `${p.first_name || ''} ${p.last_name || ''} ${p.username || ''} ${p.email || ''} ${p.phone_number || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [view, archived, activeJoiners, query]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: '#7A3A18', margin: 0 }}>
            {loading ? <Skel w={140} h={11} /> : view === 'archived'
              ? `${archived.length} archived account${archived.length !== 1 ? 's' : ''}`
              : `${activeJoiners.length} active joiner${activeJoiners.length !== 1 ? 's' : ''}`}
          </p>
          <div role="tablist" aria-label="Joiner accounts" style={{ display: 'inline-flex', background: '#F2E4D0', padding: 4, borderRadius: 12, border: '1px solid rgba(180,81,30,0.14)', marginTop: 8 }}>
            {[['active', 'Active'], ['archived', 'Archived']].map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)} style={{
                padding: '7px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontWeight: 900, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase',
                background: view === key ? '#1A0A00' : 'transparent', color: view === key ? '#FDF6EE' : '#7A3A18',
              }}>
                {label}{key === 'archived' && archived.length ? ` (${archived.length})` : ''}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => setShowBulk(true)}
          disabled={loading || joiners.length === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#1A0A00', color: '#E8A265', border: 'none', borderRadius: 999,
            padding: '11px 20px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900,
            fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase',
            boxShadow: '0 6px 18px rgba(26,10,0,0.22)',
            opacity: (loading || joiners.length === 0) ? 0.5 : 1,
          }}
        >
          <Mail size={14} /> Message a Joiner
        </button>
        <button
          onClick={() => setShowAllSent(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#FDF6EE', color: '#A8481A', border: '1px solid rgba(180,81,30,0.3)', borderRadius: 999,
            padding: '10px 18px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900,
            fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase',
          }}
        >
          <Send size={14} /> Sent Messages
        </button>

        <div className="joiners-search" style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(122,58,24,0.85)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, username, email, phone…"
            style={{
              paddingLeft: 38, paddingRight: 16, paddingTop: 10, paddingBottom: 10,
              background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.18)',
              borderRadius: 999, fontSize: 12.5, fontWeight: 600, color: '#1A0A00',
              fontFamily: 'inherit', outline: 'none', width: 280, boxSizing: 'border-box',
            }}
          />
        </div>
        </div>
      </div>

      {/* table */}
      <div style={{
        background: '#FDF6EE', borderRadius: 20,
        border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
        overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: '0.5rem 1.25rem' }}><SkeletonRows count={6} boxed={false} label="Loading joiners" /></div>
        ) : filtered.length === 0 ? (
          query ? (
            <EmptyState
              icon={SearchX}
              title="No matching joiners"
              message={`No joiner's name, username or email matches "${query}".`}
              action={{ label: 'Clear Search', onClick: () => setQuery('') }}
            />
          ) : view === 'archived' ? (
            <EmptyState icon={Users} title="No archived accounts" message="Joiners who haven't logged in for 2 years, or who deleted their account, show up here." />
          ) : (
            <EmptyState icon={Users} title="No joiners registered yet" message="New joiner accounts will show up here as soon as they sign up." />
          )
        ) : (
          <div className="responsive-table-wrapper">
            <table className="joiners-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(180,81,30,0.14)' }}>
                  {(view === 'archived' ? ['Joiner', 'Contact', 'Archived Because', 'Last Login', 'Joined', ''] : ['Joiner', 'Contact', 'Address', 'Bookings', 'Last Login', '']).map((h) => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '14px 20px', fontSize: 11.5, fontWeight: 800,
                      letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.9,
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
                    onClick={() => { if (p.archiveReason !== 'deleted') openJoiner(p); }}
                    style={{ borderBottom: '1px solid rgba(180,81,30,0.08)', cursor: p.archiveReason === 'deleted' ? 'default' : 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(180,81,30,0.05)'}
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
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 800, color: '#1A0A00', margin: 0 }}>{fullName(p)}</p>
                          {p.username && (
                            <p style={{ fontSize: 11, color: '#7A3A18', opacity: 0.9, margin: '2px 0 0' }}>@{p.username}</p>
                          )}
                          {/* phones only: the Contact column is hidden there */}
                          <p className="joiners-phone-only" style={{ fontSize: 11.5, color: '#1A0A00', margin: '3px 0 0', overflowWrap: 'anywhere' }}>{p.email || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <p style={{ fontSize: 12, color: '#1A0A00', margin: 0 }}>{p.email || '—'}</p>
                      <p style={{ fontSize: 11.5, color: '#7A3A18', opacity: 0.9, margin: '2px 0 0' }}>{p.phone_number || '—'}</p>
                    </td>
                    {view === 'archived' ? (
                      <>
                        <td style={{ padding: '14px 20px' }}>
                          <p style={{ fontSize: 12, fontWeight: 800, color: p.archiveReason === 'deleted' ? '#8C2F1C' : '#8C5216', margin: 0 }}>
                            {p.archiveReason === 'deleted' ? `Deleted their account${p.archived_at ? ` (${formatDate(p.archived_at)})` : ''}` : 'No login for 2+ years'}
                          </p>
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: 0 }}>{p.last_sign_in_at ? formatDate(p.last_sign_in_at) : 'Never'}</p>
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: 0 }}>{formatDate(p.created_at)}</p>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '14px 20px' }}>
                          <p style={{ fontSize: 12, color: '#1A0A00', opacity: 0.9, margin: 0 }}>{p.address || '—'}</p>
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
                          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: 0 }}>
                            {activity[p.id]?.last_sign_in_at ? formatDate(activity[p.id].last_sign_in_at) : '—'}
                          </p>
                        </td>
                      </>
                    )}
                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      {p.archiveReason !== 'deleted' && <ChevronRight size={16} color="rgba(122,58,24,0.85)" />}
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
          onClick={() => openJoiner(null)}
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
              borderTop: '6px solid #B4511E', position: 'relative', maxHeight: '85dvh', overflowY: 'auto',
            }}
          >
            <button
              onClick={() => openJoiner(null)}
              style={{
                position: 'absolute', top: 18, right: 18, background: 'none', border: 'none',
                cursor: 'pointer', color: 'rgba(122,58,24,0.85)',
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
                  <p style={{ fontSize: 12, color: '#7A3A18', opacity: 0.9, margin: '3px 0 0' }}>@{selected.username}</p>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <DetailRow icon={<Mail size={14} />} label="Email" value={selected.email} />
              <DetailRow icon={<Phone size={14} />} label="Phone Number" value={selected.phone_number} />
              <DetailRow icon={<Calendar size={14} />} label="Date of Birth" value={formatDate(selected.date_of_birth)} />
              <DetailRow icon={<MapPin size={14} />} label="Address" value={selected.address} />
              <DetailRow icon={<ShieldAlert size={14} />} label="Emergency Contact" value={[selected.emergency_contact_name, selected.emergency_contact_number].filter(Boolean).join(' · ') || null} />
              <DetailRow icon={<Compass size={14} />} label="Total Bookings" value={String(bookingCounts[selected.id] || 0)} />
              <DetailRow icon={<Calendar size={14} />} label="Registered On" value={formatDate(selected.created_at)} />
              <DetailRow icon={<Calendar size={14} />} label="Last Login" value={activity[selected.id]?.last_sign_in_at ? formatDate(activity[selected.id].last_sign_in_at) : 'Never'} />
            </div>

            {/* ── Email joiner ── */}
            <div style={{ borderTop: '1px solid rgba(180,81,30,0.15)', marginTop: 22, paddingTop: 18 }}>
              {emailStatus && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12,
                  background: emailStatus.type === 'success' ? 'rgba(180,81,30,0.08)' : 'rgba(140,47,28,0.08)',
                  border: `1px solid ${emailStatus.type === 'success' ? 'rgba(180,81,30,0.22)' : 'rgba(140,47,28,0.22)'}`,
                  borderRadius: 12, padding: '10px 12px',
                  color: emailStatus.type === 'success' ? '#A8481A' : '#8C2F1C',
                }}>
                  {emailStatus.type === 'success' ? <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
                  <p style={{ fontSize: 12, fontWeight: 700, margin: 0, lineHeight: 1.5 }}>{emailStatus.text}</p>
                </div>
              )}

              {!selected.email ? (
                <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: 0 }}>
                  This joiner has no email address on file.
                </p>
              ) : !composing ? (
                <button
                  onClick={() => { setComposing(true); setEmailStatus(null); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: '#1A0A00', color: '#E8A265', border: 'none', borderRadius: 12,
                    padding: '12px 0', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900,
                    fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                  }}
                >
                  <Mail size={14} /> Send
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#1A0A00', margin: 0 }}>
                    Email to {selected.email}
                  </p>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject"
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#F2E4D0',
                      border: '1px solid rgba(180,81,30,0.18)', borderRadius: 12, padding: '10px 14px',
                      fontSize: 13, fontWeight: 600, color: '#1A0A00', fontFamily: 'inherit', outline: 'none',
                    }}
                  />
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Write your message…"
                    rows={5}
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#F2E4D0', resize: 'vertical',
                      border: '1px solid rgba(180,81,30,0.18)', borderRadius: 12, padding: '10px 14px',
                      fontSize: 13, fontWeight: 500, color: '#1A0A00', fontFamily: 'inherit', outline: 'none', lineHeight: 1.6,
                    }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#7A3A18' }}>
                    <input
                      type="checkbox"
                      checked={alsoNotify}
                      onChange={(e) => setAlsoNotify(e.target.checked)}
                      style={{ accentColor: '#B4511E', width: 15, height: 15 }}
                    />
                    Also show it in their in-app notifications
                  </label>
                  <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: 0 }}>
                    Sent from bandangibayo@gmail.com — the joiner can reply directly to that address.
                  </p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => { setComposing(false); setEmailStatus(null); }}
                      disabled={sending}
                      style={{
                        flex: 1, padding: '12px 0', background: '#F2E4D0', color: '#7A3A18',
                        border: '1px solid rgba(180,81,30,0.18)', borderRadius: 999, cursor: 'pointer',
                        fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendEmail}
                      disabled={sending}
                      style={{
                        flex: 1.6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '12px 0', background: '#B4511E', color: '#FDF6EE', border: 'none',
                        borderRadius: 999, cursor: sending ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                        fontWeight: 900, fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                        boxShadow: '0 6px 20px rgba(180,81,30,0.35)', opacity: sending ? 0.6 : 1,
                      }}
                    >
                      {sending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                      {sending ? 'Sending…' : 'Send Email'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Messages already sent to this joiner ── */}
            <div style={{ borderTop: '1px solid rgba(180,81,30,0.15)', marginTop: 22, paddingTop: 18 }}>
              <p style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#1A0A00', margin: '0 0 12px' }}>
                Sent Messages
              </p>
              <SentMessages key={`${selected.id}-${sentVersion}`} userId={selected.id} />
            </div>
          </div>
        </div>
      )}

      {showBulk && <EmailJoinerModal joiners={joiners} onClose={() => setShowBulk(false)} />}

      {/* Every message sent to joiners (emails and tour updates) */}
      {showAllSent && (
        <div onClick={() => setShowAllSent(false)} style={{
          position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(26,10,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem',
        }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Sent messages" className="responsive-modal-padding" style={{
            background: '#FDF6EE', borderRadius: 24, padding: '2rem', width: '100%', maxWidth: 560,
            boxShadow: '0 32px 80px rgba(26,10,0,0.4)', borderTop: '6px solid #B4511E', position: 'relative', maxHeight: '85dvh', overflowY: 'auto',
          }}>
            <button onClick={() => setShowAllSent(false)} aria-label="Close" style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(122,58,24,0.85)' }}>
              <X size={20} />
            </button>
            <h3 style={{ fontWeight: 900, fontSize: 16, color: '#1A0A00', margin: '0 0 16px', letterSpacing: '-0.02em' }}>Sent Messages</h3>
            <SentMessages names={Object.fromEntries(joiners.map((p) => [p.id, fullName(p)]))} limit={100} />
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

/* ─────────────────────────────────────────────
   EMAIL A JOINER — pick one or more joiners, write a message, send.
   Sent through the same send-email function as every other email.
───────────────────────────────────────────── */
const EmailJoinerModal = ({ joiners, onClose }) => {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [alsoNotify, setAlsoNotify] = useState(true);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', text }

  const withEmail = useMemo(() => joiners.filter((p) => p.email), [joiners]);
  const noEmailCount = joiners.length - withEmail.length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return withEmail;
    return withEmail.filter((p) => `${fullName(p)} ${p.username || ''} ${p.email}`.toLowerCase().includes(q));
  }, [withEmail, search]);

  const allVisiblePicked = visible.length > 0 && visible.every((p) => picked.has(p.id));

  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAllVisible = () => setPicked((prev) => {
    const next = new Set(prev);
    if (allVisiblePicked) visible.forEach((p) => next.delete(p.id));
    else visible.forEach((p) => next.add(p.id));
    return next;
  });

  const handleSend = async () => {
    if (picked.size === 0) { setStatus({ type: 'error', text: 'Please choose at least one joiner.' }); return; }
    if (!subject.trim() || !body.trim()) { setStatus({ type: 'error', text: 'Please enter both a subject and a message.' }); return; }

    const recipients = withEmail.filter((p) => picked.has(p.id));
    // An email can't be taken back once sent, so confirm who it's going to.
    if (!(await confirmDialog({
      title: `Send this email to ${recipients.length} joiner${recipients.length === 1 ? '' : 's'}?`,
      message: `"${subject.trim()}"\nEmails can't be taken back once sent.`,
      confirmLabel: `Send to ${recipients.length}`,
      cancelLabel: 'Keep Editing',
    }))) return;
    setSending(true);
    setStatus(null);
    setProgress(0);

    const failed = [];
    let sent = 0;
    for (let i = 0; i < recipients.length; i++) {
      const p = recipients[i];
      const { ok, error } = await sendCustomEmail({
        userId: p.id, subject: subject.trim(), message: body.trim(),
      });
      if (ok) {
        sent++;
        if (alsoNotify) await notifyUser(p.id, { title: subject.trim(), message: body.trim() });
        await logAdminMessages([{ userId: p.id, subject: subject.trim(), message: body.trim(), source: 'email', emailed: true }]);
      } else {
        failed.push({ p, error });
      }
      setProgress(i + 1);
    }

    setSending(false);
    if (failed.length === 0) {
      setPicked(new Set());
      setSubject('');
      setBody('');
      setStatus({ type: 'success', text: `Email sent to ${sent} joiner${sent !== 1 ? 's' : ''}.` });
    } else {
      // keep only the failed ones selected so the admin can simply press Send again
      setPicked(new Set(failed.map((f) => f.p.id)));
      setStatus({
        type: 'error',
        text: `${sent} sent, ${failed.length} failed (${failed.map((f) => fullName(f.p)).join(', ')}). Reason: ${failed[0].error}. The failed joiners are still selected — press Send to retry.`,
      });
    }
  };

  const fieldStyle = {
    width: '100%', boxSizing: 'border-box', background: '#F2E4D0',
    border: '1px solid rgba(180,81,30,0.18)', borderRadius: 12, padding: '10px 14px',
    fontSize: 13, fontWeight: 600, color: '#1A0A00', fontFamily: 'inherit', outline: 'none',
  };
  const labelStyle = {
    display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.2em',
    textTransform: 'uppercase', color: '#7A3A18', opacity: 0.9, marginBottom: 6,
  };

  return (
    <div
      onClick={() => { if (!sending) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(26,10,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FDF6EE', borderRadius: 24, width: '100%', maxWidth: 560,
          maxHeight: '92dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(26,10,0,0.4)', borderTop: '6px solid #B4511E',
        }}
      >
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(180,81,30,0.12)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: '#1A0A00', color: '#E8A265', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Mail size={17} />
            </div>
            <div>
              <h3 style={{ fontWeight: 900, fontSize: 16, color: '#1A0A00', margin: 0, letterSpacing: '-0.02em' }}>Message a Joiner</h3>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: '2px 0 0' }}>
                Choose who to message — sent from bandangibayo@gmail.com
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={sending} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(122,58,24,0.85)' }}>
            <X size={20} />
          </button>
        </div>

        {/* body */}
        <div style={{ overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {status && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: status.type === 'success' ? 'rgba(180,81,30,0.08)' : 'rgba(140,47,28,0.08)',
              border: `1px solid ${status.type === 'success' ? 'rgba(180,81,30,0.22)' : 'rgba(140,47,28,0.22)'}`,
              borderRadius: 12, padding: '10px 12px',
              color: status.type === 'success' ? '#A8481A' : '#8C2F1C',
            }}>
              {status.type === 'success' ? <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
              <p style={{ fontSize: 12, fontWeight: 700, margin: 0, lineHeight: 1.5 }}>{status.text}</p>
            </div>
          )}

          {/* recipients */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>To ({picked.size} selected)</label>
              <button
                onClick={toggleAllVisible}
                disabled={sending || visible.length === 0}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A8481A', fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}
              >
                {allVisiblePicked ? 'Clear shown' : 'Select all shown'}
              </button>
            </div>

            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(122,58,24,0.85)' }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search joiners…"
                style={{ ...fieldStyle, paddingLeft: 34, borderRadius: 999 }}
              />
            </div>

            <div style={{ maxHeight: 210, overflowY: 'auto', border: '1px solid rgba(180,81,30,0.14)', borderRadius: 14, background: '#FFFBF6' }}>
              {visible.length === 0 ? (
                <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.9, textAlign: 'center', padding: '1.25rem 0', margin: 0 }}>
                  No joiners found.
                </p>
              ) : visible.map((p) => {
                const on = picked.has(p.id);
                return (
                  <label
                    key={p.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer',
                      background: on ? 'rgba(180,81,30,0.09)' : 'transparent',
                      borderBottom: '1px solid rgba(180,81,30,0.07)',
                    }}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggle(p.id)} disabled={sending} style={{ accentColor: '#B4511E', width: 15, height: 15, flexShrink: 0 }} />
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                      background: '#1A0A00', color: '#E8A265', fontWeight: 900, fontSize: 11,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {p.avatar_url ? <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initialsOf(p)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 800, color: '#1A0A00', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(p)}</p>
                      <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '1px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.email}</p>
                    </div>
                  </label>
                );
              })}
            </div>
            {noEmailCount > 0 && (
              <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '6px 0 0' }}>
                {noEmailCount} joiner{noEmailCount !== 1 ? 's have' : ' has'} no email on file and can't be selected.
              </p>
            )}
          </div>

          {/* message */}
          <div>
            <label style={labelStyle}>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" disabled={sending} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message… Each joiner's email starts with “Hi <their name>,” automatically."
              rows={5}
              disabled={sending}
              style={{ ...fieldStyle, fontWeight: 500, resize: 'vertical', lineHeight: 1.6 }}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#7A3A18' }}>
            <input type="checkbox" checked={alsoNotify} onChange={(e) => setAlsoNotify(e.target.checked)} disabled={sending} style={{ accentColor: '#B4511E', width: 15, height: 15 }} />
            Also show it in their in-app notifications
          </label>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', gap: 10, padding: '1rem 1.5rem', borderTop: '1px solid rgba(180,81,30,0.12)', background: '#F2E4D0', flexShrink: 0 }}>
          <button
            onClick={onClose}
            disabled={sending}
            style={{
              flex: 1, padding: '12px 0', background: '#FDF6EE', color: '#7A3A18',
              border: '1px solid rgba(180,81,30,0.18)', borderRadius: 999, cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase',
            }}
          >
            Close
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            style={{
              flex: 1.8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 0', background: '#B4511E', color: '#FDF6EE', border: 'none', borderRadius: 999,
              cursor: sending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 900,
              fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase',
              boxShadow: '0 6px 20px rgba(180,81,30,0.35)', opacity: sending ? 0.7 : 1,
            }}
          >
            {sending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
            {sending
              ? `Sending ${progress}/${picked.size}…`
              : `Send${picked.size > 0 ? ` to ${picked.size} joiner${picked.size !== 1 ? 's' : ''}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

const DetailRow = ({ icon, label, value }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
    <span style={{ color: '#A8481A', opacity: 0.9, marginTop: 2, flexShrink: 0 }}>{icon}</span>
    <div>
      <p style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7A3A18', margin: 0 }}>
        {label}
      </p>
      <p style={{ fontSize: 15, fontWeight: 800, color: '#1A0A00', margin: '3px 0 0' }}>
        {value || '—'}
      </p>
    </div>
  </div>
);

export default JoinerAccounts;