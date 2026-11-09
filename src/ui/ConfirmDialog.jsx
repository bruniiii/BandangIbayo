import { createRoot } from 'react-dom/client';
import ConfirmDialogBox from './ConfirmDialogBox';

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
    const close = (result) => {
      root.unmount();
      host.remove();
      previousFocus?.focus?.();
      resolve(result);
    };
    root.render(<ConfirmDialogBox title={title} message={message} confirmLabel={confirmLabel} cancelLabel={cancelLabel} tone={tone} typeToConfirm={typeToConfirm} imageUrl={imageUrl} checkLabel={checkLabel} reasonLabel={reasonLabel} passwordLabel={passwordLabel} onClose={close} />);
  });
