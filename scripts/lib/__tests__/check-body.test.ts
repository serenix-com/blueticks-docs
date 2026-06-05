import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkBody } from '../check-body';
import type { ResolvedOp } from '../types';

const spec = JSON.parse(readFileSync(join(__dirname, 'fixtures/mini-openapi.json'), 'utf8'));
const sendOp: ResolvedOp = { verb: 'post', path: '/v1/scheduled-messages', requestSchemaPointer: 'openapi#/components/schemas/SendMessageRequest' };

const base = { file: 'f.mdx', line: 1, groupId: 'g' };

describe('checkBody', () => {
  it('passes a valid poll body', () => {
    const f = checkBody({ to: '+1', type: 'poll', poll: { question: 'Q', options: ['a', 'b'] } }, sendOp, spec, base, 'json');
    expect(f).toEqual([]);
  });

  it('flags an unknown nested field', () => {
    const f = checkBody({ to: '+1', type: 'poll', poll: { question: 'Q', options: ['a', 'b'], allow_multi: false } }, sendOp, spec, base, 'json');
    expect(f.some((x) => x.kind === 'unknown-field' && x.field === 'poll.allow_multi')).toBe(true);
  });

  it('flags a bad enum / discriminator value', () => {
    const f = checkBody({ to: '+1', type: 'polls', poll: { question: 'Q', options: ['a', 'b'] } }, sendOp, spec, base, 'json');
    expect(f.some((x) => x.kind === 'bad-enum' && x.field === 'type')).toBe(true);
  });

  it('flags a missing required field', () => {
    const f = checkBody({ type: 'text', to: '+1' }, sendOp, spec, base, 'json'); // text missing
    expect(f.some((x) => x.kind === 'missing-required' && x.field === 'text')).toBe(true);
  });

  it('suggests a rename for a near-miss unknown field (fixable)', () => {
    const f = checkBody({ to: '+1', type: 'poll', poll: { question: 'Q', options: ['a', 'b'], allow_multiplee: false } }, sendOp, spec, base, 'json');
    const finding = f.find((x) => x.kind === 'unknown-field' && x.field === 'poll.allow_multiplee');
    expect(finding?.fixable).toBe(true);
    expect(finding?.suggestion).toBe('allow_multiple');
  });
});
