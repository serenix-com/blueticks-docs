# Design: Split a "Messages" section out of "Chats" in the API reference

**Date:** 2026-06-06
**Author:** noammazuz (with Claude)
**Status:** Draft — awaiting review

## Problem

The API reference sidebar (docs site, `/docs/api/*`) shows a **Scheduled Messages**
section but no dedicated section for handling live WhatsApp messages. The user
expected a separate "Messages" section with "Send message", "List messages", and
the other message-handling operations (the tools surfaced on the extension
diagnostics page: `sendMessageThunkTool`, `waLoadMessagesFromPhoneTool`,
`waGetMessageByKeyTool`, `waReactToMessageThunkTool`, `waGetMessageAckTool`,
`waGetMessageMediaUrlTool`, `waGetPinnedMessagesTool`, `waClearMessagesTool`).

## Root cause (investigation result)

The WhatsApp message REST APIs **already exist and are already documented** — they
are just grouped under the **Chats** tag, not in a section of their own. There is
nothing to build from scratch except two gaps (below).

Mapping of the diagnostics tools to existing REST endpoints (all in
`backend/src/services/api/v1/chats/chats.service.ts`, documented in
`backend/scripts/openapi-custom-paths.ts`):

| Tool | REST endpoint | Documented today |
|---|---|---|
| `sendMessageThunkTool` | `POST /v1/chats/{chat_id}/messages` | Yes — "Send message to chat" (Chats) |
| `waQueryMessagesTool` (list/search/load-more) | `GET /v1/chats/{chat_id}/messages` | Yes — "List chat messages" (Chats) |
| `waGetMessageByKeyTool` | `GET /v1/chats/{chat_id}/messages/{key}` | Yes — "Get chat message" (Chats) |
| `waGetMessageAckTool` | `GET .../{key}/ack` | Yes (Chats) |
| `waReactToMessageThunkTool` | `POST .../{key}/reactions` | Yes (Chats) |
| `waLoadMessagesFromPhoneTool` | `POST .../messages/load_older` | Yes (Chats) |
| `waGetMessageMediaUrlTool` | `GET .../{key}/media_url` | Yes (Chats) |
| `waGetMessageMediaTool` | `GET .../{key}/media` | Yes (Chats) |
| `waGetPinnedMessagesTool` | `GET /v1/chats/{chat_id}/pinned_messages` | **Route exists, NOT documented** |
| `waClearMessagesTool` | *(no REST route)* | **No route at all** |

### Why a section change is non-trivial

The docs build pipeline is: services call `registerPublicService(...)` /
`openapi-custom-paths.ts` declares `tags:[...]` → `npm run export:openapi`
rebuilds `backend/openapi.json` → copied to `docs/openapi.json` →
`pnpm generate:openapi` runs `docs/scripts/generate-openapi-pages.ts`, which
**wipes and regenerates** `content/docs/api/**` (everything except `index.mdx`)
using fumadocs `generateFiles({ groupBy: 'tag' })`.

Two consequences:

1. **Tags are pure documentation grouping.** Changing a tag does NOT change URLs,
   auth, behavior, or — critically — the SDKs. The Python/Node/PHP SDK resource is
   derived from the **first URL path segment** (`docs/scripts/lib/sdk-mapping.ts`
   `forwardResource`: `/v1/chats/...` ⇒ `bt.chats.*`), not from the tag. So
   re-tagging these endpoints to "Messages" leaves the SDKs untouched and
   unbroken. The "Messages" docs section's code samples will continue to read
   `bt.chats.list_messages(...)` etc. — which is correct, since it mirrors the
   real URL-based SDK. This is an accepted cosmetic detail, not a defect.

2. **Sidebar order follows tag first-appearance in `paths`**, which equals the
   service-registration order in `backend/src/services/api/v1/index.ts`
   (ping → account → scheduled-messages → webhooks → … → engines). The message
   endpoints live at `/v1/chats/...` paths defined in `CUSTOM_PATHS`, which are
   appended last. So a naive re-tag would place "Messages" at the **bottom** of
   the sidebar (after Engines), not after "Scheduled Messages". This requires an
   explicit ordering step (see Component 3).

## Decisions (confirmed with user)

- New tag name: **`Messages`**.
- Scope: move **all** per-message endpoints into the new section.
- Rename Scheduled Messages `create` summary "Send message" → **"Schedule message"**.
- Rename Scheduled Messages `find` summary "List messages" → **"List scheduled messages"**
  (avoids two identical "List messages" labels).
- Document **both** gap endpoints: add docs for `pinned_messages` (route exists)
  AND implement a new REST route for `waClearMessagesTool` (destructive).
- SDK: proceed — re-tagging is confirmed not to affect SDK grouping (path-based).

## Design

### Component 1 — Re-tag message endpoints (`backend/scripts/openapi-custom-paths.ts`)

Change `tags: ['Chats']` → `tags: ['Messages']` and simplify summaries on the
existing per-message path items:

| Path / verb | New summary |
|---|---|
| `GET /v1/chats/{chat_id}/messages` | List messages |
| `POST /v1/chats/{chat_id}/messages` | Send message |
| `GET /v1/chats/{chat_id}/messages/{key}` | Get message |
| `GET .../{key}/ack` | Get message delivery status |
| `POST .../{key}/reactions` | React to message |
| `POST .../messages/load_older` | Load older messages |
| `GET .../{key}/media_url` | Get message media URL |
| `GET .../{key}/media` | Get message media |
| `POST /v1/chats/message_acks` | Batch get message acks |

The chat-level endpoints stay under **Chats** (list/get chats, participants,
mark read, open, archive, pin, mute, labels, notes).

### Component 2 — Fill the two gaps

**2a. Document pinned messages.** Add `GET /v1/chats/{chat_id}/pinned_messages`
to `CUSTOM_PATHS` with `tags: ['Messages']`, summary "List pinned messages". The
route + handler (`getPinnedMessages`) already exist in `chats.service.ts`; only
the OpenAPI declaration + a response schema (reuse the inline pinned-message shape:
`{ key, chat_id, text }`) are missing.

**2b. Implement clear-messages REST route.** `waClearMessagesTool` has a contract
(`WaClearMessagesArgsSchema = {chatId}`, `WaClearMessagesResultSchema = {result,
error?}`) but no REST surface. Add:
- `chats.service.ts`: a `clearMessages(chatId, params)` method calling
  `WA_TOOL_COMMANDS.waClearMessagesTool` (mirrors `archive`/`setNote`), returning
  the `{result}` envelope.
- Route: `app.delete('/v1/chats/:id/messages', withV1Auth(app, 'chats:write',
  writeLimit, …))`.
- `CUSTOM_PATHS`: `DELETE /v1/chats/{chat_id}/messages`, `tags: ['Messages']`,
  summary "Clear chat messages", description flagging it as **destructive /
  irreversible** (deletes all messages in the chat for the connected engine).

### Component 3 — Deterministic sidebar order (`docs/scripts/generate-openapi-pages.ts`)

Add a post-generation step (after `flattenSingleOperationTags`, before the
`public/` copy) that rewrites `content/docs/api/meta.json` `pages` to a fixed
`TAG_ORDER`:

```
ping, account, scheduled-messages, messages, webhooks, audiences,
campaigns, chats, groups, newsletters, contacts, engines
```

Entries are reordered by `TAG_ORDER`; any slug not in the list is appended in its
existing order (forward-compatible with new tags). Optionally also reorder the
generated `content/docs/api/messages/meta.json` so "Send message" and "List
messages" lead the section (preference list, unknown pages appended).

This decouples sidebar order from path-emission order — a single explicit list to
maintain, and the only robust fix given the wipe-and-regenerate build.

### Component 4 — Tag descriptions

`openapi-emit.ts` (`buildOpenApiSpec`) builds the spec `tags[]` array — including
each tag's description — **only** from registered Feathers services
(`tagDescriptions` map, lines 514-519). A tag declared solely via `CUSTOM_PATHS`
`tags:[...]` (like the new **Messages**) therefore gets no description and isn't
even added to `tags[]`. To fix this cleanly:

- Export a `TAG_DESCRIPTIONS: Record<string, string>` map from
  `openapi-custom-paths.ts` (co-located with the tag it documents), e.g.
  `{ Messages: 'Send, list, search, react to, and fetch media for individual WhatsApp messages on the connected engine.' }`.
- In `openapi-emit.ts`, after the registry loop, merge `TAG_DESCRIPTIONS` into
  `tagDescriptions` **without** overriding any registry-supplied description
  (registry wins). This puts Messages into `tags[]` with its description; fumadocs
  renders it as the folder `meta.json` `description` (the section blurb).
- Update **Chats** tag description (`chats.service.ts` `registerPublicService`):
  drop "and their messages" → *"Read and manage WhatsApp chats on the connected
  engine."*

### Component 5 — Rename Scheduled Messages labels (`scheduled-messages.service.ts`)

- `create` summary `'Send message'` → `'Schedule message'`.
- `find` summary `'List messages'` → `'List scheduled messages'`.

### Component 6 — Regenerate + verify

1. `cd backend && npm run build && npm run export:openapi`.
2. Copy `backend/openapi.json` → `docs/openapi.json` (per existing process).
3. `cd docs && pnpm generate:openapi`.
4. Verify at `localhost:3000`: "Messages" appears right after "Scheduled
   Messages"; contains Send/List/Get/etc.; Scheduled Messages shows "Schedule
   message" + "List scheduled messages"; Chats no longer lists message ops.
   Confirm with Playwright snapshot.

## Out of scope

- Changing URLs (`/v1/chats/...` stays — would break the SDK and existing callers).
- Extending the external Python/Node/PHP SDKs to add `bt.chats.clear_messages` /
  `pinned_messages` methods (new endpoints simply emit no code sample until the
  SDK adds them, matching current behavior for unmapped sub-resources).
- The other undocumented chat mutations (archive/pin/mute/labels/note) — they are
  chat-level, not message-level, and remain as-is.

## Risks

- **Destructive endpoint:** exposing `clear messages` publicly. Mitigated by
  `chats:write` scope + explicit "irreversible" docs warning. (User chose to
  document/implement it.)
- **Build regeneration:** the ordering post-step must run on every `generate:openapi`;
  if skipped, order reverts. It lives inside the generate script, so it always runs.
