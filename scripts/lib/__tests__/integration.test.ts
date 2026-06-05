import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateFile } from '../../validate-examples';

const spec = JSON.parse(readFileSync(join(__dirname, 'fixtures/mini-openapi.json'), 'utf8'));

const cleanMdx = [
  '## Send', '',
  '<Tabs groupId="sdk" items={[\'cURL\']}>',
  '  <Tab value="cURL">', '',
  '```bash',
  "curl -X POST https://api.blueticks.co/v1/scheduled-messages -d '{ \"to\": \"+1\", \"type\": \"text\", \"text\": \"hi\" }'",
  '```', '',
  '  </Tab>', '</Tabs>',
].join('\n');

const driftMdx = cleanMdx.replace('"text": "hi"', '"txt": "hi"'); // unknown field + missing required `text`

const unparseableMdx = [
  '```bash',
  "curl -X POST https://api.blueticks.co/v1/scheduled-messages -d \"$PAYLOAD\"",
  '```',
].join('\n');

const skipMdx = ['{/* example:skip intentional */}', '', unparseableMdx].join('\n');

describe('validateFile', () => {
  it('clean example → no findings', () => {
    expect(validateFile('clean.mdx', cleanMdx, spec).findings).toEqual([]);
  });
  it('drifted example → unknown-field + missing-required', () => {
    const kinds = validateFile('drift.mdx', driftMdx, spec).findings.map((f) => f.kind).sort();
    expect(kinds).toContain('unknown-field');
    expect(kinds).toContain('missing-required');
  });
  it('unparseable request candidate → unparseable finding (fails)', () => {
    const f = validateFile('u.mdx', unparseableMdx, spec).findings;
    expect(f.some((x) => x.kind === 'unparseable')).toBe(true);
  });
  it('skip-annotated unparseable → ignored', () => {
    expect(validateFile('s.mdx', skipMdx, spec).findings).toEqual([]);
  });
});
