import { promises as fs } from 'node:fs';
import { createOpenAPI } from 'fumadocs-openapi/server';
import {
  forwardResource as pyResource,
  forwardJsResource as jsResource,
  forwardMethod as pyMethod,
  forwardJsMethod as jsMethod,
} from '../scripts/lib/sdk-mapping';

const SPEC_KEY = './openapi.json';

const PROD_URL = 'https://api.blueticks.co';
const STAGING_URL = 'https://stg-api.blueticks.co';
const DEV_URL = 'http://localhost:3320';

// Human-readable label for the server-select dropdown.
function describeServer(url: string): string {
  if (url.includes('localhost') || url.includes('127.0.0.1')) return 'Development';
  if (url.includes('stg-')) return 'Staging';
  return 'Production';
}

// Comma-separated list of server URLs the playground exposes.
// Per Netlify context (see netlify.toml):
//   - production deploy → only PROD_URL (one server, modal suppressed)
//   - staging / deploy-preview / branch deploy → PROD_URL,STAGING_URL
//   - local dev (unset) → PROD_URL,STAGING_URL,DEV_URL so dev can switch
//     (DEV_URL = local Feathers API) and test against a running backend
function resolveServers(): Array<{ url: string; description: string }> {
  const csv = process.env.NEXT_PUBLIC_API_SERVERS;
  const urls = csv
    ? csv.split(',').map((s) => s.trim()).filter(Boolean)
    : [PROD_URL, STAGING_URL, DEV_URL];
  return urls.map((url) => ({
    url,
    description: describeServer(url),
  }));
}

export function getResolvedServerCount(): number {
  return resolveServers().length;
}

const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete']);

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
export function buildCodeSamples(verb: string, path: string, op: { requestBody?: unknown }): CodeSample[] {
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

// Every operation documents the same error envelope across 400/401/403/404/
// 422/429/500 — six near-identical accordions per endpoint. Collapse those
// into ONE `default` response (the OpenAPI-idiomatic catch-all) whose schema
// is the shared Error envelope, shown once. The per-status meanings are
// preserved as a markdown table in the description (rendered with GFM), so no
// information is lost — just the repetition. Applies to every operation, so
// every page benefits. We do this only on the in-memory render doc; the
// downloadable public/openapi.json keeps the full per-status list intact.
const ERROR_STATUS = /^[45]\d\d$/;

// Accordion title for the collapsed error response (also the response key in
// the render doc). The bottom example tab relabels this to "Error response"
// via content.renderResponseTabs — see components/mdx.tsx.
export const ERROR_RESPONSE_KEY = 'Error codes';

function collapseErrorResponses(spec: {
  paths?: Record<string, Record<string, { responses?: Record<string, { description?: string; content?: unknown }> }>>;
}): void {
  for (const pathItem of Object.values(spec.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const op of Object.values(pathItem)) {
      const responses = op?.responses;
      if (!responses || typeof responses !== 'object') continue;
      const codes = Object.keys(responses).filter((c) => ERROR_STATUS.test(c)).sort();
      if (codes.length < 2) continue;

      const rows = codes.map(
        (c) => `| \`${c}\` | ${(responses[c].description ?? '').trim().replace(/\.$/, '')} |`,
      );
      const table = ['| Status | Meaning |', '| --- | --- |', ...rows].join('\n');
      // All error responses share the Error schema — reuse the first as the
      // content carrier so the envelope renders exactly once.
      const carrier = responses[codes[0]];
      for (const c of codes) delete responses[c];
      responses[ERROR_RESPONSE_KEY] = {
        description: `Every error response uses the standard error envelope below. Possible statuses:\n\n${table}`,
        content: carrier.content,
      };
    }
  }
}

// Drop the redundant "Value in false" badge on the error envelope's `success`
// field (the description "Always false on error responses." already says it).
// That badge is driven by `enum`, so we swap `enum: [false]` for `const: false`
// — which fumadocs renders with no badge yet still samples to `false`, keeping
// the generated error example correct. Display only: the downloadable
// public/openapi.json keeps the original enum.
function declutterErrorSchema(spec: {
  components?: {
    schemas?: { Error?: { properties?: { success?: { enum?: unknown; const?: unknown } } } };
  };
}): void {
  const success = spec.components?.schemas?.Error?.properties?.success;
  if (success && 'enum' in success) {
    delete success.enum;
    success.const = false;
  }
}

export const openapi = createOpenAPI({
  input: async () => {
    const raw = JSON.parse(await fs.readFile(SPEC_KEY, 'utf8'));
    raw.servers = resolveServers();
    injectCodeSamples(raw);
    collapseErrorResponses(raw);
    declutterErrorSchema(raw);
    return { [SPEC_KEY]: raw };
  },
});
