import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkParams } from '../check-params';
import type { ResolvedOp } from '../types';

const spec = JSON.parse(readFileSync(join(__dirname, 'fixtures/mini-openapi.json'), 'utf8'));
const op: ResolvedOp = { verb: 'get', path: '/v1/things/{id}', requestSchemaPointer: null };
const base = { file: 'f.mdx', line: 1, groupId: 'g' };

describe('checkParams', () => {
  it('flags a query param not declared on the operation', () => {
    const f = checkParams(['expand', 'bogus_param'], 'query', op, spec, base, 'bash');
    expect(f.some((x) => x.kind === 'unknown-param' && x.field === 'bogus_param')).toBe(true);
  });
  it('accepts a declared query param', () => {
    const f = checkParams(['expand'], 'query', op, spec, base, 'bash');
    expect(f.filter((x) => x.field === 'expand')).toEqual([]);
  });
});
