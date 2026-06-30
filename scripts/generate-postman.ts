#!/usr/bin/env node
/*
 * Regenerates Postman collection and environment files from openapi.json.
 * Invoked as part of `prebuild` (after generate-openapi-pages).
 *
 * Uses Postman's official converter (openapi-to-postmanv2). Output is
 * Postman Collection Format v2.1.0.
 *
 * Outputs:
 *   public/blueticks.postman_collection.json
 *   public/blueticks.localtest.postman_collection.json   (self-contained, → localhost)
 *   public/blueticks.production.postman_environment.json
 *   public/blueticks.staging.postman_environment.json
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { convert } from 'openapi-to-postmanv2';
import type { CollectionResult } from 'openapi-to-postmanv2';

const SPEC_PATH = './openapi.json';
const COLLECTION_OUT = './public/blueticks.postman_collection.json';
const LOCALTEST_OUT = './public/blueticks.localtest.postman_collection.json';
const PROD_ENV_OUT = './public/blueticks.production.postman_environment.json';
const STAGING_ENV_OUT = './public/blueticks.staging.postman_environment.json';

const PROD_URL = 'https://api.blueticks.co';
const STAGING_URL = 'https://stg-api.blueticks.co';
const LOCALTEST_URL = 'http://localhost:3310';

// Staging is internal-only — generated for deploy-preview, branch-deploy,
// and local builds, but suppressed on the production Netlify context where
// `NEXT_PUBLIC_API_SERVERS` is set to exactly the prod URL.
// See netlify.toml for the full matrix.
function shouldExposeStaging(): boolean {
  const csv = process.env.NEXT_PUBLIC_API_SERVERS;
  if (!csv) return true; // local / unset → expose
  return csv.includes('stg-');
}

// ---------------------------------------------------------------------------
// Postman collection types (subset we actually touch)
// ---------------------------------------------------------------------------

interface PostmanScript {
  type: 'text/javascript';
  exec: string[];
}

interface PostmanEvent {
  listen: 'prerequest' | 'test';
  script: PostmanScript;
}

interface PostmanAuth {
  type: 'bearer';
  bearer: Array<{ key: string; value: string }>;
}

interface PostmanUrl {
  host: string[];
  path: string[];
  query: unknown[];
  variable: unknown[];
}

interface PostmanRequest {
  name: string;
  description?: string;
  method: string;
  url: PostmanUrl;
  auth: PostmanAuth;
  header: unknown[];
}

interface PostmanItem {
  name: string;
  request?: PostmanRequest;
  item?: PostmanItem[];
  event?: PostmanEvent[];
}

interface PostmanCollection {
  info: {
    _postman_id: string;
    name: string;
    schema: string;
    description: { content: string; type: string } | string;
  };
  item: PostmanItem[];
  event?: PostmanEvent[];
  variable?: Array<{ key: string; value: string; type?: string }>;
}

// ---------------------------------------------------------------------------
// Postman environment types
// ---------------------------------------------------------------------------

interface EnvValue {
  key: string;
  value: string;
  enabled: boolean;
  type: 'default' | 'secret';
}

interface PostmanEnvironment {
  id: string;
  name: string;
  values: EnvValue[];
  _postman_variable_scope: 'environment';
  _postman_exported_at: string;
  _postman_exported_using: string;
}

// ---------------------------------------------------------------------------
// UUID v5 — deterministic from name, no extra deps
// ---------------------------------------------------------------------------

/**
 * Produces a UUID v5-shaped string (SHA1-derived) from `name`.
 * Format: xxxxxxxx-xxxx-5xxx-yxxx-xxxxxxxxxxxx
 * Stable across reruns — re-importing the same env into Postman won't dupe it.
 */
function uuidV5FromName(name: string): string {
  const hash = createHash('sha1').update(name).digest('hex');
  // Pull 32 hex chars (16 bytes) and format as UUID v5
  const h = hash.slice(0, 32);
  // version nibble = 5, variant bits = 10xx
  const variantNibble = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    '5' + h.slice(13, 16),
    variantNibble + h.slice(17, 20),
    h.slice(20, 32),
  ].join('-');
}

// ---------------------------------------------------------------------------
// Collection post-processing
// ---------------------------------------------------------------------------

const PREREQUEST_EXEC = [
  "const apiKey = pm.environment.get('apiKey') || pm.collectionVariables.get('apiKey');",
  "if (apiKey) pm.collectionVariables.set('bearerToken', apiKey);",
];

const VALIDATE_TEST_EXEC = [
  "pm.test('200 OK', () => pm.response.to.have.status(200));",
  "pm.test('returns an account id', () => {",
  '  const json = pm.response.json();',
  "  pm.expect(json).to.have.property('id');",
  "  console.log('Authenticated as account:', json.name || json.id);",
  '});',
];

const COLLECTION_DESCRIPTION =
  'Auto-generated from openapi.json. Import a Blueticks Postman environment ' +
  '(Production or Staging) alongside this collection, paste your API key into ' +
  "the env's `apiKey` field, and every request authenticates automatically.\n\n" +
  'Need a key? Generate one at https://www.blueticks.co/dashboard.';

function buildAuthFolder(): PostmanItem {
  const validateRequest: PostmanItem = {
    name: 'Validate API key',
    request: {
      name: 'Validate API key',
      description:
        'Calls GET /v1/account to confirm your API key is valid. On success, the test script ' +
        'confirms the key and prints the account name. Use this as the first request after ' +
        'pasting your apiKey into the environment.',
      method: 'GET',
      url: {
        host: ['{{baseUrl}}'],
        path: ['v1', 'account'],
        query: [],
        variable: [],
      },
      auth: {
        type: 'bearer',
        bearer: [{ key: 'token', value: '{{bearerToken}}' }],
      },
      header: [],
    },
    event: [
      {
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: VALIDATE_TEST_EXEC,
        },
      },
    ],
  };

  return {
    name: '🔑 Authentication',
    item: [validateRequest],
  };
}

function postProcess(raw: object): PostmanCollection {
  // The converter returns a plain object matching our PostmanCollection shape.
  // We cast via unknown — no `as any`.
  const col = raw as unknown as PostmanCollection;

  // a. Collection-level pre-request script
  col.event = [
    {
      listen: 'prerequest',
      script: {
        type: 'text/javascript',
        exec: PREREQUEST_EXEC,
      },
    },
  ];

  // b. Prepend auth folder
  col.item = [buildAuthFolder(), ...col.item];

  // c. Update description
  col.info.description = COLLECTION_DESCRIPTION;

  return col;
}

const LOCALTEST_DESCRIPTION =
  'Auto-generated from openapi.json, preconfigured for LOCAL testing against ' +
  `${LOCALTEST_URL}. Self-contained — no environment import needed: the ` +
  '`baseUrl` collection variable already points at the local API. Paste your ' +
  'API key into the `apiKey` collection variable and every request ' +
  'authenticates automatically. Regenerated by scripts/generate-postman.ts ' +
  'alongside the main collection, so it never drifts from the spec.';

/**
 * Build the self-contained localtest collection: a clone of the main
 * collection with the `baseUrl` collection variable overridden to the local
 * API. Unlike the main collection (which expects a Production/Staging
 * environment to supply `baseUrl`), this one carries its own `baseUrl` +
 * `apiKey` so it works standalone for local development. Deep-cloned so we
 * never mutate the shared collection object.
 */
function buildLocaltestCollection(base: PostmanCollection): PostmanCollection {
  const col: PostmanCollection = JSON.parse(JSON.stringify(base));
  col.info.name = 'Blueticks API (Localtest)';
  col.info._postman_id = uuidV5FromName('Blueticks API Localtest');
  col.info.description = LOCALTEST_DESCRIPTION;
  // Self-contained vars: requests use {{baseUrl}}; the prerequest script reads
  // `apiKey` from collectionVariables when no environment is imported.
  col.variable = [
    { key: 'baseUrl', value: LOCALTEST_URL, type: 'default' },
    { key: 'apiKey', value: '', type: 'default' },
  ];
  return col;
}

// ---------------------------------------------------------------------------
// Environment file generation
// ---------------------------------------------------------------------------

function buildEnvironment(name: string, baseUrl: string): PostmanEnvironment {
  return {
    id: uuidV5FromName(name),
    name,
    values: [
      { key: 'baseUrl', value: baseUrl, enabled: true, type: 'default' },
      { key: 'apiKey', value: '', enabled: true, type: 'secret' },
    ],
    _postman_variable_scope: 'environment',
    _postman_exported_at: new Date().toISOString(),
    _postman_exported_using: 'Blueticks docs generator',
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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

  // Post-process the collection (mutates in memory)
  const collection = postProcess(result.output[0].data);

  await fs.writeFile(COLLECTION_OUT, JSON.stringify(collection, null, 2));
  console.log(`[postman] wrote ${COLLECTION_OUT}`);

  // Self-contained localtest collection (→ localhost), regenerated in lockstep
  // so it can't go stale relative to the spec.
  const localtest = buildLocaltestCollection(collection);
  await fs.writeFile(LOCALTEST_OUT, JSON.stringify(localtest, null, 2));
  console.log(`[postman] wrote ${LOCALTEST_OUT}`);

  // Write environment files
  const prodEnv = buildEnvironment('Blueticks (Production)', PROD_URL);
  await fs.writeFile(PROD_ENV_OUT, JSON.stringify(prodEnv, null, 2));
  console.log(`[postman] wrote ${PROD_ENV_OUT}`);

  if (shouldExposeStaging()) {
    const stagingEnv = buildEnvironment('Blueticks (Staging)', STAGING_URL);
    await fs.writeFile(STAGING_ENV_OUT, JSON.stringify(stagingEnv, null, 2));
    console.log(`[postman] wrote ${STAGING_ENV_OUT}`);
  } else {
    // Production build — make sure no stale staging file leaks into the
    // deployed `public/` if one was committed from a previous local run.
    await fs.rm(STAGING_ENV_OUT, { force: true });
    console.log(`[postman] suppressed staging env (production build)`);
  }
}

main().catch((err) => {
  console.error('[postman] generation failed:', err);
  process.exit(1);
});
