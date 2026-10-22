import { Check, X } from 'lucide-react';
import { PASSWORD_RULES } from './passwordPolicy';

// Live list of the password rules, ticked off as the joiner types.
const PasswordChecklist = ({ password }) => (
  <ul aria-label="Password requirements" style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 3 }}>
    {PASSWORD_RULES.map((rule) => {
      const ok = rule.test(password || '');
      return (
        <li key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: ok ? '#3F5D62' : '#8C2F1C' }}>
          {ok ? <Check size={12} /> : <X size={12} />} {rule.label}
        </li>
      );
    })}
  </ul>
);

export default PasswordChecklist;
