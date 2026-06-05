import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveOperation, isRequestCandidate } from '../resolve-operation';
import type { ExampleGroup } from '../types';

const spec = JSON.parse(readFileSync(join(__dirname, 'fixtures/mini-openapi.json'), 'utf8'));

function group(blocks: ExampleGroup['blocks']): ExampleGroup {
  return { groupId: 'g', file: 'f.mdx', blocks, skip: false };
}

describe('resolveOperation', () => {
  it('anchors a group on its cURL URL', () => {
    const g = group([{ lang: 'bash', code: 'curl -X POST https://api.blueticks.co/v1/scheduled-messages -d \'{}\'', file: 'f', startLine: 1, endLine: 1, groupId: 'g', skip: false }]);
    const op = resolveOperation(g, spec);
    expect(op).toMatchObject({ verb: 'post', path: '/v1/scheduled-messages' });
  });

  it('resolves an SDK call via the derived inverse map', () => {
    const g = group([{ lang: 'ts', code: 'await bt.audiences.create({ name: "x" })', file: 'f', startLine: 1, endLine: 1, groupId: 'g', skip: false }]);
    const op = resolveOperation(g, spec);
    expect(op).toMatchObject({ verb: 'post', path: '/v1/audiences' });
  });

  it('returns null for a non-request group (no curl, no bt call)', () => {
    const g = group([{ lang: 'bash', code: 'export BLUETICKS_API_KEY=sk_123', file: 'f', startLine: 1, endLine: 1, groupId: 'g', skip: false }]);
    expect(resolveOperation(g, spec)).toBeNull();
  });
});

describe('isRequestCandidate', () => {
  it('true for curl with a blueticks URL', () => {
    expect(isRequestCandidate({ lang: 'bash', code: 'curl https://api.blueticks.co/v1/x', file: 'f', startLine: 1, endLine: 1, groupId: null, skip: false })).toBe(true);
  });
  it('true for a bt.*.* call', () => {
    expect(isRequestCandidate({ lang: 'ts', code: 'bt.messages.send({})', file: 'f', startLine: 1, endLine: 1, groupId: null, skip: false })).toBe(true);
  });
  it('true for a request-shaped standalone json (has to + type)', () => {
    expect(isRequestCandidate({ lang: 'json', code: '{ "to": "+1", "type": "text" }', file: 'f', startLine: 1, endLine: 1, groupId: null, skip: false })).toBe(true);
  });
  it('false for a response-shaped json (no to/type)', () => {
    expect(isRequestCandidate({ lang: 'json', code: '{ "id": "m_1", "status": "queued" }', file: 'f', startLine: 1, endLine: 1, groupId: null, skip: false })).toBe(false);
  });
  it('false for env export / print', () => {
    expect(isRequestCandidate({ lang: 'python', code: 'print(msg.id)', file: 'f', startLine: 1, endLine: 1, groupId: null, skip: false })).toBe(false);
  });
});
