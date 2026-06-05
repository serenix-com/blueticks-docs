import type { Finding } from './types';

/** Escape special regex characters in a string for safe interpolation. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace only the leaf token of a field path (or enum literal), scoped to a block's line range. */
export function applyFixes(
  source: string,
  findings: Finding[],
  range: { startLine: number; endLine: number },
): { content: string; applied: number } {
  const lines = source.split('\n');
  let applied = 0;

  for (const f of findings) {
    if (!f.fixable || !f.suggestion || !f.field) continue;
    const leaf = f.field.split('.').pop()!;
    const escapedLeaf = escapeRegExp(leaf);
    const from = Math.max(1, range.startLine) - 1;
    const to = Math.min(lines.length, range.endLine);
    for (let i = from; i < to; i++) {
      const quoted = new RegExp(`(["'])${escapedLeaf}\\1(\\s*:)`);        // "leaf": / 'leaf':
      const unquoted = new RegExp(`(^|[\\s{,])(${escapedLeaf})(\\s*:)`);  // leaf:  (node unquoted)
      const kwarg = new RegExp(`(^|[\\s(,])(${escapedLeaf})(\\s*=)`);     // leaf=  (python kwarg)
      let replaced = false;
      if (quoted.test(lines[i])) {
        lines[i] = lines[i].replace(quoted, `$1${f.suggestion}$1$2`);
        replaced = true;
      } else if (unquoted.test(lines[i])) {
        lines[i] = lines[i].replace(unquoted, (_m, p1, _p2, p3) => `${p1}${f.suggestion}${p3}`);
        replaced = true;
      } else if (kwarg.test(lines[i])) {
        lines[i] = lines[i].replace(kwarg, (_m, p1, _p2, p3) => `${p1}${f.suggestion}${p3}`);
        replaced = true;
      }
      if (replaced) { applied++; break; }
    }
  }
  return { content: lines.join('\n'), applied };
}
