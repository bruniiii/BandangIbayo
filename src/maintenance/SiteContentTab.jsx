import { useEffect, useState } from 'react';
import { Megaphone, LayoutTemplate, CalendarOff, Loader2, Lock, Upload, X, Plus } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast, reportError } from '../ui/toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import PrettySelect from '../ui/PrettySelect';
import NiceDate from '../ui/NiceDate';
import { useAdminMe } from '../adminMe';
import { shrinkImage } from '../imageCompress';
import { loadSiteContent } from '../siteContent';
import { todayManila } from '../tourUtils';
import RecordList from './RecordList';
import SharePreview from './SharePreview';
import { card, h3, hint, btn, input, label, when, spin } from './shared';

// ─────────────────────────────────────────────
// System Maintenance → Home Page & Banner
//  • Announcement banner (any admin): a notice on the homepage and the
//    joiner dashboard, optionally until a set time.
//  • Landing page (main admin): the headline, the text under it, and up to
//    6 hero photos (none = the open tours' photos, as before).
//  • No-tour dates (any admin): days without tours; tours and requests
//    can't be set on them. Archived, never deleted.
// ─────────────────────────────────────────────

const inp = { ...input, letterSpacing: 0, textTransform: 'none', fontWeight: 600 };

const SiteContentTab = () => {
  const me = useAdminMe();
  const [ann, setAnn] = useState(null);
  const [landing, setLanding] = useState(null);
  const [blackouts, setBlackouts] = useState(null);
  const [problem, setProblem] = useState('');

  const load = async () => {
    const [c, s, b] = await Promise.all([
      supabase.rpc('get_site_content'),
      supabase.from('app_settings').select('value').eq('key', 'announcement').maybeSingle(),
      supabase.from('blackout_dates').select('*').order('start_date', { ascending: false }),
    ]);
    if (c.error) { setProblem(c.error.message); return; }
    const a = s.data?.value || {};
    setAnn({ on: !!a.on, message: a.message || '', tone: a.tone || 'info', until: a.until ? String(a.until).slice(0, 16) : '', posted_at: a.posted_at, live: !!c.data?.announcement });
    const l = c.data?.landing || {};
    setLanding({ headline: l.headline || '', headline_accent: l.headline_accent || '', lead: l.lead || '', hero_images: Array.isArray(l.hero_images) ? l.hero_images : [] });
    setBlackouts(b.data || []);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the content when the tab opens
  useEffect(() => { load(); }, []);

  if (problem) {
    return (
      <div style={card}>
        <h3 style={h3}><LayoutTemplate size={16} color="var(--ib-red, #8C2F1C)" /> Site content isn't installed yet</h3>
        <p style={{ ...hint, margin: 0 }}>Run the database update <strong>20270101000000_site_content_blackouts.sql</strong>. ({problem})</p>
      </div>
    );
  }
  if (!ann) return <div style={{ ...card, display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, color: 'var(--ib-brown, #5C2A10)' }}><Loader2 size={15} style={spin} /> Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Announcement ann={ann} setAnn={setAnn} onSaved={load} />
      <Landing landing={landing} setLanding={setLanding} canEdit={me.isMain} onSaved={load} />
      <SharePreview canEdit={me.can('maintenance')} />
      <NoTourDates rows={blackouts} onChanged={load} />
    </div>
  );
};

const Announcement = ({ ann, setAnn, onSaved }) => {
  const [saving, setSaving] = useState(false);
  const save = async (on) => {
    if (on && ann.message.trim().length < 5) { toast.error('Write the announcement first'); return; }
    if (on && !(await confirmDialog({ title: 'Show this announcement?', message: `"${ann.message.trim()}"\n\nJoiners see it on the homepage and their dashboard${ann.until ? ` until ${when(ann.until)}` : ''}.`, confirmLabel: 'Show It', cancelLabel: 'Keep Editing' }))) return;
    setSaving(true);
    const { error } = await supabase.rpc('set_announcement', { p_on: on, p_message: ann.message.trim(), p_tone: ann.tone, p_until: on && ann.until ? new Date(ann.until).toISOString() : null });
    setSaving(false);
    if (error) { reportError("Couldn't save the announcement", error); return; }
    await loadSiteContent().catch(() => null);
    toast.success(on ? 'Announcement is showing' : 'Announcement removed');
    onSaved();
  };
  return (
    <section style={card}>
      <h3 style={h3}><Megaphone size={16} color="var(--ib-accent, #B4511E)" /> Announcement banner</h3>
      <p style={hint}>A short notice joiners see on the homepage and their dashboard, e.g. a typhoon advisory. {ann.live ? <strong style={{ color: 'var(--ib-green, #2E6B4A)' }}>Showing now.</strong> : 'Not showing.'}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={label}>Message<textarea value={ann.message} rows={2} maxLength={300} onChange={(e) => setAnn({ ...ann, message: e.target.value })} placeholder="e.g. Typhoon advisory: tours this weekend may be moved. Check My Bookings." style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 10 }}>
          <div style={label}>Color
            <PrettySelect ariaLabel="Banner color" value={ann.tone} onChange={(v) => setAnn({ ...ann, tone: v })} options={[{ value: 'info', label: 'Notice (amber)' }, { value: 'warning', label: 'Warning (red)' }]} />
          </div>
          <label style={label}>Show until (optional)<input type="datetime-local" value={ann.until} onChange={(e) => setAnn({ ...ann, until: e.target.value })} style={inp} /></label>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {ann.live && <button type="button" style={btn(false)} disabled={saving} onClick={() => save(false)}>Remove</button>}
          <button type="button" style={btn(true)} disabled={saving} onClick={() => save(true)}>{saving ? <Loader2 size={14} style={spin} /> : null} {ann.live ? 'Update' : 'Show Announcement'}</button>
        </div>
      </div>
    </section>
  );
};

const Landing = ({ landing, setLanding, canEdit, onSaved }) => {
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const total = landing.hero_images.length + files.length;
  const save = async () => {
    if (total > 6) { toast.error('Up to 6 hero photos'); return; }
    if (!(await confirmDialog({ title: 'Save the landing page?', message: 'Visitors see the new headline and photos right away.', confirmLabel: 'Save', cancelLabel: 'Keep Editing' }))) return;
    setSaving(true);
    try {
      const urls = [...landing.hero_images];
      for (const f of files) {
        const small = await shrinkImage(f);
        const path = `site/hero-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${small.type === 'image/png' ? 'png' : 'jpg'}`;
        const { error } = await supabase.storage.from('tours').upload(path, small, { contentType: small.type || 'image/jpeg' });
        if (error) throw error;
        urls.push(supabase.storage.from('tours').getPublicUrl(path).data.publicUrl);
      }
      const { error } = await supabase.rpc('set_landing_content', { p_content: { ...landing, hero_images: urls } });
      if (error) throw error;
      setFiles([]);
      await loadSiteContent().catch(() => null);
      toast.success('Landing page saved');
      onSaved();
    } catch (err) {
      reportError("Couldn't save the landing page", err);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section style={card}>
      <h3 style={h3}><LayoutTemplate size={16} color="var(--ib-accent, #B4511E)" /> Landing page</h3>
      <p style={hint}>The big headline, the line under it, and the photos behind them. Leave a box empty to use the usual text; with no photos, the open tours' photos are shown.</p>
      {!canEdit && <p style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--ib-parch, #F2E4D0)', borderRadius: 12, padding: '10px 12px', fontSize: 12.5, fontWeight: 700, color: 'var(--ib-brown, #5C2A10)', margin: '0 0 12px' }}><Lock size={15} /> Only the main admin can change the landing page.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 10 }}>
        <label style={label}>Headline<input value={landing.headline} disabled={!canEdit} maxLength={80} onChange={(e) => setLanding({ ...landing, headline: e.target.value })} placeholder="Your next adventure is" style={inp} /></label>
        <label style={label}>Highlighted part<input value={landing.headline_accent} disabled={!canEdit} maxLength={60} onChange={(e) => setLanding({ ...landing, headline_accent: e.target.value })} placeholder="one seat away." style={inp} /></label>
      </div>
      <label style={{ ...label, marginTop: 10 }}>Text under it<input value={landing.lead} disabled={!canEdit} maxLength={240} onChange={(e) => setLanding({ ...landing, lead: e.target.value })} placeholder="Join group tours across the Philippines…" style={inp} /></label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {landing.hero_images.map((u) => (
          <div key={u} style={{ position: 'relative', width: 110, height: 72, borderRadius: 10, overflow: 'hidden' }}>
            <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', maxWidth: 'none' }} />
            {canEdit && <button type="button" aria-label="Remove photo" onClick={() => setLanding({ ...landing, hero_images: landing.hero_images.filter((x) => x !== u) })} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(var(--ib-ink-rgb, 26,10,0), 0.7)', color: 'var(--ib-on-ink, #FDF6EE)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={12} /></button>}
          </div>
        ))}
        {files.map((f, i) => (
          <div key={i} style={{ position: 'relative', width: 110, height: 72, borderRadius: 10, overflow: 'hidden', outline: '2px dashed var(--ib-accent, #B4511E)' }}>
            <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', maxWidth: 'none' }} />
            <button type="button" aria-label="Remove photo" onClick={() => setFiles(files.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(var(--ib-ink-rgb, 26,10,0), 0.7)', color: 'var(--ib-on-ink, #FDF6EE)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={12} /></button>
          </div>
        ))}
        {canEdit && total < 6 && (
          <label style={{ ...btn(false), height: 72, width: 110, flexDirection: 'column' }}>
            <Upload size={15} /> Add photo
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple style={{ display: 'none' }} onChange={(e) => { const picked = [...(e.target.files || [])]; e.target.value = ''; setFiles((x) => [...x, ...picked].slice(0, 6 - landing.hero_images.length)); }} />
          </label>
        )}
      </div>
      {canEdit && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button type="button" style={btn(true)} disabled={saving} onClick={save}>{saving ? <Loader2 size={14} style={spin} /> : null} Save Landing Page</button></div>}
    </section>
  );
};

const NoTourDates = ({ rows, onChanged }) => {
  const [f, setF] = useState({ start: '', end: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const add = async () => {
    if (!f.start || f.reason.trim().length < 2) { toast.error('Pick the day(s) and write the reason'); return; }
    const end = f.end || f.start;
    if (end < f.start) { toast.error('The last day can\'t be before the first'); return; }
    setSaving(true);
    const { error } = await supabase.from('blackout_dates').insert([{ start_date: f.start, end_date: end, reason: f.reason.trim() }]);
    setSaving(false);
    if (error) { reportError("Couldn't add it", error); return; }
    setF({ start: '', end: '', reason: '' });
    await loadSiteContent().catch(() => null);
    toast.success('No-tour date added', f.reason.trim());
    onChanged();
  };
  const setActive = async (x, on) => {
    if (!on && !(await confirmDialog({ title: `Allow tours on ${x.reason} again?`, message: 'Tours can be set on those days again. You can restore it any time.', confirmLabel: 'Archive', cancelLabel: 'Keep' }))) return;
    const { error } = await supabase.from('blackout_dates').update({ is_active: on }).eq('id', x.id);
    if (error) { toast.error("Couldn't change it", error.message); return; }
    await loadSiteContent().catch(() => null);
    toast.success(on ? 'Restored' : 'Archived', x.reason);
    onChanged();
  };
  const range = (x) => `${new Date(`${x.start_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}${x.end_date !== x.start_date ? ` – ${new Date(`${x.end_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`;
  return (
    <section style={card}>
      <h3 style={h3}><CalendarOff size={16} color="var(--ib-accent, #B4511E)" /> No-tour dates</h3>
      <p style={hint}>Holidays and agency days off. New tours, date changes and private tour or tour requests can't be set on these days. Days that already have tours can't be blocked.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10, alignItems: 'end', marginBottom: 12 }}>
        <div style={label}>First day<NiceDate value={f.start} min={todayManila()} onChange={(e) => setF({ ...f, start: e.target.value })} placeholder="Pick a day" /></div>
        <div style={label}>Last day (optional)<NiceDate value={f.end} min={f.start || todayManila()} onChange={(e) => setF({ ...f, end: e.target.value })} placeholder="Same day" clearable /></div>
        <label style={label}>Reason<input value={f.reason} maxLength={120} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Christmas break" style={inp} /></label>
        <button type="button" style={btn(true)} disabled={saving} onClick={add}>{saving ? <Loader2 size={14} style={spin} /> : <Plus size={14} />} Add</button>
      </div>
      <RecordList
        items={rows}
        placeholder="Search no-tour dates"
        empty="No no-tour dates yet."
        textOf={(x) => `${x.reason} ${x.start_date} ${x.end_date}`}
        onArchive={(x) => setActive(x, false)}
        onRestore={(x) => setActive(x, true)}
        render={(x) => (
          <>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)' }}>{x.reason}</p>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--ib-brown, #5C2A10)' }}>{range(x)}{x.end_date < todayManila() ? ' · past' : ''}</p>
          </>
        )}
      />
    </section>
  );
};

export default SiteContentTab;
