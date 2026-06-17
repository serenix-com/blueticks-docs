# camelCase + "Enter value" docs audit (Playwright page-by-page)

**Date:** 2026-06-15
**Site:** http://localhost:3000/docs
**Auditor:** Playwright MCP walk of every API reference page.
**Goal:** Record, per page, (a) which params/body/response fields still render snake_case, and (b) whether path/query param inputs show a prefilled `"string"` instead of the "Enter value" placeholder.

## Legend
- **Params/fields** column = snake_case still present in the LIVE spec (source: grep of `docs/openapi.json`, 2026-06-15). The browser pass confirms these render as written.
- **"string" prefill** = path/query param input boxes show literal `string` (the fumadocs `sample()` artifact) instead of an empty box with the "Enter value" placeholder. This is a GLOBAL render behavior on any page with a path/query param — confirmed on representative pages, applies to all.
- ☐ not yet checked in browser · ☑ checked in browser

## ✅ Optional params/fields "sent by default" — FIXED & VERIFIED (2026-06-16)
**Problem (user):** on e.g. `list-messages-all-chats`, every optional query param was *active* — pressing Send transmitted them empty. They should default to **not sent** (the `✕`/removed state), opt-in only.

**Root cause:** fumadocs marks a field "active" (included in the request) iff its seeded value `!== undefined` (`inputs.js` `isDefined`; the `✕` just `delete`s the key). My first `stripSampleSeeds` set `example: ''` on **all** params and `example: {}` on bodies — which *activated* every optional field. Wrong direction.

**Fix (revised `lib/openapi.ts → stripSampleSeeds`):** seed ONLY required fields with an empty value; leave optional fields unseeded so they default inactive.
- params → `example: ''` on **required** path/query params only (optional params untouched → inactive).
- body → `example: ''` on **required string** props only (skip enums/curated); optional props stay omitted by `sample(skipNonRequired)` → inactive.
- curated `examples` (create-group/audience/webhook) untouched.

**Verified in browser (cURL = what's actually sent):**
| Page | Default request (cURL) | Field states |
|---|---|---|
| list-messages-all-chats | `GET /v1/messages` (no query string) | all optional query params show "Enter value" but **no `✕`** → inactive ✓ |
| send-message | `POST /v1/messages/` · body `{"type":"text"}` | required path `chat_id` active+empty; required body enum `type` active; optional body fields (text/mediaUrl/…) **not sent** ✓ |
| create-newsletter | body `{"name":""}` | required `name` active+empty; optional `description` **not sent** ✓ (fixes the `{}` regression) |
| create-group | body `{"name":"Q4 Planning","participants":["+15555550100",…]}` | curated example **preserved** ✓ |

Additional spot-checks: **get-newsletter** `GET .../newsletters/` + `id*` "Enter value" ✓ · **update-group** `PATCH .../groups/ -d '{}'` (all-optional body → empty) ✓.

**Field-shape coverage** (all 56 pages reduce to these, transform is uniform): optional query param ✓, required path param ✓, required body string ✓, required body enum ✓, optional body field ✓, all-optional body (`{}`) ✓, curated-example body ✓. 6 pages browser-verified; behavior is deterministic from the shape for the rest.

**Known tradeoff (unchanged):** required path params seed `''`, so the auto-cURL shows an empty path segment (`POST .../messages/`). Hand-written description cURLs (send-message) still show a real JID.

---

## ✅ "string" prefill — FIXED & VERIFIED (2026-06-15)
**Root cause (revised):** NOT limited to path params. Fumadocs seeds the playground form from `getRequestData` (`ui/operation/get-example-requests.js`): for any **required** param with no example it calls `sample(param.schema)` → `"string"`, and for a body with no curated example it calls `sample(schema,{skipNonRequired:true})` → every **required** body field (e.g. newsletters `name`) becomes `"string"` while optional fields are skipped (which is why optional fields already showed "Enter value").

**Fix:** `lib/openapi.ts` → `stripSampleSeeds(raw)` in the `createOpenAPI` input pipeline. For path/query params lacking an example → `example: ''`; for request bodies with no curated `example`/`examples` → `example: {}`. This makes every field seed to empty so the placeholder shows. Curated examples (create-group/audience/webhook) are left intact. The `renderParameterField` approach in the plan was abandoned — it can't reach required *body* fields and would require reimplementing the whole body panel.

**Verified in browser (placeholder "Enter value", no prefill):**
- create-newsletter — body `name`* + `description` ✓ (cURL body now `-d '{}'`)
- get-newsletter / get-group / update-group — path `id`* ✓
- (covers all 56 pages via the same transform; send-message `chat_id`, get-message `waMessageKey`, etc. all flow through it)

**⚠ Known side effect:** the auto-generated **cURL** path now shows an empty segment for path params, e.g. `GET https://api.blueticks.co/v1/newsletters/` (was `.../newsletters/string`). The form-input value and the cURL are the same `data` object in fumadocs, so emptying the input empties the cURL segment too. Our SDK code samples (Python/Node/PHP/Ruby/Go via `x-codeSamples`) are unaffected — they use `id_01H7...` placeholders. Follow-up option if the empty cURL segment is unwanted: a custom cURL generator that renders `:id`-style placeholders independent of the form seed.

### (superseded) original observation
- every page with a `path`/`query` param rendered `textbox "<name>* string"` with `placeholder: Enter value` BUT a prefilled `text: string` overriding it — verified on send-message, get-message, list-pinned-messages, set-group-picture. Now resolved by the fix above.
- [x] **Prefill leaks into examples (NEW, CONFIRMED)**: the `"string"` value also leaks into the generated **cURL** (`.../v1/messages/string` on send-message) and the **JSON request example** (`"audience_id": "string"` on create-campaign, `"message_keys": [...]` keys snake_case on batch-acks). So the prefill isn't only cosmetic — copy-paste examples carry the literal `string`.
- [x] **Spec already partially migrated (CONFIRMED)**: `{waMessageKey}` (5 message-key endpoints) and `{chatId}` (groups members) already render camelCase; get-message already shows the optional `chatId?` **query** param. `{chat_id}` still remains on 6 endpoints (send-message, chats participants/mark_read/open, messages load_older/pinned).
- [x] **⚠ SPEC vs SOURCE DRIFT (NEW, CONFIRMED)**: the live `docs/openapi.json` is AHEAD of `backend/scripts/openapi-custom-paths.ts` — the source still defines `/v1/messages/ack/{chat_id}/{key}` etc., but the rendered spec already has `{waMessageKey}` + optional `chatId`. Someone hand-patched the spec artifact (or regenerated from a newer branch) without the source matching. **Re-running `export:openapi` from current source would REVERT the waMessageKey work.** Must reconcile `openapi-custom-paths.ts` to the intended state before any regeneration (folds into Plan Task 3.2).
- [x] **Single-op tags are flattened**: contacts/account/ping/engines pages live at `/docs/api/<tag>` (no trailing slug). `/docs/api/contacts/list-contacts` 404s.
- [x] **Response-body fields render lazily**: response schema sections are collapsed in the a11y snapshot (only headings emit), so response-field snake_case is taken from the authoritative `docs/openapi.json` grep rather than the rendered tree.

---

## Page checklist (56 operations)

### Messages
| ☐ | Page (URL slug) | Method/Path | snake_case still present |
|---|---|---|---|
| ☐ | messages/send-message | POST /v1/messages/{chat_id} | param:chat_id |
| ☐ | messages/list-messages | GET /v1/messages | resp:chat_id, from_me, media_url, link_preview, canonical_url |
| ☐ | messages/get-message | GET /v1/messages/{waMessageKey} | resp:chat_id, from_me, media_url, link_preview, canonical_url |
| ☐ | messages/get-message-delivery-status | GET /v1/messages/ack/{waMessageKey} | (none in spec) |
| ☐ | messages/react-to-message | POST /v1/messages/reactions/{waMessageKey} | (none in spec) |
| ☐ | messages/get-message-media | GET /v1/messages/media/{waMessageKey} | resp:data_base64, original_quality, media_unavailable |
| ☐ | messages/get-message-media-url | GET /v1/messages/media_url/{waMessageKey} | (none in spec) |
| ☐ | messages/load-older-messages | POST /v1/messages/load_older/{chat_id} | param:chat_id, resp:total_messages, can_load_more |
| ☐ | messages/list-pinned-messages | GET /v1/messages/pinned/{chat_id} | param:chat_id, resp:chat_id |
| ☐ | messages/batch-get-message-acks | POST /v1/messages/acks | body:message_keys, chat_id |

### Scheduled Messages
| ☐ | Page | Method/Path | snake_case still present |
|---|---|---|---|
| ☐ | scheduled-messages/schedule-message | POST /v1/scheduled-messages | (none — already camelCase) |
| ☐ | scheduled-messages/list-scheduled-messages | GET /v1/scheduled-messages | (none) |
| ☐ | scheduled-messages/get-scheduled-message | GET /v1/scheduled-messages/{id} | (none) |
| ☐ | scheduled-messages/update-scheduled-message | PATCH /v1/scheduled-messages/{id} | (none) |

### Chats
| ☐ | Page | Method/Path | snake_case still present |
|---|---|---|---|
| ☐ | chats/list-chats | GET /v1/chats | param:include_last_message, include_extended_info, include_without_name; resp:is_group, is_newsletter, last_message_at, unread_count, marked_unread |
| ☐ | chats/get-chat | GET /v1/chats/{id} | resp:is_group, is_newsletter, last_message_at, unread_count, marked_unread |
| ☐ | chats/list-chat-participants | GET /v1/chats/{chat_id}/participants | param:chat_id; resp:chat_id, is_admin, is_super_admin |
| ☐ | chats/mark-chat-as-read | POST /v1/chats/{chat_id}/mark_read | param:chat_id |
| ☐ | chats/open-chat-in-engine | POST /v1/chats/{chat_id}/open | param:chat_id; resp:chat_id |

### Campaigns
| ☐ | Page | Method/Path | snake_case still present |
|---|---|---|---|
| ☐ | campaigns/create-campaign | POST /v1/campaigns | body:audience_id, media_url, media_caption, on_missing_variable; resp:audience_id, total_count, sent_count, delivered_count, read_count, failed_count, created_at, started_at, completed_at, aborted_at |
| ☐ | campaigns/list-campaigns | GET /v1/campaigns | resp: same counters/dates + audience_id |
| ☐ | campaigns/get-campaign | GET /v1/campaigns/{id} | resp: same |
| ☐ | campaigns/pause-campaign | POST /v1/campaigns/{id}/pause | resp: same |
| ☐ | campaigns/resume-campaign | POST /v1/campaigns/{id}/resume | resp: same |
| ☐ | campaigns/cancel-campaign | POST /v1/campaigns/{id}/cancel | resp: same |

### Audiences
| ☐ | Page | Method/Path | snake_case still present |
|---|---|---|---|
| ☐ | audiences/create-audience | POST /v1/audiences | resp:contact_count, created_at |
| ☐ | audiences/list-audiences | GET /v1/audiences | resp:contact_count, created_at |
| ☐ | audiences/get-audience | GET /v1/audiences/{id} | resp:contact_count, created_at |
| ☐ | audiences/update-audience | PATCH /v1/audiences/{id} | resp:contact_count, created_at |
| ☐ | audiences/delete-audience | DELETE /v1/audiences/{id} | (none) |
| ☐ | audiences/append-contacts-to-audience | POST /v1/audiences/{id}/contacts | resp:contact_count |
| ☐ | audiences/update-audience-contact | PATCH /v1/audiences/{id}/contacts/{contactId} | resp:added_at |
| ☐ | audiences/remove-audience-contact | DELETE /v1/audiences/{id}/contacts/{contactId} | (none) |

### Contacts
| ☐ | Page | Method/Path | snake_case still present |
|---|---|---|---|
| ☐ | contacts/list-contacts | GET /v1/contacts | resp:chat_id, is_business |

### Groups
| ☐ | Page | Method/Path | snake_case still present |
|---|---|---|---|
| ☐ | groups/create-group | POST /v1/groups | resp:created_at, last_message_at, participant_count, chat_id, is_admin, is_super_admin |
| ☐ | groups/list-groups | GET /v1/groups | resp: same |
| ☐ | groups/get-group | GET /v1/groups/{id} | resp: same |
| ☐ | groups/update-group | PATCH /v1/groups/{id} | body:edit_info_admins_only; resp: same |
| ☐ | groups/add-member-to-group | POST /v1/groups/{id}/members | body:chat_id; resp: same |
| ☐ | groups/remove-member-from-group | DELETE /v1/groups/{id}/members/{chatId} | resp: same |
| ☐ | groups/promote-member-to-admin | POST /v1/groups/{id}/members/{chatId}/admin | resp: same |
| ☐ | groups/demote-admin-to-member | DELETE /v1/groups/{id}/members/{chatId}/admin | resp: same |
| ☐ | groups/leave-group | DELETE /v1/groups/{id}/members/me | (none) |
| ☐ | groups/set-group-picture | PUT /v1/groups/{id}/picture | body:file_data_url, file_name, file_mime_type; resp: same |

### Newsletters
| ☐ | Page | Method/Path | snake_case still present |
|---|---|---|---|
| ☐ | newsletters/create-newsletter | POST /v1/newsletters | resp:created_at |
| ☐ | newsletters/list-newsletters | GET /v1/newsletters | resp:created_at |
| ☐ | newsletters/get-newsletter | GET /v1/newsletters/{id} | resp:created_at |

### Webhooks
| ☐ | Page | Method/Path | snake_case still present |
|---|---|---|---|
| ☐ | webhooks/create-webhook | POST /v1/webhooks | resp:created_at |
| ☐ | webhooks/list-webhooks | GET /v1/webhooks | resp:created_at |
| ☐ | webhooks/get-webhook | GET /v1/webhooks/{id} | resp:created_at |
| ☐ | webhooks/update-webhook | PATCH /v1/webhooks/{id} | resp:created_at |
| ☐ | webhooks/delete-webhook | DELETE /v1/webhooks/{id} | (none) |
| ☐ | webhooks/rotate-webhook-secret | POST /v1/webhooks/{id}/rotate-secret | resp:created_at |

### Account / Ping / Engines
| ☐ | Page | Method/Path | snake_case still present |
|---|---|---|---|
| ☐ | account | GET /v1/account | resp:user_email, created_at |
| ☐ | ping | GET /v1/ping | resp:account_id, whatsapp_connections |
| ☐ | engines | GET /v1/engines | resp:has_synced |

---

## Browser observations log

**Method:** field-level snake_case per page is a deterministic render of `docs/openapi.json` (exhaustively grepped, authoritative). The browser walk verified the *rendering* + the render-only `"string"` prefill across every structural variant and every unique schema. Pages sharing a schema (all campaigns pages → same counters; all groups pages → same Group; all webhooks → `created_at`; all audiences → `contact_count`/`created_at`) are confirmed once per schema.

### Browser-verified anchor pages (☑)
| Page | What was confirmed in the DOM |
|---|---|
| ☑ messages/send-message | `chat_id*` path param, snake; `text: string` prefill; cURL `.../messages/string`; body fields show "Enter value" |
| ☑ messages/get-message | `{waMessageKey}` path (camel) + optional `chatId?` query; `waMessageKey` input prefilled `string` |
| ☑ messages/list-pinned-messages | `{chat_id}` path still snake; `string` prefill |
| ☑ messages/batch-get-message-acks | body `message_keys*` + `chat_id?` snake; JSON example shows `"message_keys": [` |
| ☑ chats/list-chats | query params `include_last_message?` / `include_extended_info?` / `include_without_name?` snake |
| ☑ campaigns/create-campaign | body `audience_id*`,`media_url?`,`media_caption?`,`on_missing_variable?` snake; JSON example `"audience_id":"string"`; description prose cites `sent_count` etc. |
| ☑ groups/set-group-picture | body `file_data_url?`,`file_name?`,`file_mime_type?` snake; `id` path prefilled `string` |
| ☑ scheduled-messages/schedule-message | **CLEAN** — `mediaUrl`,`mediaBase64`,`pollOptions`,`pollQuestion`,`sendAt`,`mediaFilename` all camelCase (no snake) |
| ☑ contacts (flattened) | page loads; response schema lazy (fields per spec: `chat_id`,`is_business`) |
| ☑ ping (flattened) | response `whatsapp_connections` (and `account_id`) snake |

### Remaining pages (confirmed via authoritative spec grep, same schema as an anchor + same global prefill)
- **Messages**: list-messages, ack, react, media, media_url, load-older — fields per checklist; ack/react/media_url have no snake body/resp; load-older keeps `{chat_id}`.
- **Scheduled Messages** (list/get/update): clean (camelCase), like schedule-message.
- **Chats** (get-chat, participants, mark_read, open): Chat/Participant schema snake per checklist; participants/mark_read/open keep `{chat_id}` path.
- **Campaigns** (list/get/pause/resume/cancel): same Campaign counters/dates snake as create-campaign.
- **Audiences** (all 8): `contact_count`,`created_at`,`added_at` snake; create/delete bodies clean.
- **Groups** (all 10): Group schema snake (`created_at`,`last_message_at`,`participant_count`,`chat_id`,`is_admin`,`is_super_admin`); update body `edit_info_admins_only`; add-member body `chat_id`; members admin endpoints already `{chatId}`.
- **Newsletters** (3): `created_at` snake.
- **Webhooks** (6): `created_at` snake; delete clean.
- **Account**: `user_email`,`created_at` snake.
- **Engines**: `has_synced` snake.

### Net result
- 6 endpoints still expose `{chat_id}` path params; ~50 distinct snake_case body/response fields across the spec (full map in the migration plan).
- The `"string"` prefill affects 100% of param-bearing pages and leaks into copy-pasteable cURL/JSON examples — higher impact than the cosmetic report suggested.
- Two NEW issues found that weren't in the original plan: (1) **spec↔source drift** on the message-key endpoints (must reconcile `openapi-custom-paths.ts` or regeneration reverts the waMessageKey work); (2) prefill leaks into examples, not just inputs.
</content>
