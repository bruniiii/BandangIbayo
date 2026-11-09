import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';

// Saves the tour form's current details as a template (asks for its name).
export const saveTourTemplate = async (data, suggestedName = '') => {
  const name = await confirmDialog({
    title: 'Save as a template',
    message: `Name this pre-made tour (e.g. the place: "${suggestedName || 'Baguio'}"). Next time you create a tour, pick it and tick what you need. A template with the same name is replaced.`,
    reasonLabel: 'Template name',
    confirmLabel: 'Save Template', cancelLabel: 'Cancel',
  });
  if (!name) return false;
  const clean = name.trim().slice(0, 80);
  const { data: existing } = await supabase.from('tour_templates').select('id').ilike('name', clean.replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle();
  const row = { name: clean, data, updated_at: new Date().toISOString() };
  const { error } = existing
    ? await supabase.from('tour_templates').update(row).eq('id', existing.id)
    : await supabase.from('tour_templates').insert([row]);
  if (error) { toast.error("Couldn't save the template", error.message); return false; }
  toast.success('Template saved', `"${clean}" is ready. Use it from Create New Tour.`);
  return true;
};
