import React, { useEffect, useState } from 'react';
import { Star, Send, Loader2, CheckCircle2, MessageSquareHeart } from 'lucide-react';
import { supabase, currentUser } from './supabaseClient';
import { toast } from './ui/toast';
import { FEEDBACK_QUESTIONS } from './feedbackQuestions';

// ─────────────────────────────────────────────
// Feedback survey (joiners): five 1–5 ratings and a comment, to help improve
// the website. Results are in the admin's Reports. Open from the Feedback
// menu, or from the homepage after a trip.
// ─────────────────────────────────────────────


const WORDS = ['', 'Very poor', 'Poor', 'Okay', 'Good', 'Excellent'];

const Stars = ({ value, onChange, label }) => (
  <div role="radiogroup" aria-label={label} style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
    {[1, 2, 3, 4, 5].map((n) => (
      <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} – ${WORDS[n]}`} onClick={() => onChange(n)} className="no-touch-size"
        style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', lineHeight: 0 }}>
        <Star size={28} fill={n <= value ? '#E8A265' : 'none'} color={n <= value ? '#B4511E' : 'rgba(122,58,24,0.5)'} />
      </button>
    ))}
    <span style={{ marginLeft: 6, fontSize: 12.5, fontWeight: 800, color: value ? '#5C2A10' : '#7A3A18' }}>{value ? WORDS[value] : 'Tap a star'}</span>
  </div>
);

const Feedback = () => {
  const [answers, setAnswers] = useState({});
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const user = await currentUser();
      if (!user) return;
      const { data } = await supabase.from('system_feedback').select('created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1);
      if (alive) setLastSent(data?.[0]?.created_at || null);
    })();
    return () => { alive = false; };
  }, []);

  const missing = FEEDBACK_QUESTIONS.filter(([k]) => !answers[k]);
  const submit = async (e) => {
    e.preventDefault();
    if (missing.length) { toast.error('A few questions left', 'Please rate every question.'); return; }
    setSending(true);
    const { error } = await supabase.from('system_feedback').insert([{ ...answers, comment: comment.trim() || null }]);
    setSending(false);
    if (error) { toast.error("Couldn't send your feedback", error.message); return; }
    setDone(true);
    setLastSent(new Date().toISOString());
    toast.success('Thank you!', 'Your feedback helps us improve Bandang IBAYO.');
  };

  if (done) {
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CheckCircle2 size={28} color="#1B5E3B" />
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#1A0A00' }}>Thank you for your feedback!</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 600, color: '#5C2A10' }}>We read every answer to make the website better.</p>
          </div>
        </div>
        <button type="button" onClick={() => { setDone(false); setAnswers({}); setComment(''); }} style={{ ...secondaryBtn, marginTop: 16 }}>Answer Again</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <MessageSquareHeart size={26} color="#B4511E" style={{ flexShrink: 0 }} />
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#1A0A00' }}>Help us improve</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 600, color: '#5C2A10', lineHeight: 1.5 }}>
            A 1-minute survey about the website. Rate each question from 1 (very poor) to 5 (excellent).
            {lastSent && ` You last answered on ${new Date(lastSent).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}.`}
          </p>
        </div>
      </div>
      {FEEDBACK_QUESTIONS.map(([key, q], i) => (
        <div key={key} style={{ borderTop: '1px solid rgba(180,81,30,0.12)', paddingTop: 14 }}>
          <p style={{ margin: '0 0 6px', fontSize: 13.5, fontWeight: 800, color: '#1A0A00' }}>{i + 1}. {q} <span style={{ color: '#A8481A' }}>*</span></p>
          <Stars label={q} value={answers[key] || 0} onChange={(n) => setAnswers((a) => ({ ...a, [key]: n }))} />
        </div>
      ))}
      <div style={{ borderTop: '1px solid rgba(180,81,30,0.12)', paddingTop: 14 }}>
        <label htmlFor="feedback-comment" style={{ display: 'block', margin: '0 0 6px', fontSize: 13.5, fontWeight: 800, color: '#1A0A00' }}>
          6. What should we improve or add? <span style={{ fontWeight: 600, color: '#7A3A18' }}>(optional)</span>
        </label>
        <textarea id="feedback-comment" value={comment} maxLength={1000} rows={4} onChange={(e) => setComment(e.target.value)}
          placeholder="Tell us anything: what was hard, what you liked, what's missing…"
          style={{ width: '100%', boxSizing: 'border-box', borderRadius: 14, border: '1px solid rgba(180,81,30,0.25)', padding: '10px 12px', fontFamily: 'inherit', fontSize: 16, color: '#1A0A00', background: '#FDF6EE', resize: 'vertical' }} />
      </div>
      {missing.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#8C2F1C' }}>Still to rate: question {missing.map(([k]) => FEEDBACK_QUESTIONS.findIndex(([q]) => q === k) + 1).join(', ')}</p>
      )}
      <button type="submit" disabled={sending || missing.length > 0} style={primaryBtn}>
        {sending ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />} Send Feedback
      </button>
    </form>
  );
};

const card = { background: '#FDF6EE', borderRadius: 22, padding: '1.5rem', border: '1px solid rgba(180,81,30,0.14)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)', maxWidth: 720 };
const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, padding: '0 22px', borderRadius: 14, border: 'none', cursor: 'pointer',
  background: '#B4511E', color: '#FDF6EE', fontFamily: 'inherit', fontWeight: 900, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', alignSelf: 'flex-start',
};
const secondaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 18px', borderRadius: 12, cursor: 'pointer',
  background: 'transparent', border: '1px solid rgba(180,81,30,0.35)', color: '#5C2A10', fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase',
};

export default Feedback;
