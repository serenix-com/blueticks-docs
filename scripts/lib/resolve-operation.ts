import type { CodeBlock, ExampleGroup, ResolvedOp } from './types';
import { buildInverseMap } from './sdk-mapping';

type Spec = {
  paths: Record<string, Record<string, any>>;
  components?: { schemas?: Record<string, unknown> };
};

const BT_CALL = /\b(?:bt|client)\.([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\(/;

// Two separate regexes: one that captures the HTTP verb (-X VERB), one that doesn't.
// Branching on which matched avoids any m.length ambiguity.
const CURL_URL_WITH_VERB = /curl[\s\S]*?-X\s+(GET|POST|PATCH|PUT|DELETE)[\s\S]*?https?:\/\/[^/\s]+(\/v1\/[^\s'"]+)/i;
const CURL_URL_NO_VERB   = /curl[\s\S]*?https?:\/\/[^/\s]+(\/v1\/[^\s'"]+)/i;

export function isRequestCandidate(b: CodeBlock): boolean {
  if (b.lang === 'bash') return /curl/.test(b.code) && /blueticks|\/v1\//.test(b.code);
  if (b.lang === 'ts' || b.lang === 'js' || b.lang === 'python') return BT_CALL.test(b.code);
  if (b.lang === 'json') {
    try {
      const o = JSON.parse(b.code);
      return o && typeof o === 'object' && 'to' in o && 'type' in o;
    } catch { return false; }
  }
  return false;
}

function matchPath(spec: Spec, urlPath: string): string | null {
  const clean = urlPath.replace(/\?.*$/, '').replace(/\/+$/, '') || urlPath;
  for (const p of Object.keys(spec.paths ?? {})) {
    const re = new RegExp('^' + p.replace(/\{[^}]+\}/g, '[^/]+') + '$');
    if (re.test(clean)) return p;
  }
  return null;
}

/** Escape a JSON Pointer token per RFC 6901: ~ → ~0, / → ~1. */
function escapePointerToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

function requestSchemaPointer(spec: Spec, path: string, verb: string): string | null {
  const op = spec.paths?.[path]?.[verb];
  const schema = op?.requestBody?.content?.['application/json']?.schema;
  if (!schema) return null;
  if (typeof schema.$ref === 'string') return `openapi#${schema.$ref.slice(1)}`;
  // Build a JSON Pointer using ~0/~1 escaping (NOT percent-encoding) so that
  // both deref() (which un-escapes ~1/~0 per segment) and ajv.getSchema() can
  // resolve the pointer against the spec object.
  return `openapi#/paths/${escapePointerToken(path)}/${verb}/requestBody/content/application~1json/schema`;
}

export function resolveOperation(group: ExampleGroup, spec: Spec): ResolvedOp | null {
  // 1) cURL anchor — try verb-carrying pattern first, fall back to no-verb pattern
  for (const b of group.blocks) {
    if (b.lang !== 'bash' || !/curl/.test(b.code)) continue;

    const mWithVerb = b.code.match(CURL_URL_WITH_VERB);
    if (mWithVerb) {
      // mWithVerb[1] = verb, mWithVerb[2] = path segment
      const verb = mWithVerb[1].toLowerCase();
      const path = matchPath(spec, mWithVerb[2]);
      if (path && spec.paths[path][verb]) {
        return { verb, path, requestSchemaPointer: requestSchemaPointer(spec, path, verb) };
      }
    }

    const mNoVerb = b.code.match(CURL_URL_NO_VERB);
    if (mNoVerb) {
      // mNoVerb[1] = path segment; default to POST when no -X
      const verb = 'post';
      const path = matchPath(spec, mNoVerb[1]);
      if (path && spec.paths[path][verb]) {
        return { verb, path, requestSchemaPointer: requestSchemaPointer(spec, path, verb) };
      }
    }
  }

  // 2) SDK call via inverse map
  const inv = buildInverseMap(spec);
  for (const b of group.blocks) {
    if (b.lang !== 'ts' && b.lang !== 'js' && b.lang !== 'python') continue;
    const m = b.code.match(BT_CALL);
    if (!m) continue;
    const ref = inv.get(`${m[1]}.${m[2]}`);
    if (ref) return { verb: ref.verb, path: ref.path, requestSchemaPointer: requestSchemaPointer(spec, ref.path, ref.verb) };
  }

  // 3) Standalone request-shaped JSON → send endpoint
  for (const b of group.blocks) {
    if (b.lang === 'json' && isRequestCandidate(b)) {
      const path = '/v1/scheduled-messages';
      if (spec.paths?.[path]?.post) {
        return { verb: 'post', path, requestSchemaPointer: requestSchemaPointer(spec, path, 'post') };
      }
    }
  }

  return null;
}
