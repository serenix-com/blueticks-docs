export interface IgnoreDirective { kinds: string[]; reason: string; }

export function parseIgnoreMarker(value: string): IgnoreDirective | null {
  // Separator must be an em-dash (—) or a long dash (--). A bare single hyphen
  // is NOT allowed: it collides with hyphenated kind names (e.g. "unknown-field"),
  // so a reason-less marker like `validate:ignore unknown-field` returns null
  // instead of mis-splitting into {kinds:['unknown'], reason:'field'}.
  const m = value.match(/validate:ignore\s+([a-z-]+(?:\s*,\s*[a-z-]+)*)\s*(?:—|--)\s*(.+?)\s*\*?\/?\s*$/);
  if (!m) return null;
  const kinds = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  return { kinds, reason: m[2].trim() };
}

export function isSuppressed(directive: { kinds: string[] } | undefined, kind: string): boolean {
  return !!directive && directive.kinds.includes(kind);
}
