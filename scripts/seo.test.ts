import { describe, it, expect } from 'vitest';
import { buildDocsMetadata, buildRootMetadata, buildHomeMetadata, rootMetadataBase } from '../lib/seo';
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

describe('buildRootMetadata', () => {
  const m = buildRootMetadata();

  it('resolves relative urls against the production origin', () => {
    expect(String(m.metadataBase)).toBe(`${SITE_URL}/`);
  });

  it('gives every page a branded title and the home page a default one', () => {
    expect(m.title).toEqual({
      default: 'Blueticks API docs',
      template: '%s | Blueticks API',
    });
  });

  it('has a site-wide description without em-dashes', () => {
    expect(typeof m.description).toBe('string');
    expect((m.description as string).length).toBeGreaterThan(50);
    expect(m.description).not.toContain('\u2014');
  });
});

describe('buildHomeMetadata', () => {
  it('canonicalises the home page to /', () => {
    expect(buildHomeMetadata().alternates?.canonical).toBe('/');
  });
});
