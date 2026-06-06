import { describe, it, expect } from 'vitest';
import type { Finding } from '../types';

describe('tooling smoke', () => {
  it('compiles shared types and runs vitest', () => {
    const f: Finding = {
      file: 'x.mdx', line: 1, groupId: null, lang: 'json',
      kind: 'unknown-field', message: 'ok', fixable: false,
    };
    expect(f.kind).toBe('unknown-field');
  });
});
