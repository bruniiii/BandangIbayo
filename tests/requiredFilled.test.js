import { describe, it, expect } from 'vitest';
import { allRequiredFilled } from '../src/ui/useRequiredFilled';

// A tiny stand-in for a <form>: the boxes it holds and the two look-ups the check uses.
const fakeForm = (els) => ({
  querySelectorAll: () => els.filter((e) => e.required),
  querySelector: (sel) => {
    const radio = sel.match(/type="radio"\]\[name="([^"]+)"\]:checked/);
    if (radio) return els.find((e) => e.type === 'radio' && e.name === radio[1] && e.checked) || null;
    const byName = sel.match(/^\[name="([^"]+)"\]$/);
    return byName ? els.find((e) => e.name === byName[1]) || null : null;
  },
});
const box = (props) => ({ type: 'text', value: '', required: true, disabled: false, ...props });

describe('allRequiredFilled', () => {
  it('needs every required box filled', () => {
    expect(allRequiredFilled(fakeForm([box({ name: 'a', value: 'x' }), box({ name: 'b', value: '  ' })]))).toBe(false);
    expect(allRequiredFilled(fakeForm([box({ name: 'a', value: 'x' }), box({ name: 'b', value: 'y' })]))).toBe(true);
  });
  it('skips disabled and hidden boxes', () => {
    expect(allRequiredFilled(fakeForm([box({ name: 'a', disabled: true }), box({ name: 'b', type: 'hidden' })]))).toBe(true);
  });
  it('needs required checkboxes ticked and a radio choice', () => {
    expect(allRequiredFilled(fakeForm([box({ name: 'ok', type: 'checkbox', checked: false })]))).toBe(false);
    expect(allRequiredFilled(fakeForm([box({ name: 'ok', type: 'checkbox', checked: true })]))).toBe(true);
    const r1 = box({ name: 'pick', type: 'radio', checked: false });
    const r2 = box({ name: 'pick', type: 'radio', checked: false });
    expect(allRequiredFilled(fakeForm([r1, r2]))).toBe(false);
    r2.checked = true;
    expect(allRequiredFilled(fakeForm([r1, r2]))).toBe(true);
  });
  it('checks extra boxes by name, and skips names not on the page', () => {
    const form = fakeForm([box({ name: 'street', required: false, value: '' })]);
    expect(allRequiredFilled(form, ['street', 'missing'])).toBe(false);
    expect(allRequiredFilled(fakeForm([box({ name: 'street', required: false, value: 'Rizal St' })]), ['street', 'missing'])).toBe(true);
  });
  it('is false with no form yet', () => {
    expect(allRequiredFilled(null)).toBe(false);
  });
});
