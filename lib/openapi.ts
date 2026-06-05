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
