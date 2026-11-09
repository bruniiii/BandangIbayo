import { confirmDialog } from './ConfirmDialog';

// Before a profile photo is used: show it and ask the person to confirm it
// follows the rules. Resolves true to use it, false to pick another.
export const PHOTO_RULES = 'Use a clear photo of yourself. No nudity, violence, offensive or copyrighted images. Admins can remove photos that break these rules.';

export const confirmPhoto = (file) => {
  const url = URL.createObjectURL(file);
  return confirmDialog({
    title: 'Use this as your profile photo?',
    message: PHOTO_RULES,
    imageUrl: url,
    checkLabel: 'This photo is appropriate and follows the rules above.',
    confirmLabel: 'Use Photo',
    cancelLabel: 'Choose Another',
  }).finally(() => URL.revokeObjectURL(url));
};
