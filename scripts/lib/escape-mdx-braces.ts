/**
 * Escape `{` / `}` in prose so MDX does not parse a path template such as
 * `/v1/chats/{chatId}/wa-labels` as a JS expression (which throws
 * "chatId is not defined" at prerender). Fenced code blocks and inline code
 * spans are left untouched — braces are literal there already.
 */
export function escapeMdxBraces(markdown: string): string {
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line
        .split(/(`[^`]*`)/)
        .map((seg, i) => (i % 2 === 1 ? seg : seg.replace(/([{}])/g, '\\$1')))
        .join('');
    })
    .join('\n');
}
