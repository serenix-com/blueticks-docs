# Blueticks API Docs — Review & Cleanup Progress

Reviewing the developer docs at `http://localhost:3000/docs` page by page, like a
developer landing on them cold. Goal: clear, consistent, well-organized docs —
every endpoint shown with **cURL + every SDK**, guides that teach the common
cases simply, and no duplicated/confusing explanations.

Status legend: ⬜ todo · 🟡 in progress · ✅ done

---

## Architecture (how the docs are built)

- **Framework:** Fumadocs (Next.js) in `blueticks-api/docs`. Dev server on `:3000`.
- **Guides** (`content/docs/*.mdx`) — hand-written. These are the front door.
- **API Reference** (`content/docs/api/**`) — **auto-generated** at build time by
  `scripts/generate-openapi-pages.ts` from `openapi.json`. Each page embeds an
  `<APIPage>` playground. **Do not hand-edit these** — they're regenerated.
- **`openapi.json`** — itself **generated from the backend**
  (`blueticks-api/backend/scripts/export-openapi.js` + `openapi-custom-paths.ts`).
  → Reference-page **prose** (summaries/descriptions) is sourced there.
- **SDK code samples** on reference pages — injected per-operation by
  `lib/openapi.ts` → `buildCodeSamples()`, which resolves the SDK
  resource/method via `scripts/lib/sdk-mapping.ts`.

Sources of truth, where fixes belong:
| What you see | Fix it in |
| --- | --- |
| Guide content | `content/docs/*.mdx` (this repo) |
| Reference page prose | backend `openapi-custom-paths.ts` / route descriptions, then regenerate |
| Reference SDK code samples | `scripts/lib/sdk-mapping.ts` (this repo) |
| Sidebar order / grouping | `content/docs/**/meta.json` + generator `TAG_ORDER` |

---

## 🔴 Systemic issues found

### S1 — 9 reference pages show cURL only (no SDK samples) ✅ root-caused
The headline complaint. `buildCodeSamples()` emits Python/Node/PHP only when
`sdk-mapping.ts` resolves a resource+method. Its `SDK_METHOD_OVERRIDES` keys
still use the **old path convention** (`/v1/chats/{chat_id}/messages/...`) from
before the `/v1/messages/{chat_id}` URL restructure → no override matches → no
SDK sample. Affected ops (all `/v1/messages/*`):
- `POST /v1/messages/{chat_id}` (Send message) ← the page the user flagged
- `GET /v1/messages/{chat_id}/{key}` (Get message)
- `GET /v1/messages/ack/{chat_id}/{key}`
- `POST /v1/messages/reactions/{chat_id}/{key}`
- `POST /v1/messages/load_older/{chat_id}`
- `GET /v1/messages/media_url/{chat_id}/{key}`
- `GET /v1/messages/media/{chat_id}/{key}`
- `POST /v1/messages/acks`
- `GET /v1/messages/pinned/{chat_id}`

### S2 — Some generated SDK samples are WRONG ✅ found
`forwardResource()` assumes the first URL segment == SDK resource. False for
`/v1/messages/*`: those belong to the SDK's **`chats`** resource
(`bt.chats.send_message`, `bt.chats.react`, …), not a `messages` resource
(which doesn't exist in the SDKs). So:
- `GET /v1/messages` currently generates `bt.messages.list(...)` — **no such
  method**. Should map to the chats/scheduled-messages search method.
- Once S1 is "fixed" naively it would emit `bt.messages.send_message` — also wrong.
→ Fix needs a **resource override** (messages-prefix → `chats`) plus
per-op method overrides keyed to the **current** spec paths, verified against
the real SDK surface in `sdks/{python,node,php}`.

### S3 — ~8 reference pages have no prose description (bare playground)
No `description` in the spec → page is just the interactive playground, no
explanation. Fix in backend spec source, then regenerate. Affected:
`GET /v1/audiences`, `GET /v1/audiences/{id}`, `GET /v1/campaigns`,
`GET /v1/campaigns/{id}`, `GET /v1/chats`, `GET /v1/chats/{id}`,
`GET /v1/groups/{id}`, `GET /v1/contacts`.

### S4 — Guide ↔ SDK ↔ spec drift
Guide examples reference methods/paths that may not match the shipped SDK after
the URL restructure. E.g. `messages.mdx` uses `bt.messages.react(...)` and cites
`POST /v1/messages/reactions/{chat_id}/{key}`, while the SDK exposes
`bt.chats.react(chat_id, key, emoji=...)`. Every SDK snippet in the guides needs
verifying against `sdks/` (or the `validate:examples` script).

### S5 — Guides duplicate the reference (organization)
`messages.mdx` has grown into a mega-page (~630 lines) that re-documents groups,
newsletters, chats, acks, media, pinned, etc. — most of which have their own
reference pages. It tries to be both a guide and a reference. Per the user's ask
("guides should explain the most common cases in the simplest way, hands-on"),
guides should teach the core flow and link out to reference for the long tail.

---

## Page-by-page review

### Guides
- ✅ **Introduction** (`index.mdx`) — clear. Minor: "Next steps" list partly
  duplicates the sidebar; fine.
- ✅ **Quickstart** (`quickstart.mdx`) — strong. install → key → ping → account.
- ✅ **Authentication** (`authentication.mdx`) — clear. (Note: says "Create key",
  later "GET /v1/ping" to verify — consistent.)
- ✅ **Errors & retries** (`errors.mdx`) — excellent, thorough.
- 🟡 **Sending messages** (`messages.mdx`) — good core, but **overloaded** (S5).
  Verify all SDK snippets (S4). Consider trimming the reference-dump tail
  (groups/newsletters/chats/acks/media) to short "see reference" pointers.
- 🟡 **Receiving webhooks** (`webhooks.mdx`) — solid. Verify SDK snippets.
- 🟡 **Running campaigns** (`campaigns.mdx`) — solid. Verify SDK snippets
  (e.g. PHP `campaigns->create` positional args look off).
- ✅ **Using the MCP server** (`mcp.mdx`) — clear.

### Reference (generated) — common issues
- S1 cURL-only on the 9 `/v1/messages/*` ops.
- S2 wrong SDK resource/method names for messages ops.
- S3 missing descriptions on ~8 list/get ops.
- Otherwise consistent layout (collapsed error envelope, response tabs).

---

## Fix plan (prioritized)

1. **S1+S2 — SDK code samples** (`sdk-mapping.ts`): rebuild the path→(resource,
   method) map against the **current** spec paths and the **real** SDK surface so
   all 56 ops emit correct cURL + Python + Node + PHP. _Highest impact, this repo._
2. **S4 — verify guide SDK snippets** against `sdks/` + `validate:examples`.
3. **S5 — reorganize guides**: trim `messages.mdx` to core flows; demote the
   reference-dump sections to brief pointers. (Pending scope confirm.)
4. **S3 — reference prose**: add descriptions for the ~8 bare ops in backend
   spec source; regenerate.
5. **Verify**: `pnpm generate:openapi`, `pnpm validate:examples`, `pnpm build`,
   visual spot-check in browser.

---

## Verification log

### ✅ S1 + S2 — SDK code samples (per-language rewrite)
- Root cause: `sdk-mapping.ts` override keys used the pre-restructure
  `/v1/chats/{chat_id}/messages/...` paths, and `forwardResource` assumed the
  URL prefix == SDK resource. Deeper: the 3 SDKs genuinely diverge —
  - `/v1/messages/*` is a `messages` resource in Node (`bt.messages.send`) but
    `chats` in Python/PHP (`bt.chats.send_message` / `$bt->chats->sendMessage`);
  - single-resource GET is `get` in Python/Node, `retrieve` in PHP;
  - `engines` GET is `status` in Node, `retrieve` elsewhere;
  - `ping` is a callable client method in Python (`bt.ping()`).
- Fix: rewrote `scripts/lib/sdk-mapping.ts` to resolve **per language** from
  tables verified against `sdks/{python,node,php}`; rewrote `buildCodeSamples`
  in `lib/openapi.ts` to render each language from its own resolved call.
- **Verified:** exhaustive check across all 56 ops × 3 langs →
  **166 samples generated, 0 mismatches** against the real SDK surfaces. The
  only cURL-only page left is `GET /v1/messages/pinned/{chat_id}` (Python/PHP
  have no method yet; Node shows `messages.listPinned`). `tsc --noEmit` clean
  on changed files (only pre-existing missing-devDep errors remain). Added
  per-language unit tests in `__tests__/sdk-mapping.test.ts` (vitest not
  installed in this env; logic verified via tsx). Browser: send-message page
  now renders cURL + Python + Node.js + PHP tabs (was cURL-only).

### ✅ S4 — guide SDK snippet drift
- `messages.mdx` React section used `bt.messages.react` / `$bt->messages->react`
  for Python/PHP — wrong (no `messages` resource there). Fixed to `chats`.
  Node `bt.messages.react` is correct (Node has a `messages` resource) — kept.
- Audited every `bt.*`/`$bt->*` call in the guides against the SDK surfaces;
  the rest (incl. campaigns Node `audience_id`/`on_missing_variable`, PHP
  `campaigns->retrieve`) are correct.

### ✅ S5 — guide reorganization
- Per user: trimmed `messages.mdx` to core hands-on flows. Replaced the
  reference-dump tail (read conversations, acks, inbound media, manage groups,
  manage channels — ~80 lines of `<ApiExample>` blocks) with a compact
  "Beyond sending" pointer list linking to the reference pages.

### ✅ S3 — missing reference descriptions
- Added descriptions at the durable backend source for the 8 bare ops
  (`audiences` find/get, `campaigns` find/get, `chats` find/get, `contacts`
  find, `groups` get) in `backend/src/services/api/v1/*/*.service.ts`.
- Backend regeneration needs a full app boot (DB/Redis) — out of scope here —
  so also patched the docs' committed `openapi.json` with the identical text
  and reran `generate:openapi`. **Verified** all 8 now render in the generated
  pages. Next backend `export:openapi` will reproduce the same text.

## Hardening pass — 5 review cycles

### ✅ Cycle 1 — link & cross-reference integrity
- Verified **every** internal `/docs/...` link and `<ApiExample op>` in the
  guides resolves to a real page / spec operation — **0 broken**. No anchor
  links pointed into the sections trimmed out of `messages.mdx`.
- Confirmed the API-Reference download artifacts exist in `public/`
  (`openapi.json` + 3 Postman files). Regenerated the Postman collection so it
  reflects the patched spec (new descriptions).

### ✅ Cycle 2 — remaining guides + changelog
- All guides (quickstart, authentication, errors, webhooks, campaigns, mcp,
  index) re-read and verified accurate. Webhook signature helpers in
  `webhooks.mdx` match the SDK exports exactly (`verify`/`verifyWebhook` /
  `Webhooks\verify`, `WebhookVerificationError`) across Python/Node/PHP.
- **Fixed:** `changelog.mdx` MCP entry listed `whatsapp_*` tool names that
  contradicted `mcp.mdx` — aligned to the guide's resource-named tools.
  **Verified against the authoritative source** `backend/src/mcp-tool-defs/tools/`:
  the real tool names are the 9 bare resource names (`audiences`, `campaigns`,
  `chats`, `contacts`, `engine`, `groups`, `scheduled_messages`, `utils`,
  `webhooks`) — matching `mcp.mdx` and the corrected changelog. The
  `whatsapp_<resource>` naming in the early design spec
  (`docs/.../2026-04-25-blueticks-mcp-server-design.md`) was never shipped.
- **Fixed:** changelog SDK section described only the old cursor pagination;
  added a sourced v4.0.0/v5.0.0 entry for the offset-pagination migration
  (corroborated by the API-spec section + `versions.json` + the
  typed-`delete()` note). The version table itself is correct vs `versions.json`.

### ✅ Cycle 3 — reference prose vs spec
- Reference page prose matches the spec; status lifecycles in the guides match
  the enums exactly (`MessageStatus` = scheduled→queued→sending→delivered→read
  /failed; `CampaignStatus` = pending→running→complete_sent→complete_delivered
  +paused/aborted).

### ✅ Cycle 4 — terminology & cross-cutting
- Caption/media field casing: the **API itself** is inconsistent —
  messages use camelCase (`text`, `mediaCaption`, `mediaUrl`), campaigns use
  snake_case (`media_url`, `media_caption`). The guides reflect each **correctly**,
  so no doc change; logged as a backend-surface follow-up below.
- JIDs (`@c.us`/`@g.us`/`@newsletter`), base URL, and the `BLUETICKS_API_KEY`
  placeholder are consistent across guides and generated samples.

### ✅ Cycle 5 — full render-walk
- HTTP sweep: every guide + sampled reference page returns 200 (`/docs/` 308 is
  the canonical redirect).
- Edge cases render correctly: `list-pinned-messages` shows **cURL + Node.js
  only** (Python/PHP have no method) and `ping` renders Python `bt.ping()`.
- The one console error is an extension-induced hydration mismatch on
  `<body dir="ltr">` (predates these changes, dev-only) — not a docs issue.

## Hardening pass 2 — 5 more cycles

### ✅ Cycle 6 — guide snippets + MCP actions (found 2 real bugs)
- **Bug fixed — `ping` samples:** every SDK exposes `ping` as a **callable client
  method** (`client.ping()` / `await bt.ping()` / `$bt->ping()`), verified in each
  SDK's constructor — not `ping.retrieve()`. The reference `ping` page was showing
  `bt.ping.retrieve()` (Node) / `$bt->ping->retrieve()` (PHP). Fixed in
  `SAMPLE_METHODS` (callable for all three) + unit test.
- **Bug fixed — PHP constructor:** the PHP SDK constructor is
  `__construct(array $opts)` (key `apiKey`), so `new Blueticks('BLUETICKS_API_KEY')`
  (string) throws. It was wrong in `messages.mdx` (5×) **and in every generated
  reference PHP sample** (`renderSample`). Fixed to `new Blueticks(['apiKey' => …])`.
- Verified `mcp.mdx`'s claimed tool actions against the real `mcp-tool-defs`
  (`scheduled_messages`: send/get/list/update/cancel; `chats`: list/search/
  list_messages; `audiences`: append_contacts; …) — all accurate.
- Re-ran the exhaustive validation: **166 samples × 3 SDKs, 0 mismatches.**

### ✅ Cycle 7 — reference render quality
- All 56 generated pages structurally clean: every one has an `<APIPage>` tag, a
  non-empty title, `full: true`, and no template/`undefined`/TODO leakage.
  Flattened single-op pages (`account`, `engines`, `ping`, `contacts`) carry the
  tag title, not the operation summary.

### ✅ Cycle 8 — full production build (strongest gate)
- `next build` **passes**: ✓ compiled, ✓ type-checked, ✓ **206/206 static pages
  generated**. (Restored the declared-but-uninstalled `json5` devDep to unblock
  the build's type-check; the `Failed to load dynamic font` line is an unrelated
  OG-image fetch, non-fatal.)

### ✅ Cycle 9 — cross-guide consistency
- Guides don't hard-code scope strings (only the reference shows them, from the
  spec) — no drift possible. Install commands / package names are correct
  (`blueticks` on PyPI/npm, `blueticks/blueticks` on Packagist). `index.mdx`
  correctly lists Python/Node/PHP (Ruby/Go still flagged below).

### ✅ Cycle 10 — full reference sweep
- HTTP sweep of **all 56 reference pages → every one returns 200**; the build
  independently static-generated all 206 site pages without error.

> Note: 7 guides (`authentication`, `campaigns`, `errors`, `index`, `mcp`,
> `quickstart`, `webhooks`) + `lib/staged-upload.ts` had **pre-existing
> uncommitted changes** in the working tree before this session — left untouched.

## Ruby + Go SDKs — now first-class in the docs

Previously only Python/Node/PHP appeared. Ruby (`gem blueticks` v2.1.0) and Go
(`github.com/serenix-com/blueticks-go` v2.1.0) are official SDKs (per
`versions.json`) and are now documented everywhere, verified against real source
in `sdks/{ruby,go}`:

- **Resolver** (`scripts/lib/sdk-mapping.ts`): `SdkLang` extended to 5; per-language
  tables for Ruby + Go. Key divergences captured:
  - Ruby mirrors Python (snake_case, `chats` holds messages) but `engines.status`
    and `ping` is a resource (`client.ping.retrieve`, not callable).
  - Go uses PascalCase resources+methods (`client.Chats.SendMessage`,
    `GetMediaURL`), `client.Ping.Retrieve(ctx)`, ctx-first, typed param structs.
  - Ruby + Go nest media/poll under `media`/`poll` objects (vs the flat
    `mediaUrl`/`pollQuestion` of Python/Node/PHP).
- **Reference pages** (`lib/openapi.ts renderSample`): every endpoint now emits
  cURL + Python + Node + PHP + Ruby + Go.
- **`<ApiExample>` component**: expanded from Python/Node-only to all 5 SDKs.
- **Guides**: quickstart, authentication, errors, messages, campaigns, webhooks
  now have Ruby + Go tabs (hand-written, verified against the SDK surfaces incl.
  nested media/poll, `Blueticks::Errors::RateLimitError`, `blueticks.ErrRateLimit`).
- **index.mdx + changelog**: list all 5 SDKs; changelog gains a "Ruby & Go SDKs"
  entry and Ruby/Go rows + versions in the table.
- **Verified:** 5 SDKs × 56 ops → **276 generated samples, 0 mismatches** vs the
  real surfaces; `next build` passes (**206/206 pages**); browser shows 6 tabs on
  reference pages and Ruby/Go tabs in the guides; per-language unit tests added.

> Found while verifying: the **Go SDK README is stale** — it shows
> `client.Messages.Send` / `client.Utils`, but the shipped source has neither
> (messages live on `client.Chats`, no `Utils` on the client). A Go-SDK-repo
> follow-up; the docs use the real source surface.

## Remaining / follow-ups
- Run `pnpm test:unit` and `pnpm validate:examples` once devDeps (`vitest`,
  `json5`) are installed — both blocked in this environment.
- Regenerate `openapi.json` from the backend (`npm run build && npm run
  export:openapi`) in a proper env to confirm parity with the hand-patch.
- Consider a CI guard asserting every spec op yields ≥1 SDK sample (would have
  caught the original regression).
- **Changelog narrative gap:** entries jump from the new v4.0.0/v5.0.0 bridge
  entry to the latest (Python/Node v4.1.0, PHP v5.1.0, MCP v1.1.0). `versions.json`
  has the full release history (4.0.0→4.1.0 etc.) — the team should backfill the
  per-release notes; I only added what I could source.
- ~~**Undocumented SDKs:** Ruby + Go~~ — **DONE** (see "Ruby + Go SDKs" section
  above): now in the resolver, reference pages, ApiExample, guides, index, and
  changelog table.
- **API field-casing wart (backend):** messages use camelCase
  (`mediaCaption`/`mediaUrl`) while campaigns use snake_case
  (`media_caption`/`media_url`) for the same concepts. Docs are correct as-is;
  consider normalizing the API surface in a future major.
