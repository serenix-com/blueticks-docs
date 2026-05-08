# Docs site UX review — pre-release fix list

Date: 2026-05-08
Scope: `blueticks-api/docs/` (the public dev.blueticks.co Fumadocs site).
Goal: comprehensive pre-release UX pass — fix or remove anything non-functional.

## Issues catalogued (from a Playwright walkthrough of every page)

### A. Navigation duplication
1. `Quickstart` appears twice in the left sidebar — as a top-tab link AND as a regular nav entry.
2. `API Reference` appears twice — as a top-tab link AND as the expandable section header.
3. `Messages` and `Webhooks` appear twice — once under **Guides** (hand-written explainers) and once under **API Reference** (auto-generated reference for the resource). Same labels, different content, no visual differentiation.

### B. API operation page layout
4. After the playground card (`Server URL` / `POST /v1/...` / `Authorization` / `Header` / `Body` collapsibles), the `Authorization` h2 below the card has no top spacing — it visually sticks to the bottom edge of the card.
5. The `BearerAuth` / `application/json` "tag" labels are right-aligned on the same baseline as the next h2, producing an overlap.
6. Schema constraint badges (e.g. `Length length ≤ 64`) from a parameter list bleed into the next section's h2 (`Request Body`), producing the visible overlap shown in the user's screenshot.
7. Operation pages have no right-side `On this page` TOC; hand-written pages do. Inconsistent.

### C. API playground non-functional
8. The `Send` button POSTs to `https://api.blueticks.co/v1/*`, which currently returns 404 — the public API is not yet deployed at the prod host. Every visitor's first interaction is a guaranteed failure.
9. Clicking the `Server URL` pill opens a centered dialog with one read-only entry (only one server is in `openapi.json`). The dialog is not styled into the page layout — it spans the full viewport width — and offers no useful action.

### D. Smaller polish
10. Console shows `Error retrieving a token` on every page (likely a GA4 init guard).
11. `meta.json` uses `"---Guides---"` as a section divider and a bare `"---"` above `changelog`. The latter divider has no semantic meaning visually.

---

## Decisions (confirmed with user)

- **Top tabs:** remove entirely. Sidebar is the single source of truth for navigation.
- **Playground:** make it functional via env-driven server URL — production deploy points at prod, staging deploy points at staging (`https://stg-api.blueticks.co`), local dev can pick from a dropdown. Keep the `Send` button; fix the broken bits; do not remove the playground.

---

## Plan

### Step 1 — nav consolidation (`lib/layout.shared.tsx`, `content/docs/meta.json`)

- Remove the `links` array from `baseOptions()`. Sidebar becomes the only navigation surface; the "tabs" above the search bar disappear.
- Rename the four guide pages to verb-form titles so they don't collide with API ref tag names. File-level `frontmatter.title` updates only; no slug changes (URLs stable):
  - `messages.mdx` → "Sending messages"
  - `webhooks.mdx` → "Receiving webhooks"
  - `campaigns.mdx` → "Running campaigns"
  - `mcp.mdx` → "Using the MCP server"
- Replace the `"---Guides---"` separator with the Fumadocs canonical group title syntax (a `{ "type": "separator", "name": "Guides" }` entry) and drop the bare `"---"` above `changelog` (changelog stays as a top-level entry — no fake divider).

### Step 2 — env-driven server URL

Goal: the playground sends real requests to the right host without hard-coding it.

- Introduce env var `NEXT_PUBLIC_API_SERVER_URL`. Resolution order:
  1. If set, that single URL becomes the only server.
  2. If unset (local dev), expose **both** `https://api.blueticks.co` (prod) and `https://stg-api.blueticks.co` (staging) so dev can switch in the dropdown — and the existing `Server URL` modal becomes meaningful (multiple options).
- Implementation:
  - `lib/openapi.ts` — load `openapi.json`, mutate `servers` based on the env var, pass the resulting object to `createOpenAPI` (it accepts raw objects via `input`).
  - `scripts/generate-openapi-pages.ts` — same transformation applied to `FILTERED_SPEC_PATH` so the generated MDX renders the right host in cURL examples and the playground.
  - `netlify.toml` — set `NEXT_PUBLIC_API_SERVER_URL=https://api.blueticks.co` for production context, `https://stg-api.blueticks.co` for the deploy-preview / branch context. (Netlify supports per-context env in `[context.<name>.environment]`.)
  - `.env.example` documents the variable; local dev leaves it unset to get both options.
- The `openapi.json` checked into git remains canonical (single `https://api.blueticks.co` server) — it's the spec the SDKs and external tools consume. Server-list mutation happens only inside the docs site's runtime/build path.

### Step 3 — operation page layout fixes (`app/global.css`)

Targeted CSS scoped to operation pages (Fumadocs OpenAPI components emit predictable class names — `.fd-api-playground`, `[id^="api-"]` etc.). Fixes:

- Add `margin-bottom` (≈2rem) to the playground card container so the next h2 doesn't kiss it.
- Force schema constraint pills (`<Property>` `Length` / `Format` / `Match` badges) into the property's own block, not floating into the next section. Concretely: wrap them in a flex container with `clear: both` or set the parent `<div>` to `display: block` with explicit bottom margin.
- Fix the right-aligned auth/content-type tags (`BearerAuth`, `application/json`) — either:
  - Stack them above the heading on narrow rows (mobile-style) at all widths, OR
  - Drop them entirely (they duplicate info already shown inside the section).
  - **Choose:** stack above. The labels carry useful info (which auth scheme, which content type) and just need not to overlap.
- Make sure `h2` inside a `.full` page (operation pages have `full: true` frontmatter) gets a proper `margin-top` reset.

### Step 4 — TOC parity

- Operation pages use `frontmatter.full = true`, which Fumadocs honors by widening content and (depending on layout config) hiding the right-rail TOC. Decide:
  - **Recommended:** flip `full: false` for operation pages so they get the same TOC treatment as guides. The playground card and tables still fit at the standard width — verified by spot-checking the longest operation page (`send-message`).
  - Alternative: keep `full: true` but render a custom TOC inside the article body. More work, recommend not doing this.
- Update `frontmatter` emission in `scripts/generate-openapi-pages.ts` accordingly.

### Step 5 — polish

- Wrap the GA4 init in a try/catch or guard the `gtag('js', new Date())` call so the `Error retrieving a token` warning stops appearing. Investigation first — confirm root cause before suppressing.
- Re-test in browser after each step.

---

### Step 6 — strip FeathersJS leak from the public spec (`blueticks-api/backend/`)

**Problem (verified):** 8 endpoints currently expose `$limit` / `$skip` / `$sort` / `filter` as documented query parameters. Source: `feathers-swagger` auto-injects the standard Feathers query interface for every service registered with a `find()` method, even when the implementation ignores those params.

| Endpoint | Today | Should be |
|---|---|---|
| `GET /v1/account` | `$limit, $skip, $sort, filter` | *(no params — singleton)* |
| `GET /v1/webhooks` | `$limit, $skip, $sort, filter` | `limit, cursor` |
| `GET /v1/audiences` | `$limit, $skip, $sort, filter` | `limit, cursor` |
| `GET /v1/campaigns` | `$limit, $skip, $sort, filter` | `limit, cursor, status?` |
| `GET /v1/chats` | `$limit, $skip, $sort, filter` | `limit, cursor` |
| `GET /v1/contacts` | `$limit, $skip, $sort, filter` | `limit, cursor` |
| `GET /v1/engines` | `$limit, $skip, $sort, filter` | *(no params — small enum list)* |
| `GET /v1/scheduled-messages` | `$limit, $skip, $sort, filter` | `limit, cursor` |

`GET /v1/messages` and the chats sub-endpoints already document `limit/cursor` correctly — those are the model.

**Approach (chosen):** explicit `parameters` per endpoint in each service's `(service as any).docs.operations.find` block. Mirrors what `messages.service.ts` already does. Avoids spooky-action-at-a-distance from a centralized post-processor.

For each list service:
- Verify the implementation actually paginates via `findPaged` / `findPagedAggregate` (cursor-based — confirmed in `lib/paginate.ts`).
- Set `parameters` to `[ {limit}, {cursor} ]` matching the existing `messages` shape.
- For non-list singletons (`account`, `engines` if it's not paginated), set `parameters: []`.
- For `campaigns`, add a `status` filter param (the only documented filter need today). Other resources defer named filter params to a follow-up — no callers exist yet.

After the rename:
- Update `lib/paginate.ts` `CursorQuery` is already correct (`limit` + `cursor`); no change needed.
- Re-run `pnpm build && pnpm export:openapi` in backend.
- Re-run `./regenerate.sh` from the orchestration repo to push the new spec into `blueticks-api/docs/openapi.json`.
- Verify the docs site re-renders with clean param names.

**Sort:** deferred. None of the eight endpoints exposes a server-side sort today (they're all `createdAt DESC, _id DESC`). Adding `?sort=-created_at` requires actual sort logic — out of scope for this pass. Document the fixed-order behaviour in the description text instead.

**Tests:** the backend has unit tests for these services. The docs config change is a metadata-only change — no runtime behavior changes — so existing tests should pass. Add a `__tests__` assertion that the exported `openapi.json` does not contain any `$`-prefixed query param names (regression guard).

---

## Out of scope (flag, do not fix here)

- Adding rich named filter params per resource (e.g. `?status=delivered&from=...` on `/v1/messages`). The current spec doesn't expose `filter` usefully anyway — and all eight list endpoints already work without it.
- Server-side sort beyond `createdAt DESC`.
- Mobile responsiveness — explicit split into a separate session/PR (user decision). No spot-check during this pass either; mobile QA gets its own end-to-end walkthrough.
- Search relevance, sitemap, OpenGraph tuning.
