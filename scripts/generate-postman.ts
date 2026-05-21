#!/usr/bin/env node
/*
 * Regenerates public/blueticks.postman_collection.json from openapi.json.
 * Invoked as part of `prebuild` (after generate-openapi-pages).
 *
 * Uses Postman's official converter (openapi-to-postmanv2). Output is
 * Postman Collection Format v2.1.0.
 */
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { convert } from 'openapi-to-postmanv2';
import type { CollectionResult } from 'openapi-to-postmanv2';

const SPEC_PATH = './openapi.json';
const OUTPUT_PATH = './public/blueticks.postman_collection.json';

async function main(): Promise<void> {
  const data = await fs.readFile(SPEC_PATH, 'utf8');

  await fs.mkdir('public', { recursive: true });

  const result = await new Promise<CollectionResult>((resolve, reject) => {
    convert(
      { type: 'string', data },
      {
        folderStrategy: 'Tags',
        requestNameSource: 'Fallback',
        // Bearer auth — the spec already declares securitySchemes.BearerAuth.
        // openapi-to-postmanv2 picks this up automatically.
      },
      (err, res) => {
        if (err) return reject(new Error(err.message));
        if (!res) return reject(new Error('postman conversion returned no result'));
        resolve(res);
      },
    );
  });

  if (!result.result || !result.output || result.output.length === 0) {
    throw new Error(`postman conversion failed: ${result.reason ?? 'no output'}`);
  }

  const collection = result.output[0].data;
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(collection, null, 2));
  console.log(`[postman] wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('[postman] generation failed:', err);
  process.exit(1);
});
