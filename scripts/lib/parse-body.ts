import JSON5 from 'json5';
import type { Lang } from './types';

export type ParseResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; reason: string };

/** Extract the substring from the first `open` to its matching `close` starting at/after `from`. */
function balanced(src: string, open: string, close: string, from: number): string | null {
  const start = src.indexOf(open, from);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

function tryJson5(text: string): ParseResult {
  try {
    const v = JSON5.parse(text);
    if (v && typeof v === 'object' && !Array.isArray(v)) return { ok: true, body: v as Record<string, unknown> };
    return { ok: false, reason: 'not an object' };
  } catch (e) {
    return { ok: false, reason: String((e as Error).message) };
  }
}

function parseBash(code: string): ParseResult {
  const m = code.match(/(?:-d|--data(?:-raw)?)\s+'([\s\S]*?)'/) ?? code.match(/(?:-d|--data(?:-raw)?)\s+"([\s\S]*?)"/);
  if (!m) return { ok: false, reason: 'no -d payload' };
  if (/`|\$\{|\$[A-Za-z_]/.test(m[1])) return { ok: false, reason: 'shell variable in payload' };
  try {
    return { ok: true, body: JSON.parse(m[1]) };
  } catch (e) {
    return { ok: false, reason: String((e as Error).message) };
  }
}

/**
 * Guard: reject an object literal if it contains a bare (unquoted) identifier
 * used as a value — e.g. `{ to: recipient }`. JSON5 treats bare identifiers as
 * valid identifiers for *keys* but rejects them as *values*, so this is belt-
 * and-suspenders in case JSON5 is ever lenient.
 *
 * Pattern: after a colon (value position) or comma / opening brace (element
 * position), an unquoted word that is NOT a JSON5 keyword (true/false/null/
 * Infinity/NaN) and not a number.
 *
 * NOTE: We first strip quoted string contents so that template-style {{...}}
 * placeholders inside legitimate single/double-quoted string values don't
 * trip the guard.
 */
const BARE_IDENT_VALUE = /(?::\s*|[([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(?=\s*[,}\])])/g;
const JSON5_KEYWORDS = new Set(['true', 'false', 'null', 'undefined', 'Infinity', 'NaN']);

/** Replace the contents of all single- and double-quoted strings with placeholder spaces. */
function stripQuotedStrings(src: string): string {
  return src.replace(/'(?:[^'\\]|\\.)*'/g, (m) => "'" + ' '.repeat(m.length - 2) + "'")
            .replace(/"(?:[^"\\]|\\.)*"/g, (m) => '"' + ' '.repeat(m.length - 2) + '"');
}

function hasBareIdentifierValue(obj: string): boolean {
  const stripped = stripQuotedStrings(obj);
  BARE_IDENT_VALUE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BARE_IDENT_VALUE.exec(stripped)) !== null) {
    const word = m[1];
    if (!JSON5_KEYWORDS.has(word)) return true;
  }
  return false;
}

function parseNode(code: string): ParseResult {
  const call = code.search(/\bbt\.[A-Za-z_]\w*\.[A-Za-z_]\w*\s*\(/);
  const obj = balanced(code, '{', '}', call < 0 ? 0 : call);
  if (!obj) return { ok: false, reason: 'no object literal' };
  if (/`|\$\{/.test(obj)) return { ok: false, reason: 'template literal' };
  if (hasBareIdentifierValue(obj)) return { ok: false, reason: 'bare identifier value (runtime variable)' };
  return tryJson5(obj);
}

function parsePython(code: string): ParseResult {
  const call = code.search(/\bbt\.[A-Za-z_]\w*\.[A-Za-z_]\w*\s*\(/);
  if (call < 0) return { ok: false, reason: 'no bt.*.* call' };
  const args = balanced(code, '(', ')', call);
  if (!args) return { ok: false, reason: 'unbalanced call' };
  let inner = args.slice(1, -1); // strip ( )
  if (/\bf"|\bf'/.test(inner)) return { ok: false, reason: 'f-string' };
  // kwargs k=v -> "k": v  (identifier at start of an argument)
  inner = inner.replace(/(^|,)\s*([A-Za-z_]\w*)\s*=/g, '$1 "$2": ');
  inner = inner.replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null');
  return tryJson5(`{${inner}}`);
}

export function parseBody(lang: Lang, code: string): ParseResult {
  switch (lang) {
    case 'bash': return parseBash(code);
    case 'json': return tryJson5(code.trim());
    case 'ts':
    case 'js': return parseNode(code);
    case 'python': return parsePython(code);
    default: return { ok: false, reason: `unsupported lang ${String(lang)}` };
  }
}
