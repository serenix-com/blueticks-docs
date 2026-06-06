// lib/example-engine.ts
// Shared example engine: turns an OpenAPI operation into a canonical
// request/response example with synthesized field values.

// The engine only synthesizes `curl` and `json` snippets. `python` and `node`
// are populated later by the SDK layer (see lib/openapi.ts buildCodeSamples),
// which the consuming <ApiExample> component merges in.
export type ExampleLang = 'curl' | 'python' | 'node' | 'json';

export interface ResolvedOperation {
  verb: string;
  path: string;
  op: Record<string, unknown>;
}

export interface RequestExample {
  method: string;
  url: string;
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type Spec = {
  paths: Record<string, Record<string, any>>;
  components?: { schemas?: Record<string, any> };
};

function deref(spec: Spec, schema: any): any {
  let s = schema;
  const seen = new Set<string>();
  while (s && typeof s.$ref === 'string') {
    if (seen.has(s.$ref)) return {};
    seen.add(s.$ref);
    const path = s.$ref.replace(/^#\//, '').split('/');
    let cur: any = spec;
    for (const seg of path) cur = cur?.[seg.replace(/~1/g, '/').replace(/~0/g, '~')];
    s = cur;
  }
  return s ?? {};
}

export const FORMAT_SAMPLES: Record<string, string> = {
  email: 'user@example.com',
  'date-time': '2026-01-01T00:00:00Z',
  date: '2026-01-01',
  uri: 'https://example.com',
  uuid: '01H7XYZ0000000000000000000',
};

// ---------------------------------------------------------------------------
// Value synthesis
// ---------------------------------------------------------------------------

export function exampleForSchema(spec: Spec, rawSchema: any, depth = 0): unknown {
  if (depth > 12) return null;
  const schema = deref(spec, rawSchema);
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
  if (schema.default !== undefined) return schema.default;
  const union = schema.oneOf ?? schema.anyOf ?? schema.allOf;
  if (Array.isArray(union) && union.length) {
    if (schema.allOf) {
      const merged: Record<string, unknown> = {};
      for (const part of union)
        Object.assign(merged as object, exampleForSchema(spec, part, depth + 1) as object);
      return merged;
    }
    return exampleForSchema(spec, union[0], depth + 1);
  }
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  switch (schema.type) {
    case 'string':
      return FORMAT_SAMPLES[schema.format as string] ?? 'string';
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [exampleForSchema(spec, schema.items ?? {}, depth + 1)];
    case 'object':
    default: {
      const props = schema.properties ?? {};
      const required: string[] = Array.isArray(schema.required)
        ? schema.required
        : Object.keys(props);
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(props))
        if (required.includes(key)) out[key] = exampleForSchema(spec, props[key], depth + 1);
      return out;
    }
  }
}

// ---------------------------------------------------------------------------
// Operation resolution
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Parameter helpers
// ---------------------------------------------------------------------------

function paramExample(spec: Spec, p: any): string {
  const v = exampleForSchema(spec, p.schema ?? { type: 'string' });
  return typeof v === 'string' ? v : String(v ?? '');
}

function collectParams(spec: Spec, path: string, op: any, where: string): any[] {
  const all = [...(spec.paths?.[path]?.parameters ?? []), ...(op.parameters ?? [])];
  return all.filter((p) => p?.in === where);
}

// ---------------------------------------------------------------------------
// Request example
// ---------------------------------------------------------------------------

export function buildRequestExample(spec: Spec, opKey: string): RequestExample | null {
  const r = resolveOp(spec, opKey);
  if (!r) return null;
  const { verb, path, op } = r as any;

  // Substitute path params
  let url = path;
  for (const p of collectParams(spec, path, op, 'path'))
    url = url.replace(`{${p.name}}`, encodeURIComponent(paramExample(spec, p)));

  // Required query params
  const query: Record<string, string> = {};
  for (const p of collectParams(spec, path, op, 'query'))
    if (p.required) query[p.name] = paramExample(spec, p);

  // Headers: auth always present; add required header params
  const headers: Record<string, string> = { Authorization: 'Bearer BLUETICKS_API_KEY' };
  for (const p of collectParams(spec, path, op, 'header'))
    if (p.required) headers[p.name] = paramExample(spec, p);

  // Body
  const bodySchema = op.requestBody?.content?.['application/json']?.schema;
  const body = bodySchema ? exampleForSchema(spec, bodySchema) : null;

  // Assemble URL
  const qs = Object.keys(query).length ? '?' + new URLSearchParams(query).toString() : '';
  const fullUrl = `${SERVER_URL}${url}${qs}`;

  // Build curl snippet
  const allHeaders = { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) };
  const headerFlags = Object.entries(allHeaders)
    .map(([k, v]) => `  -H '${k}: ${v}'`)
    .join(' \\\n');
  const bodyStr = JSON.stringify(body, null, 2).replace(/'/g, `'\\''`);
  const dataFlag = body ? ` \\\n  -d '${bodyStr}'` : '';
  const curl = `curl -X ${verb.toUpperCase()} '${fullUrl}' \\\n${headerFlags}${dataFlag}`;

  return {
    method: verb.toUpperCase(),
    url: fullUrl,
    headers,
    query,
    body,
    perLang: {
      curl,
      json: body ? JSON.stringify(body, null, 2) : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Response example
// ---------------------------------------------------------------------------

export function buildResponseExample(
  spec: Spec,
  opKey: string,
  status?: string,
): ResponseExample | null {
  const r = resolveOp(spec, opKey);
  if (!r) return null;
  const op = (r as any).op;
  const responses = op.responses ?? {};
  const chosen =
    status ??
    Object.keys(responses).find((c) => /^2\d\d$/.test(c)) ??
    Object.keys(responses)[0];
  if (!chosen) return null;
  const schema = responses[chosen]?.content?.['application/json']?.schema;
  const body = schema ? exampleForSchema(spec, schema) : {};
  return {
    status: chosen,
    body,
    perLang: { json: JSON.stringify(body, null, 2) },
  };
}
