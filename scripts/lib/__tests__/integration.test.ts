import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateFile } from '../../validate-examples';

const spec = JSON.parse(readFileSync(join(__dirname, 'fixtures/mini-openapi.json'), 'utf8'));

// Bug 2 regression: bodyless operations (no requestBody in spec) must not produce 'unparseable' findings
describe('validateFile — bodyless operations (Bug 2)', () => {
  it('POST with no body in spec → no findings (not unparseable)', () => {
    const mdx = [
      '## Rotate',
      '',
      '```bash',
      'curl -X POST https://api.blueticks.co/v1/things/abc/rotate',
      '```',
    ].join('\n');
    const f = validateFile('bodyless.mdx', mdx, spec).findings;
    expect(f.every((x) => x.kind !== 'unparseable')).toBe(true);
    expect(f).toEqual([]);
  });

  it('GET with -X GET and no body in spec → no unparseable findings', () => {
    const mdx = [
      '## Get',
      '',
      '```bash',
      'curl -X GET https://api.blueticks.co/v1/things/abc',
      '```',
    ].join('\n');
    const f = validateFile('bodyless-get.mdx', mdx, spec).findings;
    expect(f.every((x) => x.kind !== 'unparseable')).toBe(true);
    // No body findings — only potentially dead-endpoint (if route unmatchable) but NOT unparseable
    const unparseables = f.filter((x) => x.kind === 'unparseable');
    expect(unparseables).toEqual([]);
  });
});

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

// Bug 3 regression: SDK path-parameter kwargs (chat_id, key) must not be flagged as unknown body fields
describe('validateFile — SDK path params stripped (Bug 3)', () => {
  it('Python bt.chats.react with path params + emoji → no findings', () => {
    const mdx = [
      '## React',
      '',
      '<Tabs groupId="sdk" items={[\'cURL\', \'Python\']}>',
      '  <Tab value="cURL">',
      '',
      '```bash',
      "curl -X POST https://api.blueticks.co/v1/chats/c/messages/k/reactions -d '{\"emoji\":\"❤️\"}'",
      '```',
      '',
      '  </Tab>',
      '  <Tab value="Python">',
      '',
      '```python',
      'bt.chats.react(chat_id="c", key="k", emoji="x")',
      '```',
      '',
      '  </Tab>',
      '</Tabs>',
    ].join('\n');
    const f = validateFile('reactions.mdx', mdx, spec).findings;
    // chat_id and key are path params — must NOT appear as unknown-field
    const badFields = f.filter((x) => x.kind === 'unknown-field' && (x.field === 'chat_id' || x.field === 'key'));
    expect(badFields).toEqual([]);
    expect(f).toEqual([]);
  });
});

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
