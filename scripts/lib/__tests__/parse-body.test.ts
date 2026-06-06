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

  it('parses a Node object literal using the client. prefix', () => {
    const code = `await client.messages.send({ to: "+1", type: "text", text: "x" })`;
    expect(parseBody('ts', code)).toEqual({
      ok: true,
      body: { to: '+1', type: 'text', text: 'x' },
    });
  });

  it('parses Python kwargs using the client. prefix', () => {
    const code = `client.messages.send(to="+1", type="text", text="x")`;
    expect(parseBody('python', code)).toEqual({
      ok: true,
      body: { to: '+1', type: 'text', text: 'x' },
    });
  });

  it('returns ok:false for unparseable bodies (variables / f-strings)', () => {
    const code = `bt.messages.send({ to: recipient, type: 'text', text: \`hi \${name}\` })`;
    expect(parseBody('ts', code).ok).toBe(false);
  });

  // Bug 4 regression: {{...}} inside a single-quoted string must NOT trip the bare-identifier guard
  it('parses a Node campaigns.create object with {{...}} template placeholder in a string value', () => {
    const code = `await bt.campaigns.create({
  name: 'Launch blast',
  audience_id: 'aud_01h7...',
  text: 'Hey {{first_name}}! Your order ships today.',
  on_missing_variable: 'fail',
});`;
    const r = parseBody('ts', code);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.body).toMatchObject({ name: 'Launch blast', on_missing_variable: 'fail' });
    }
  });
});
