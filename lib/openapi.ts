import { promises as fs } from 'node:fs';
import { createOpenAPI } from 'fumadocs-openapi/server';
import { resolveSampleCall, type SdkLang } from '../scripts/lib/sdk-mapping';

const SPEC_KEY = './openapi.json';

const PROD_URL = 'https://api.blueticks.co';
const STAGING_URL = 'https://stg-api.blueticks.co';
const DEV_URL = 'http://localhost:3310';

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

function pathParams(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}

interface CodeSample {
  lang: string;
  label: string;
  source: string;
}

// Render one SDK call snippet for a language. Path params become positional
// placeholder args; a request body becomes a trailing placeholder. Resolution
// (resource/method/callable, including per-language divergence) comes from
// scripts/lib/sdk-mapping.ts so the snippet matches the real SDK surface.
function renderSample(
  lang: SdkLang,
  verb: string,
  path: string,
  hasBody: boolean,
): CodeSample | null {
  const call = resolveSampleCall(lang, verb, path);
  if (!call) return null;
  const params = pathParams(path);

  if (lang === 'python') {
    const args = params.map((p) => `"${p}_01H7..."`).concat(hasBody ? ['# request body fields…'] : []);
    const target = call.callable ? `bt.${call.resource}` : `bt.${call.resource}.${call.method}`;
    return {
      lang: 'python',
      label: 'Python',
      source: [
        'import blueticks',
        '',
        'bt = blueticks.Blueticks(api_key="BLUETICKS_API_KEY")',
        `result = ${target}(${args.length ? '\n    ' + args.join(',\n    ') + ',\n' : ''})`,
      ].join('\n'),
    };
  }

  if (lang === 'node') {
    const args = params.map((p) => `'${p}_01H7...'`).concat(hasBody ? ['{ /* … */ }'] : []);
    const target = call.callable ? `bt.${call.resource}` : `bt.${call.resource}.${call.method}`;
    return {
      lang: 'ts',
      label: 'Node.js',
      source: [
        "import { Blueticks } from 'blueticks';",
        '',
        "const bt = new Blueticks({ apiKey: 'BLUETICKS_API_KEY' });",
        `const result = await ${target}(${args.join(', ')});`,
      ].join('\n'),
    };
  }

  if (lang === 'php') {
    const args = params.map((p) => `'${p}_01H7...'`).concat(hasBody ? ['/* opts */'] : []);
    const target = call.callable ? `$bt->${call.resource}` : `$bt->${call.resource}->${call.method}`;
    return {
      lang: 'php',
      label: 'PHP',
      source: [
        'use Blueticks\\Blueticks;',
        '',
        "$bt = new Blueticks(['apiKey' => 'BLUETICKS_API_KEY']);",
        `$result = ${target}(${args.join(', ')});`,
      ].join('\n'),
    };
  }

  if (lang === 'ruby') {
    const args = params.map((p) => `"${p}_01H7..."`).concat(hasBody ? ['# request body fields…'] : []);
    const target = call.callable ? `client.${call.resource}` : `client.${call.resource}.${call.method}`;
    return {
      lang: 'ruby',
      label: 'Ruby',
      source: [
        'require "blueticks"',
        '',
        'client = Blueticks::Client.new(api_key: "BLUETICKS_API_KEY")',
        `result = ${target}(${args.length ? '\n  ' + args.join(',\n  ') + ',\n' : ''})`,
      ].join('\n'),
    };
  }

  // Go — PascalCase resources/methods, ctx first, typed params struct.
  const args = ['context.Background()']
    .concat(params.map((p) => `"${p}_01H7..."`))
    .concat(hasBody ? ['params'] : []);
  const target = call.callable ? `client.${call.resource}` : `client.${call.resource}.${call.method}`;
  return {
    lang: 'go',
    label: 'Go',
    source: [
      'import (',
      '\t"context"',
      '',
      '\tblueticks "github.com/serenix-com/blueticks-go"',
      ')',
      '',
      'client, _ := blueticks.NewClient(blueticks.WithAPIKey("BLUETICKS_API_KEY"))',
      `result, _ := ${target}(${args.join(', ')})`,
    ].join('\n'),
  };
}

export function buildCodeSamples(verb: string, path: string, op: { requestBody?: unknown }): CodeSample[] {
  const hasBody = !!op.requestBody;
  const langs: SdkLang[] = ['python', 'node', 'php', 'ruby', 'go'];
  return langs
    .map((lang) => renderSample(lang, verb, path, hasBody))
    .filter((s): s is CodeSample => s !== null);
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

// Render query parameters in a consistent order on every endpoint: filters
// first (most useful first), pagination (skip/limit) always last. Params not
// named here keep their original relative order in the middle. This mirrors the
// same normalization the backend applies when it builds openapi.json
// (backend/src/services/api/v1/lib/openapi-emit.ts → reorderQueryParameters),
// so the committed spec and the rendered docs agree; doing it here too means
// the docs stay consistent even if a spec is regenerated without that pass.
const QUERY_PARAM_ORDER: Record<string, number> = {
  // Filters — most important first
  chatId: 10,
  searchToken: 20,
  status: 30,
  // Pagination — always last
  skip: 900,
  limit: 910,
};
const DEFAULT_QUERY_PARAM_RANK = 500;

function reorderQueryParameters(spec: {
  paths?: Record<string, Record<string, { parameters?: Array<{ in?: string; name?: string }> }>>;
}): void {
  const rankOf = (p: { name?: string }) =>
    QUERY_PARAM_ORDER[p.name ?? ''] ?? DEFAULT_QUERY_PARAM_RANK;
  for (const pathItem of Object.values(spec.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const op of Object.values(pathItem)) {
      const params = op?.parameters;
      if (!Array.isArray(params) || params.length < 2) continue;
      if (!params.some((p) => p.in === 'query')) continue;
      // Stable sort of the query entries only; path/header params stay put.
      const sortedQuery = params
        .map((param, idx) => ({ param, idx }))
        .filter((e) => e.param.in === 'query')
        .sort((a, b) => rankOf(a.param) - rankOf(b.param) || a.idx - b.idx)
        .map((e) => e.param);
      let qi = 0;
      for (let i = 0; i < params.length; i++) {
        if (params[i].in === 'query') params[i] = sortedQuery[qi++];
      }
    }
  }
}

// Two playground-seed problems solved together, both rooted in how fumadocs
// seeds the "Try it" form from `getRequestData` (ui/operation/get-example-requests):
//
//   1. "string" prefill — a REQUIRED field with no example is seeded with
//      `sample(schema)`, which returns the literal "string" (path params, and
//      required body fields like newsletters `name`). We want an empty box that
//      shows the "Enter value" placeholder instead.
//   2. Optional params/fields are SENT by default — fumadocs marks a field
//      "active" (included in the request) whenever its seeded value is not
//      `undefined` (inputs.js: `isDefined = value !== undefined`; the ✕ button
//      just `delete`s the key). A field left UNSEEDED defaults to inactive /
//      opt-in (the user clicks to add it). So optional params must NOT be seeded.
//
// Therefore: seed ONLY required fields, with an empty value (clears "string",
// keeps them active), and leave every optional field unseeded so it defaults to
// "not sent". `sample(schema,{skipNonRequired:true})` already omits optional body
// props, so we only need to blank the required ones.
//
//   • params  → set `example: ''` on REQUIRED path/query params only (pickExample
//     wins over the sample() fallback → empty, active). Optional params untouched
//     → inactive.
//   • body    → on uncurated json bodies, set `example: ''` on each REQUIRED
//     *string* property (skip enums/selects) so it seeds empty+active; optional
//     props stay omitted → inactive.
//
// Curated examples (create-group / create-audience / create-webhook, which carry
// an `examples` map) keep their example entries, but we blank the free-text
// `text` field of the DEFAULT (first) example so the playground's text box opens
// EMPTY (placeholder) rather than pre-filled with a canned message. fumadocs
// seeds the form from the first example's `value` (get-example-requests:
// `result.body = examples[firstKey].value`) and always auto-selects
// `examples.at(0)`, so a pre-filled "Hello from Blueticks!" both looked like a
// prefilled value (not a placeholder) AND was a live-send footgun in the "Try
// it" panel. The displayed code snippets come from `x-codeSamples` (injected
// above) and are independent of the examples map, so they are unaffected; the
// other example entries (link / poll / media / reply) are left intact so
// selecting them still populates the form. Display-only: the downloadable
// public/openapi.json keeps its original form.
function stripSampleSeeds(spec: {
  paths?: Record<string, Record<string, {
    parameters?: Array<{ in?: string; required?: boolean; example?: unknown; examples?: unknown }>;
    requestBody?: {
      content?: Record<string, {
        schema?: { properties?: Record<string, { type?: unknown; enum?: unknown; example?: unknown; default?: unknown }>; required?: unknown };
        example?: unknown;
        examples?: Record<string, { value?: Record<string, unknown> }>;
      }>
    };
  }>>;
}): void {
  for (const pathItem of Object.values(spec.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const op of Object.values(pathItem)) {
      if (!op || typeof op !== 'object') continue;

      // Params: seed only the required ones (clears "string"); optional params
      // stay unseeded so they default to inactive / opt-in.
      for (const param of op.parameters ?? []) {
        if ((param.in === 'path' || param.in === 'query') && param.required === true &&
          param.example === undefined && param.examples === undefined) {
          param.example = '';
        }
      }

      // Body: blank required string props on uncurated bodies; leave optional
      // props unseeded (sample omits them → inactive).
      for (const media of Object.values(op.requestBody?.content ?? {})) {
        if (!media || typeof media !== 'object') continue;

        // Curated body (carries an `examples` map): fumadocs seeds the form from
        // the first example and auto-selects it, so blank that default example's
        // free-text `text` field → the text box opens empty (placeholder). Other
        // examples are left intact so selecting them still fills the form.
        if (media.examples !== undefined) {
          const first = Object.values(media.examples)[0];
          if (first && typeof first === 'object' && first.value && typeof first.value === 'object' &&
            typeof first.value.text === 'string') {
            first.value.text = '';
          }
          continue;
        }
        if (media.example !== undefined) continue;

        const props = media.schema?.properties;
        const required = Array.isArray(media.schema?.required) ? media.schema.required : [];
        if (!props || typeof props !== 'object') continue;
        for (const name of required) {
          const p = props[name as string];
          if (p && typeof p === 'object' && p.type === 'string' && p.enum === undefined &&
            p.example === undefined && p.default === undefined) {
            p.example = '';
          }
        }
      }
    }
  }
}

export const openapi = createOpenAPI({
  input: async () => {
    const raw = JSON.parse(await fs.readFile(SPEC_KEY, 'utf8'));
    raw.servers = resolveServers();
    injectCodeSamples(raw);
    collapseErrorResponses(raw);
    declutterErrorSchema(raw);
    reorderQueryParameters(raw);
    stripSampleSeeds(raw);
    return { [SPEC_KEY]: raw };
  },
});
