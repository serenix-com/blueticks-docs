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
