import { describe, it, expect } from 'vitest';
import { buildSitemapEntries, buildRobots, SITE_URL } from '../lib/sitemap';

describe('buildSitemapEntries', () => {
  it('maps page urls to absolute urls, home first, sorted, de-duplicated', () => {
    const out = buildSitemapEntries([
      { url: '/docs/webhooks', slugs: ['webhooks'] },
      { url: '/docs', slugs: [] },
      { url: '/docs/webhooks', slugs: ['webhooks'] },
      { url: '/docs/api/uploads', slugs: ['api', 'uploads'] },
    ]);
    expect(out.map((e) => e.url)).toEqual([
      `${SITE_URL}/`,
      `${SITE_URL}/docs`,
      `${SITE_URL}/docs/api/uploads`,
      `${SITE_URL}/docs/webhooks`,
    ]);
  });

  it('leaves out the debug-gated suno reference pages', () => {
    const out = buildSitemapEntries([
      { url: '/docs/api/suno/generate', slugs: ['api', 'suno', 'generate'] },
      { url: '/docs/api/messages/send-message', slugs: ['api', 'messages', 'send-message'] },
    ]);
    expect(out.map((e) => e.url)).toEqual([
      `${SITE_URL}/`,
      `${SITE_URL}/docs/api/messages/send-message`,
    ]);
  });
});

describe('buildRobots', () => {
  it('allows crawling, blocks only the /api/ route handlers, and points at the sitemap', () => {
    const r = buildRobots();
    expect(r.rules).toEqual([{ userAgent: '*', allow: '/', disallow: '/api/' }]);
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});
