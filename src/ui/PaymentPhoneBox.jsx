import { useEffect, useRef, useState } from 'react';
import { Phone, CreditCard } from 'lucide-react';
import { phoneFieldProps } from './phoneField';
import { paymongoPhone, formatPhPhone } from '../validation';
import { primaryBtn, secondaryBtn, COLORS } from './buttons';
import { toast } from './toast';

// ─────────────────────────────────────────────
// The contact number checked right before PayMongo checkout. It must be a
// Philippine mobile number: +63 and exactly 10 digits, the first a 9. The
// field only takes digits (10 after +63). Resolves to "+639XXXXXXXXX", or
// null when the joiner cancels.
// ─────────────────────────────────────────────

const PaymentPhoneBox = ({ initial, onClose }) => {
  const [value, setValue] = useState(formatPhPhone(initial || ''));
  const [problem, setProblem] = useState('');
  const inputRef = useRef(null);
  // All 10 digits after +63 typed in (the check on submit says if it's not a mobile number).
  const complete = String(value).replace(/\D/g, '').replace(/^63/, '').length >= 10;
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (e) => {
    e.preventDefault();
    const clean = paymongoPhone(value);
    if (!clean) {
      const msg = 'Enter a Philippine mobile number: +63 followed by 10 digits starting with 9, like +63 917 123 4567.';
      setProblem(msg);
      toast.error("That contact number can't be used for payment", msg);
      return;
    }
    onClose(clean);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={() => onClose(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.6)', backdropFilter: 'blur(3px)' }} />
      <form role="dialog" aria-modal="true" aria-labelledby="pay-phone-title" onSubmit={submit} noValidate style={{
        position: 'relative', width: '100%', maxWidth: 420, background: COLORS.cream, borderRadius: 22, padding: '1.6rem',
        boxShadow: '0 24px 60px rgba(26,10,0,0.35)', borderTop: `6px solid ${COLORS.primary}`,
      }}>
        <h2 id="pay-phone-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 17, color: '#1A0A00' }}>
          <Phone size={18} style={{ color: '#A8481A' }} /> Your contact number
        </h2>
        <p style={{ margin: '6px 0 14px', fontSize: 12.5, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5 }}>
          PayMongo uses this number for your payment. It must be a Philippine mobile number (+63 9XX XXX XXXX).
        </p>
        <input
          ref={inputRef}
          {...phoneFieldProps(value, (v) => { setValue(v); setProblem(''); })}
          aria-label="Contact number for payment"
          aria-invalid={!!problem}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, fontFamily: 'inherit', fontSize: 16, fontWeight: 700,
            color: '#1A0A00', background: '#FFFDF9', outline: 'none', border: `1px solid ${problem ? '#8C2F1C' : 'rgba(180,81,30,0.25)'}`,
          }}
        />
        {problem && <p role="alert" style={{ margin: '6px 2px 0', fontSize: 12, fontWeight: 800, color: '#8C2F1C' }}>{problem}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => onClose(null)} style={{ ...secondaryBtn(), flex: '1 1 120px' }}>Cancel</button>
          <button type="submit" disabled={!complete} title={complete ? undefined : 'Type the whole number first (10 digits after +63)'} style={{ ...primaryBtn(!complete), flex: '2 1 160px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <CreditCard size={15} /> Continue to Payment
          </button>
        </div>
      </form>
    </div>
  );
};

export default PaymentPhoneBox;
