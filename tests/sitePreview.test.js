import { describe, it, expect } from 'vitest';
import { sitePreviewHtml, DEFAULT_PREVIEW } from '../api/site-preview.js';

describe('site link preview', () => {
  it('uses the usual preview when nothing is saved', () => {
    const html = sitePreviewHtml('/', {});
    expect(html).toContain(`content="${DEFAULT_PREVIEW.title.replace('·', '·')}"`);
    expect(html).toContain(DEFAULT_PREVIEW.image_url);
    expect(html).toContain('og:url" content="https://www.bandangibayo.website/"');
  });
  it('shows the saved title, text and photo, escaped', () => {
    const html = sitePreviewHtml('/tours', { title: 'Summer <promo> "now"', description: 'Book & go', image_url: 'https://x.supabase.co/a.jpg' });
    expect(html).toContain('Summer &lt;promo&gt; &quot;now&quot;');
    expect(html).toContain('Book &amp; go');
    expect(html).toContain('og:image" content="https://x.supabase.co/a.jpg"');
    expect(html).toContain('https://www.bandangibayo.website/tours');
  });
  it('ignores a photo that is not https and odd paths', () => {
    const html = sitePreviewHtml('/evil"path', { image_url: 'javascript:alert(1)' });
    expect(html).not.toContain('javascript:');
    expect(html).toContain('og:url" content="https://www.bandangibayo.website/"');
  });
});
