import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractExamples } from '../extract-examples';

const file = join(__dirname, 'fixtures/sample.mdx');
const src = readFileSync(file, 'utf8');

describe('extractExamples', () => {
  const groups = extractExamples('fixtures/sample.mdx', src);

  it('groups the two poll Tabs siblings under one groupId', () => {
    const poll = groups.find((g) => g.blocks.some((b) => b.lang === 'python'));
    expect(poll).toBeDefined();
    expect(poll!.blocks.map((b) => b.lang).sort()).toEqual(['python', 'ts']);
    expect(poll!.groupId).not.toBeNull();
    expect(poll!.skip).toBe(false);
  });

  it('marks the skip-annotated standalone json block as skip with reason', () => {
    const sched = groups.find((g) => g.blocks.some((b) => b.lang === 'json'));
    expect(sched!.skip).toBe(true);
    expect(sched!.skipReason).toContain('forward-looking');
  });

  it('records 1-based line numbers for each block', () => {
    const py = groups.flatMap((g) => g.blocks).find((b) => b.lang === 'python')!;
    expect(py.startLine).toBeGreaterThan(0);
    expect(py.endLine).toBeGreaterThan(py.startLine);
  });
});

describe('extractExamples — response-heading carry is one-shot', () => {
  const src = [
    '## Create something',
    '',
    '### Response',
    '',
    '```json',
    '{ "id": "abc", "status": "ok" }',
    '```',
    '',
    'Some prose that is not a heading.',
    '',
    '```bash',
    'curl -X POST https://api.example.com/v1/things -d \'{"name":"x"}\'',
    '```',
    '',
  ].join('\n');

  const groups = extractExamples('inline.mdx', src);

  it('tags the FIRST block after a ### Response heading as response', () => {
    const jsonGroup = groups.find((g) => g.blocks.some((b) => b.lang === 'json'))!;
    expect(jsonGroup).toBeDefined();
    expect(jsonGroup.responseStatus).toBe('200');
    expect(jsonGroup.blocks[0].responseStatus).toBe('200');
  });

  it('does NOT tag a SECOND block under the same Response heading as response', () => {
    const bashGroup = groups.find((g) => g.blocks.some((b) => b.lang === 'bash'))!;
    expect(bashGroup).toBeDefined();
    expect(bashGroup.responseStatus).toBeUndefined();
    expect(bashGroup.blocks[0].responseStatus).toBeUndefined();
  });
});
