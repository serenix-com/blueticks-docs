# v1 API camelCase Full Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the entire public v1 API contract from snake_case to camelCase (every path param, query param, and request/response body field), make `chatId` optional on the five message-key endpoints, normalize the MCP tool surface and the two engine-contract snake_case stragglers to match, regenerate the docs + all 5 SDKs, and fix the docs playground so path-param inputs show the "Enter value" placeholder instead of a prefilled `"string"`.

**Architecture:** The pipeline is **zod schemas (`v1/*/*.schemas.ts`) → `zod-to-openapi` → `openapi.json` → SDK generators + Fumadocs site**. There is no global key transformer; mappers (`v1/*/*.mapper.ts`) hand-construct snake_case objects from camelCase engine shapes. The rename therefore happens **at the schema + mapper + service source** (spec Approach A). Docs and SDKs follow via regeneration. The engine/tool layer is already camelCase except two leaked fields; the MCP surface is its own snake_case convention the user has now asked to align.

**Tech Stack:** Node 20 + FeathersJS + zod, `@asteasolutions/zod-to-openapi`, Fumadocs (Next.js, `fumadocs-openapi@^10.8.0`), Python/Node/PHP/Ruby/Go SDKs (Claude-generated, HITL), Python orchestrator `tools/regenerate.py`.

**Canonical edit root:** `d:\dev2\Blueticks\blueticks-api\backend` (this is a git submodule of `whatsapp-scheduler-backend@staging`; the standalone `whatsapp-scheduler-backend` checkout receives these changes via normal submodule sync — **do NOT double-edit it**). The engine layer in `whatsapp-scheduler` IS edited directly (Phase 5), and its `bt-common` mirror in `blueticks-api/backend/src/bt-common` must be kept byte-identical.

---

## Canonical rename map (single source of truth for all phases)

Every occurrence of the LEFT token used as an object key, path/query param, or field read becomes the RIGHT token. This table is referenced by every task below — apply it consistently.

| snake_case | camelCase | Domains it appears in |
|---|---|---|
| `chat_id` | `chatId` | chats, groups, contacts, scheduled-messages, utils, batch-acks |
| `created_at` | `createdAt` | account, audiences, campaigns, groups, newsletters, webhooks |
| `contact_count` | `contactCount` | audiences |
| `added_at` | `addedAt` | audiences |
| `audience_id` | `audienceId` | campaigns |
| `media_url` | `mediaUrl` | campaigns, chats, status |
| `media_caption` | `mediaCaption` | campaigns |
| `media_data_base64` | `mediaDataBase64` | status |
| `data_base64` | `dataBase64` | chats (Media) |
| `on_missing_variable` | `onMissingVariable` | campaigns |
| `total_count` | `totalCount` | campaigns |
| `sent_count` | `sentCount` | campaigns |
| `delivered_count` | `deliveredCount` | campaigns |
| `read_count` | `readCount` | campaigns |
| `failed_count` | `failedCount` | campaigns |
| `started_at` | `startedAt` | campaigns |
| `completed_at` | `completedAt` | campaigns |
| `aborted_at` | `abortedAt` | campaigns |
| `is_group` | `isGroup` | chats |
| `is_newsletter` | `isNewsletter` | chats |
| `last_message_at` | `lastMessageAt` | chats, groups |
| `unread_count` | `unreadCount` | chats |
| `marked_unread` | `markedUnread` | chats |
| `is_admin` | `isAdmin` | chats, groups |
| `is_super_admin` | `isSuperAdmin` | chats, groups |
| `is_muted` | `isMuted` | chats |
| `mute_expiration_at` | `muteExpirationAt` | chats |
| `from_me` | `fromMe` | chats |
| `canonical_url` | `canonicalUrl` | chats (link_preview) |
| `link_preview` | `linkPreview` | chats |
| `original_quality` | `originalQuality` | chats |
| `media_unavailable` | `mediaUnavailable` | chats |
| `total_messages` | `totalMessages` | chats |
| `can_load_more` | `canLoadMore` | chats |
| `unmute_at` | `unmuteAt` | chats |
| `label_ids` | `labelIds` | chats |
| `include_last_message` | `includeLastMessage` | chats (query) |
| `include_extended_info` | `includeExtendedInfo` | chats (query) |
| `include_without_name` | `includeWithoutName` | chats (query) |
| `message_keys` | `messageKeys` | chats (batch acks) |
| `has_synced` | `hasSynced` | engines, **engine contract** |
| `account_id` | `accountId` | ping |
| `whatsapp_connections` | `whatsappConnections` | ping |
| `file_data_url` | `fileDataUrl` | groups |
| `file_mime_type` | `fileMimeType` | groups |
| `file_name` | `fileName` | groups |
| `edit_info_admins_only` | `editInfoAdminsOnly` | groups |
| `participant_count` | `participantCount` | groups |
| `formatted_chat_id` | `formattedChatId` | utils, **engine contract** |
| `phone_or_chat_id` | `phoneOrChatId` | utils |
| `now_utc` | `nowUtc` | utils |
| `now_local` | `nowLocal` | utils |
| `epoch_ms` | `epochMs` | utils |
| `offset_minutes` | `offsetMinutes` | utils |
| `iso_local` | `isoLocal` | utils |
| `iso_utc` | `isoUtc` | utils |
| `is_dst_now` | `isDstNow` | utils |
| `request_id` | `requestId` | lib/error-envelope |

**Already-camelCase / DO NOT TOUCH:** `scheduled-messages` response schema (`createdAt`, `confirmedAt`, …), the engine contract (except the two rows above), `wa-communication-layer` (`fromMe`, `isForwarded`), and the WAWeb-internal `_serialized` / `_bytesForExtraction` markers. `subscribers` (newsletters) is already a single word — leave it.

**Spec Part 1 exception:** the five **message-key** endpoints do NOT just rename `chat_id`→`chatId`; they get the structural change in Phase 4 (Task 4.x). The destination-chat endpoints (send-message, mark_read, open, participants, load_older, pinned, archive/pin/mute/etc., contacts) DO simply rename `chat_id`→`chatId` as a required path param.

---

## Phase 0 — Setup & safety net

### Task 0.1: Branch + baseline green

**Files:** none (git + verification only)

- [ ] **Step 1: Create a feature branch off main in the backend repo**

Run (in `d:\dev2\Blueticks\blueticks-api\backend`):
```bash
git checkout -b feat/v1-camelcase-migration
```

- [ ] **Step 2: Establish the baseline — build + export spec + run spec-guard tests**

Run (in `backend/`):
```bash
npm install
npm run build
npm run export:openapi
npm run test:runtime -- test/scripts/export-openapi.test.ts test/scripts/openapi-custom-paths.test.ts test/services/api-v1-lib/openapi-emit.test.ts
```
Expected: build succeeds, `backend/openapi.json` regenerates, all listed tests PASS. If any fail at baseline, STOP and report — do not migrate on a red baseline.

- [ ] **Step 3: Snapshot the current snake_case count for a before/after check**

Run (in `backend/`):
```bash
grep -oE '"[a-z]+(_[a-z]+)+":' openapi.json | sort | uniq -c | sort -rn
```
Expected: a list of snake_case property names (the targets). Save this output to the PR description as the "before" state.

---

## Phase 1 — Docs playground: path params show "Enter value" (independent, ship-able first)

Root cause: `fumadocs-openapi`'s `sample()` turns a `{type:"string"}` path/query param with no example into the literal value `"string"`, which renders as the input's *value*. Body fields render empty (placeholder shows). Fix: supply a `renderParameterField` override that renders the input with an empty initial value + the "Enter value" placeholder. This lives in `components/` so `generate:openapi` never rewrites it.

### Task 1.1: Add a parameter-field renderer that doesn't prefill the type name

**Files:**
- Create: `d:\dev2\Blueticks\blueticks-api\docs\components\playground-parameter-field.tsx`
- Modify: `d:\dev2\Blueticks\blueticks-api\docs\components\mdx.tsx` (the `createAPIPage` `client.playground` config block)

- [ ] **Step 1: Read the current playground wiring**

Read `docs/components/mdx.tsx` (the `createAPIPage` call, ~L41-60) and `docs/node_modules/fumadocs-openapi/dist/playground/client.d.ts` (the `PlaygroundClientOptions.renderParameterField` signature: `(fieldName: FieldKey, param: ParameterObject) => ReactNode`). Confirm `components.CollapsiblePanel` is already overridden with `UploadBodyPanel` — the new hook is added alongside it.

- [ ] **Step 2: Write the parameter-field component**

Create `docs/components/playground-parameter-field.tsx`:
```tsx
'use client';

// Fumadocs' default parameter renderer seeds a {type:"string"} path/query input
// with the generated sample value "string" (from utils/schema/sample.js), so the
// box looks pre-filled. Body fields render empty and show the "Enter value"
// placeholder instead. This override renders path/query/header inputs as a plain
// controlled text box whose initial value is empty, so the placeholder shows —
// matching the body fields. Regeneration-safe: lives in components/.

import { Custom } from 'fumadocs-openapi/playground/client';
import type { ReactNode } from 'react';

export function renderParameterField(fieldName: string, _param: unknown): ReactNode {
  return <ParameterTextInput fieldName={fieldName} />;
}

function ParameterTextInput({ fieldName }: { fieldName: string }) {
  const controller = Custom.useController([fieldName]);
  const value = controller.value;
  return (
    <input
      type="text"
      placeholder="Enter value"
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => controller.setValue(e.target.value)}
      className="w-full rounded-md border border-fd-border bg-fd-background px-2.5 py-1.5 text-sm text-fd-foreground placeholder:text-fd-muted-foreground"
    />
  );
}
```
> Note: verify the `Custom.useController` path-key shape against the installed fumadocs version during Step 4 — for parameters the controller key is the field name directly (path params are top-level in the playground form), unlike body fields which are `['body', name]`. If the live API differs, adjust the `useController([...])` argument and re-run the visual check; do not guess past the visual confirmation in Step 4.

- [ ] **Step 3: Wire it into createAPIPage**

In `docs/components/mdx.tsx`, import the renderer and add it to the `client.playground` options object (sibling of `components`):
```tsx
import { renderParameterField } from './playground-parameter-field';
// ...inside createAPIPage({ ... client: { playground: { ... } } }):
        renderParameterField,
```

- [ ] **Step 4: Verify visually**

Run (in `docs/`):
```bash
npm run dev
```
Open `http://localhost:3000/docs/api/messages/send-message`, expand the **Path** panel. Expected: the `chat_id`/`chatId` input is EMPTY and shows the grey "Enter value" placeholder (no prefilled `"string"`). Check a query-param page too (e.g. list-messages). Take a screenshot for the PR.

- [ ] **Step 5: Commit**

Run (in `docs/`):
```bash
git add components/playground-parameter-field.tsx components/mdx.tsx
git commit -m "fix(docs): show 'Enter value' placeholder for playground path/query params"
```

---

## Phase 2 — REST v1 camelCase: simple-rename domains

Each domain below is a self-contained task: rename zod keys in `*.schemas.ts`, mapper output keys in `*.mapper.ts`, inline response keys + input field reads in `*.service.ts`, then update `__tests__/*` assertions, using the canonical rename map. Per-domain TDD: update the test FIRST to assert camelCase (it goes red), then rename source to make it green.

> **Pattern (applies to every domain task — read once):**
> 1. In `*.schemas.ts`: rename the zod object key. If a `.describe()`/`.openapi({example})` references the old name in prose, update it. Drop any snake_case input alias (`z.preprocess`/`.or()` mapping snake→camel) per the breaking-bump decision — flag each removed alias in the PR.
> 2. In `*.mapper.ts`: rename the LHS key of each output object literal (value/RHS is already camelCase from the engine).
> 3. In `*.service.ts`: rename inline response-object keys AND request-body field reads (`body.x_y` → `body.xY`, `parsed.x_y` → `parsed.xY`, `q.x_y` → `q.xY`) AND route param names.
> 4. In `__tests__/*`: update every assertion/fixture key.
> 5. Build the domain's tests green, then commit.

### Task 2.1: account

**Files:**
- Modify: `backend/src/services/api/v1/account/account.schemas.ts` (key `created_at`→`createdAt`)
- Modify: `backend/src/services/api/v1/account/account.service.ts` (any inline `created_at`)
- Test: `backend/src/services/api/v1/account/__tests__/account.service.test.ts`

- [ ] **Step 1: Flip the test assertion to camelCase**

In the account service test, change every `created_at` expectation to `createdAt`. Run:
```bash
npm run test:runtime -- src/services/api/v1/account/__tests__/account.service.test.ts
```
Expected: FAIL (response still has `created_at`).

- [ ] **Step 2: Rename the schema + any service inline key**

`account.schemas.ts`: `created_at:` → `createdAt:`. Grep the service for `created_at` and rename. (`to-public-shape.ts` is shared — if account uses `toPublicAccount`, confirm whether the key is emitted there; if so it's handled in Task 2.10/lib.)

- [ ] **Step 3: Re-run the test**

Run: `npm run test:runtime -- src/services/api/v1/account/__tests__/account.service.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/api/v1/account
git commit -m "refactor(v1/account): camelCase response fields"
```

### Task 2.2: audiences

**Files:**
- Modify: `audiences.schemas.ts` (`contact_count`,`created_at`,`added_at`)
- Modify: `audiences.mapper.ts:87-97` (`contact_count`,`created_at`,`added_at` LHS keys)
- Modify: `audiences.service.ts:360` (inline `{ added, contact_count }`)
- Modify: `scripts/openapi-custom-paths.ts:54` (the inline `AppendContactsResponse` zod with `contact_count`)
- Test: `audiences/__tests__/audiences.service.test.ts`

Follow the per-domain pattern. Renames: `contact_count→contactCount`, `created_at→createdAt`, `added_at→addedAt`. **Also** update `AppendContactsResponse` in `openapi-custom-paths.ts` (it has its own `contact_count`). **Input-alias note:** audiences accepts `firstName`/`first_name` on contact variables — per breaking decision, remove the `first_name` alias; flag in PR.

- [ ] Update test to camelCase → run (red) → rename schema/mapper/service/custom-path → run (green) → commit `refactor(v1/audiences): camelCase fields`.

### Task 2.3: campaigns

**Files:** `campaigns.schemas.ts`, `campaigns.mapper.ts`, `campaigns.service.ts`, `__tests__/campaigns.service.test.ts`

Renames: `audience_id→audienceId`, `media_url→mediaUrl`, `media_caption→mediaCaption`, `on_missing_variable→onMissingVariable`, `total_count→totalCount`, `sent_count→sentCount`, `delivered_count→deliveredCount`, `read_count→readCount`, `failed_count→failedCount`, `created_at→createdAt`, `started_at→startedAt`, `completed_at→completedAt`, `aborted_at→abortedAt`. Update the `CampaignCounters` interface (mapper L32-36, L70), all mapper LHS keys (L121-128), and service input reads (`parsed.media_url`, `parsed.audience_id`, `parsed.on_missing_variable` at L113/117/128/179-180/200).

- [ ] Update test → red → rename → green → commit `refactor(v1/campaigns): camelCase request+response fields`.

### Task 2.4: engines

**Files:** `engines.schemas.ts:18` (`has_synced`), `engines.service.ts:47-51`, `__tests__/engines.service.test.ts`

Rename `has_synced→hasSynced`. NOTE: this value originates from the engine contract field `has_synced` (Phase 5 renames the contract to `hasSynced`); for now the mapper reads `resp.has_synced` — after Phase 5 it becomes `resp.hasSynced`. To keep Phase 2 independently green, read defensively here: `hasSynced: resp.hasSynced ?? (resp as any).has_synced ?? false` and remove the fallback in Phase 5 Task 5.4.

- [ ] Update test → red → rename → green → commit `refactor(v1/engines): camelCase hasSynced`.

### Task 2.5: groups

**Files:** `groups.schemas.ts`, `groups.mapper.ts`, `groups.service.ts`, `__tests__/groups.service.test.ts`

Renames: `edit_info_admins_only→editInfoAdminsOnly`, `file_data_url→fileDataUrl`, `file_mime_type→fileMimeType`, `file_name→fileName`, `chat_id→chatId` (GroupParticipant + member-op body reads), `is_admin→isAdmin`, `is_super_admin→isSuperAdmin`, `created_at→createdAt`, `last_message_at→lastMessageAt`, `participant_count→participantCount`. Update service reads at L179-183 (settings destructure), L202 (`body.chat_id`), L272-298 (`file_name`/`file_data_url`/`file_mime_type` multipart reads), and the `SetPictureRequest` error message text. Update `openapi-custom-paths.ts` group-picture description that names `file_data_url`.

- [ ] Update test → red → rename → green → commit `refactor(v1/groups): camelCase request+response fields`.

### Task 2.6: newsletters

**Files:** `newsletters.schemas.ts:49` (`created_at`), `newsletters.service.ts:47`, `__tests__/newsletters.service.test.ts`

Rename `created_at→createdAt`. Leave `subscribers` as-is.

- [ ] Update test → red → rename → green → commit `refactor(v1/newsletters): camelCase createdAt`.

### Task 2.7: ping

**Files:** `ping/ping.schemas.ts:24,27` (`account_id`,`whatsapp_connections`), `ping.service.ts`, `__tests__/ping.service.test.ts`

Renames: `account_id→accountId`, `whatsapp_connections→whatsappConnections`. **SDK note:** ping is a callable in Python/Node/PHP and a resource in Ruby/Go — flag in the SDK phase that ping response types change in all five.

- [ ] Update test → red → rename → green → commit `refactor(v1/ping): camelCase fields`.

### Task 2.8: status

**Files:** `status/status.service.ts:27-78` (inline schema `media_url`,`media_data_base64`), `__tests__` if present

Renames: `media_url→mediaUrl`, `media_data_base64→mediaDataBase64`. Update the inline zod schema keys AND the body reads at L39/77/78.

- [ ] Update test (or add a minimal one if none) → red → rename → green → commit `refactor(v1/status): camelCase media fields`.

### Task 2.9: utils

**Files:** `utils/utils.service.ts` (input `phone_or_chat_id`; outputs `formatted_chat_id`, `now_utc`,`now_local`,`epoch_ms`,`offset_minutes`,`iso_local`,`iso_utc`,`is_dst_now`), `__tests__/utils.service.test.ts`

Renames per map. NOTE `formatted_chat_id` value comes from the engine contract (`resp.formatted_chat_id`) — apply the same defensive-read pattern as engines (`resp.formattedChatId ?? (resp as any).formatted_chat_id`) until Phase 5 Task 5.4 renames the contract.

- [ ] Update test → red → rename → green → commit `refactor(v1/utils): camelCase request+response fields`.

### Task 2.10: webhooks + shared lib (error envelope)

**Files:** `webhooks/webhooks.service.ts:96,115-117` + `webhooks.schemas.ts:39` (`created_at`); `lib/error-envelope.schema.ts:24` + `lib/error-envelope.ts:51` (`request_id`); `lib/to-public-shape.ts` (if it emits `created_at`); `webhooks/__tests__/webhooks.service.test.ts`; `lib/__tests__/*` for the error envelope if present.

Renames: `created_at→createdAt`, `request_id→requestId`. **`request_id` is the error-response shape** — changing it is breaking for every error path; call this out explicitly in the PR and check the docs `errors.mdx` guide + every SDK's error type.

- [ ] Update tests → red → rename → green → commit `refactor(v1/webhooks+lib): camelCase createdAt + error requestId`.

---

## Phase 3 — REST v1 camelCase: chats domain + message-key restructure (spec Part 1)

The chats domain is the largest and is coupled to spec Part 1 (optional `chatId`). Do it in two tasks.

### Task 3.1: chats — straight field renames (non-message-key)

**Files:** `chats/chats.schemas.ts`, `chats/chats.mapper.ts`, `chats/chats.service.ts`, `chats/__tests__/chats.mapper.test.ts`, `chats/__tests__/chats.service.test.ts`

Rename all chats keys per the map: `is_group, is_newsletter, last_message_at, unread_count, marked_unread, chat_id (Participant/PublicMessage/ChatRef/PinnedMessage), is_admin, is_super_admin, from_me, media_url, canonical_url (nested in link_preview→linkPreview), original_quality, media_unavailable, total_messages, can_load_more, mute_expiration_at, is_muted, data_base64, include_last_message/include_extended_info/include_without_name (query), unmute_at, label_ids, message_keys (batch-acks)`. Update mapper LHS (L21-96), service inline responses (L97-98, 254, 421-423, 628), query parsing (L130-132), body reads (`body.unmute_at` L536, `body.label_ids` L591, `body.chat_id` L680). Rename the destination-chat **path params** `:chat_id`→`:chatId` for: mark_read, open, participants, send-message, load_older, pinned, archive, unarchive, pin, unpin, mute, unmute, mark_unread, labels (GET+PATCH), note (PATCH), contacts profile_picture. Update `GetChatParticipantsQuery` + `MessagesQuery` query-param keys.

- [ ] Update both chats test files to camelCase → run (red) → rename schema/mapper/service → run (green):
```bash
npm run test:runtime -- src/services/api/v1/chats/__tests__/
```
- [ ] Commit `refactor(v1/chats): camelCase fields + chatId path params`.

### Task 3.2: chats — message-key endpoints: optional chatId + key→waMessageKey (spec Part 1)

**Files:** `chats/chats.service.ts` (route block ~L820-880, `wireKey` ~L95, handlers for get/ack/react/media/media_url), `chats/chats.schemas.ts`, `backend/scripts/openapi-custom-paths.ts` (the five `/v1/messages/*/{chat_id}/{key}` entries), `chats/__tests__/chats.service.test.ts`

The five endpoints become:
```
GET  /v1/messages/:waMessageKey
GET  /v1/messages/ack/:waMessageKey
POST /v1/messages/reactions/:waMessageKey
GET  /v1/messages/media/:waMessageKey
GET  /v1/messages/media_url/:waMessageKey
```
`chatId` moves to optional `req.query.chatId`. Handler signatures change `(chatId, key, params)` → `(waMessageKey, params, chatId?)`.

- [ ] **Step 1: Unit-test `wireKey` first (TDD)**

Add to the chats service test:
```ts
describe('wireKey', () => {
  it('passes a complete key through unchanged', () => {
    const k = 'false_120363@g.us_3EB0_188@lid';
    expect(wireKey(k)).toBe(k);
  });
  it('rebuilds a bare id when chatId is supplied', () => {
    expect(wireKey('3EB0', '120363@g.us')).toBe(serializeWaMessageKey({ id: '3EB0', remoteJid: '120363@g.us', fromMe: false }));
  });
  it('throws 400 for a bare id with no chatId', () => {
    expect(() => wireKey('3EB0')).toThrow(/complete waMessageKey|chatId/);
  });
});
```
Run: `npm run test:runtime -- src/services/api/v1/chats/__tests__/chats.service.test.ts -t wireKey` → FAIL.

- [ ] **Step 2: Rewrite `wireKey`** (export it for the test) per spec:
```ts
export function wireKey(waMessageKey: string, chatId?: string): string {
  if (parseWaMessageKey(waMessageKey)) return waMessageKey;
  if (chatId) return serializeWaMessageKey({ id: waMessageKey, remoteJid: chatId, fromMe: false });
  throw new BadRequest(
    'Provide the complete waMessageKey (e.g. false_<jid>_<id>[_<participant>]), ' +
    'or pass ?chatId= so the key can be rebuilt from a bare message id.',
  );
}
```

- [ ] **Step 3: Re-register the five routes** dropping `:chat_id`, reading `req.query.chatId`. **Route ordering is critical**: register catch-all `GET /v1/messages/:waMessageKey` AFTER `/ack/...`, `/media/...`, `/media_url/...`, `/pinned/...` and after the list route `GET /v1/messages`. Add an explicit ordering test hitting `/v1/messages/ack/<key>` to prove it isn't swallowed.

- [ ] **Step 4: Update `openapi-custom-paths.ts`** — replace each `/v1/messages/.../{chat_id}/{key}` path with the `{waMessageKey}` form; parameters become one required path param `waMessageKey` + one optional query param `chatId` (use the verbatim descriptions from the design spec §Part 1). Update cURL examples to a full key, no `chat_id` segment. Also rename the **send-message** path key `/v1/messages/{chat_id}` → `/v1/messages/{chatId}` and `idParam('chat_id')`→`idParam('chatId')`, and the same for `/v1/chats/{chat_id}/*`, `/v1/groups/{id}/members/{chatId}` (already chatId), `/v1/messages/load_older/{chat_id}`, `/v1/messages/pinned/{chat_id}`, `/v1/chats/{chat_id}/participants`.

- [ ] **Step 5: Run the full chats + spec-guard suite green**, then commit:
```bash
npm run test:runtime -- src/services/api/v1/chats/__tests__/ test/scripts/openapi-custom-paths.test.ts
git add backend/src/services/api/v1/chats backend/scripts/openapi-custom-paths.ts
git commit -m "feat(v1/messages)!: optional chatId, key->waMessageKey on message-key endpoints"
```

---

## Phase 4 — Regenerate spec + verify zero stragglers

### Task 4.1: Rebuild + export + grep for snake_case in openapi.json

**Files:** none (build + verify)

- [ ] **Step 1: Rebuild lib and re-export the spec**

Run (in `backend/`):
```bash
npm run build && npm run export:openapi
```
Expected: `backend/openapi.json` regenerates with no error.

- [ ] **Step 2: Grep emitted spec for snake_case property names (the spec's headline risk)**

Run (in `backend/`):
```bash
grep -nE '"[a-z]+(_[a-z]+)+":' openapi.json | grep -vE '"(application_json|multipart_form_data)"' || echo "CLEAN"
```
Expected: `CLEAN`. Any hit is a missed field — find its domain, rename, rebuild, re-grep. Also grep path templates: `grep -nE '\{[a-z]+_[a-z]+\}' openapi.json` → expect zero (`{chat_id}` etc. gone).

- [ ] **Step 3: Run all spec-guard tests**

Run (in `backend/`):
```bash
npm run test:runtime -- test/scripts/ test/services/api-v1-lib/
```
Expected: PASS. Fix `export-openapi.test.ts` / `openapi-custom-paths.test.ts` assertions that hard-code old param/path names (`chat_id`, `{chat_id}/{key}`).

- [ ] **Step 4: Commit the regenerated spec**

```bash
git add backend/openapi.json backend/test
git commit -m "chore(v1): regenerate openapi.json (camelCase) + update spec guards"
```

---

## Phase 5 — MCP surface + engine-contract stragglers

### Task 5.1: MCP tool definitions

**Files:** `backend/src/mcp-tool-defs/tools/{audiences,campaigns,chats,contacts,groups,scheduled-messages,utils,webhooks}.ts` (+ `surface.ts` if it lists param names)

Rename every snake_case **parameter name** in the input schemas to camelCase per the map, PLUS these MCP-specific ones: `group_id→groupId`, `contact_id→contactId`, `campaign_id→campaignId`, `webhook_id→webhookId`, `message_types→messageTypes`, `include_participants→includeParticipants`, `reply_to→replyTo`, `allow_multiple→allowMultiple`, `send_at→sendAt`. **Leave action/verb names** (`get_profile_picture`, `mark_read`, `list_messages`, `send_message_text`, `rotate_secret`, `append_contacts`, …) AS-IS — those are tool-name tokens, not field names, and renaming them changes published tool identifiers (out of scope unless the user confirms). Flag this boundary in the PR.

- [ ] **Step 1: Update MCP tool tests/handler input schemas FIRST**

`backend/src/mcp/tools/handlers/shared-tool-handlers.ts` input schemas (L40-169) mirror these param names — rename them in lockstep. Find the MCP handler tests and flip assertions. Run the MCP test suite:
```bash
npm run test:runtime -- src/mcp
```
Expected: FAIL on renamed params.

- [ ] **Step 2: Rename params in `mcp-tool-defs/tools/*.ts` + `shared-tool-handlers.ts`**, including the dispatch reads (L206-233) that read `args.chat_id` etc.

- [ ] **Step 3: Re-run** `npm run test:runtime -- src/mcp` → PASS.

- [ ] **Step 4: Commit** `refactor(mcp): camelCase tool parameter names`.

### Task 5.2: Engine contract — flip `formatted_chat_id` + `has_synced` (both mirrors)

**Files (must stay byte-identical):**
- `d:\dev2\Blueticks\blueticks-api\backend\src\bt-common\interfaces\whatsapp-tool-contracts.interface.ts` (L301 `has_synced`, L339 `formatted_chat_id`)
- `d:\dev2\Blueticks\whatsapp-scheduler\src\bt-common\interfaces\whatsapp-tool-contracts.interface.ts` (same)

- [ ] **Step 1:** Rename `has_synced→hasSynced` (IsWhatsAppConnectedResult) and `formatted_chat_id→formattedChatId` (WaValidatePhoneNumberOrChatIdResult) in BOTH files. Update the comment that calls them "PUBLIC snake_case names" to reflect the new camelCase contract.

- [ ] **Step 2: Verify the two files are identical:**
```bash
diff d:/dev2/Blueticks/blueticks-api/backend/src/bt-common/interfaces/whatsapp-tool-contracts.interface.ts \
     d:/dev2/Blueticks/whatsapp-scheduler/src/bt-common/interfaces/whatsapp-tool-contracts.interface.ts
```
Expected: no diff.

### Task 5.3: Engine page handlers + server actions emit the new keys

**Files:** `whatsapp-scheduler/src/common/tools/whatsapp/wa-tools-server-actions.ts` (L39 `formatted_chat_id`, L82 `has_synced` interfaces) and the `wa-communication-layer` handler(s) that build the validate-phone and is-connected results.

- [ ] **Step 1:** Rename the interface fields + the object literals that produce them to `formattedChatId` / `hasSynced`. Grep `whatsapp-scheduler/src` for `formatted_chat_id` and `has_synced` to catch all producers/consumers; rename all.

- [ ] **Step 2: Typecheck the engine package:**
```bash
cd d:/dev2/Blueticks/whatsapp-scheduler && npx tsc --noEmit
```
Expected: no new errors from these renames.

- [ ] **Step 3: Commit (engine repo)** `refactor(engine): camelCase formattedChatId + hasSynced to match v1 contract`.

### Task 5.4: Remove the defensive fallbacks added in Phase 2

**Files:** `backend/src/services/api/v1/engines/engines.service.ts`, `backend/src/services/api/v1/utils/utils.service.ts`

- [ ] Now that the contract emits `hasSynced`/`formattedChatId`, remove the `?? (resp as any).has_synced` / `?? (resp as any).formatted_chat_id` fallbacks from Tasks 2.4 and 2.9. Run those two domains' tests green. Commit `refactor(v1): drop snake_case contract fallbacks after engine rename`.

---

## Phase 6 — Regenerate docs + 5 SDKs + drift gate

> This is the heaviest phase. SDKs are **Claude-generated per each `sdks/<lang>/CLAUDE.md`** via the HITL flow in `tools/regenerate.py`, not auto-generated. Expect one focused subagent per language. PHP/Ruby/Go QA need their runtimes; if a runtime is unavailable locally, generate the code + snapshot and let CI run QA (note it in the PR).

### Task 6.1: Sync spec to docs + regenerate doc pages

**Files:** `docs/openapi.json`, `docs/public/openapi.json`, `docs/content/docs/api/**` (regenerated)

- [ ] **Step 1:** Copy spec and regenerate pages:
```bash
cp backend/openapi.json docs/openapi.json
cd docs && npx tsx scripts/generate-openapi-pages.ts
```
Expected: `content/docs/api/**` mdx regenerates; `public/openapi.json` updated. Do NOT hand-edit generated mdx.

- [ ] **Step 2:** Spot-check the send-message + get-message pages in `npm run dev` — params show `chatId`/`waMessageKey`, the optional `chatId` query param appears on get-message, and (Phase 1) inputs show "Enter value". Update the hand-written guides (`content/docs/messages.mdx`, `errors.mdx`, `quickstart.mdx`, postman collections in `public/`) that reference `chat_id`/`request_id`/`{chat_id}/{key}`.

- [ ] **Step 3: Commit (docs repo)** `docs: regenerate API reference for camelCase v1 + optional chatId`.

### Task 6.2: Regenerate each SDK (one task per language)

**Files:** `sdks/<lang>/**` + `sdks/<lang>/openapi.snapshot.json`

For each of python, node, php, ruby, go — run the HITL regen and have a subagent rewrite the resource/type/test files per that SDK's `CLAUDE.md` against the new `openapi.json`:
```bash
python3 tools/regenerate.py --only <lang> --skip-prompt
```
Per-language reminders from the SDK divergence map: `/v1/messages/*` is the `messages` resource in Node but `chats` elsewhere; single-GET is `get`/`retrieve`/`Get`; ping is callable (Py/Node/PHP) vs resource (Ruby/Go); Go is PascalCase + ctx-first + typed structs and nests media/poll. Every changed field/param/error-`requestId` must propagate to types + tests.

- [ ] python → snapshot + QA green → commit
- [ ] node → snapshot + QA green → commit
- [ ] php → snapshot + QA green (or CI) → commit
- [ ] ruby → snapshot + QA green (or CI) → commit
- [ ] go → snapshot + QA green (or CI) → commit

### Task 6.3: Drift gate + versions bump

- [ ] **Step 1: Verify all snapshots match the backend spec:**
```bash
python3 tools/regenerate.py --check-snapshots
```
Expected: `✓` for all five languages. Any `✗` → that SDK's snapshot is stale; re-run its regen.

- [ ] **Step 2: Major-version bump** in each SDK's version file + `versions.json` (breaking change). Add a migration/changelog note (snake→camel field table; `chatId` now optional + `waMessageKey` path; error `request_id`→`requestId`).

- [ ] **Step 3: Commit** `chore: major version bump — breaking camelCase v1 migration`.

---

## Phase 7 — Final verification & integration

### Task 7.1: Full green + straggler sweep

- [ ] **Step 1: Backend full test suite:** `cd backend && npm run test:runtime` → all PASS.
- [ ] **Step 2: Repo-wide straggler grep** (the headline risk) — confirm no snake_case survives in the public contract:
```bash
grep -nE '"[a-z]+(_[a-z]+)+":' backend/openapi.json | grep -v multipart || echo CLEAN-SPEC
grep -rnE '\bchat_id\b' backend/src/services/api/v1 sdks docs/content/docs/api && echo "STRAGGLERS FOUND" || echo CLEAN-SRC
```
Expected: `CLEAN-SPEC` and no `chat_id` hits in the v1 service layer / SDKs / generated docs.
- [ ] **Step 3: Engine typecheck:** `cd whatsapp-scheduler && npx tsc --noEmit` → clean.
- [ ] **Step 4:** Use `superpowers:finishing-a-development-branch` to open the PR(s). PR body must list: every renamed field (the canonical map), removed input aliases, the `request_id`→`requestId` error-shape break, the `chatId`-optional/`waMessageKey` endpoint change, MCP param renames (and that action/verb tool names were intentionally NOT renamed), and the before/after snake_case grep counts.

---

## Self-review notes (gaps surfaced & resolved)

- **scheduled-messages** intentionally has NO rename task — its response schema is already camelCase (verified); its request body (`sendAt`, `mediaFilename`, `pollQuestion`, …) is already camelCase. Only its `data_base64` internal action-arg (service L275/283) is non-public and may stay; confirm during Phase 3 grep it doesn't surface in the spec.
- **`request_id`** is the shared error envelope — renaming it is the broadest break; explicitly tracked in Task 2.10 + PR body, and every SDK error type in Phase 6.
- **MCP action/verb names** (`mark_read`, `send_message_text`, …) are deliberately excluded (they are published tool identifiers, not field names). Flagged for the user in Task 5.1 + PR.
- **Engine-contract → REST coupling** for `has_synced`/`formatted_chat_id` is sequenced: Phase 2 reads defensively, Phase 5 renames the contract in both mirrors + engine producers, Phase 5.4 removes the fallback. Prevents a red window.
- **Route ordering** regression for the catch-all `:waMessageKey` is covered by an explicit ordering test in Task 3.2.
</content>
</invoke>
