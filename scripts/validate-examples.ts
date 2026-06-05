#!/usr/bin/env tsx
import { readFileSync, writeFileSync, globSync } from 'node:fs';
import { join, relative } from 'node:path';
import { extractExamples } from './lib/extract-examples';
import { resolveOperation, isRequestCandidate } from './lib/resolve-operation';
import { parseBody } from './lib/parse-body';
import { checkBody } from './lib/check-body';
import { applyFixes } from './lib/autofix';
import type { Finding } from './lib/types';

const DOCS_ROOT = join(__dirname, '..');
const SPEC_PATH = join(DOCS_ROOT, 'openapi.json');
const GUIDE_GLOB = 'content/docs/*.mdx'; // top-level guides only; excludes content/docs/api/**

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

/** For SDK languages, strip path-parameter keys from a parsed body object. */
function stripPathParams(body: Record<string, unknown>, opPath: string, lang: string): Record<string, unknown> {
  if (lang !== 'ts' && lang !== 'js' && lang !== 'python') return body;
  const params = pathParamNames(opPath);
  if (params.size === 0) return body;
  const stripped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!params.has(k)) stripped[k] = v;
  }
  return stripped;
}

export function validateFile(file: string, src: string, spec: any): { findings: Finding[] } {
  const groups = extractExamples(file, src);
  const findings: Finding[] = [];

  for (const group of groups) {
    if (group.skip) continue;
    const candidates = group.blocks.filter(isRequestCandidate);
    if (candidates.length === 0) continue;

    const op = resolveOperation(group, spec);
    if (!op) {
      for (const b of candidates) findings.push({
        file, line: b.startLine, groupId: group.groupId, lang: b.lang,
        kind: 'dead-endpoint', message: 'Could not resolve example to an OpenAPI operation', fixable: false,
      });
      continue;
    }

    // Skip body parsing/checking entirely for operations with no request body schema
    if (!hasRequestBody(spec, op)) continue;

    for (const b of candidates) {
      const parsed = parseBody(b.lang, b.code);
      if (!parsed.ok) {
        findings.push({
          file, line: b.startLine, groupId: group.groupId, lang: b.lang,
          kind: 'unparseable', message: `Could not parse request body: ${parsed.reason}`, fixable: false,
        });
        continue;
      }
      const body = stripPathParams(parsed.body, op.path, b.lang);
      findings.push(...checkBody(body, op, spec, { file, line: b.startLine, groupId: group.groupId }, b.lang));
    }
  }
  return { findings };
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
      const body = stripPathParams(parsed.body, op.path, b.lang);
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
  const files = globSync(GUIDE_GLOB, { cwd: DOCS_ROOT }).map((f: string) => join(DOCS_ROOT, f));

  let total = 0;
  let fixedTotal = 0;
  const allFindings: Finding[] = [];

  for (const abs of files) {
    const rel = relative(DOCS_ROOT, abs);
    let src = readFileSync(abs, 'utf8');
    if (fix) {
      const r = applyFileFixes(rel, src, spec);
      if (r.applied > 0) { writeFileSync(abs, r.content); src = r.content; fixedTotal += r.applied; }
    }
    const { findings } = validateFile(rel, src, spec);
    allFindings.push(...findings);
    total += findings.length;
  }

  for (const f of allFindings) {
    console.error(`${f.file}:${f.line}  [${f.kind}] ${f.message}${f.suggestion ? `  → did you mean '${f.suggestion}'?` : ''}`);
  }
  if (fix) console.error(`\nApplied ${fixedTotal} fix(es).`);
  console.error(`\n${total} finding(s) across ${files.length} guide file(s).`);
  process.exit(total === 0 ? 0 : 1);
}

if (process.argv[1] && process.argv[1].endsWith('validate-examples.ts')) main();
