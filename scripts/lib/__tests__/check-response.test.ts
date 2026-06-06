import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkResponseBody } from '../check-response';
import type { ResolvedOp } from '../types';

const spec = JSON.parse(readFileSync(join(__dirname, 'fixtures/mini-openapi.json'), 'utf8'));
const op: ResolvedOp = { verb: 'post', path: '/v1/scheduled-messages', requestSchemaPointer: null };
const base = { file: 'f.mdx', line: 1, groupId: 'g' };

describe('checkResponseBody', () => {
  it('flags an unknown field in a 200 response example', () => {
    const f = checkResponseBody({ id: 'm_1', bogus_field: true }, op, '200', spec, base, 'json');
    expect(f.some((x) => x.kind === 'response-shape' && x.field === 'bogus_field')).toBe(true);
  });
  it('passes a valid response body', () => {
    const f = checkResponseBody({ id: 'm_1', status: 'scheduled' }, op, '200', spec, base, 'json');
    expect(f).toEqual([]);
  });
  it('returns [] when the op/status has no JSON response schema', () => {
    expect(checkResponseBody({ x: 1 }, op, '500', spec, base, 'json')).toEqual([]);
  });
});
