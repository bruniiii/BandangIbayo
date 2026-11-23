import { useEffect, useState } from 'react';
import { Timer, RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { card, h3, hint, btn, when, spin } from './shared';

// ─────────────────────────────────────────────
// System Maintenance → System → Jobs
// The automatic jobs (releasing unpaid holds, reminders, weather deadlines,
// archiving…) with their last run and failures in the last 24 hours.
// ─────────────────────────────────────────────

// Plain names for the scheduled jobs.
const JOB_NAMES = {
  'expire-payment-holds': 'Release unpaid checkouts', 'archive-past-tours': 'Move ended tours to the archive', 'notify-pickup-day': 'Pickup-day notices',
  'archive-inactive-joiners': 'Archive inactive joiners', 'reject-overdue-requests': 'Close overdue requests', 'departure-reminders': 'Departure reminders',
  'weather-deadlines': 'Bad-weather choice deadlines', 'approve-overdue-cancellations': 'Approve old cancellation requests', 'van-quiet': 'Van location gone quiet',
  'trip-not-started': 'Trip not started alerts', 'cleanup-client-errors': 'Delete old error reports', 'anonymize-old-archived': 'Anonymize long-archived joiners',
  'trip-emails': 'Trip emails', 'send-reminders': 'Reminder emails',
};

const HealthTab = () => {
  const [jobs, setJobs] = useState(null);
  const load = async () => {
    setJobs(null);
    const j = await supabase.rpc('system_jobs');
    setJobs(j.error ? { available: false, error: j.error.message, jobs: [] } : j.data);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads when the section opens
  useEffect(() => { load(); }, []);

  const bad = (jobs?.jobs || []).filter((x) => x.last_status === 'failed' || x.failed_24h > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={h3}><Timer size={16} color="var(--ib-accent, #B4511E)" /> Automatic jobs</h3>
          <button type="button" style={btn(false)} onClick={load}><RefreshCw size={14} /> Check Again</button>
        </div>
        <p style={hint}>What the website does by itself on a schedule, and whether its last run worked.</p>
        {!jobs ? <p style={{ ...hint, display: 'flex', gap: 8 }}><Loader2 size={15} style={spin} /> Checking…</p> : !jobs.available ? (
          <p style={{ ...hint, margin: 0 }}>The job schedule can't be read here{jobs.error ? ` (${jobs.error})` : ''}. Check Supabase → Integrations → Cron.</p>
        ) : (
          <>
            <p style={{ margin: '0 0 10px', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 800, color: bad.length ? 'var(--ib-red, #8C2F1C)' : 'var(--ib-green, #2E6B4A)' }}>
              {bad.length ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
              {bad.length ? `${bad.length} job${bad.length === 1 ? '' : 's'} failed recently.` : 'All jobs ran fine.'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 8 }}>
              {jobs.jobs.map((x) => {
                const failed = x.last_status === 'failed' || x.failed_24h > 0;
                return (
                  <div key={x.name} style={{ background: failed ? 'var(--ib-surface-2, #FBEDE6)' : 'var(--ib-parch, #F2E4D0)', borderRadius: 12, padding: '10px 12px' }}>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)' }}>{JOB_NAMES[x.name] || x.name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, fontWeight: 600, color: 'var(--ib-brown, #5C2A10)' }}>{x.name} · {x.schedule}{x.active ? '' : ' · paused'}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 800, color: failed ? 'var(--ib-red, #8C2F1C)' : 'var(--ib-green, #2E6B4A)' }}>
                      {x.last_run ? `Last run ${when(x.last_run)}: ${x.last_status}` : 'Not run yet'}{x.failed_24h ? ` · ${x.failed_24h} failed in 24 hours` : ''}
                    </p>
                    {failed && x.last_message && <p style={{ margin: '4px 0 0', fontSize: 11.5, fontWeight: 600, color: 'var(--ib-red, #8C2F1C)', overflowWrap: 'anywhere' }}>{x.last_message}</p>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

    </div>
  );
};

export default HealthTab;
