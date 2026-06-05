import { describe, it, expect } from 'vitest';
import { applyFixes } from '../autofix';
import type { Finding } from '../types';

const mdx = [
  '```json',
  '{ "to": "+1", "type": "poll", "poll": { "question": "Q", "options": ["a"], "allow_multiplee": false } }',
  '```',
].join('\n');

describe('applyFixes', () => {
  it('renames a near-miss field in place within the block line range', () => {
    const findings: Finding[] = [{
      file: 'f.mdx', line: 2, groupId: 'g', lang: 'json',
      kind: 'unknown-field', field: 'poll.allow_multiplee',
      message: 'x', suggestion: 'allow_multiple', fixable: true,
    }];
    const { content, applied } = applyFixes(mdx, findings, { startLine: 1, endLine: 3 });
    expect(content).toContain('"allow_multiple": false');
    expect(content).not.toContain('allow_multiplee');
    expect(applied).toBe(1);
  });

  it('does not touch non-fixable findings', () => {
    const findings: Finding[] = [{
      file: 'f.mdx', line: 2, groupId: 'g', lang: 'json',
      kind: 'missing-required', field: 'text', message: 'x', fixable: false,
    }];
    const { content, applied } = applyFixes(mdx, findings, { startLine: 1, endLine: 3 });
    expect(content).toBe(mdx);
    expect(applied).toBe(0);
  });
});
