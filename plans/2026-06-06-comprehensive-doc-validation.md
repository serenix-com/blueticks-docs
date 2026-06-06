# Comprehensive Doc ⇄ OpenAPI Validation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make docs examples impossible to silently diverge from `openapi.json` — generate examples from the spec where possible (`<ApiExample>`), and hard-gate every remaining hand-written code block (request, response, params) plus operation coverage in CI.

**Architecture:** One shared `lib/example-engine.ts` turns an operation key into a canonical request/response example (value-synthesized from the spec). The `<ApiExample>` MDX component renders it at build (drift-impossible). The existing `scripts/validate-examples.ts` pipeline is extended to validate response bodies, parameter existence, and operation coverage across **all** guide MDX, with inline + `.validateignore` suppression.

**Tech Stack:** TypeScript, tsx, Vitest, Next.js + Fumadocs, `fumadocs-openapi`, Ajv, `mdast-util-from-markdown` + `mdast-util-mdx`.

**Repo / branch:** `serenix-com/blueticks-docs`, branch `feat/comprehensive-doc-validation` (already created; the design spec lives at `specs/2026-06-06-comprehensive-doc-validation-design.md`).

**Spec reference:** `specs/2026-06-06-comprehensive-doc-validation-design.md`.

---

## Orientation — what already exists (read before starting)

- `scripts/validate-examples.ts` — entry. `validateFile(file, src, spec)` extracts `<Tabs>`/code groups, `resolveOperation` → op, validates **request** bodies via `checkBody`. `main()` globs `content/docs/*.mdx`, prints findings, `process.exit(0|1)`. Runs as `pnpm validate:examples` (and `:fix` with `--fix`).
- `scripts/lib/types.ts` — `Lang`, `CodeBlock`, `ExampleGroup`, `ResolvedOp`, `FindingKind`, `Finding`.
- `scripts/lib/extract-examples.ts` — `extractExamples(file, src)` walks the MDX AST; emits `ExampleGroup[]`; honours `{/* example:skip <reason> */}` markers carried to the next code/Tabs node.
- `scripts/lib/resolve-operation.ts` — `resolveOperation(group, spec)` (cURL URL → path, else SDK `bt.x.y()` → path via `buildInverseMap`), `isRequestCandidate(block)`, `requestSchemaPointer`.
- `scripts/lib/check-body.ts` — `checkBody(body, op, spec, base, lang)`: Ajv-walks a parsed body against the request schema (`op.requestSchemaPointer`); handles `oneOf`+discriminator; emits `unknown-field`/`bad-enum`/`missing-required`. Internals (`deref`, `resolveVariant`, the walk) are **not** exported.
- `scripts/lib/parse-body.ts` — `parseBody(lang, code)` → `{ok, body}|{ok:false,reason}` for bash/json/ts/js/python.
- `scripts/lib/sdk-mapping.ts` — `forwardResource`/`forwardJsResource`/`forwardMethod`/`forwardJsMethod` (path→SDK), `buildInverseMap` (SDK→op).
- `lib/openapi.ts` — `buildCodeSamples(verb, path, op)` builds Python/Node/PHP SDK snippets (with **placeholder** bodies) injected as `x-codeSamples`; `createOpenAPI`.
- `components/mdx.tsx` — wires `createAPIPage(openapi, {...})` and the MDX component registry.
- Tests: Vitest, `scripts/**/*.test.ts`, fixtures in `scripts/lib/__tests__/fixtures/mini-openapi.json` (paths incl. `/v1/scheduled-messages`, `/v1/things/{id}`, `/v1/chats/{chat_id}/messages/{key}/reactions`; schemas `SendMessageRequest`/`SendText`/`SendPoll`/`CreateAudience`).
- CI: `.github/workflows/ci.yml` already runs `pnpm validate:examples`.

**Conventions:** Vitest (`describe/it/expect`), `import` with relative paths inside `scripts/lib/`, `@/` alias for app code. Run a single test file with `pnpm vitest run <path>`.

---

## File Structure

**Create:**
- `lib/example-engine.ts` — spec → canonical example (value synthesis + request/response assembly). Imported by the component.
- `lib/__tests__/example-engine.test.ts` — engine unit tests.
- `components/api-example.tsx` — the `<ApiExample>` MDX component.
- `scripts/lib/check-response.ts` — response-body validation (`response-shape`).
- `scripts/lib/check-params.ts` — parameter-existence validation (`unknown-param`).
- `scripts/lib/coverage.ts` — coverage gate (`coverage-gap`) + `<ApiExample>` usage scan + `.validateignore` loader.
- `scripts/lib/suppress.ts` — inline `{/* validate:ignore <kind> — reason */}` parsing + application.
- `.validateignore` — coverage exemptions (created empty with a header comment).
- New tests under `scripts/lib/__tests__/` for each of the above.

**Modify:**
- `scripts/lib/types.ts` — add `FindingKind` members `response-shape`, `unknown-param`, `coverage-gap`; add a `response-marker` carry to extraction.
- `scripts/lib/check-body.ts` — extract a reusable `checkValueAgainstSchema(...)` used by both request and response checks (DRY).
- `scripts/lib/extract-examples.ts` — also parse `{/* example:response <status> */}` and `{/* validate:ignore <kind> — reason */}` markers; widen nothing else.
- `scripts/validate-examples.ts` — widen glob to `content/docs/**/*.mdx` (exclude `content/docs/api/**`); call the new checks; apply suppression; run coverage once at the end.
- `components/mdx.tsx` — register `ApiExample`.
- `.github/workflows/ci.yml` — no change needed (already runs `validate:examples`); add a one-line comment noting expanded scope.

---

## Phase 1 — Example engine

### Task 1: `lib/example-engine.ts` — value synthesis + request/response assembly

**Files:**
- Create: `lib/example-engine.ts`
- Test: `lib/__tests__/example-engine.test.ts`

The engine has three pure functions over a parsed spec object. Types:

```ts
export type ExampleLang = 'curl' | 'python' | 'node' | 'json';

export interface ResolvedOperation {
  verb: string;   // lowercase: 'get'|'post'|'patch'|'put'|'delete'
  path: string;   // spec path, e.g. '/v1/things/{id}'
  op: Record<string, unknown>; // the operation object
}

export interface RequestExample {
  method: string;                 // uppercase
  url: string;                    // server + path with path-params filled
  headers: Record<string, string>;
  query: Record<string, string>;
  body: unknown | null;
  perLang: Partial<Record<ExampleLang, string>>;
}

export interface ResponseExample {
  status: string;
  body: unknown;
  perLang: Record<'json', string>;
}
```

- [ ] **Step 1: Write failing tests for `exampleForSchema` (value synthesis)**

Create `lib/__tests__/example-engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exampleForSchema, resolveOp, buildRequestExample, buildResponseExample } from '../example-engine';

const spec = JSON.parse(
  readFileSync(join(__dirname, '../../scripts/lib/__tests__/fixtures/mini-openapi.json'), 'utf8'),
);

describe('exampleForSchema', () => {
  it('prefers an explicit example over synthesis', () => {
    expect(exampleForSchema(spec, { type: 'string', example: 'hello' })).toBe('hello');
  });
  it('uses default when no example', () => {
    expect(exampleForSchema(spec, { type: 'integer', default: 7 })).toBe(7);
  });
  it('picks the first enum value', () => {
    expect(exampleForSchema(spec, { type: 'string', enum: ['text', 'poll'] })).toBe('text');
  });
  it('synthesizes by format', () => {
    expect(exampleForSchema(spec, { type: 'string', format: 'email' })).toBe('user@example.com');
    expect(exampleForSchema(spec, { type: 'string', format: 'date-time' })).toBe('2026-01-01T00:00:00Z');
  });
  it('builds an object from required + properties and follows $ref', () => {
    const out = exampleForSchema(spec, { $ref: '#/components/schemas/SendText' }) as Record<string, unknown>;
    expect(out).toHaveProperty('to');
    expect(out).toHaveProperty('type', 'text');
  });
  it('selects the first oneOf variant of a discriminated union', () => {
    const out = exampleForSchema(spec, { $ref: '#/components/schemas/SendMessageRequest' }) as Record<string, unknown>;
    expect(typeof out.type).toBe('string'); // a concrete variant, not a union
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run lib/__tests__/example-engine.test.ts`
Expected: FAIL — `exampleForSchema is not a function`.

- [ ] **Step 3: Implement `exampleForSchema` + `deref`**

Create `lib/example-engine.ts`:

```ts
type Spec = { paths: Record<string, Record<string, any>>; components?: { schemas?: Record<string, any> } };

function deref(spec: Spec, schema: any): any {
  let s = schema;
  const seen = new Set<string>();
  while (s && typeof s.$ref === 'string') {
    if (seen.has(s.$ref)) return {}; // cycle guard
    seen.add(s.$ref);
    const path = s.$ref.replace(/^#\//, '').split('/');
    let cur: any = spec;
    for (const seg of path) cur = cur?.[seg.replace(/~1/g, '/').replace(/~0/g, '~')];
    s = cur;
  }
  return s ?? {};
}

const FORMAT_SAMPLES: Record<string, string> = {
  email: 'user@example.com',
  'date-time': '2026-01-01T00:00:00Z',
  date: '2026-01-01',
  uri: 'https://example.com',
  uuid: '01H7XYZ0000000000000000000',
};

export function exampleForSchema(spec: Spec, rawSchema: any, depth = 0): unknown {
  if (depth > 12) return null; // recursion backstop
  const schema = deref(spec, rawSchema);
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
  if (schema.default !== undefined) return schema.default;

  // Discriminated / plain unions → first concrete branch.
  const union = schema.oneOf ?? schema.anyOf ?? schema.allOf;
  if (Array.isArray(union) && union.length) {
    if (schema.allOf) {
      // Merge allOf members into one object example.
      const merged: Record<string, unknown> = {};
      for (const part of union) Object.assign(merged as object, exampleForSchema(spec, part, depth + 1) as object);
      return merged;
    }
    return exampleForSchema(spec, union[0], depth + 1);
  }

  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];

  switch (schema.type) {
    case 'string': return FORMAT_SAMPLES[schema.format as string] ?? 'string';
    case 'integer':
    case 'number': return 0;
    case 'boolean': return false;
    case 'array': return [exampleForSchema(spec, schema.items ?? {}, depth + 1)];
    case 'object':
    default: {
      const props = schema.properties ?? {};
      const required: string[] = Array.isArray(schema.required) ? schema.required : Object.keys(props);
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(props)) {
        if (required.includes(key)) out[key] = exampleForSchema(spec, props[key], depth + 1);
      }
      return out;
    }
  }
}
```

- [ ] **Step 4: Run the synthesis tests**

Run: `pnpm vitest run lib/__tests__/example-engine.test.ts -t exampleForSchema`
Expected: PASS (6 cases).

- [ ] **Step 5: Add failing tests for `resolveOp` / `buildRequestExample` / `buildResponseExample`**

Append to the test file:

```ts
describe('resolveOp', () => {
  it('resolves a METHOD path key', () => {
    const r = resolveOp(spec, 'POST /v1/scheduled-messages');
    expect(r?.verb).toBe('post');
    expect(r?.path).toBe('/v1/scheduled-messages');
  });
  it('returns null for an unknown op', () => {
    expect(resolveOp(spec, 'GET /v1/nope')).toBeNull();
  });
});

describe('buildRequestExample', () => {
  it('fills path params, auth header, and a JSON body', () => {
    const ex = buildRequestExample(spec, 'PATCH /v1/things/{id}')!;
    expect(ex.method).toBe('PATCH');
    expect(ex.url).toMatch(/\/v1\/things\/[^/{}]+$/); // {id} substituted
    expect(ex.headers.Authorization).toMatch(/^Bearer /);
    expect(ex.perLang.curl).toContain('curl');
  });
});

describe('buildResponseExample', () => {
  it('returns the first 2xx response body by default', () => {
    const ex = buildResponseExample(spec, 'POST /v1/scheduled-messages')!;
    expect(ex.status).toMatch(/^2\d\d$/);
    expect(ex.perLang.json).toContain('{');
  });
});
```

- [ ] **Step 6: Run to confirm failure**

Run: `pnpm vitest run lib/__tests__/example-engine.test.ts`
Expected: FAIL — `resolveOp is not a function`.

- [ ] **Step 7: Implement `resolveOp`, `buildRequestExample`, `buildResponseExample`**

Append to `lib/example-engine.ts`:

```ts
export interface ResolvedOperation { verb: string; path: string; op: Record<string, unknown>; }

const SERVER_URL = 'https://api.blueticks.co';

export function resolveOp(spec: Spec, opKey: string): ResolvedOperation | null {
  const m = opKey.trim().match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)$/i);
  if (!m) return null;
  const verb = m[1].toLowerCase();
  const path = m[2];
  const op = spec.paths?.[path]?.[verb];
  if (!op) return null;
  return { verb, path, op };
}

function paramExample(spec: Spec, p: any): string {
  const v = exampleForSchema(spec, p.schema ?? { type: 'string' });
  return typeof v === 'string' ? v : String(v ?? '');
}

function collectParams(spec: Spec, path: string, op: any, where: string): any[] {
  const all = [...(spec.paths?.[path]?.parameters ?? []), ...(op.parameters ?? [])];
  return all.filter((p) => p?.in === where);
}

export interface RequestExample {
  method: string; url: string;
  headers: Record<string, string>; query: Record<string, string>;
  body: unknown | null; perLang: Partial<Record<'curl'|'python'|'node'|'json', string>>;
}

export function buildRequestExample(spec: Spec, opKey: string): RequestExample | null {
  const r = resolveOp(spec, opKey);
  if (!r) return null;
  const { verb, path, op } = r as any;

  let url = path;
  for (const p of collectParams(spec, path, op, 'path')) {
    url = url.replace(`{${p.name}}`, encodeURIComponent(paramExample(spec, p)));
  }
  const query: Record<string, string> = {};
  for (const p of collectParams(spec, path, op, 'query')) {
    if (p.required) query[p.name] = paramExample(spec, p);
  }
  const headers: Record<string, string> = { Authorization: 'Bearer BLUETICKS_API_KEY' };
  for (const p of collectParams(spec, path, op, 'header')) {
    if (p.required) headers[p.name] = paramExample(spec, p);
  }

  const bodySchema = op.requestBody?.content?.['application/json']?.schema;
  const body = bodySchema ? exampleForSchema(spec, bodySchema) : null;

  const qs = Object.keys(query).length ? '?' + new URLSearchParams(query).toString() : '';
  const fullUrl = `${SERVER_URL}${url}${qs}`;
  const headerFlags = Object.entries({ ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) })
    .map(([k, v]) => `  -H '${k}: ${v}'`).join(' \\\n');
  const dataFlag = body ? ` \\\n  -d '${JSON.stringify(body, null, 2)}'` : '';
  const curl = `curl -X ${verb.toUpperCase()} '${fullUrl}' \\\n${headerFlags}${dataFlag}`;

  return {
    method: verb.toUpperCase(), url: fullUrl, headers, query, body,
    perLang: { curl, json: body ? JSON.stringify(body, null, 2) : undefined },
  };
}

export interface ResponseExample { status: string; body: unknown; perLang: Record<'json', string>; }

export function buildResponseExample(spec: Spec, opKey: string, status?: string): ResponseExample | null {
  const r = resolveOp(spec, opKey);
  if (!r) return null;
  const op = (r as any).op;
  const responses = op.responses ?? {};
  const chosen = status
    ?? Object.keys(responses).find((c) => /^2\d\d$/.test(c))
    ?? Object.keys(responses)[0];
  if (!chosen) return null;
  const schema = responses[chosen]?.content?.['application/json']?.schema;
  const body = schema ? exampleForSchema(spec, schema) : {};
  return { status: chosen, body, perLang: { json: JSON.stringify(body, null, 2) } };
}
```

> NOTE on Python/Node code: reuse `buildCodeSamples(verb, path, op)` from `lib/openapi.ts` for the SDK languages, substituting the synthesized `body` into the placeholder slots. The component (Task 2) calls `buildRequestExample` for curl/json and `buildCodeSamples` for python/node, so the engine stays focused on curl/json + values. Do NOT duplicate the SDK-mapping logic here.

- [ ] **Step 8: Run all engine tests**

Run: `pnpm vitest run lib/__tests__/example-engine.test.ts`
Expected: PASS (all cases).

- [ ] **Step 9: Commit**

```bash
git add lib/example-engine.ts lib/__tests__/example-engine.test.ts
git commit -m "feat(docs): example-engine — spec→canonical request/response example with value synthesis"
```

---

## Phase 2 — `<ApiExample>` component

### Task 2: `components/api-example.tsx` + mdx wiring

**Files:**
- Create: `components/api-example.tsx`
- Modify: `components/mdx.tsx` (register `ApiExample`)

**Behaviour:** Server component. Reads the spec once (`import openapiJson from '@/openapi.json'` — Next supports JSON import; the file is `./openapi.json` at repo root, already imported elsewhere via `createOpenAPI`). Resolves `op`; throws on unknown op (build-time failure). Renders Fumadocs `<Tabs>`/`<DynamicCodeBlock>` (or the existing `CodeBlock`) with the per-language sources.

- [ ] **Step 1: Implement the component**

```tsx
import { Tabs, Tab } from 'fumadocs-ui/components/tabs';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import openapiSpec from '@/openapi.json';
import { buildRequestExample, buildResponseExample, resolveOp } from '@/lib/example-engine';
import { buildCodeSamples } from '@/lib/openapi';

type Lang = 'curl' | 'python' | 'node' | 'json';

interface ApiExampleProps {
  op: string;                 // "POST /v1/messages"
  kind?: 'request' | 'response';
  status?: string;            // response only
  lang?: Lang;                // omit → all langs as tabs
}

const LABELS: Record<string, string> = { curl: 'cURL', python: 'Python', node: 'Node.js', json: 'JSON' };

export function ApiExample({ op, kind = 'request', status, lang }: ApiExampleProps) {
  const spec = openapiSpec as any;
  const resolved = resolveOp(spec, op);
  if (!resolved) throw new Error(`<ApiExample>: unknown operation "${op}" — not found in openapi.json`);

  const samples: Array<{ key: Lang; label: string; code: string; codeLang: string }> = [];

  if (kind === 'response') {
    const ex = buildResponseExample(spec, op, status);
    if (!ex) throw new Error(`<ApiExample>: no response for "${op}"${status ? ` status ${status}` : ''}`);
    samples.push({ key: 'json', label: `${ex.status}`, code: ex.perLang.json, codeLang: 'json' });
  } else {
    const ex = buildRequestExample(spec, op)!;
    if (ex.perLang.curl) samples.push({ key: 'curl', label: LABELS.curl, code: ex.perLang.curl, codeLang: 'bash' });
    // SDK languages from the existing generator, with the synthesized body injected.
    for (const s of buildCodeSamples(resolved.verb, resolved.path, resolved.op)) {
      const key = (s.lang === 'ts' ? 'node' : s.lang) as Lang;
      if (key === 'python' || key === 'node') {
        samples.push({ key, label: LABELS[key], code: s.source, codeLang: s.lang === 'ts' ? 'typescript' : 'python' });
      }
    }
    if (ex.perLang.json) samples.push({ key: 'json', label: LABELS.json, code: ex.perLang.json, codeLang: 'json' });
  }

  const shown = lang ? samples.filter((s) => s.key === lang) : samples;
  if (shown.length === 1) {
    return <DynamicCodeBlock lang={shown[0].codeLang} code={shown[0].code} />;
  }
  return (
    <Tabs items={shown.map((s) => s.label)}>
      {shown.map((s) => (
        <Tab key={s.key} value={s.label}>
          <DynamicCodeBlock lang={s.codeLang} code={s.code} />
        </Tab>
      ))}
    </Tabs>
  );
}
```

> If `@/openapi.json` import fails typing/resolution, read it instead with `readFileSync(join(process.cwd(),'openapi.json'))` inside the component (it is a server component, so Node fs is allowed at render). Verify which works during implementation.

- [ ] **Step 2: Register in `components/mdx.tsx`**

Add to the imports and the components object returned by the MDX components factory:

```tsx
import { ApiExample } from '@/components/api-example';
// ... inside the components map passed to MDX:
ApiExample,
```

(Place it alongside the existing `APIPage`, `AppLink`, etc. entries.)

- [ ] **Step 3: Add a temporary smoke usage and build**

Append to `content/docs/quickstart.mdx` (will be removed in Step 5):

```mdx
<ApiExample op="POST /v1/scheduled-messages" kind="request" />
<ApiExample op="POST /v1/scheduled-messages" kind="response" status="200" />
```

Run: `pnpm run generate:openapi && pnpm build`
Expected: build SUCCEEDS; no "unknown operation" error.

- [ ] **Step 4: Verify an unknown op fails the build**

Temporarily change the smoke usage to `op="GET /v1/does-not-exist"`, run `pnpm build`.
Expected: build FAILS with `<ApiExample>: unknown operation "GET /v1/does-not-exist"`.
Then revert to the valid op.

- [ ] **Step 5: Remove the smoke usage**

Delete the two temporary `<ApiExample>` lines from `content/docs/quickstart.mdx`.

- [ ] **Step 6: Commit**

```bash
git add components/api-example.tsx components/mdx.tsx
git commit -m "feat(docs): <ApiExample> MDX component — spec-generated request/response tabs, build-time op check"
```

---

## Phase 3 — Validator extensions

### Task 3: Widen scan scope + add new finding kinds

**Files:**
- Modify: `scripts/lib/types.ts`
- Modify: `scripts/validate-examples.ts`
- Test: `scripts/lib/__tests__/scope.test.ts`

- [ ] **Step 1: Add the finding kinds**

In `scripts/lib/types.ts`, extend `FindingKind`:

```ts
export type FindingKind =
  | 'unknown-field'
  | 'bad-enum'
  | 'missing-required'
  | 'dead-endpoint'
  | 'unparseable'
  | 'schema-invalid'
  | 'response-shape'   // new
  | 'unknown-param'    // new
  | 'coverage-gap';    // new
```

- [ ] **Step 2: Write a failing scope test**

Create `scripts/lib/__tests__/scope.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { guideFiles } from '../../validate-examples';

describe('guideFiles', () => {
  it('includes nested guide MDX and excludes generated api pages', () => {
    const files = guideFiles('content/docs');
    expect(files.some((f) => f.includes('content/docs/api/'))).toBe(false);
    expect(files.every((f) => f.endsWith('.mdx'))).toBe(true);
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `pnpm vitest run scripts/lib/__tests__/scope.test.ts`
Expected: FAIL — `guideFiles` not exported.

- [ ] **Step 4: Implement + export `guideFiles`, widen the glob**

In `scripts/validate-examples.ts`, replace `const GUIDE_GLOB = 'content/docs/*.mdx';` and the `main()` glob with:

```ts
export function guideFiles(root: string): string[] {
  return globSync('content/docs/**/*.mdx', { cwd: DOCS_ROOT })
    .filter((f: string) => !f.startsWith('content/docs/api/'))
    .map((f: string) => join(DOCS_ROOT, f));
}
```

And in `main()`: `const files = guideFiles(DOCS_ROOT);`

- [ ] **Step 5: Run the scope test + the full suite**

Run: `pnpm vitest run scripts/lib/__tests__/scope.test.ts && pnpm test:unit`
Expected: PASS.

- [ ] **Step 6: Run the validator against real docs to capture the new baseline**

Run: `pnpm validate:examples; echo "exit=$?"`
Expected: it runs over all guide MDX (more files than before). Record any findings — these are pre-existing drift to fix or `validate:ignore` in later tasks; do not silence them here.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/types.ts scripts/validate-examples.ts scripts/lib/__tests__/scope.test.ts
git commit -m "feat(docs-validate): scan all guide MDX (excluding generated api pages) + new finding kinds"
```

### Task 4: Response-body validation

**Files:**
- Modify: `scripts/lib/check-body.ts` (extract `checkValueAgainstSchema`)
- Create: `scripts/lib/check-response.ts`
- Modify: `scripts/lib/extract-examples.ts` (parse `{/* example:response <status> */}`)
- Modify: `scripts/lib/types.ts` (add response marker to `CodeBlock`/`ExampleGroup`)
- Modify: `scripts/validate-examples.ts` (wire response checks)
- Test: `scripts/lib/__tests__/check-response.test.ts`

- [ ] **Step 1: Refactor `check-body.ts` to expose a schema-pointer checker**

In `scripts/lib/check-body.ts`, extract the body-walking core (everything after the pointer is resolved) into:

```ts
export function checkValueAgainstSchema(
  body: Record<string, unknown>,
  schemaPointer: string,           // 'openapi#/components/schemas/X' or '...responses/.../schema'
  spec: Spec,
  base: { file: string; line: number; groupId: string | null },
  lang: Lang,
): Finding[] { /* moved body of checkBody, using schemaPointer in place of op.requestSchemaPointer */ }
```

Then make `checkBody` delegate: `return op.requestSchemaPointer ? checkValueAgainstSchema(body, op.requestSchemaPointer, spec, base, lang) : [];`. Keep all existing request tests green.

- [ ] **Step 2: Run the existing check-body tests (refactor must be behavior-preserving)**

Run: `pnpm vitest run scripts/lib/__tests__/check-body.test.ts`
Expected: PASS (unchanged behavior).

- [ ] **Step 3: Add a `responseSchemaPointer` + `checkResponseBody` with a failing test**

Create `scripts/lib/__tests__/check-response.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkResponseBody } from '../check-response';
import type { ResolvedOp } from '../types';

const spec = JSON.parse(readFileSync(join(__dirname, 'fixtures/mini-openapi.json'), 'utf8'));
const op: ResolvedOp = { verb: 'post', path: '/v1/scheduled-messages', requestSchemaPointer: null };
const base = { file: 'f.mdx', line: 1, groupId: 'g' };

describe('checkResponseBody', () => {
  it('flags an unknown field in a 200 response example', () => {
    const f = checkResponseBody({ id: 'm_1', bogus_field: true }, op, '200', spec, base, 'json');
    expect(f.some((x) => x.kind === 'response-shape' && x.field === 'bogus_field')).toBe(true);
  });
  it('passes a valid response body', () => {
    const f = checkResponseBody({ id: 'm_1', status: 'scheduled' }, op, '200', spec, base, 'json');
    expect(f).toEqual([]);
  });
  it('returns [] when the op/status has no JSON response schema', () => {
    expect(checkResponseBody({ x: 1 }, op, '500', spec, base, 'json')).toEqual([]);
  });
});
```

> The fixture `mini-openapi.json` must have a 200 response schema for `/v1/scheduled-messages`. If absent, add one in this step (e.g. `{ type:'object', properties:{ id:{type:'string'}, status:{type:'string'} }, additionalProperties:false }`) and note it in the commit.

- [ ] **Step 4: Run to confirm failure**

Run: `pnpm vitest run scripts/lib/__tests__/check-response.test.ts`
Expected: FAIL — `checkResponseBody` not found.

- [ ] **Step 5: Implement `check-response.ts`**

```ts
import type { Finding, Lang, ResolvedOp } from './types';
import { checkValueAgainstSchema } from './check-body';

type Spec = { paths: Record<string, Record<string, any>>; components?: { schemas?: Record<string, any> } };

function escapeToken(t: string): string { return t.replace(/~/g, '~0').replace(/\//g, '~1'); }

export function responseSchemaPointer(spec: Spec, path: string, verb: string, status: string): string | null {
  const schema = spec.paths?.[path]?.[verb]?.responses?.[status]?.content?.['application/json']?.schema;
  if (!schema) return null;
  if (typeof schema.$ref === 'string') return `openapi#${schema.$ref.slice(1)}`;
  return `openapi#/paths/${escapeToken(path)}/${verb}/responses/${escapeToken(status)}/content/application~1json/schema`;
}

export function checkResponseBody(
  body: Record<string, unknown>,
  op: ResolvedOp,
  status: string,
  spec: Spec,
  base: { file: string; line: number; groupId: string | null },
  lang: Lang,
): Finding[] {
  const pointer = responseSchemaPointer(spec, op.path, op.verb, status);
  if (!pointer) return [];
  // Reuse the shared walker; relabel its kinds to 'response-shape' for response context.
  return checkValueAgainstSchema(body, pointer, spec, base, lang).map((f) => ({ ...f, kind: 'response-shape' as const }));
}
```

- [ ] **Step 6: Parse `{/* example:response <status> */}` in extraction**

In `scripts/lib/types.ts` add to `CodeBlock`: `responseStatus?: string;` and to `ExampleGroup`: `responseStatus?: string;`.

In `scripts/lib/extract-examples.ts`, alongside `parseSkip`, add:

```ts
function parseResponseMarker(node: any): { status: string } | null {
  const value: string = node.value ?? '';
  const m = value.match(/example:response\s+(\d{3})/);
  return m ? { status: m[1] } : null;
}
```

Carry it forward like `pendingSkip` (a `pendingResponse` variable), consume it onto the next code/Tabs group, and set `group.responseStatus`. A JSON block under a `### Response`/`## Response` heading that immediately follows a resolved request group is also treated as a response candidate (heading text matched case-insensitively against `/^response/`); the explicit marker wins when both are present.

- [ ] **Step 7: Wire response checks into `validateFile`**

In `scripts/validate-examples.ts` `validateFile`, after the request-body loop, add: for each group with a `responseStatus` (or a response-context JSON block), resolve the op (a response block reuses the op resolved from its preceding request group; if standalone, require the marker carry the op via a future field — for now, response blocks must follow a resolved request group OR carry the marker within a `<Tabs>` that also has the request). Parse the JSON body via `parseBody('json', code)` and call `checkResponseBody(body, op, status, spec, base, 'json')`; push findings.

- [ ] **Step 8: Run the response tests + suite**

Run: `pnpm vitest run scripts/lib/__tests__/check-response.test.ts && pnpm test:unit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/check-body.ts scripts/lib/check-response.ts scripts/lib/extract-examples.ts scripts/lib/types.ts scripts/validate-examples.ts scripts/lib/__tests__/check-response.test.ts scripts/lib/__tests__/fixtures/mini-openapi.json
git commit -m "feat(docs-validate): response-body validation against response schemas (response-shape)"
```

### Task 5: Parameter-existence validation

**Files:**
- Create: `scripts/lib/check-params.ts`
- Modify: `scripts/validate-examples.ts` (wire it)
- Test: `scripts/lib/__tests__/check-params.test.ts`

- [ ] **Step 1: Failing test**

Create `scripts/lib/__tests__/check-params.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkParams } from '../check-params';
import type { ResolvedOp } from '../types';

const spec = JSON.parse(readFileSync(join(__dirname, 'fixtures/mini-openapi.json'), 'utf8'));
const op: ResolvedOp = { verb: 'get', path: '/v1/things/{id}', requestSchemaPointer: null };
const base = { file: 'f.mdx', line: 1, groupId: 'g' };

describe('checkParams', () => {
  it('flags a query param not declared on the operation', () => {
    const f = checkParams(['expand', 'bogus_param'], 'query', op, spec, base, 'bash');
    expect(f.some((x) => x.kind === 'unknown-param' && x.field === 'bogus_param')).toBe(true);
  });
  it('accepts a declared query param', () => {
    const f = checkParams(['expand'], 'query', op, spec, base, 'bash');
    expect(f.filter((x) => x.field === 'expand')).toEqual([]);
  });
});
```

> If `/v1/things/{id}` GET in the fixture declares no `expand` query param, add one in this step so the test is meaningful.

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run scripts/lib/__tests__/check-params.test.ts`
Expected: FAIL — `checkParams` not found.

- [ ] **Step 3: Implement `check-params.ts`**

```ts
import type { Finding, Lang, ResolvedOp } from './types';

type Spec = { paths: Record<string, Record<string, any>> };

function declaredParams(spec: Spec, op: ResolvedOp, where: string): Set<string> {
  const all = [...(spec.paths?.[op.path]?.parameters ?? []), ...(spec.paths?.[op.path]?.[op.verb]?.parameters ?? [])];
  return new Set(all.filter((p) => p?.in === where).map((p) => p.name));
}

export function checkParams(
  used: string[],
  where: 'query' | 'path' | 'header',
  op: ResolvedOp,
  spec: Spec,
  base: { file: string; line: number; groupId: string | null },
  lang: Lang,
): Finding[] {
  const declared = declaredParams(spec, op, where);
  const out: Finding[] = [];
  for (const name of used) {
    if (declared.has(name)) continue;
    out.push({ ...base, lang, kind: 'unknown-param',
      message: `Unknown ${where} parameter '${name}' on ${op.verb.toUpperCase()} ${op.path}`,
      field: name, fixable: false });
  }
  return out;
}
```

- [ ] **Step 4: Extract used params + wire into `validateFile`**

In `scripts/validate-examples.ts`, add a helper `usedQueryParams(block)` that, for a bash/curl block, reads the URL's `?a=…&b=…` keys; for SDK blocks, reads kwargs that map to declared params is out of scope — only validate **query** params from cURL URLs and **header** params from `-H` flags (the highest-signal, lowest-noise sources). Call `checkParams(queryKeys, 'query', op, …)` and `checkParams(headerNames, 'header', op, …)` per resolved request group. Skip auth headers (`Authorization`) and standard headers (`Content-Type`, `Accept`) via a constant allowlist.

- [ ] **Step 5: Run param tests + suite**

Run: `pnpm vitest run scripts/lib/__tests__/check-params.test.ts && pnpm test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/check-params.ts scripts/validate-examples.ts scripts/lib/__tests__/check-params.test.ts scripts/lib/__tests__/fixtures/mini-openapi.json
git commit -m "feat(docs-validate): parameter-existence checks for cURL query + header params (unknown-param)"
```

### Task 6: Coverage gate + `<ApiExample>` usage scan + `.validateignore`

**Files:**
- Create: `scripts/lib/coverage.ts`
- Create: `.validateignore`
- Modify: `scripts/validate-examples.ts` (run coverage once after all files)
- Test: `scripts/lib/__tests__/coverage.test.ts`

- [ ] **Step 1: Failing test**

Create `scripts/lib/__tests__/coverage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { specOperationKeys, apiExampleOps, coverageFindings } from '../coverage';

const spec = {
  paths: {
    '/v1/a': { get: {}, post: {} },
    '/v1/b': { get: {} },
  },
};

describe('coverage', () => {
  it('lists all METHOD path keys for /v1 ops', () => {
    expect(specOperationKeys(spec as any).sort()).toEqual(['GET /v1/a', 'GET /v1/b', 'POST /v1/a']);
  });
  it('extracts <ApiExample op=...> keys from MDX', () => {
    const mdx = `<ApiExample op="GET /v1/a" /> text <ApiExample op="POST /v1/a" kind="response"/>`;
    expect(apiExampleOps(mdx).sort()).toEqual(['GET /v1/a', 'POST /v1/a']);
  });
  it('flags ops covered by neither a component nor a resolved example', () => {
    const f = coverageFindings(spec as any, new Set(['GET /v1/a', 'POST /v1/a']), new Set());
    expect(f.map((x) => x.field)).toEqual(['GET /v1/b']);
    expect(f[0].kind).toBe('coverage-gap');
  });
  it('respects ignored ops', () => {
    const f = coverageFindings(spec as any, new Set(['GET /v1/a', 'POST /v1/a']), new Set(['GET /v1/b']));
    expect(f).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run scripts/lib/__tests__/coverage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `coverage.ts`**

```ts
import type { Finding } from './types';

type Spec = { paths: Record<string, Record<string, any>> };
const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete']);

export function specOperationKeys(spec: Spec): string[] {
  const keys: string[] = [];
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    if (!path.startsWith('/v1/')) continue;
    for (const verb of Object.keys(item)) {
      if (VERBS.has(verb)) keys.push(`${verb.toUpperCase()} ${path}`);
    }
  }
  return keys;
}

export function apiExampleOps(mdx: string): string[] {
  const out: string[] = [];
  for (const m of mdx.matchAll(/<ApiExample\b[^>]*\bop=["']([^"']+)["']/g)) out.push(m[1].trim());
  return out;
}

export function coverageFindings(spec: Spec, covered: Set<string>, ignored: Set<string>): Finding[] {
  const out: Finding[] = [];
  for (const key of specOperationKeys(spec)) {
    if (covered.has(key) || ignored.has(key)) continue;
    out.push({ file: '.validateignore', line: 0, groupId: null, lang: 'json',
      kind: 'coverage-gap', field: key,
      message: `Operation '${key}' has no guide example (<ApiExample> or hand-written). Add one or exempt it in .validateignore.`,
      fixable: false });
  }
  return out;
}

export function loadValidateIgnore(content: string): Set<string> {
  const set = new Set<string>();
  for (const raw of content.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line) set.add(line);
  }
  return set;
}
```

- [ ] **Step 4: Create `.validateignore`**

```
# .validateignore — operations exempt from the coverage gate.
# One "METHOD /v1/path" per line, each with a trailing "# reason".
# Example:
#   GET /v1/internal-thing   # internal-only, intentionally undocumented
```

- [ ] **Step 5: Wire coverage into `main()`**

In `scripts/validate-examples.ts` `main()`: accumulate a `covered` set across files — add `apiExampleOps(src)` keys AND, for each resolved request group, the `\`${op.verb.toUpperCase()} ${op.path}\`` key. After the file loop, load `.validateignore` (if present) and push `coverageFindings(spec, covered, ignored)` into `allFindings`.

- [ ] **Step 6: Run coverage tests + suite**

Run: `pnpm vitest run scripts/lib/__tests__/coverage.test.ts && pnpm test:unit`
Expected: PASS.

- [ ] **Step 7: Run the real validator; triage coverage gaps**

Run: `pnpm validate:examples; echo "exit=$?"`
Expected: `coverage-gap` findings for every `/v1` op without a guide example. For this task, add genuinely internal/uninteresting ops to `.validateignore` (with reasons); leave the rest as real gaps to be closed in Task 8. Document the count in the commit message.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/coverage.ts .validateignore scripts/validate-examples.ts scripts/lib/__tests__/coverage.test.ts
git commit -m "feat(docs-validate): operation coverage gate + <ApiExample> credit + .validateignore"
```

### Task 7: Inline `{/* validate:ignore <kind> — reason */}` suppression

**Files:**
- Create: `scripts/lib/suppress.ts`
- Modify: `scripts/lib/extract-examples.ts` (parse the marker, attach to group)
- Modify: `scripts/lib/types.ts` (group gains `ignore?: { kinds: string[] }`)
- Modify: `scripts/validate-examples.ts` (drop suppressed findings)
- Test: `scripts/lib/__tests__/suppress.test.ts`

- [ ] **Step 1: Failing test**

Create `scripts/lib/__tests__/suppress.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseIgnoreMarker, isSuppressed } from '../suppress';

describe('suppress', () => {
  it('parses kinds and reason', () => {
    expect(parseIgnoreMarker('/* validate:ignore unknown-field — legacy alias */'))
      .toEqual({ kinds: ['unknown-field'], reason: 'legacy alias' });
  });
  it('parses multiple comma-separated kinds', () => {
    expect(parseIgnoreMarker('/* validate:ignore unknown-param,response-shape — wip */')?.kinds)
      .toEqual(['unknown-param', 'response-shape']);
  });
  it('returns null when no marker', () => {
    expect(parseIgnoreMarker('/* example:skip x */')).toBeNull();
  });
  it('suppresses a matching finding kind', () => {
    expect(isSuppressed({ kinds: ['unknown-field'] }, 'unknown-field')).toBe(true);
    expect(isSuppressed({ kinds: ['unknown-field'] }, 'bad-enum')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run scripts/lib/__tests__/suppress.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `suppress.ts`**

```ts
export interface IgnoreDirective { kinds: string[]; reason: string; }

export function parseIgnoreMarker(value: string): IgnoreDirective | null {
  const m = value.match(/validate:ignore\s+([a-z-]+(?:\s*,\s*[a-z-]+)*)\s*(?:—|--|-)\s*(.+?)\s*\*?\/?\s*$/);
  if (!m) return null;
  const kinds = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  return { kinds, reason: m[2].trim() };
}

export function isSuppressed(directive: { kinds: string[] } | undefined, kind: string): boolean {
  return !!directive && directive.kinds.includes(kind);
}
```

- [ ] **Step 4: Parse the marker in extraction + attach to group**

In `scripts/lib/extract-examples.ts`, when an `mdxFlowExpression` matches `parseIgnoreMarker`, hold it as `pendingIgnore` and attach to the next group as `group.ignore`. Add `ignore?: { kinds: string[]; reason: string }` to `ExampleGroup` in `types.ts`.

- [ ] **Step 5: Drop suppressed findings in `validateFile`**

After collecting a group's findings, filter: `findings.filter((f) => !isSuppressed(group.ignore, f.kind))`. (Coverage findings are file-level, suppressed only via `.validateignore`.)

- [ ] **Step 6: Run suppress tests + suite**

Run: `pnpm vitest run scripts/lib/__tests__/suppress.test.ts && pnpm test:unit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/suppress.ts scripts/lib/extract-examples.ts scripts/lib/types.ts scripts/validate-examples.ts scripts/lib/__tests__/suppress.test.ts
git commit -m "feat(docs-validate): inline {/* validate:ignore <kind> — reason */} suppression"
```

---

## Phase 4 — Migrate a section + turn the gate green

### Task 8: Migrate one guide section to `<ApiExample>`, close/ignore coverage gaps, make CI green

**Files:**
- Modify: one guide, e.g. `content/docs/messages.mdx` (replace hand-written request/response blocks with `<ApiExample>` for its operation)
- Modify: `.validateignore` (exempt genuinely-internal ops with reasons)
- Modify: `.github/workflows/ci.yml` (comment only)

- [ ] **Step 1: Replace a hand-written example with the component**

In `content/docs/messages.mdx`, replace the primary send-message request `<Tabs>` and its response JSON block with:

```mdx
<ApiExample op="POST /v1/messages" kind="request" />

### Response

<ApiExample op="POST /v1/messages" kind="response" status="200" />
```

(Use the actual operation key present in `openapi.json` for the messages send endpoint — confirm with `python3 -c "import json;print([k for k in json.load(open('openapi.json'))['paths'] if 'message' in k])"`.)

- [ ] **Step 2: Build to confirm the component renders**

Run: `pnpm run generate:openapi && pnpm build`
Expected: SUCCESS.

- [ ] **Step 3: Resolve every remaining finding**

Run: `pnpm validate:examples; echo "exit=$?"`
For each finding: fix the example if it's real drift; migrate to `<ApiExample>` where appropriate; or add an inline `validate:ignore` / `.validateignore` entry **with a written reason** if the finding is a deliberate exception. Re-run until `exit=0`.

- [ ] **Step 4: Add a clarifying comment to CI**

In `.github/workflows/ci.yml`, above the `pnpm validate:examples` step, add:

```yaml
      # Validates ALL guide MDX code blocks (request + response + params) against
      # openapi.json and enforces operation coverage. Suppress false positives with
      # {/* validate:ignore <kind> — reason */} or .validateignore. See
      # specs/2026-06-06-comprehensive-doc-validation-design.md.
```

- [ ] **Step 5: Full green check**

Run: `pnpm test:unit && pnpm build && pnpm validate:examples; echo "exit=$?"`
Expected: tests PASS, build SUCCESS, validator `exit=0`.

- [ ] **Step 6: Commit**

```bash
git add content/docs/messages.mdx .validateignore .github/workflows/ci.yml
git commit -m "feat(docs): migrate messages guide to <ApiExample>; close coverage gaps; document the gate"
```

---

## Final verification (after all tasks)

- [ ] `pnpm test:unit` — all Vitest suites pass.
- [ ] `pnpm build` — Next build succeeds (proves every `<ApiExample op>` resolves).
- [ ] `pnpm validate:examples` — exits 0 with the new checks active.
- [ ] Manually run the dev server (`PORT=3210 pnpm dev`) and confirm a migrated guide renders generated request + response tabs identical in style to the reference pages.
- [ ] Open a PR to `serenix-com/blueticks-docs`; CI runs the expanded gate.
```
