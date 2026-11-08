import { describe, it, expect } from 'vitest';
import { buildDocsMetadata, rootMetadataBase } from '../lib/seo';
import { SITE_URL } from '../lib/sitemap';

describe('rootMetadataBase', () => {
  it('is the production origin, so relative og/twitter image urls resolve there', () => {
    expect(rootMetadataBase().href).toBe(`${SITE_URL}/`);
  });
});

describe('buildDocsMetadata', () => {
  const page = {
    title: 'Receiving webhooks',
    description: 'Get events',
    url: '/docs/webhooks',
    imageUrl: '/og/docs/webhooks/image.png',
  };

  it('keeps title, description and the og image', () => {
    const m = buildDocsMetadata(page);
    expect(m.title).toBe('Receiving webhooks');
    expect(m.description).toBe('Get events');
    expect(m.openGraph?.images).toBe('/og/docs/webhooks/image.png');
  });

  it('sets a canonical on the page url', () => {
    expect(buildDocsMetadata(page).alternates?.canonical).toBe('/docs/webhooks');
  });
});
