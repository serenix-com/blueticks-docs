# v1 API: camelCase migration + optional `chatId` on message endpoints

**Date:** 2026-06-14
**Repo:** `blueticks-api` (`backend/`)
**Status:** Design — approved (Approach A), pending spec review
**Breaking:** Yes — major version bump. All generated SDKs change.

## Summary

Two coupled changes to the public v1 API:

1. **Optional `chatId` on the message-key endpoints.** Today `chat_id` is a
   required path segment used only to rebuild the canonical WhatsApp message
   key (`<fromMe>_<chatJid>_<id>`) from a bare id. Make it optional: callers
   pass the **complete** wire key as the message-key param and omit `chatId`.
   `chatId` becomes an optional *query* param described as a lookup
   accelerator. Affects:
   - `GET  /v1/messages/{key}` → `getMessage` (waGetMessageByKeyTool)
   - `GET  /v1/messages/ack/{key}` → `getMessageAck` (waGetMessageAckTool)
   - `POST /v1/messages/reactions/{key}` → `react` (waReactToMessageThunkTool)
   - `GET  /v1/messages/media/{key}` → `getMedia` (waGetMessageMediaTool)
   - `GET  /v1/messages/media_url/{key}` → `getMediaUrl` (waGetMessageMediaTool)

2. **API-wide snake_case → camelCase.** Every path param, query param, and
   request/response **body field** across all `v1/*` endpoints converts to
   camelCase. ~46 distinct body fields plus all params. Docs + SDKs regenerate.

## Why these are coupled

The message endpoints already thread `chatId` only into `wireKey()`; the tools
ignore the separate `chatId` field (verified in whatsapp-scheduler:
`waGetMessageByKeyTool`, `waGetMessageAckTool`, `waReactToMessageThunkTool`,
`waGetMessageMediaTool` all consume only `waMessageKey`). So the param work and
the rename touch the same handlers and schemas — doing them together avoids
editing `chats.service.ts` / `chats.schemas.ts` / `openapi-custom-paths.ts`
twice.

## Architecture / source of truth

The pipeline is: **zod schemas (`v1/*/*.schemas.ts`) → `zod-to-openapi` →
`openapi.json` → SDK generators + Fumadocs site**. There is **no global key
transformer**; mappers (`v1/*/*.mapper.ts`) hand-construct snake_case objects
from the camelCase engine shapes (`BtSlim*`). Therefore the rename happens **at
the schema + mapper source** (Approach A). Docs and SDKs follow automatically
via regeneration. Approach B (response middleware) was rejected because OpenAPI
is generated from the zod schemas, so a runtime transform would not change the
docs/SDKs without a second, drift-prone post-process step.

Note: the engine/tool layer is **already camelCase**, so many mappers collapse
toward near-identity after this change.

## Detailed design

### Part 1 — message endpoints

**Routes** (`chats.service.ts`, registration block ~L820-880). Drop the
`:id` segment; `chatId` moves to query. New shapes:

```
GET  /v1/messages/:waMessageKey
GET  /v1/messages/ack/:waMessageKey
POST /v1/messages/reactions/:waMessageKey
GET  /v1/messages/media/:waMessageKey
GET  /v1/messages/media_url/:waMessageKey
```

**Route ordering (critical).** The catch-all `GET /v1/messages/:waMessageKey`
must be registered AFTER all prefixed GETs (`/ack/...`, `/media/...`,
`/media_url/...`, `/pinned/...`) and after the list route `GET /v1/messages`,
otherwise `:waMessageKey` swallows `ack`/`media`/etc. Current order already
places `/v1/messages/:id/:key` last among GETs — preserve that.

**Param name.** Message-key path param renamed `key` → `waMessageKey` (matches
the tool/contract field exactly). The full wire key is one URL path segment (no
slashes; contains `_`, `@`, `.` — `@` should be percent-encoded by clients but
Express decodes it fine).

**`chatId`** becomes `req.query.chatId` (optional). Handler signatures change
from `(chatId, key, params)` to `(waMessageKey, params, chatId?)`.

**`wireKey` (`chats.service.ts:95`).** Update to:

```ts
function wireKey(waMessageKey: string, chatId?: string): string {
  if (parseWaMessageKey(waMessageKey)) return waMessageKey;   // full key → as-is
  if (chatId) return serializeWaMessageKey({ id: waMessageKey, remoteJid: chatId, fromMe: false });
  throw new BadRequest(
    'Provide the complete waMessageKey (e.g. false_<jid>_<id>[_<participant>]), ' +
    'or pass ?chatId= so the key can be rebuilt from a bare message id.',
  );
}
```

**Validation.** `parseOrBadRequest(ChatId, chatId)` becomes conditional (only
when `chatId` is supplied). `waMessageKey` is validated as a non-empty string
(it may be either a full key or a bare id — `wireKey` decides).

**OpenAPI (`openapi-custom-paths.ts`).** For each of the five paths:
- Replace `{chat_id}/{key}` with `{waMessageKey}`.
- `parameters`: one required path param `waMessageKey` + one optional query
  param `chatId`.
- `chatId` description (verbatim intent): *"Optional. Only used to find the
  message faster — when you pass a bare message id instead of the complete key,
  `chatId` lets the server rebuild the full key. If you pass the complete
  `waMessageKey` (e.g. `false_120363426216988013@g.us_3EB0659D13650092D677AD_188450464616609@lid`)
  you can omit it."*
- `waMessageKey` description: *"The complete WhatsApp message key
  (`<fromMe>_<chatJid>_<id>[_<participant>]`)."*
- Update cURL examples to show the full key and no `chat_id` segment.

### Part 2 — API-wide camelCase

**Field inventory (~46 body fields)** across `v1/*/*.schemas.ts`:
`aborted_at, account_id, added_at, audience_id, can_load_more, canonical_url,
chat_id, completed_at, contact_count, created_at, delivered_count,
edit_info_admins_only, failed_count, file_data_url, file_mime_type, file_name,
from_me, has_synced, include_extended_info, include_last_message,
include_without_name, is_admin, is_group, is_muted, is_newsletter,
is_super_admin, label_ids, last_message_at, link_preview, marked_unread,
media_caption, media_unavailable, media_url, message_keys, mute_expiration_at,
on_missing_variable, original_quality, participant_count, read_count,
sent_count, started_at, total_count, total_messages, unmute_at, unread_count,
whatsapp_connections` (+ any nested/aliased fields surfaced during execution).

**Per-domain execution** (each domain = schemas + mapper + service + tests):
`account, audiences, campaigns, chats, contacts, engines, groups, hooks,
newsletters, scheduled-messages, status, webhooks`, plus shared `lib/`
(`paginate`, `link-preview`, `media-shared`).

For each domain:
1. Rename zod fields in `*.schemas.ts` (keys + any `.describe()` / `.openapi()`
   refs). Drop snake_case input aliases unless explicitly retained.
2. Update `*.mapper.ts` output object keys to camelCase.
3. Update `*.service.ts`: path/query param names, inline response object keys,
   request body field reads, query parsing.
4. Update `openapi-custom-paths.ts` param names, examples, descriptions.
5. Update `__tests__/*` assertions.

**Input-alias policy.** Some schemas already accept both cases on input (e.g.
audiences `firstName`/`first_name`). Per the breaking-bump decision, default is
**camelCase-only**; remove snake_case input aliases. (Flag any alias removal in
the PR description so it's an explicit decision, not an accident.)

**Regeneration.** After code changes: run `./regenerate.sh` (→ `tools/regenerate.py`)
to rebuild `backend/openapi.json`, the SDKs under `sdks/`, and the docs site.
Verify `sdk-spec-drift` CI check passes (no drift between spec and SDKs).

## Error handling

- Bare id with no `chatId` → `400 BadRequest` with the actionable message above.
- Full key supplied → `chatId` ignored (pass-through), no error.
- Message not found → unchanged (`404` for get-message, `ack:null` for ack,
  media sentinels unchanged).

## Testing

- Unit: `wireKey` — full key pass-through; bare id + chatId build; bare id +
  no chatId throws 400.
- Service tests for all five message endpoints: full-key-only path (no chatId),
  and bare-id + `?chatId=` path.
- Existing per-domain mapper/service tests updated to camelCase assertions.
- `export-openapi.test.ts` and `sdk-spec-drift` green.

## Out of scope

- Engine/tool layer (`whatsapp-scheduler`) — already camelCase; the redundant
  `chatId` field on the tool contracts is left as-is (it's optional and unread;
  removing it is a separate cleanup).
- MCP tool surface (`mcp-tool-defs/`) — separate naming convention; not part of
  the REST v1 contract.
- Versioning mechanics (how the major bump is published) — assumed handled by
  the existing `versions.json` / release flow.

## Risks

- **Largest risk: silent payload drift.** Missing a single field key leaves a
  snake_case straggler in a response. Mitigation: after regeneration, grep the
  emitted `openapi.json` for `[a-z]_[a-z]` in property names — should be zero.
- Route-ordering regression hiding `/ack`/`/media` behind the catch-all.
  Mitigation: explicit ordering test hitting `/v1/messages/ack/<key>`.
- SDK consumers break (intended, breaking bump) — ensure changelog/migration
  note is produced.
