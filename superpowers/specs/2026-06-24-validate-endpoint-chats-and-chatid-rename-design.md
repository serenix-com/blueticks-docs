# Design: Document the validate endpoint under Chats + unify validate field names

**Date:** 2026-06-24
**Status:** Approved (pending written-spec review)

## Problem

1. The phone/chat validation endpoint (`POST /v1/utils/validate_phone`, backed by the
   `waValidatePhoneNumberOrChatIdTool`) works and is already exposed to AI agents via MCP,
   but it is **not** in the developer docs / OpenAPI spec / SDKs.
2. The tool/result field name `formatted_chat_id` (and its public projection `formattedChatId`)
   is inconsistent with the rest of the surface. We want the resolved id to be plain `chatId`.
3. The input field name differs between layers (REST request `phoneOrChatId` vs tool arg `chatId`).
   We want a single name across the API and the tool.
4. "Open chat in engine" (`POST /v1/chats/{chatId}/open`) should stay a working route but no
   longer appear in the developer docs.

## Architecture context (where things are defined)

The REST surface has **one** definition that feeds everything:

- **`backend/openapi.json`** is built by `backend/scripts/export-openapi.js` from:
  Feathers service registrations + **`CUSTOM_PATHS`** (`backend/scripts/openapi-custom-paths.ts`) + zod schemas.
- **Docs site** is generated from `openapi.json` (`docs/scripts/generate-openapi-pages.ts` →
  `content/docs/api/**`, regenerated wholesale every build).
- **SDKs** are generated from `openapi.json` (`tools/regenerate.py`, per-language snapshots).

Therefore **docs and SDK are inseparable**: anything in `openapi.json` is in both; removing an
entry from `CUSTOM_PATHS` removes it from both. There is no docs-only/SDK-only split today.

**AI agents (MCP)** are a *separate, hand-written* surface:
`backend/src/mcp-tool-defs/tools/*.ts` + `surface.ts`. Not generated from `openapi.json`.
The validate endpoint is **already** exposed here via the `utils` tool's `validate_phone` action.

## Decisions

- **Input** unifies on `phoneOrChatId` across REST request **and** the engine tool arg
  (rename the tool arg `chatId` → `phoneOrChatId`). SDK/MCP keep their snake_case projection
  `phone_or_chat_id`.
- **Output** unifies on `chatId` (rename `formatted_chat_id` / `formattedChatId` → `chatId`)
  across the whole chain.
- Keep the existing `POST /v1/utils/validate_phone` route — only *document* it (under **Chats**).
- Remove "Open chat in engine" by **dropping it from `CUSTOM_PATHS`** (route in code is untouched).
- AI-agent (MCP) exposure already exists — verify only, no code change.
- No CUSTOM_PATHS readability refactor (not needed for the docs-vs-sdk-vs-mcp distinction).

## Part A — Document the validate endpoint under Chats

- The endpoint stays at `POST /v1/utils/validate_phone` (no new route, no relocation).
- Add a `utils.schemas.ts` zod module (matching the `*/X.schemas.ts` pattern used by chats,
  audiences, etc.) exporting:
  - `ValidatePhoneRequest = z.object({ phoneOrChatId: z.string().min(1).max(128) }).strict()`
  - `ValidatePhoneResponse = z.object({ valid: z.boolean(), chatId: z.string().nullable() }).strict()`
  Import `ValidatePhoneRequest` into `utils.service.ts` (replacing the inline definition).
- Add a `CUSTOM_PATHS` entry for `/v1/utils/validate_phone` with:
  - `tags: ['Chats']`, `security: bearerScoped('contacts:read')`
  - request body = `toJsonSchema(ValidatePhoneRequest)`, response 200 = `toJsonSchema(ValidatePhoneResponse)`
  - summary "Validate phone or chat id", description noting it resolves to the canonical `chatId`
    and requires `contacts:read`.
- The service stays a thin proxy: validate input → `waValidatePhoneNumberOrChatIdTool` → return `{ valid, chatId }`.

## Part B — Rename across the whole chain

### Output: `formatted_chat_id` / `formattedChatId` → `chatId`

Backend (`blueticks-api/backend`, == `whatsapp-scheduler-backend` repo — edit once):
- `src/bt-common/interfaces/whatsapp-tool-contracts.interface.ts` — `WaValidatePhoneNumberOrChatIdResultSchema.formatted_chat_id` → `chatId` (+ comment).
- `src/bt-common/interfaces/whatsapp-tools-commands.interface.ts` — `formatted_chat_id?` → `chatId?`.
- `src/gateway/baileys/handlers/validation.ts` — 3 emit sites + comment.
- `src/gateway/baileys/handlers/__tests__/validation.test.ts` — 3 expectations.
- `src/services/api/v1/utils/utils.service.ts` — response field + `resp.formatted_chat_id` read + comment.
- `src/services/api/v1/utils/__tests__/utils.service.test.ts` — mocks + expectations.
- `tools/api-smoke/lib/schemas.ts` — `formatted_chat_id` → `chatId`.

Engine (`whatsapp-scheduler`):
- `src/bt-common/interfaces/whatsapp-tool-contracts.interface.ts` (mirror of the backend schema).
- `src/bt-common/interfaces/whatsapp-tools-commands.interface.ts` (mirror).
- `src/extension/wa-communication-layer/validation/validation-operations.ts` — all emit sites + comments.
- `src/extension/context/content/thunks/WhatsappThunks.ts` — emit/consume sites (~L1611, L1617).
- `src/common/tools/whatsapp/wa-tools-server-actions.ts` — `ValidateChatIdResult.formatted_chat_id` → `chatId`.
- Any consumers (`wa-chat-id-validation.ts`) + affected tests.

### Input: tool arg `chatId` → `phoneOrChatId`

- `src/bt-common/.../whatsapp-tool-contracts.interface.ts` — `WaValidatePhoneNumberOrChatIdArgsSchema.chatId` → `phoneOrChatId` (both mirrors).
- `src/common/tools/whatsapp/wa-tools-server-actions.ts` — `ValidateChatIdParams.chatId` → `phoneOrChatId` (engine).
- Dispatch sites: `utils.service.ts` passes `{ phoneOrChatId: body.phoneOrChatId }`.
  The Baileys handler already accepts both `chatId` and `phoneOrChatId`; keep it tolerant.
- REST request body field stays `phoneOrChatId` (already is).

### Transition safety

The chrome-extension engine must be rebuilt/reloaded to emit the new `chatId`. Until then, keep a
defensive read at the backend boundary: `resp.chatId ?? (resp as any).formatted_chat_id`. Remove the
fallback once the engine is deployed (or land both together). Document this in the plan as a sequenced step.

## Part C — Remove "Open chat in engine" from the docs

- Delete the `/v1/chats/{chatId}/open` entry from `CUSTOM_PATHS` in `openapi-custom-paths.ts`.
- The route handler (`src/services/api/v1/chats/chats.service.ts`, Express route + `waOpenChatTool`)
  is untouched — the endpoint keeps working for programmatic callers.
- Regeneration wipes/rebuilds the docs, so `content/docs/api/chats/open-chat-in-engine.mdx` and its
  `meta.json` entry disappear automatically; the SDK `chats.open()` method is dropped by SDK regen.

## AI agents (MCP)

No change required. `backend/src/mcp-tool-defs/tools/utils.ts` already exposes `validate_phone`
(`utils.validatePhone({ phone_or_chat_id })`, `readOnlyHint`). The output rename flows through
(the tool `JSON.stringify`s the response). **Verify** the action still returns the resolved id under
`chatId` after the rename.

## Regeneration & verification

1. `cd backend && npm run build && node scripts/export-openapi.js` → new `backend/openapi.json`.
2. Copy spec to `docs/openapi.json` + `docs/public/openapi.json`; run docs page generation.
3. `python3 tools/regenerate.py` (or per-language) → SDK snapshots + code, incl. validate, minus open-chat.
4. Regenerate Postman collections (`docs/scripts/generate-postman.ts`).
5. Run backend unit tests (utils + baileys validation) and engine validation tests.
6. Smoke: `POST /v1/utils/validate_phone { "phoneOrChatId": "..." }` → `{ "valid": true, "chatId": "..." }`.
7. Confirm docs nav: validate page under **Chats**, no "Open chat in engine" page; `/open` route still 200s.

## Out of scope

- Relocating the route to a `/v1/chats/...` path (explicitly keeping `/v1/utils/validate_phone`).
- Broad CUSTOM_PATHS refactor.
- Changing MCP tool structure (the existing `utils.validate_phone` action stays).
