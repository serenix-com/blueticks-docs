#!/usr/bin/env node
/*
 * Regenerates content/docs/api/* from openapi.json.
 * Invoked as `prebuild` by `pnpm build`.
 *
 * fumadocs-openapi v10 API notes:
 *   - generateFiles() takes { input: OpenAPIServer, output: string, per?, groupBy?, meta? }
 *   - OpenAPIServer is created via createOpenAPI({ input: string[] })
 *   - The generated MDX files emit <APIPage> tags — wire this component in components/mdx.tsx
 */

import { generateFiles } from 'fumadocs-openapi';
import { createOpenAPI } from 'fumadocs-openapi/server';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const OUTPUT_DIR = 'content/docs/api';
const SPEC_PATH = './openapi.json';
// We read SPEC_PATH, drop noisy operations, and write this filtered copy
// for fumadocs to consume. The runtime APIPage components still resolve
// against ./openapi.json (the unfiltered original served from public/),
// so the filter only affects what pages get generated, not what data
// the page components fetch.
const FILTERED_SPEC_PATH = './.openapi.docs.json';

async function main(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Wipe the generated tag folders before regenerating. fumadocs writes
  // new files but doesn't remove orphans (e.g. when a path is dropped or
  // its summary changes). Without this cleanup, stale MDX files
  // accumulate in tag folders even though they're no longer in meta.json.
  // The hand-written index.mdx is preserved; everything else under
  // OUTPUT_DIR is regenerated.
  for (const ent of await fs.readdir(OUTPUT_DIR, { withFileTypes: true })) {
    if (ent.name === 'index.mdx') continue;
    await fs.rm(join(OUTPUT_DIR, ent.name), { recursive: true, force: true });
  }
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // feathers-swagger auto-emits both PUT and PATCH on every Feathers
  // service (the underlying ORM doesn't distinguish), but the public
  // backend only exposes one of them. The vestigial companion has an
  // empty `summary` AND `security: []` (no auth required) — that pair
  // is the signature of the auto-emit, not an intentional surface.
  // Without dropping it, fumadocs generates a duplicate doc page named
  // verbatim from the path (e.g. "/v1/scheduled-messages/{id}").
  const raw = await fs.readFile(SPEC_PATH, 'utf8');
  const spec = JSON.parse(raw) as { paths?: Record<string, Record<string, unknown>> };
  const isAutoEmittedNoise = (op: unknown): boolean => {
    if (!op || typeof op !== 'object') return false;
    const o = op as { summary?: string; security?: unknown[] };
    return !o.summary && Array.isArray(o.security) && o.security.length === 0;
  };
  if (spec.paths) {
    for (const [, pathItem] of Object.entries(spec.paths)) {
      for (const method of ['put', 'patch'] as const) {
        if (isAutoEmittedNoise(pathItem[method])) {
          delete pathItem[method];
        }
      }
    }
  }
  await fs.writeFile(FILTERED_SPEC_PATH, JSON.stringify(spec, null, 2));

  const server = createOpenAPI({
    input: [FILTERED_SPEC_PATH],
  });

  // Flatten file paths under each tag folder.
  // Default v2 algorithm produces e.g. `audiences/v1/audiences/id/contacts/post.mdx`
  // — verbose URL-segment nesting that bloats the sidebar. We replace it with
  // a slug derived from the operation summary ("Append contacts to audience" ->
  // "append-contacts-to-audience"), falling back to method+path when summary
  // is absent. One file per operation, all siblings under the tag folder.
  const slugify = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const usedNames = new Map<string, number>();

  await generateFiles({
    input: server,
    output: OUTPUT_DIR,
    per: 'operation',
    groupBy: 'tag',
    meta: true,
    name: (output) => {
      const summary = output.info.title;
      const item = (output as { item?: { method?: string; path?: string } }).item;
      const fallback = `${item?.method ?? 'op'}-${(item?.path ?? '').replace(/^\/+|\/+$/g, '').replace(/[/{}]+/g, '-')}`;
      const base = summary ? slugify(summary) : slugify(fallback);
      // De-dupe within a tag — append -2, -3 if multiple ops share a summary
      const count = (usedNames.get(base) ?? 0) + 1;
      usedNames.set(base, count);
      return count === 1 ? base : `${base}-${count}`;
    },
    frontmatter: (title, description) => ({
      title,
      // Frontmatter description is rendered as a flat paragraph at the
      // top of the page — no markdown processing. Strip to just the
      // first sentence/line so multi-line variant breakdowns don't
      // appear as a wall of text. Long-form description (variant
      // examples, etc.) lands in the MDX body via the post-process
      // step below, where markdown renders properly.
      description: firstSentence(description),
      full: true,
    }),
  });

  // Post-process the generated MDX files. Two transforms:
  //   1. Rewrite <APIPage document="..."> back to ./openapi.json — fumadocs
  //      bakes the FILTERED spec path into the file, but at runtime we
  //      want the unfiltered original (same as public/openapi.json).
  //   2. Inject the operation's full markdown description into the MDX
  //      BODY as a prose block above <APIPage>. The frontmatter
  //      description was truncated to the first sentence (above), so we
  //      need the long-form variant breakdown rendered here where
  //      Fumadocs MDX processes markdown properly.
  const mdxFiles = await collectMdx(OUTPUT_DIR);
  const filteredRef = `document={"${FILTERED_SPEC_PATH}"}`;
  const canonicalRef = `document={"./openapi.json"}`;
  // Build a path+method → description map from the spec so we can match
  // each generated MDX file back to its operation.
  const opDescriptions = collectOperationDescriptions(spec);
  for (const file of mdxFiles) {
    let content = await fs.readFile(file, 'utf8');
    if (content.includes(filteredRef)) {
      content = content.split(filteredRef).join(canonicalRef);
    }
    const op = matchOperation(content, opDescriptions);
    if (op && op.body) {
      content = injectDescriptionBody(content, op.body);
    }
    await fs.writeFile(file, content);
  }

  // Copy spec to public/ so /openapi.json is served verbatim for Postman etc.
  // We serve the unfiltered original (PUT operations included) — Postman
  // imports and external tools should see the full API surface.
  await fs.mkdir('public', { recursive: true });
  await fs.copyFile(SPEC_PATH, join('public', 'openapi.json'));
  await fs.unlink(FILTERED_SPEC_PATH).catch(() => {
    /* ignore — leftover filtered file is harmless */
  });

  console.log(`[openapi] regenerated ${OUTPUT_DIR} from ${SPEC_PATH}`);
}

/**
 * Take the first sentence of a description (or first line if no full
 * stop). Used for the MDX frontmatter `description` field, which is
 * rendered as plain text by Fumadocs — markdown lists/bold are shown
 * literally, so longer multi-line content has to live in the MDX body.
 */
function firstSentence(text: string | undefined): string {
  if (!text) return '';
  const trimmed = text.trim();
  // First period followed by space/newline/EOS, or first newline.
  const m = trimmed.match(/^(.+?[.!?])(?=\s|$)/s);
  if (m) return m[1].trim();
  return trimmed.split(/\r?\n/)[0]!.trim();
}

interface OpDesc {
  path: string;
  method: string;
  summary: string;
  // Long-form portion of the description (everything AFTER the first
  // sentence). Empty when the description is short enough to live
  // entirely in the frontmatter.
  body: string;
}

function collectOperationDescriptions(spec: any): OpDesc[] {
  const out: OpDesc[] = [];
  for (const [p, item] of Object.entries(spec.paths ?? {}) as [string, any][]) {
    for (const [method, op] of Object.entries(item)) {
      if (!op || typeof op !== 'object' || Array.isArray(op)) continue;
      const o = op as { summary?: string; description?: string };
      if (!o.description) continue;
      const head = firstSentence(o.description);
      const body = o.description.trim().slice(head.length).trim();
      out.push({ path: p, method, summary: o.summary ?? '', body });
    }
  }
  return out;
}

function matchOperation(mdxContent: string, ops: OpDesc[]): OpDesc | undefined {
  // Each generated MDX has an APIPage tag like:
  //   <APIPage document={"./openapi.json"} operations={[{"path":"/v1/messages","method":"post"}]} />
  const m = mdxContent.match(/operations=\{\[\{"path":"([^"]+)","method":"([^"]+)"\}\]\}/);
  if (!m) return undefined;
  const [, path, method] = m;
  return ops.find((o) => o.path === path && o.method === method);
}

function injectDescriptionBody(mdxContent: string, body: string): string {
  // Insert the long-form description as a prose block immediately
  // before <APIPage. Fumadocs MDX renders this as full markdown.
  const apiPageMatch = mdxContent.indexOf('<APIPage');
  if (apiPageMatch === -1) return mdxContent;
  const before = mdxContent.slice(0, apiPageMatch);
  const after = mdxContent.slice(apiPageMatch);
  return `${before}${body}\n\n${after}`;
}

async function collectMdx(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await collectMdx(full)));
    } else if (ent.name.endsWith('.mdx')) {
      out.push(full);
    }
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
