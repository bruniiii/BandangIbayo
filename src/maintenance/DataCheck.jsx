import { useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { card, h3, hint, row, btn } from './shared';

// ─────────────────────────────────────────────
// Cleanups → Data check: incomplete or inconsistent records
// (data_integrity), each with where to fix it.
// ─────────────────────────────────────────────

// Each check: what it means, and where to fix it.
const CHECKS = {
  overbooked: { title: 'Tours with more joiners than slots', fix: 'Raise the slots or move a booking to another date.', page: 'Tour Management' },
  booking_without_tour: { title: 'Bookings whose tour no longer exists', fix: 'Check the booking and cancel or move it.', page: 'Booking Management' },
  overpaid: { title: 'Bookings paid more than their total', fix: 'Check the payment, then fix the amount or refund the extra.', page: 'Booking Management' },
  open_tour_missing_details: { title: 'Open tours missing details', fix: 'Add the missing price, slots, photo or pickup points.', page: 'Tour Management' },
  bad_dates: { title: 'Tours that end before they start', fix: 'Fix the dates in the tour form.', page: 'Tour Management' },
  past_tour_open: { title: 'Tours that ended but are still open', fix: 'Run the cleanup above: it moves them to Tour Archive.', page: null },
  joiner_missing_contact: { title: 'Joiners without a name or phone number', fix: 'They are asked to finish their profile when they log in.', page: 'Joiner Accounts' },
};

const DataCheck = ({ onNavigate }) => {
  const [checks, setChecks] = useState(null);
  const [checkError, setCheckError] = useState('');

  const load = async () => {
    const c = await supabase.rpc('data_integrity');
    if (c.error) { setCheckError(c.error.message); setChecks([]); } else { setCheckError(''); setChecks(c.data?.checks || []); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- runs the checks when the section opens
  useEffect(() => { load(); }, []);

  const problems = (checks || []).reduce((n, c) => n + (Number(c.count) || 0), 0);

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={h3}><ShieldCheck size={16} color="var(--ib-sienna, #A8481A)" /> Data check</h3>
          <p style={hint}>Looks for incomplete or inconsistent records. Click a record to open it and fix it.</p>
        </div>
        <button type="button" onClick={load} style={btn(false)}><RefreshCw size={14} /> Check Again</button>
      </div>
      {checkError && <p role="alert" style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--ib-red, #8C2F1C)' }}>Couldn't run the check ({checkError}). Run the latest database update (install_updates.sql).</p>}
      {checks === null ? <p style={{ margin: 0, color: 'var(--ib-brown, #5C2A10)' }}>Checking…</p> : (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 900, color: problems ? 'var(--ib-red, #8C2F1C)' : 'var(--ib-green, #1B5E3B)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {problems ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {problems ? `${problems} record${problems === 1 ? '' : 's'} to look at` : 'No problems found'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {checks.map((c) => {
              const info = CHECKS[c.key] || { title: c.key };
              const n = Number(c.count) || 0;
              return (
                <div key={c.key} style={{ ...row, alignItems: 'flex-start', background: n ? 'rgba(var(--ib-amber-rgb, 232,162,101), 0.14)' : 'var(--ib-parch, #F2E4D0)' }}>
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)' }}>
                      {info.title} <span style={{ marginLeft: 6, color: c.count == null ? 'var(--ib-warn, #7A4410)' : n ? 'var(--ib-red, #8C2F1C)' : 'var(--ib-green, #1B5E3B)' }}>{c.count == null ? "couldn't check" : n ? n : '✓ none'}</span>
                    </p>
                    {n > 0 && <p style={{ margin: '2px 0 6px', fontSize: 12, fontWeight: 600, color: 'var(--ib-brown, #5C2A10)' }}>{info.fix}</p>}
                    {n > 0 && (
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
                        {(c.items || []).map((it) => (
                          <li key={it.id}>
                            {info.page ? (
                              <button type="button" onClick={() => onNavigate(info.page, it.id)} className="text-link"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, textAlign: 'left' }}>
                                {it.label} <ChevronRight size={13} />
                              </button>
                            ) : <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ib-dark, #1A0A00)' }}>{it.label}</span>}
                          </li>
                        ))}
                        {n > (c.items || []).length && <li style={{ fontSize: 12, color: 'var(--ib-brown, #5C2A10)' }}>and {n - c.items.length} more</li>}
                      </ul>
                    )}
                  </div>
                  </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
};

export default DataCheck;
