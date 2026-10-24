import { ShieldCheck, X } from 'lucide-react';

// The Terms & Conditions, in a window. Used by registration and Exclusive
// Tours. onAgree is optional: without it only Close is shown.
const TermsModal = ({ onClose, onAgree }) => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      zIndex: 300,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(26,10,0,0.88)',
      backdropFilter: 'blur(6px)',
      padding: 16,
    }}
  >
    <div
      style={{
        position: 'relative',
        background: '#FDF6EE',
        width: '100%',
        maxWidth: 620,
        maxHeight: '85dvh',
        borderRadius: 24,
        boxShadow: '0 32px 80px rgba(26,10,0,0.45)',
        borderTop: '7px solid #B4511E',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          background: '#1A0A00',
          padding: '1.75rem 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              background: '#B4511E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={19} color="#FDF6EE" />
          </div>

          <div>
            <h3
              style={{
                fontSize: 15,
                fontWeight: 900,
                letterSpacing: '0.02em',
                color: '#FDF6EE',
                margin: 0,
              }}
            >
              Terms &amp; Conditions
            </h3>

            <p
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'rgba(232,162,101,0.7)',
                margin: '3px 0 0',
              }}
            >
              Bandang IBAYO Joiner Agreement
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(232,210,190,0.85)',
          }}
        >
          <X size={22} />
        </button>
      </div>

      <div
        style={{
          padding: '1.75rem 2rem',
          overflowY: 'auto',
          flex: 1,
        }}
      >
        <TermsSection title="1. Booking & Payment">
          All bookings are confirmed only after payment is received online
          (GCash, Maya or card), either in full or as a 40% downpayment.
          Exclusive (private) tours are confirmed with a 50% downpayment of
          the package price the agency sends you; the remaining balance can be
          paid online or settled with the agency before the trip. Every joiner is charged the
          full listed tour price regardless of age or status — the platform
          does not offer PWD or senior citizen discounts.
        </TermsSection>

        <TermsSection title="2. Non-Refundable & Cancellation Policy">
          All payments made through the platform are strictly
          non-refundable. Cancellations are not accepted within two (2)
          weeks of the scheduled tour date. This policy protects the
          agency from the financial losses caused by last-minute
          withdrawals, since the cost of shared transport and
          accommodations depends on a fixed number of confirmed
          passengers.
        </TermsSection>

        <TermsSection title="3. Medical Disclaimer">
          Joiner tours may involve physical activity, travel to remote
          areas, and varying difficulty levels. By booking, you confirm
          that you are physically fit to participate and that you have
          disclosed any relevant medical conditions, allergies, or
          limitations to the organizer prior to the trip. Bandang IBAYO
          and its partner organizers are not liable for pre-existing
          health conditions not disclosed at the time of booking.
        </TermsSection>

        <TermsSection title="4. Date Changes (Weather & Safety)">
          A tour date may be moved because of bad weather (such as typhoons
          or heavy rain), road closures, or other safety concerns. When this
          happens, the agency will notify affected joiners as soon as
          possible and help them move to a new date.
        </TermsSection>

        <TermsSection title="5. Tracking & Vehicle Information">
          Estimated Time of Arrival (ETA), driver details, and vehicle
          plate numbers shown on the platform are provided for
          transparency and safety. ETA information is an estimate only
          and does not reflect real-time GPS tracking.
        </TermsSection>

        <TermsSection title="6. Account & Data Privacy">
          Your account information, including your contact details and
          payment records, is stored securely and protected through
          role-based access controls. Information you provide is used
          solely to process your bookings, verify payments, and send
          tour-related reminders and updates.
        </TermsSection>

        <TermsSection title="7. Conduct & Reviews">
          Joiners are expected to conduct themselves respectfully toward
          organizers, drivers, and fellow travelers. Reviews and comments
          posted on tours should reflect genuine experiences and may be
          moderated by the agency to maintain a trustworthy platform for
          future joiners.
        </TermsSection>

        <div
          style={{
            background: 'rgba(180,81,30,0.08)',
            border: '1px solid rgba(180,81,30,0.18)',
            borderRadius: 16,
            padding: '1rem 1.25rem',
            marginTop: 8,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <AlertTriangle
            size={16}
            style={{
              color: '#A8481A',
              flexShrink: 0,
              marginTop: 1,
            }}
          />

          <p
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: '#7A3A18',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            By creating an account, you acknowledge that you have read,
            understood, and agree to be bound by these Terms &amp;
            Conditions and the Medical Disclaimer above for every tour
            you book through Bandang IBAYO.
          </p>
        </div>
      </div>

      <div
        style={{
          padding: '1.25rem 2rem',
          borderTop: '1px solid rgba(180,81,30,0.15)',
          display: 'flex',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: '13px 0',
            background: '#F2E4D0',
            border: '1px solid rgba(180,81,30,0.18)',
            borderRadius: 999,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 900,
            fontSize: 11.5,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#7A3A18',
          }}
        >
          Close
        </button>

        {onAgree && (
        <button
          onClick={onAgree}
          style={{
            flex: 1.4,
            padding: '13px 0',
            background: '#B4511E',
            border: 'none',
            borderRadius: 999,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 900,
            fontSize: 11.5,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#FDF6EE',
            boxShadow: '0 6px 20px rgba(180,81,30,0.35)',
          }}
        >
          I Agree to the Terms
        </button>
        )}
      </div>
    </div>
  </div>
);

const TermsSection = ({ title, children }) => (
  <div style={{ marginBottom: 22 }}>
    <h4
      style={{
        fontSize: 11.5,
        fontWeight: 900,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: '#A8481A',
        margin: '0 0 8px',
      }}
    >
      {title}
    </h4>

    <p
      style={{
        fontSize: 12.5,
        fontWeight: 500,
        color: '#7A3A18',
        lineHeight: 1.7,
        margin: 0,
      }}
    >
      {children}
    </p>
  </div>
);

export default TermsModal;
