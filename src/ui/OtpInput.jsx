import { useRef } from 'react';

// ─────────────────────────────────────────────
// ONE-TIME CODE: one box per digit. Typing moves to the next box, Backspace
// goes back, and pasting a whole code (or the phone's "From Messages/Mail"
// suggestion) fills every box at once.
// ─────────────────────────────────────────────

const OtpInput = ({ length = 6, value, onChange, invalid = false, disabled = false, autoFocus = false, describedBy }) => {
  const refs = useRef([]);
  const digits = Array.from({ length }, (_, i) => value[i] || '');

  const setAt = (index, digit) => {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join('').slice(0, length));
  };

  const fill = (text, from = 0) => {
    const clean = text.replace(/\D/g, '').slice(0, length - from);
    if (!clean) return;
    const next = digits.slice();
    clean.split('').forEach((d, i) => { next[from + i] = d; });
    onChange(next.join(''));
    refs.current[Math.min(from + clean.length, length - 1)]?.focus();
  };

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) { e.preventDefault(); setAt(i - 1, ''); refs.current[i - 1]?.focus(); }
    else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus();
  };

  const border = invalid ? '#A9474E' : 'rgba(181,81,27,0.3)';
  return (
    <div role="group" aria-label="Verification code" aria-describedby={describedBy} style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          aria-label={`Digit ${i + 1} of ${length}`}
          aria-invalid={invalid}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          value={d}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => { e.preventDefault(); fill(e.clipboardData.getData('text'), i); }}
          onChange={(e) => {
            const typed = e.target.value.replace(/\D/g, '');
            if (!typed) { setAt(i, ''); return; }
            if (typed.length > 1) { fill(typed, i); return; }   // autofill of the whole code
            setAt(i, typed);
            refs.current[i + 1]?.focus();
          }}
          style={{
            width: 'min(48px, 13vw)', height: 56, textAlign: 'center', fontSize: 24, fontWeight: 900,
            color: '#0E0F0B', background: invalid ? 'rgba(169,71,78,0.04)' : '#FFFFFF',
            border: `1.5px solid ${border}`, borderRadius: 12, outline: 'none', fontFamily: 'inherit', padding: 0,
          }}
        />
      ))}
    </div>
  );
};

export default OtpInput;
