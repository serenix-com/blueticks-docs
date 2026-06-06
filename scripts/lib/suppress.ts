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
