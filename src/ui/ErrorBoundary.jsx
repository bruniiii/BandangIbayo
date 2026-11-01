import React from 'react';
import { logClientError } from '../errorLog';

// When a page crashes while drawing, show a friendly message with a Reload
// button instead of a blank white screen, and save the error for the admins.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    logClientError(Object.assign(new Error(error?.message || String(error)), {
      stack: `${error?.stack || ''}\n--- component ---${info?.componentStack || ''}`,
    }), 'page crashed');
  }

  render() {
    if (!this.state.failed) return this.props.children;
    // An old copy of the site after an update: reloading gets the new one.
    return (
      <div role="alert" style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box',
        background: '#FDF6EE', fontFamily: "'Outfit', 'Inter', system-ui, sans-serif", textAlign: 'center',
      }}>
        <div style={{ maxWidth: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#1A0A00' }}>Something went wrong</h1>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#7A3A18', lineHeight: 1.6 }}>
            This page couldn't load. Reloading usually fixes it. The problem was reported to Bandang IBAYO.
          </p>
          <button type="button" onClick={() => window.location.reload()} style={{
            marginTop: 6, padding: '14px 28px', borderRadius: 999, border: 'none', cursor: 'pointer', background: '#B4511E', color: '#FDF6EE',
            fontFamily: 'inherit', fontWeight: 900, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>Reload</button>
        </div>
      </div>
    );
  }
}
