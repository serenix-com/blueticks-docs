export const SITE_URL = 'https://dev.blueticks.co';

export interface SitemapPage {
  url: string;
  slugs: readonly string[];
}

export interface SitemapEntry {
  url: string;
}

export interface RobotsConfig {
  rules: { userAgent: string; allow: string; disallow: string }[];
  sitemap: string;
}

/** Suno reference pages are debug-gated in the UI, so they stay out of the sitemap. */
function isHidden(page: SitemapPage): boolean {
  return page.slugs[0] === 'api' && page.slugs[1] === 'suno';
}

/** Home page first, then every public docs page as an absolute url, sorted and unique. */
export function buildSitemapEntries(pages: readonly SitemapPage[]): SitemapEntry[] {
  const urls = new Set<string>();
  for (const page of pages) {
    if (isHidden(page)) continue;
    urls.add(`${SITE_URL}${page.url}`);
  }
  const home = SITE_URL;
  const rest = [...urls].filter((u) => u !== home).sort();
  return [home, ...rest].map((url) => ({ url }));
}

export function buildRobots(): RobotsConfig {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: '/api/' }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
