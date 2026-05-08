import { promises as fs } from 'node:fs';
import { createOpenAPI } from 'fumadocs-openapi/server';

const SPEC_KEY = './openapi.json';

const PROD_URL = 'https://api.blueticks.co';
const STAGING_URL = 'https://stg-api.blueticks.co';

// Comma-separated list of server URLs the playground exposes.
// Per Netlify context (see netlify.toml):
//   - production deploy → only PROD_URL (one server, modal suppressed)
//   - staging / deploy-preview / branch deploy → PROD_URL,STAGING_URL
//   - local dev (unset) → PROD_URL,STAGING_URL so dev can switch
function resolveServers(): Array<{ url: string; description: string }> {
  const csv = process.env.NEXT_PUBLIC_API_SERVERS;
  const urls = csv
    ? csv.split(',').map((s) => s.trim()).filter(Boolean)
    : [PROD_URL, STAGING_URL];
  return urls.map((url) => ({
    url,
    description: url.includes('stg-') ? 'Staging' : 'Production',
  }));
}

export function getResolvedServerCount(): number {
  return resolveServers().length;
}

export const openapi = createOpenAPI({
  input: async () => {
    const raw = JSON.parse(await fs.readFile(SPEC_KEY, 'utf8'));
    raw.servers = resolveServers();
    return { [SPEC_KEY]: raw };
  },
});
