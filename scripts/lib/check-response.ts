import type { Finding, Lang, ResolvedOp } from './types';
import { checkValueAgainstSchema } from './check-body';

type Spec = { paths: Record<string, Record<string, any>>; components?: { schemas?: Record<string, any> } };

/** Escape a JSON Pointer token per RFC 6901: ~ → ~0, / → ~1. */
function escapeToken(t: string): string {
  return t.replace(/~/g, '~0').replace(/\//g, '~1');
}

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
  return checkValueAgainstSchema(body, pointer, spec, base, lang).map((f) => ({ ...f, kind: 'response-shape' as const }));
}
