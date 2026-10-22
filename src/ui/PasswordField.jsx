import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

// Password box with an eye button that shows or hides what's typed.
// Takes the same props as an <input> (name, placeholder, style, onChange…).
const PasswordField = ({ style, ...props }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input {...props} type={visible ? 'text' : 'password'} style={{ ...style, paddingRight: 46 }} />
      <button
        type="button"
        className="no-touch-size"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        title={visible ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#7A3A18',
        }}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
};

export default PasswordField;
