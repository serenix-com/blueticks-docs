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
      description,
      full: true,
    }),
  });

  // Post-process the generated MDX files: fumadocs bakes the input path
  // into each <APIPage document="..."> reference, but at runtime we want
  // the page components to fetch the unfiltered ./openapi.json (the same
  // file external tools consume from public/openapi.json). Rewrite all
  // <APIPage> document references back to "./openapi.json".
  const mdxFiles = await collectMdx(OUTPUT_DIR);
  const filteredRef = `document={"${FILTERED_SPEC_PATH}"}`;
  const canonicalRef = `document={"./openapi.json"}`;
  for (const file of mdxFiles) {
    const content = await fs.readFile(file, 'utf8');
    if (content.includes(filteredRef)) {
      await fs.writeFile(file, content.split(filteredRef).join(canonicalRef));
    }
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
