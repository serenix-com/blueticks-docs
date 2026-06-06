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
