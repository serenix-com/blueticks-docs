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

async function main(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const server = createOpenAPI({
    input: [SPEC_PATH],
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

  // Copy spec to public/ so /openapi.json is served verbatim for Postman etc.
  await fs.mkdir('public', { recursive: true });
  await fs.copyFile(SPEC_PATH, join('public', 'openapi.json'));

  console.log(`[openapi] regenerated ${OUTPUT_DIR} from ${SPEC_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
