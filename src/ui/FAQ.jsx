import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Frequently asked questions on the landing page (added by Katrina on the
// oliva branch; on the same cream as the sections around it). One answer is
// open at a time.

const faqData = [
  {
    question: 'What is a Joiner Tour?',
    answer: 'A Joiner is a solo traveler or small group who shares a tour package with others—splitting transport and accommodation costs.',
  },
  {
    question: 'How do I book and pay for a tour?',
    answer: 'Browse an available tour, fill out the required details, and pay securely online with GCash, Maya or card to confirm your slot instantly.',
  },
  {
    question: 'Are deposits refundable?',
    answer: 'We follow a non-refundable deposit policy to protect both our travelers and organizers. Please check specific trip terms before booking.',
  },
  {
    question: 'Will I receive a reminder before the trip?',
    answer: 'Yes! An automatic email reminder is sent to you 24 hours before your departure.',
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <section style={{ background: '#FDF6EE', padding: 'clamp(5rem,10vw,8rem) clamp(1.5rem,5vw,4rem)' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#A8481A' }}>FAQ</span>
          <h2 style={{ fontWeight: 900, fontSize: 'clamp(2rem,3.5vw,3rem)', letterSpacing: '-0.03em', color: '#1A0A00', marginTop: 10, marginBottom: 8 }}>
            Frequently Asked Questions
          </h2>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#7A3A18', margin: 0 }}>
            Got questions about joining our tours? We've got answers.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {faqData.map((faq, index) => {
            const open = openIndex === index;
            return (
              <div key={faq.question} style={{
                background: open ? '#FFFFFF' : '#FFFBF6', borderRadius: 18, overflow: 'hidden',
                border: `1px solid ${open ? 'rgba(180,81,30,0.35)' : 'rgba(180,81,30,0.18)'}`,
                boxShadow: open ? '0 10px 28px rgba(26,10,0,0.08)' : '0 2px 10px rgba(26,10,0,0.04)',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}>
                <button
                  type="button"
                  onClick={() => setOpenIndex(open ? null : index)}
                  aria-expanded={open}
                  style={{
                    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
                    padding: '1.1rem 1.4rem', background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', textAlign: 'left', fontSize: 15.5, fontWeight: 800, color: '#1A0A00',
                  }}
                >
                  <span>{faq.question}</span>
                  <span style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: open ? '#B4511E' : 'rgba(180,81,30,0.1)', color: open ? '#FDF6EE' : '#A8481A', transition: 'background 0.2s',
                  }}>
                    <ChevronDown size={16} style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />
                  </span>
                </button>
                {open && (
                  <p style={{ margin: 0, padding: '0 1.4rem 1.25rem', fontSize: 14, lineHeight: 1.7, fontWeight: 500, color: '#7A3A18' }}>
                    {faq.answer}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
