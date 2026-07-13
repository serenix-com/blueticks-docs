# btgpt Per-Conversation Config + Deterministic Settings Commands

**Date:** 2026-07-13
**Status:** Approved design — ready for implementation plan
**Repos:** `blueticks-api` (backend), `whatsapp-scheduler` (btgpt web view + extension WA ingest)

## Problem

The btgpt (Blueticks AI Agent) header has three controls — **model** (Sonnet), **permissions** (Allow all / granular), and **trace level** (Trace). Today they are:

- **Session-global browser `localStorage`** (`btgpt.model`, `btgpt.permissions`, `btgpt.debugLevel`) in `whatsapp-scheduler/src/website/views/btgpt/btgpt-view.tsx`, re-sent in every message body.
- **Read per-request on the backend** (`blueticks-api/backend/src/services/btgpt/btgpt.service.ts` `handleTurn`); **not persisted** on the conversation record (`btgpt.model.ts` `BtgptConversations` has no config fields).
- The WhatsApp headless path (`runHeadlessBtgptTurn`) **hard-codes** model `sonnet`, `sendPermission: 'ask-before-send'`.

Consequences we are fixing:
1. Config is not per-conversation — every conversation shares one browser-wide setting, and it does not survive across devices or reach the WhatsApp path.
2. There is no reliable way to view/change these settings from inside a chat. Asking the agent "what model are you?" makes it **hallucinate** (observed: it answered "GPT-4o (OpenAI)" while actually running `claude-sonnet-4-6`).

## Goals

1. Persist model / permissions / trace **per conversation** on the backend; make the backend the source of truth.
2. New conversation **created from an existing conversation** inherits that conversation's config; a **fresh** conversation uses fixed defaults: `model=sonnet`, `permissions=allow-all`, `debugLevel=trace`.
3. Three **deterministic** in-chat commands — `/model`, `/permissions`, `/trace-level` — that report the real current value and let the user change it. No LLM interpretation (it hallucinates).
   - **btgpt web view:** `/model` shows current + an inline clickable picker; `/model sonnet` sets directly. Same for the other two.
   - **WhatsApp:** the command sends a real WhatsApp **poll** (title `"… — currently: X"`); the vote deterministically applies the change.
4. Each header control shows its command hint so users discover the chat shortcut; command ⇄ control stay in sync because both write the one per-conversation record.

## Non-goals

- No natural-language / bare-phrase parsing ("use sonnet" typed alone does nothing) — deterministic commands + pickers only.
- No change to the "Files auto-recognition" toggle (stays user-doc/Redux backed).
- No new models/permissions/trace levels beyond the existing enums.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Command handling | **Deterministic only** — parser intercepts commands, LLM turn skipped |
| btgpt input | **Command + inline arg + picker** (`/model`, `/model sonnet`, clickable picker); no bare phrases |
| Permissions picker | **Binary level**: `Allow all` / `Ask before sending` |
| Trace in WhatsApp | **Yes** — poll in WA, persisted per-conversation (effect visible in web view) |

## Architecture

### §1 — Per-conversation config (backend is source of truth)

Add to `BtgptConversations` (`blueticks-api/backend/src/services/btgpt/btgpt.model.ts`):

- `model: 'haiku'|'sonnet'|'opus'|'fable'|'local'`
- `permissions: { send: boolean; schedule: boolean; history: boolean; archive: boolean }`
- `debugLevel: 'thinking'|'debug'|'trace'`
- `pendingSetting?: { setting: 'model'|'permissions'|'trace'; pollMsgKey: string }` — transient marker for an outstanding WhatsApp settings poll

**Resolution in `handleTurn` / `runHeadlessBtgptTurn`:**
- **Existing** conversation → read config from the **record** (request body ignored for these three fields).
- **New** conversation (`conversationId == null`) → seed from request body if provided, else hard defaults.
- **Hard defaults** (fresh, no seed): `model=sonnet`, `permissions={send:true,schedule:true,history:true,archive:true}`, `debugLevel=trace`.

`debugLevel` continues to only narrow the SSE trace projection (`projectDebug`); for existing conversations it is read from the record.

**Inheritance falls out naturally:** btgpt "New Chat" keeps the current dropdown values (loaded from the conversation being viewed) and sends them as the create-seed → inherit. A fresh `/btgpt` with nothing loaded shows hard defaults → new conversation gets defaults.

### §2 — Deterministic command parser (shared, backend)

`parseSettingsCommand(text): { setting: 'model'|'permissions'|'trace'; arg?: string } | null`, run at turn entry **before** any LLM call.

- `/model` → picker/poll; `/model sonnet` → set directly + confirm.
- `/permissions` → picker/poll; `/permissions allow-all` | `ask-before-sending` → set.
- `/trace-level` → picker/poll; `/trace-level trace` → set.
- Unknown/invalid arg → reply listing valid options.

When a command is detected the **LLM turn is skipped entirely**. Realm decided by entry point: SSE web request → inline picker; headless WA path → poll.

**Enums / option lists** (reuse existing):
- Models: `haiku | sonnet | opus | fable` (+ `local` only when `bt-debug`), from `model-map.ts` `MODEL_MAP` / `ModelSelector.MODEL_OPTIONS`.
- Trace: `thinking | debug | trace` (`turn-debug.ts` `DebugLevel`).
- Permissions binary mapping:
  - `Allow all` → `{send:true, schedule:true, history:true, archive:true}`
  - `Ask before sending` → `{send:false, schedule:true, history:true, archive:true}`
  - Current display: all-true → "Allow all", else → "Ask before sending".

### §3 — WhatsApp flow (poll + deterministic vote)

`/model` (no arg) in a WA AI-conversation group:

1. Backend sends a real WhatsApp **poll** via the existing poll-send plumbing (`gateway/chatbot/nodes/utils.ts` `createChatbotMessage` poll build, or the harness `send_message_poll` low-level sender): title `"Model — currently: Sonnet"`, options = the choices.
2. Store `pendingSetting = { setting: 'model', pollMsgKey }` on the conversation.
3. When the vote returns, the btgpt WA ingest **intercepts `poll_vote` deterministically** (before the LLM): if it matches `pendingSetting`, apply the choice to the record, clear the marker, send a `"Model set to Opus ✅"` confirmation. No LLM interpretation.

**Integration risk (verify first in plan):** poll-vote events for btgpt groups must reach the btgpt ingest. Today `wa-event-relevance.ts` marks `poll_vote_webhook` as `botRelevant:false`. The plan's first backend step verifies whether votes in AI-conversation groups reach `runHeadlessBtgptTurn`'s ingress; if not, wire that routing. This is the one genuinely new backend seam.

### §4 — btgpt web UI (`btgpt-view.tsx` + `btgptUi/`)

- On opening a conversation → fetch its config, set the three controls. Replace the localStorage-global reads with per-conversation state. A fresh `/btgpt` with no loaded conversation shows the **fixed** hard defaults (`sonnet` / allow-all / `trace`) — not a last-used value; the `btgpt.model` / `btgpt.permissions` / `btgpt.debugLevel` localStorage keys are removed.
- Dropdown / popover change → `PATCH /btgpt/conversations/:id` (existing) or local state only (not-yet-created).
- Typing `/model` in the input → backend returns an inline **settings-picker message block** (new lightweight widget in `btgptUi/`, registered in `widget-factory.ts`); clicking an option `PATCH`es + updates the control. `/model sonnet` → confirmation + live control update via an SSE `settings-changed` event.
- **Command hints on every control:**
  - Model dropdown → `/model`
  - Trace dropdown → `/trace-level`
  - Permissions popover → `/permissions` (subtle hint line under the "Agent permissions" title)
- Permissions popover keeps its granular toggles; the binary command is a shortcut over the same field.

## Phased implementation (outline; detailed plan follows)

1. **Backend persistence + resolution** — schema fields, defaults, `handleTurn` / headless read-from-record, `PATCH` support for the three fields.
2. **btgpt UI wiring** — load/save per-conversation config; New-Chat inherit; fresh defaults; command hints.
3. **Deterministic command parser + btgpt picker widget** — parser, inline picker message block, `/x arg` direct-set, `settings-changed` SSE.
4. **WhatsApp poll + deterministic vote bridge** — send poll, `pendingSetting` marker, poll-vote interception + apply + confirm (includes the §3 routing verification).

## Testing

- Unit: `parseSettingsCommand` (all commands, valid/invalid args, non-commands); permissions binary mapping; default resolution (fresh vs seeded vs existing).
- Backend integration: `handleTurn` skips LLM on command; existing conversation reads config from record; new conversation seeds/defaults; `PATCH` updates fields.
- WA: poll send stores `pendingSetting`; matching poll-vote applies + clears + confirms; non-matching vote falls through.
- btgpt UI: opening conversation hydrates controls; New-Chat inheritance; fresh defaults; picker click PATCHes; `settings-changed` updates control.

---

## Addendum (2026-07-13): Per-conversation language + transcription skip

A fourth per-conversation setting, `language`, plus a `languageLocked` flag.

- **Default & lock:** seeded conceptually from the user's `preferredLanguage`; on the FIRST real turn it locks to the message's detected script (Hebrew/Arabic → `he`/`ar`; Latin is ambiguous → fall back to `preferredLanguage`, else `en`). `languageLocked` distinguishes seed from locked. Locked value is exposed by `/btgpt/wa-conversations`.
- **Reply consistency:** `buildBtgptSystemPrompt({conversationLanguage})` injects "reply in <language>". Reinforces the core rule (a lone name/group/command is not a language switch).
- **Change on request (agent directive):** the surface `identity` has no conversationId, so a full MCP tool is impractical; instead the agent emits `[set-language: xx]` on an explicit request, which the turn parses + strips (`parseSetLanguageDirective`) and persists. The web view also strips it from the streamed bubble.
- **Transcription skip (client):** transcription is on-device (extension `offscreen.ts`, local Whisper) with a detect→transcribe two-phase that already skips detection when a language is passed. The ai-linked-chats-registry carries each chat's locked language (from the list endpoint + an optimistic record of the first voice's detected language); `TranscribeMessageThunks` feeds it as the language hint above the local sticky heuristic. Decision: **auto-detect the first voice, then lock and skip from voice #2** (chosen over seeding voice #1 from the user pref).
