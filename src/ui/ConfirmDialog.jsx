import { createRoot } from 'react-dom/client';
import ConfirmDialogBox from './ConfirmDialogBox';
import { lessMotion } from '../motion';

// ─────────────────────────────────────────────
// CONFIRMATION DIALOG, used instead of the browser's plain OK/Cancel box.
//   const ok = await confirmDialog({
//     title: 'Delete this post?',
//     message: "It can't be undone.",
//     confirmLabel: 'Delete Post',     // says what happens, never "Yes"/"OK"
//     cancelLabel: 'Keep Post',
//     tone: 'danger',                  // red button for destructive actions
//     typeToConfirm: 'archive',        // optional: a word to type before the button works
//     imageUrl, checkLabel,            // optional: a picture to show; a box to tick first
//     reasonLabel,                     // optional: a reason to type; resolves to the text (or false)
//     passwordLabel,                   // optional: a password to type; resolves to it (or false)
//   });
// One primary (or red) button; Cancel is always the lighter secondary button.
// For destructive actions the safe button gets the focus, so Enter doesn't delete.
// ─────────────────────────────────────────────

export const confirmDialog = ({ title, message = '', confirmLabel = 'Continue', cancelLabel = 'Cancel', tone = 'primary', typeToConfirm = '', imageUrl = '', checkLabel = '', reasonLabel = '', passwordLabel = '' }) =>
  new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const previousFocus = document.activeElement;
    let closing = false;
    const close = (result) => {
      if (closing) return;
      closing = true;
      previousFocus?.focus?.();
      resolve(result);
      // The box shrinks away and the backdrop fades out, then it's removed.
      const card = host.querySelector('.paper-card');
      const shade = card?.previousElementSibling;
      const remove = () => { root.unmount(); host.remove(); };
      if (lessMotion() || !card?.animate) { remove(); return; }
      host.style.pointerEvents = 'none';
      shade?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
      card.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.95 }], { duration: 160, easing: 'ease-in', fill: 'forwards' }).finished.then(remove, remove);
    };
    root.render(<ConfirmDialogBox title={title} message={message} confirmLabel={confirmLabel} cancelLabel={cancelLabel} tone={tone} typeToConfirm={typeToConfirm} imageUrl={imageUrl} checkLabel={checkLabel} reasonLabel={reasonLabel} passwordLabel={passwordLabel} onClose={close} />);
  });
