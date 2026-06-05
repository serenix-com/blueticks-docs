import { describe, it, expect } from 'vitest';
import { parseBody } from '../parse-body';

describe('parseBody', () => {
  it('parses a cURL -d JSON payload', () => {
    const code = `curl -X POST https://api.blueticks.co/v1/scheduled-messages \\
  -H "Authorization: Bearer KEY" \\
  -d '{ "to": "+972", "type": "text", "text": "hi" }'`;
    expect(parseBody('bash', code)).toEqual({
      ok: true, body: { to: '+972', type: 'text', text: 'hi' },
    });
  });

  it('parses a raw JSON block', () => {
    expect(parseBody('json', '{ "to": "+972", "type": "text", "send_at": "2026-12-01T09:00:00Z" }'))
      .toEqual({ ok: true, body: { to: '+972', type: 'text', send_at: '2026-12-01T09:00:00Z' } });
  });

  it('parses a Node object literal (JSON5: unquoted keys, single quotes, false)', () => {
    const code = `const msg = await bt.messages.send({
      to: '+972',
      type: 'poll',
      poll: { question: 'Q?', options: ['Yes', 'No'], allow_multiple: false },
    });`;
    expect(parseBody('ts', code)).toEqual({
      ok: true,
      body: { to: '+972', type: 'poll', poll: { question: 'Q?', options: ['Yes', 'No'], allow_multiple: false } },
    });
  });

  it('parses Python kwargs (True/None/single quotes)', () => {
    const code = `msg = bt.messages.send(
    to="+972",
    type="poll",
    poll={"question": "Q?", "options": ["Yes", "No"], "allow_multiple": False},
)`;
    expect(parseBody('python', code)).toEqual({
      ok: true,
      body: { to: '+972', type: 'poll', poll: { question: 'Q?', options: ['Yes', 'No'], allow_multiple: false } },
    });
  });

  it('returns ok:false for unparseable bodies (variables / f-strings)', () => {
    const code = `bt.messages.send({ to: recipient, type: 'text', text: \`hi \${name}\` })`;
    expect(parseBody('ts', code).ok).toBe(false);
  });
});
