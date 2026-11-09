import React, { useEffect, useState } from 'react';
import { MessageSquareHeart, Star } from 'lucide-react';
import { supabase } from './supabaseClient';
import { FEEDBACK_QUESTIONS } from './feedbackQuestions';

// ─────────────────────────────────────────────
// Reports → Survey Results: the joiners' feedback survey (Feedback.jsx):
// the average for each question (1–5) and the latest comments.
// ─────────────────────────────────────────────
const FeedbackResults = () => {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    supabase.from('system_feedback').select('*').order('created_at', { ascending: false }).limit(500).then(({ data, error: err }) => {
      if (!alive) return;
      if (err) { setError(err.message); setRows([]); return; }
      setRows(data || []);
    });
    return () => { alive = false; };
  }, []);

  const n = rows?.length || 0;
  const avg = (k) => (n ? rows.reduce((s, r) => s + (Number(r[k]) || 0), 0) / n : 0);
  const comments = (rows || []).filter((r) => r.comment).slice(0, 6);

  return (
    <section aria-label="Survey results" style={{
      background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
      border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
    }}>
      <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#A8481A', margin: '0 0 14px' }}>
        <MessageSquareHeart size={14} /> Survey Results (joiners' feedback on the website)
      </h4>
      {rows === null ? (
        <p style={{ margin: 0, fontSize: 12.5, color: '#7A3A18' }}>Loading…</p>
      ) : error ? (
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#8C2F1C' }}>Couldn't load the survey ({error}). Run the latest database update.</p>
      ) : n === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#7A3A18' }}>No answers yet. Joiners answer it from the Feedback menu or after a trip.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#5C2A10' }}>{n} answer{n === 1 ? '' : 's'} · average out of 5</p>
            {FEEDBACK_QUESTIONS.map(([k, q]) => (
              <div key={k}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, fontWeight: 800, color: '#1A0A00' }}>
                  <span>{q}</span><span style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Star size={12} fill="#E8A265" color="#B4511E" /> {avg(k).toFixed(1)}</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: '#F2E4D0', overflow: 'hidden', marginTop: 4 }}>
                  <div style={{ width: `${(avg(k) / 5) * 100}%`, height: '100%', background: '#B4511E' }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#5C2A10' }}>Latest suggestions</p>
            {comments.length === 0 ? <p style={{ margin: 0, fontSize: 12.5, color: '#7A3A18' }}>No written suggestions yet.</p> : comments.map((r) => (
              <div key={r.id} style={{ background: '#F2E4D0', borderRadius: 12, padding: '10px 14px' }}>
                <p style={{ margin: 0, fontSize: 12.5, color: '#1A0A00', lineHeight: 1.5 }}>“{r.comment}”</p>
                <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 700, color: '#7A3A18' }}>{new Date(r.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} · overall {r.overall}/5</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default FeedbackResults;
