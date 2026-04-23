# blueticks-docs

Developer documentation for the [Blueticks](https://blueticks.co) API,
published at [docs.blueticks.co](https://docs.blueticks.co).

Built with [Fumadocs](https://fumadocs.dev) on Next.js App Router. The
API reference under `/docs/api/` is regenerated from the OpenAPI
specification at build time via `fumadocs-openapi`.

## Local development

```bash
pnpm install
pnpm dev
# open http://localhost:3000
```

## Content

- `content/docs/*.mdx` — hand-written guides.
- `content/docs/api/*.mdx` — regenerated from `openapi.json` by
  `scripts/generate-openapi-pages.ts`. Do not edit by hand.

See `CLAUDE.md` for regeneration conventions.

## Deployment

Automatic via Vercel on push to `main`.
