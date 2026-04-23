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

  await generateFiles({
    input: server,
    output: OUTPUT_DIR,
    per: 'operation',
    groupBy: 'tag',
    meta: true,
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
