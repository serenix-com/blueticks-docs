#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync, globSync } from 'node:fs';
import { join, relative } from 'node:path';
import { extractExamples } from './lib/extract-examples';
import { resolveOperation, isRequestCandidate } from './lib/resolve-operation';
import { parseBody } from './lib/parse-body';
import { checkBody } from './lib/check-body';
import { checkResponseBody } from './lib/check-response';
import { checkParams } from './lib/check-params';
import { applyFixes } from './lib/autofix';
import { apiExampleOps, coverageFindings, loadValidateIgnore } from './lib/coverage';
import { isSuppressed } from './lib/suppress';
import type { Finding, ResolvedOp } from './lib/types';

const DOCS_ROOT = join(__dirname, '..');
const SPEC_PATH = join(DOCS_ROOT, 'openapi.json');
/**
 * Enumerate all hand-written guide MDX files (recursively), excluding the
 * generated API reference pages under content/docs/api/. Returns absolute paths.
 * The `root` param exists for the test signature; resolution uses DOCS_ROOT.
 */
export function guideFiles(root: string): string[] {
  return globSync('content/docs/**/*.mdx', { cwd: DOCS_ROOT })
    .filter((f: string) => !f.startsWith('content/docs/api/'))
    .map((f: string) => join(DOCS_ROOT, f));
}

/** Returns true if the resolved operation defines a JSON request body in the spec. */
function hasRequestBody(spec: any, op: { path: string; verb: string }): boolean {
  return !!(spec.paths?.[op.path]?.[op.verb]?.requestBody?.content?.['application/json']?.schema);
}

/** Extract path parameter names from an OpenAPI path template, e.g. '/v1/chats/{chat_id}/messages/{key}' → ['chat_id', 'key']. */
function pathParamNames(opPath: string): Set<string> {
  const names = new Set<string>();
  for (const m of opPath.matchAll(/\{([^}]+)\}/g)) names.add(m[1]);
  return names;
}

/**
 * Convert an HTTP header name to the two kwarg forms SDKs use:
 *   'Idempotency-Key' → snake: 'idempotency_key', camel: 'idempotencyKey'
 */
function headerToKwargForms(headerName: string): string[] {
  const snake = headerName.toLowerCase().replace(/-/g, '_');
  const parts = headerName.split('-');
  const camel = parts[0].toLowerCase() + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');
  return snake === camel ? [snake] : [snake, camel];
}

/** Collect header parameter names (as SDK kwarg forms) for a resolved operation. */
function headerParamKwargs(spec: any, op: { path: string; verb: string }): Set<string> {
  const kwargSet = new Set<string>();
  const opObj = spec.paths?.[op.path]?.[op.verb];
  const pathObj = spec.paths?.[op.path];
  const allParams: any[] = [
    ...(pathObj?.parameters ?? []),
    ...(opObj?.parameters ?? []),
  ];
  for (const param of allParams) {
    if (param?.in === 'header' && typeof param.name === 'string') {
      for (const form of headerToKwargForms(param.name)) kwargSet.add(form);
    }
  }
  return kwargSet;
}

/**
 * For SDK languages, strip both path-parameter keys AND header-parameter kwargs
 * from a parsed body object. cURL/JSON bodies contain only real body fields — skip.
 */
function stripNonBodyParams(body: Record<string, unknown>, op: { path: string; verb: string }, spec: any, lang: string): Record<string, unknown> {
  if (lang !== 'ts' && lang !== 'js' && lang !== 'python') return body;
  const pathParams = pathParamNames(op.path);
  const headerKwargs = headerParamKwargs(spec, op);
  if (pathParams.size === 0 && headerKwargs.size === 0) return body;
  const stripped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!pathParams.has(k) && !headerKwargs.has(k)) stripped[k] = v;
  }
  return stripped;
}

/**
 * Headers that are auth/standard transport concerns, not operation parameters.
 * Matched case-insensitively (cURL header names are case-insensitive).
 */
const HEADER_ALLOWLIST = new Set(['authorization', 'content-type', 'accept']);

/**
 * Extract query-string parameter keys from the blueticks API URL in a cURL/bash
 * block. Joins backslash-continued lines, finds the first /v1/ blueticks URL,
 * and reads its `?a=…&b=…` keys. Returns [] when there is no query string.
 */
function curlQueryKeys(code: string): string[] {
  const joined = code.replace(/\\\r?\n/g, ' ');
  const m = joined.match(/https?:\/\/[^/\s'"]+(\/v1\/[^\s'"]*)/i);
  if (!m) return [];
  const full = joined.slice(m.index!).match(/https?:\/\/[^\s'"]+/i);
  const urlStr = full ? full[0] : '';
  const q = urlStr.indexOf('?');
  if (q === -1) return [];
  const query = urlStr.slice(q + 1);
  try {
    return [...new URLSearchParams(query).keys()];
  } catch {
    return [];
  }
}

/**
 * Extract header names from `-H 'Name: value'` / `-H "Name: value"` (and
 * unquoted) flags in a cURL/bash block. Drops auth/standard headers via the
 * case-insensitive allowlist. Backslash-continued lines are joined first.
 */
function curlHeaderNames(code: string): string[] {
  const joined = code.replace(/\\\r?\n/g, ' ');
  const names: string[] = [];
  const re = /-H\s+(?:'([^']*)'|"([^"]*)"|(\S+:[^\s]*))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(joined)) !== null) {
    const raw = m[1] ?? m[2] ?? m[3] ?? '';
    const colon = raw.indexOf(':');
    if (colon === -1) continue;
    const name = raw.slice(0, colon).trim();
    if (!name || HEADER_ALLOWLIST.has(name.toLowerCase())) continue;
    names.push(name);
  }
  return names;
}

export function validateFile(file: string, src: string, spec: any): { findings: Finding[]; covered: Set<string> } {
  const groups = extractExamples(file, src);
  const findings: Finding[] = [];

  // Operation keys (`METHOD /v1/path`) this file documents, for the coverage
  // gate: every <ApiExample op="…"> reference plus every resolved request group.
  const covered = new Set<string>(apiExampleOps(src));

  // The op resolved from the most recent request group; response examples
  // reuse it (a response block follows the request it documents).
  let lastOp: ResolvedOp | null = null;

  // Validate a single group, collecting its findings into `groupFindings`.
  // Returns so the bare `continue` early-exits stay intact; the caller then
  // filters out inline-suppressed kinds before merging into the file findings.
  function validateGroup(group: typeof groups[number], groupFindings: Finding[]): void {
    if (group.skip) return;

    // Response example: a group flagged with a responseStatus marker (or under a
    // "Response" heading). Validate its JSON body against the response schema,
    // reusing the op from the preceding request group.
    if (group.responseStatus) {
      const op = lastOp;
      if (!op) return; // standalone response with no resolvable op — skip gracefully
      const status = group.responseStatus;
      for (const b of group.blocks) {
        if (b.lang !== 'json') continue;
        const parsed = parseBody('json', b.code);
        if (!parsed.ok) continue; // don't crash on an unparseable response sample
        groupFindings.push(...checkResponseBody(parsed.body, op, status, spec, { file, line: b.startLine, groupId: group.groupId }, 'json'));
      }
      return;
    }

    const candidates = group.blocks.filter(isRequestCandidate);
    if (candidates.length === 0) return;

    const op = resolveOperation(group, spec);
    if (!op) {
      for (const b of candidates) groupFindings.push({
        file, line: b.startLine, groupId: group.groupId, lang: b.lang,
        kind: 'dead-endpoint', message: 'Could not resolve example to an OpenAPI operation', fixable: false,
      });
      return;
    }
    lastOp = op;
    covered.add(`${op.verb.toUpperCase()} ${op.path}`);

    // Parameter-existence checks: validate query keys (from the cURL URL) and
    // header names (from -H flags) against the operation's declared parameters.
    for (const b of candidates) {
      if (b.lang !== 'bash' || !/curl/.test(b.code)) continue;
      const base = { file, line: b.startLine, groupId: group.groupId };
      groupFindings.push(...checkParams(curlQueryKeys(b.code), 'query', op, spec, base, 'bash'));
      groupFindings.push(...checkParams(curlHeaderNames(b.code), 'header', op, spec, base, 'bash'));
    }

    // Skip body parsing/checking entirely for operations with no request body schema
    if (!hasRequestBody(spec, op)) return;

    for (const b of candidates) {
      const parsed = parseBody(b.lang, b.code);
      if (!parsed.ok) {
        groupFindings.push({
          file, line: b.startLine, groupId: group.groupId, lang: b.lang,
          kind: 'unparseable', message: `Could not parse request body: ${parsed.reason}`, fixable: false,
        });
        continue;
      }
      const body = stripNonBodyParams(parsed.body, op, spec, b.lang);
      groupFindings.push(...checkBody(body, op, spec, { file, line: b.startLine, groupId: group.groupId }, b.lang));
    }
  }

  for (const group of groups) {
    const groupFindings: Finding[] = [];
    validateGroup(group, groupFindings);
    // Drop inline-suppressed findings ({/* validate:ignore <kind> — reason */}).
    // Coverage-gap findings are file-level (appended in main()) and are NOT
    // affected here — only by .validateignore.
    findings.push(...groupFindings.filter((f) => !isSuppressed(group.ignore, f.kind)));
  }
  return { findings, covered };
}

function applyFileFixes(file: string, src: string, spec: any): { content: string; applied: number } {
  const groups = extractExamples(file, src);
  let content = src;
  let applied = 0;
  for (const group of groups) {
    if (group.skip) continue;
    const op = resolveOperation(group, spec);
    if (!op) continue;
    if (!hasRequestBody(spec, op)) continue;
    for (const b of group.blocks.filter(isRequestCandidate)) {
      const parsed = parseBody(b.lang, b.code);
      if (!parsed.ok) continue;
      const body = stripNonBodyParams(parsed.body, op, spec, b.lang);
      const f = checkBody(body, op, spec, { file, line: b.startLine, groupId: group.groupId }, b.lang);
      const r = applyFixes(content, f, { startLine: b.startLine, endLine: b.endLine });
      content = r.content;
      applied += r.applied;
    }
  }
  return { content, applied };
}

function main() {
  const fix = process.argv.includes('--fix');
  const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));
  const files = guideFiles(DOCS_ROOT);

  let fixedTotal = 0;
  const allFindings: Finding[] = [];
  const covered = new Set<string>();

  for (const abs of files) {
    const rel = relative(DOCS_ROOT, abs);
    let src = readFileSync(abs, 'utf8');
    if (fix) {
      const r = applyFileFixes(rel, src, spec);
      if (r.applied > 0) { writeFileSync(abs, r.content); src = r.content; fixedTotal += r.applied; }
    }
    const { findings, covered: fileCovered } = validateFile(rel, src, spec);
    allFindings.push(...findings);
    for (const key of fileCovered) covered.add(key);
  }

  // Coverage gate: every /v1 operation must be documented by a guide example
  // (an <ApiExample> reference or a resolved request group) unless exempted in
  // .validateignore. Gaps count toward the exit code.
  const ignorePath = join(DOCS_ROOT, '.validateignore');
  const ignored = existsSync(ignorePath) ? loadValidateIgnore(readFileSync(ignorePath, 'utf8')) : new Set<string>();
  allFindings.push(...coverageFindings(spec, covered, ignored));

  const total = allFindings.length;

  for (const f of allFindings) {
    console.error(`${f.file}:${f.line}  [${f.kind}] ${f.message}${f.suggestion ? `  → did you mean '${f.suggestion}'?` : ''}`);
  }
  if (fix) console.error(`\nApplied ${fixedTotal} fix(es).`);
  console.error(`\n${total} finding(s) across ${files.length} guide file(s).`);
  process.exit(total === 0 ? 0 : 1);
}

if (process.argv[1] && process.argv[1].endsWith('validate-examples.ts')) main();
