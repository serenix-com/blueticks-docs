import { describe, expect, it } from 'vitest';
import { escapeMdxBraces } from '../escape-mdx-braces';

describe('escapeMdxBraces', () => {
  it('escapes path-template braces in prose', () => {
    expect(escapeMdxBraces('Use PATCH /v1/chats/{chatId}/wa-labels now')).toBe(
      'Use PATCH /v1/chats/\\{chatId\\}/wa-labels now',
    );
  });

  it('leaves inline code spans untouched', () => {
    expect(escapeMdxBraces('Call `POST /v1/messages/{chatId}` or /x/{id}')).toBe(
      'Call `POST /v1/messages/{chatId}` or /x/\\{id\\}',
    );
  });

  it('leaves fenced code blocks untouched', () => {
    const md = ['before {a}', '```json', '{"to":"x"}', '```', 'after {b}'].join('\n');
    expect(escapeMdxBraces(md)).toBe(
      ['before \\{a\\}', '```json', '{"to":"x"}', '```', 'after \\{b\\}'].join('\n'),
    );
  });
});
