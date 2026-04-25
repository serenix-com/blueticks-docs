# `blueticks-docs` conventions

You are editing the public developer documentation site for the Blueticks
API. Built with Fumadocs on Next.js App Router. Deployed on Netlify
(see `netlify.toml`) at https://dev.blueticks.co.

## Boundaries

### MAY edit by hand

- `content/docs/index.mdx`
- `content/docs/quickstart.mdx`
- `content/docs/authentication.mdx`
- `content/docs/errors.mdx`
- `content/docs/changelog.mdx`
- `content/docs/meta.json`
- `content/docs/api/index.mdx` (reference overview; hand-written)
- `app/**` (layouts, pages, config)
- `lib/**`
- `scripts/**`
- `public/**`
- `components/**`
- `source.config.ts`
- `package.json`, `tsconfig.json`, `next.config.mjs`, `.eslintrc.*`,
  `.github/workflows/*.yml`
- `README.md`, `CLAUDE.md`, `LICENSE`

### DO NOT edit by hand

- `content/docs/api/<tag>/**/*.mdx` (regenerated from openapi.json)
- `content/docs/api/<tag>/meta.json` (regenerated)
- `content/docs/api/meta.json` (regenerated)
- `openapi.json` at the repo root (syncs from blueticks-api orchestration)
- `pnpm-lock.yaml` unless adding/removing a dep

## Regeneration

`scripts/generate-openapi-pages.ts` runs as `prebuild` (invoked by
`pnpm build`). It reads `openapi.json` and writes `content/docs/api/*`.

If you need to change the API reference output:
1. Edit `scripts/generate-openapi-pages.ts`.
2. Run `pnpm run generate:openapi` locally.
3. Commit both the script change and the regenerated `content/docs/api/`.

CI rejects PRs where the generated output is out of sync with the
committed files (via `git diff --exit-code content/docs/api/`).

## Content conventions

- **Code samples in hand-written pages** use snake_case wire fields
  (matching the SDKs and the API response format). Field names like
  `account_id`, `created_at`, `key_prefix`.
- **SDK code tabs** always use the group id `sdk` so selection
  synchronizes across pages: `<Tabs groupId="sdk" persist items={['Python','Node.js','PHP']}>`.
- **Internal links** are absolute from site root: `/docs/<path>`.
- **Frontmatter** requires `title` and `description`. Optional: `icon`
  (lucide-react name).

## Code tab ordering

Always **Python → Node.js → PHP**. Rationale: matches SDK release order
and keeps visual consistency; do not reorder.

## Running locally

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm typecheck    # tsc --noEmit
pnpm lint         # next lint
pnpm build        # full prebuild + Next build
```

## Success criteria

1. `pnpm build` exits 0.
2. `git diff --exit-code content/docs/api/` is clean after `pnpm build`.
3. All internal links resolve.
4. Search returns results for hand-written terms like "account",
   "quickstart", "rate limit".
