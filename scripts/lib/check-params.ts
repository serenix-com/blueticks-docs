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
