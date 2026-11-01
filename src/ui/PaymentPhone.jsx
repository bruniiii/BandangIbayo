import { createRoot } from 'react-dom/client';
import PaymentPhoneBox from './PaymentPhoneBox';

// Asks for (and checks) the contact number right before PayMongo checkout.
// Resolves to "+639XXXXXXXXX", or null when the joiner cancels.
export const askPaymentPhone = (initial) =>
  new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const close = (result) => { root.unmount(); host.remove(); resolve(result); };
    root.render(<PaymentPhoneBox initial={initial} onClose={close} />);
  });
