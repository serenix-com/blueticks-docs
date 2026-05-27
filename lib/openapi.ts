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

// Map (VERB + path) → SDK method name when convention doesn't match.
// Source of truth: sdks/python/src/blueticks/resources/*.py.
// Path params here must use the literal name used in openapi.json
// (e.g. `{contactId}`, `{chat_id}`, `{key}`) for the lookup to hit.
const SDK_METHOD_OVERRIDES: Record<string, string> = {
  'GET /v1/account': 'retrieve',
  'POST /v1/scheduled-messages': 'send',
  'POST /v1/campaigns/{id}/pause': 'pause',
  'POST /v1/campaigns/{id}/resume': 'resume',
  'POST /v1/campaigns/{id}/cancel': 'cancel',
  'POST /v1/webhooks/{id}/rotate-secret': 'rotate_secret',
  'POST /v1/audiences/{id}/contacts': 'append_contacts',
  'PATCH /v1/audiences/{id}/contacts/{contactId}': 'update_contact',
  'DELETE /v1/audiences/{id}/contacts/{contactId}': 'delete_contact',
  'POST /v1/groups/{id}/members': 'add_member',
  'DELETE /v1/groups/{id}/members/me': 'leave',
  'DELETE /v1/groups/{id}/members/{chatId}': 'remove_member',
  'POST /v1/groups/{id}/members/{chatId}/admin': 'promote_admin',
  'DELETE /v1/groups/{id}/members/{chatId}/admin': 'demote_admin',
  'PUT /v1/groups/{id}/picture': 'set_picture',
  'GET /v1/chats/{chat_id}/messages': 'list_messages',
  'GET /v1/chats/{chat_id}/messages/{key}': 'get_message',
  'GET /v1/chats/{chat_id}/messages/{key}/ack': 'get_message_ack',
  'GET /v1/chats/{chat_id}/messages/{key}/media': 'get_media',
  'GET /v1/chats/{chat_id}/messages/{key}/media_url': 'get_media_url',
  'POST /v1/chats/{chat_id}/messages/{key}/reactions': 'react',
  'POST /v1/chats/{chat_id}/messages/load_older': 'load_older_messages',
  'POST /v1/chats/message_acks': 'batch_message_acks',
  'GET /v1/chats/{chat_id}/participants': 'list_participants',
  'POST /v1/chats/{chat_id}/mark_read': 'mark_read',
  'POST /v1/chats/{chat_id}/open': 'open',
};

const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete']);

function pyResource(path: string): string | null {
  const m = path.match(/^\/v1\/([^/]+)/);
  return m ? m[1].replace(/-/g, '_') : null;
}
function jsResource(path: string): string | null {
  const m = path.match(/^\/v1\/([^/]+)/);
  return m ? m[1].replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()) : null;
}
function pyMethod(verb: string, path: string): string | null {
  const key = `${verb} ${path}`;
  if (SDK_METHOD_OVERRIDES[key]) return SDK_METHOD_OVERRIDES[key];
  const m = path.match(/^\/v1\/[^/]+(\/\{[^}]+\})?(\/.+)?$/);
  if (!m) return null;
  if (m[2]) return null; // unmapped sub-resource — emit no sample
  const hasId = !!m[1];
  if (!hasId) {
    if (verb === 'GET') return 'list';
    if (verb === 'POST') return 'create';
    return null;
  }
  return (
    ({ GET: 'get', PATCH: 'update', PUT: 'update', DELETE: 'delete' } as Record<string, string>)[verb] ?? null
  );
}
function jsMethod(verb: string, path: string): string | null {
  const py = pyMethod(verb, path);
  return py ? py.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()) : null;
}
function pyPathArgs(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => `"${m[1]}_01H7..."`);
}
function phpPathArgs(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => `'${m[1]}_01H7...'`);
}

interface CodeSample {
  lang: string;
  label: string;
  source: string;
}
function buildCodeSamples(verb: string, path: string, op: { requestBody?: unknown }): CodeSample[] {
  const out: CodeSample[] = [];
  const py = pyResource(path);
  const js = jsResource(path);
  const mPy = pyMethod(verb, path);
  const mJs = jsMethod(verb, path);
  if (!py || !js || !mPy || !mJs) return out;
  const hasBody = !!op.requestBody;
  const pyArgs = pyPathArgs(path).concat(hasBody ? ['# request body fields…'] : []);
  const phpArgs = phpPathArgs(path).concat(hasBody ? ['/* opts */'] : []);
  const jsArgs = phpPathArgs(path).concat(hasBody ? ['{ /* … */ }'] : []);
  out.push({
    lang: 'python',
    label: 'Python',
    source: [
      'import blueticks',
      '',
      'bt = blueticks.Blueticks(api_key="BLUETICKS_API_KEY")',
      `result = bt.${py}.${mPy}(${pyArgs.length ? '\n    ' + pyArgs.join(',\n    ') + ',\n' : ''})`,
    ].join('\n'),
  });
  out.push({
    lang: 'ts',
    label: 'Node.js',
    source: [
      "import { Blueticks } from 'blueticks';",
      '',
      "const bt = new Blueticks({ apiKey: 'BLUETICKS_API_KEY' });",
      `const result = await bt.${js}.${mJs}(${jsArgs.join(', ')});`,
    ].join('\n'),
  });
  out.push({
    lang: 'php',
    label: 'PHP',
    source: [
      'use Blueticks\\Blueticks;',
      '',
      "$bt = new Blueticks('BLUETICKS_API_KEY');",
      `$result = $bt->${py}->${mJs}(${phpArgs.join(', ')});`,
    ].join('\n'),
  });
  return out;
}

// Walk the spec's operations and attach `x-codeSamples` per operation.
// Replaces fumadocs's default raw-HTTP Python tab with the actual SDK
// call (`bt.account.retrieve()` instead of `requests.get(...)`), and
// adds Node.js / PHP samples that don't exist in the defaults at all.
function injectCodeSamples(spec: { paths?: Record<string, Record<string, { requestBody?: unknown } & Record<string, unknown>>> }): void {
  if (!spec.paths) return;
  for (const [p, pathItem] of Object.entries(spec.paths)) {
    for (const [verb, op] of Object.entries(pathItem)) {
      if (!op || typeof op !== 'object' || !VERBS.has(verb)) continue;
      const samples = buildCodeSamples(verb.toUpperCase(), p, op);
      if (samples.length > 0) {
        (op as Record<string, unknown>)['x-codeSamples'] = samples;
      }
    }
  }
}

export const openapi = createOpenAPI({
  input: async () => {
    const raw = JSON.parse(await fs.readFile(SPEC_KEY, 'utf8'));
    raw.servers = resolveServers();
    injectCodeSamples(raw);
    return { [SPEC_KEY]: raw };
  },
});
