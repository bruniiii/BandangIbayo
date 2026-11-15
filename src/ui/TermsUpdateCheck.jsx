import { useEffect, useState } from 'react';
import { supabase, currentUser } from '../supabaseClient';
import { toast } from './toast';
import TermsModal from './TermsModal';

// When a newer version of the Terms & Conditions is published (System
// Maintenance → Policies & Content), a joiner who agreed to an older one is
// asked to agree to the new one when they open their dashboard. Closing
// it asks again next time.
const TermsUpdateCheck = () => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const user = await currentUser();
      if (!user) return;
      const [{ data: current }, { data: me }] = await Promise.all([
        supabase.rpc('current_terms_version'),
        supabase.from('profiles').select('terms_version, role').eq('id', user.id).maybeSingle(),
      ]);
      // (Before the 20261229 update there's no version to compare.)
      if (!alive || current == null || !me || me.role === 'admin' || !('terms_version' in me)) return;
      if ((me.terms_version || 0) < current) setShow(true);
    })();
    return () => { alive = false; };
  }, []);

  if (!show) return null;
  const agree = async () => {
    const { error } = await supabase.rpc('accept_current_terms');
    if (error) { toast.error("Couldn't save that", error.message); return; }
    setShow(false);
    toast.success('Thank you', 'You agreed to the updated Terms & Conditions.');
  };
  return <TermsModal updated onClose={() => setShow(false)} onAgree={agree} />;
};

export default TermsUpdateCheck;
