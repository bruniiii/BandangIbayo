import { useEffect } from 'react';
import { toast } from './toast';

// Forms that show their error under the button also pop it up, so it isn't missed.
export const usePopupError = (text, title = 'Something went wrong') => {
  useEffect(() => {
    if (text) toast.error(title, text, { id: `form-error:${title}` });
  }, [text, title]);
};
