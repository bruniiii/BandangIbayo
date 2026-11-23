// The on/off switch used in System Maintenance.
const Toggle = ({ on, onChange, disabled, label: text }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={text} disabled={disabled} onClick={() => onChange(!on)} style={{
    width: 52, height: 30, borderRadius: 999, border: 'none', padding: 3, cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
    background: on ? '#2E9B5F' : '#C9B8A6', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', transition: 'background 0.15s', opacity: disabled ? 0.6 : 1,
  }}>
    <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--ib-surface, #FFFDF9)', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }} />
  </button>
);

export default Toggle;
