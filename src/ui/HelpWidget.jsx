import { useEffect, useState } from 'react';
import { HelpCircle, X, ChevronDown, UserPlus, Compass, CreditCard, Backpack, QrCode, Star } from 'lucide-react';

// Where "Message us on Facebook" goes. For testing this is a personal profile;
// swap in the Bandang IBAYO Facebook page when it's ready.
const FACEBOOK_URL = 'https://www.facebook.com/isabellalouise.sabado.5';

// The Facebook "f" logo (lucide has no brand icons).
const FacebookIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
  </svg>
);

// ─────────────────────────────────────────────
// HELP BUTTON (landing page): a floating button at the bottom-right that
// opens the joiner FAQ and a step-by-step guide to using the site.
// ─────────────────────────────────────────────

const FAQS = [
  {
    q: 'What is a joiner tour?',
    a: 'You join a group tour with other travelers and share the van, guide and other costs, so the trip costs less than going alone.',
  },
  {
    q: 'How do I create an account?',
    a: 'Tap Join Now, fill in your details and click Register. We email you a 6-digit code; enter it and your account is ready. Any email address works.',
  },
  {
    q: 'How do I book a tour?',
    a: 'Open a tour, pick a date and your pickup point, choose how many people are coming (add their names and numbers), then pay online. Your slots are held for 30 minutes while you pay.',
  },
  {
    q: 'How can I pay? Can I pay a downpayment?',
    a: 'Pay online with GCash, Maya, card or GrabPay. You can pay in full or a 40% downpayment. The rest can be paid online from My Bookings or on the day of the tour.',
  },
  {
    q: 'Can I cancel or move my booking?',
    a: 'You can request a cancellation up to 14 days before the tour. Bandang IBAYO approves it within 12 hours. Payments are non-refundable. If the same trip runs on another date, you can move your booking there instead and your payment carries over.',
  },
  {
    q: 'What if the tour is full?',
    a: "Join the waitlist on that tour. If a slot opens, we'll notify and email you. Slots go to whoever books first.",
  },
  {
    q: 'What if the weather is bad?',
    a: 'A tour date may be moved because of bad weather, road closures or other safety concerns. We will notify you right away and help you pick a new date.',
  },
  {
    q: 'Where will I be picked up?',
    a: 'When you book, choose your pickup point from the list for that tour. You can see it in My Bookings, on your receipt, and on the Day trip card; pickup times are under Tracking.',
  },
  {
    q: 'What do I need on the day of the tour?',
    a: 'Your check-in QR (My Bookings → View Details, or the Day trip card). Show it to the coordinator. You can follow the van and see pickup times under Tracking.',
  },
  {
    q: 'Can I talk to the other joiners?',
    a: 'Yes. Once your payment is confirmed, you join the Group Chat for your tour with the other joiners and the Bandang IBAYO team.',
  },
  {
    q: 'Can I book a private trip for my group?',
    a: 'Yes. Use Exclusive Tours to request a private trip. We send you a package and price, and you confirm it with a 50% downpayment.',
  },
  {
    q: 'I forgot my password. What do I do?',
    a: 'On the login page, tap "Forgot password?" and enter your email. We send you a link to set a new password.',
  },
];

const GUIDE = [
  { Icon: UserPlus, title: 'Create your account', points: ['Tap Join Now and fill in your details.', 'Enter the 6-digit code we email you.', 'Log in with your username or email.'] },
  { Icon: Compass, title: 'Find a tour', points: ['Open Explore Tours, or use the Calendar to see tours by date.', 'Filter by month, price or trip length.', 'Tap a tour to see the itinerary, inclusions and things to bring.'] },
  { Icon: CreditCard, title: 'Book and pay', points: ['Pick a date, your pickup point and how many people are coming.', 'Choose full payment or a 40% downpayment.', 'Pay with GCash, Maya, card or GrabPay. Your receipt is in My Bookings.'] },
  { Icon: Backpack, title: 'Get ready', points: ['We remind you the evening before, with the meeting time and pickup point.', 'Tick off your packing list in My Bookings.', 'Chat with your group in Group Chat.'] },
  { Icon: QrCode, title: 'On tour day', points: ['Show your check-in QR to the coordinator.', 'Follow the van and pickup times under Tracking.', 'Pay any remaining balance if you haven\'t yet.'] },
  { Icon: Star, title: 'After the trip', points: ['Rate your trip and share photos in Reviews.', 'Book your next adventure!'] },
];

// zIndex: above the page but, in the dashboard, below the menu and pop-ups.
const HelpWidget = ({ zIndex = 600 }) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('faq');
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Help for joiners"
          className="help-widget-panel"
          style={{
            position: 'fixed', zIndex, right: 20, bottom: 92,
            width: 380, maxWidth: 'calc(100vw - 24px)', height: 'min(620px, calc(100dvh - 120px))',
            background: '#FDF6EE', borderRadius: 22, border: '1px solid rgba(180,81,30,0.18)',
            boxShadow: '0 24px 60px rgba(26,10,0,0.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          <div style={{ background: '#1A0A00', color: '#FDF6EE', padding: '16px 18px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#E8A265', margin: 0 }}>Help for joiners</p>
                <p style={{ fontSize: 16, fontWeight: 900, margin: '2px 0 0' }}>How can we help?</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close help" style={{ background: 'rgba(253,246,238,0.12)', border: 'none', color: '#FDF6EE', width: 36, height: 36, borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} />
              </button>
            </div>
            <div role="tablist" style={{ display: 'flex', gap: 6, marginTop: 14, background: 'rgba(253,246,238,0.08)', padding: 4, borderRadius: 12 }}>
              {[['faq', 'FAQ'], ['guide', 'User Guide']].map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} style={{
                  flex: 1, border: 'none', borderRadius: 9, padding: '8px 0', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase',
                  background: tab === key ? '#B4511E' : 'transparent', color: tab === key ? '#FDF6EE' : 'rgba(232,210,190,0.85)',
                }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '14px 14px 10px' }}>
            {tab === 'faq' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {FAQS.map((f, i) => {
                  const isOpen = openFaq === i;
                  return (
                    <div key={f.q} style={{ background: isOpen ? '#FFF' : '#FFFBF6', borderRadius: 14, border: `1px solid ${isOpen ? 'rgba(180,81,30,0.35)' : 'rgba(180,81,30,0.15)'}` }}>
                      <button type="button" onClick={() => setOpenFaq(isOpen ? null : i)} aria-expanded={isOpen} style={{
                        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                        padding: '11px 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        textAlign: 'left', fontSize: 13.5, fontWeight: 800, color: '#1A0A00',
                      }}>
                        <span>{f.q}</span>
                        <ChevronDown size={16} style={{ color: '#A8481A', flexShrink: 0, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                      </button>
                      {isOpen && <p style={{ margin: 0, padding: '0 12px 12px', fontSize: 13, lineHeight: 1.6, fontWeight: 500, color: '#7A3A18' }}>{f.a}</p>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {GUIDE.map((step, i) => (
                  <li key={step.title} style={{ display: 'flex', gap: 12, background: '#FFFBF6', border: '1px solid rgba(180,81,30,0.15)', borderRadius: 14, padding: '12px 12px' }}>
                    <span style={{ width: 36, height: 36, borderRadius: 12, background: '#B4511E', color: '#FDF6EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <step.Icon size={17} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 900, color: '#1A0A00', margin: '0 0 4px' }}>
                        <span style={{ color: '#A8481A' }}>Step {i + 1}.</span> {step.title}
                      </p>
                      <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'disc', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {step.points.map((p) => <li key={p} style={{ fontSize: 12.5, lineHeight: 1.5, fontWeight: 500, color: '#7A3A18' }}>{p}</li>)}
                      </ul>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div style={{ padding: '10px 14px 14px', borderTop: '1px solid rgba(180,81,30,0.12)', textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: '#7A3A18' }}>Still have questions? Chat with us right away.</p>
            <a
              href={FACEBOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44,
                borderRadius: 14, background: '#1877F2', color: '#FFF', textDecoration: 'none',
                fontSize: 13, fontWeight: 900, letterSpacing: '0.04em',
              }}
            >
              <FacebookIcon size={18} /> Message us on Facebook
            </a>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Close help' : 'Help: FAQ and user guide'}
        className="help-widget-button"
        style={{
          position: 'fixed', zIndex, right: 20, bottom: 20, height: 58, minWidth: 58, padding: '0 20px 0 16px',
          borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          background: '#B4511E', color: '#FDF6EE', boxShadow: '0 12px 30px rgba(180,81,30,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontSize: 13, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase',
        }}
      >
        {open ? <X size={22} /> : <HelpCircle size={22} />}
        <span className="help-widget-label">{open ? 'Close' : 'Help'}</span>
      </button>
    </>
  );
};

export default HelpWidget;
