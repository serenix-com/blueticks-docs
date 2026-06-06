import { describe, it, expect } from 'vitest';
import { specOperationKeys, apiExampleOps, coverageFindings } from '../coverage';

const spec = {
  paths: {
    '/v1/a': { get: {}, post: {} },
    '/v1/b': { get: {} },
  },
};

describe('coverage', () => {
  it('lists all METHOD path keys for /v1 ops', () => {
    expect(specOperationKeys(spec as any).sort()).toEqual(['GET /v1/a', 'GET /v1/b', 'POST /v1/a']);
  });
  it('extracts <ApiExample op=...> keys from MDX', () => {
    const mdx = `<ApiExample op="GET /v1/a" /> text <ApiExample op="POST /v1/a" kind="response"/>`;
    expect(apiExampleOps(mdx).sort()).toEqual(['GET /v1/a', 'POST /v1/a']);
  });
  it('flags ops covered by neither a component nor a resolved example', () => {
    const f = coverageFindings(spec as any, new Set(['GET /v1/a', 'POST /v1/a']), new Set());
    expect(f.map((x) => x.field)).toEqual(['GET /v1/b']);
    expect(f[0].kind).toBe('coverage-gap');
  });
  it('respects ignored ops', () => {
    const f = coverageFindings(spec as any, new Set(['GET /v1/a', 'POST /v1/a']), new Set(['GET /v1/b']));
    expect(f).toEqual([]);
  });
});
