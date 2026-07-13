# btgpt Per-Conversation Config + Deterministic Settings Commands — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist model/permissions/trace per btgpt conversation and add deterministic `/model`, `/permissions`, `/trace-level` commands (inline picker in the btgpt web view, WhatsApp poll + deterministic vote), so settings are accurate (no LLM hallucination), per-conversation, and inherited on New-Chat.

**Architecture:** The btgpt conversation record (`BtgptConversations`) becomes the source of truth for the three settings. A shared deterministic parser intercepts the commands at turn entry and skips the LLM. The btgpt web view loads/saves config per-conversation and renders an inline picker widget; the WhatsApp headless path renders a poll and applies the returning vote deterministically via a `pendingSetting` marker.

**Tech Stack:** Node 18/22 + FeathersJS + Mongoose (backend), React 18 + Redux (btgpt web view), extension content-script (WA poll-vote capture). Backend tests: vitest (`src/harness/vitest.config.ts`) + Node 22 binary where required.

## Global Constraints

- Models enum: `haiku | sonnet | opus | fable | local` (`local` only when `bt-debug`). Concrete ids resolved by `blueticks-api/backend/src/harness/llm/model-map.ts` `MODEL_MAP`.
- Trace enum: `thinking | debug | trace` (`blueticks-api/backend/src/harness/trace/turn-debug.ts`).
- Permissions granular type: `{ send, schedule, history, archive }` booleans (`blueticks-api/backend/src/harness/types.ts`). Binary command mapping: `Allow all` = all true; `Ask before sending` = `{send:false, schedule:true, history:true, archive:true}`.
- Fresh-conversation hard defaults: `model=sonnet`, `permissions` all-true, `debugLevel=trace`.
- Deterministic only — no LLM interpretation of commands, no bare-phrase parsing.
- `bt-common` command interfaces are mirrored byte-identical between `blueticks-api/backend/src/bt-common/` and `whatsapp-scheduler/src/bt-common/` — any addition must be applied to both.
- Spec: `blueticks-api/docs/superpowers/specs/2026-07-13-btgpt-per-conversation-config-and-commands-design.md`.

---

## File Structure

**Backend (`blueticks-api/backend/src`)**
- Modify `services/btgpt/btgpt.model.ts` — add `model`, `permissions`, `debugLevel`, `pendingSetting` fields.
- Create `services/btgpt/settings-commands.ts` — `parseSettingsCommand`, option catalogs, binary permission mapping, current-value formatting.
- Create `services/btgpt/settings-commands.test.ts` — unit tests for the parser + mapping.
- Modify `services/btgpt/btgpt.service.ts` — config resolution (record vs seed vs default), command interception in `handleTurn`, PATCH support, poll send + `pendingSetting`, headless read-from-record.
- Modify `harness/surfaces/btgpt-adapter.ts` / `services/btgpt/btgpt.service.ts:runHeadlessBtgptTurn` — read config from record.

**btgpt web view (`whatsapp-scheduler/src/website/views/btgpt`)**
- Modify `btgpt-view.tsx` — per-conversation config state, load on open, PATCH on change, New-Chat inherit, remove localStorage globals, command hints on controls, handle `settings-changed` SSE.
- Modify `services/btgpt-server-client.ts` + `types/btgpt-types.ts` — config fetch/patch, `settings-changed` chunk type, settings-picker block type.
- Create `btgptUi/settings-picker-block.tsx` — inline picker widget; register in `btgptUi/widget-factory.ts`.

**Extension WA ingest (`whatsapp-scheduler/src/extension`)**
- Verify/modify poll-vote routing so votes in btgpt AI-conversation groups reach the backend btgpt settings handler (integration point — Task 8).

---

## Task 1: Persist the three settings on the conversation record

**Files:**
- Modify: `blueticks-api/backend/src/services/btgpt/btgpt.model.ts`
- Test: `blueticks-api/backend/src/services/btgpt/btgpt.model.test.ts` (create if absent)

**Interfaces:**
- Produces: `BtgptConversations` docs carry `model?: string`, `permissions?: {send,schedule,history,archive}`, `debugLevel?: string`, `pendingSetting?: {setting, pollMsgKey}`.

- [ ] **Step 1: Write the failing test** — a new conversation created with no config resolves to defaults via a helper `applyConversationDefaults(doc)`.

```ts
import { applyConversationDefaults } from './btgpt.model';
test('applyConversationDefaults fills fresh defaults', () => {
  const doc: any = {};
  applyConversationDefaults(doc);
  expect(doc.model).toBe('sonnet');
  expect(doc.permissions).toEqual({ send: true, schedule: true, history: true, archive: true });
  expect(doc.debugLevel).toBe('trace');
});
test('applyConversationDefaults preserves provided values', () => {
  const doc: any = { model: 'opus', debugLevel: 'debug' };
  applyConversationDefaults(doc);
  expect(doc.model).toBe('opus');
  expect(doc.debugLevel).toBe('debug');
  expect(doc.permissions).toEqual({ send: true, schedule: true, history: true, archive: true });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/services/btgpt/btgpt.model.test.ts` → FAIL (`applyConversationDefaults` not exported).

- [ ] **Step 3: Add schema fields + `applyConversationDefaults`** to `btgpt.model.ts`. Add to the Mongoose schema:

```ts
model: { type: String, default: null },
permissions: {
  send: { type: Boolean, default: true },
  schedule: { type: Boolean, default: true },
  history: { type: Boolean, default: true },
  archive: { type: Boolean, default: true },
},
debugLevel: { type: String, default: null },
pendingSetting: {
  setting: { type: String, default: null },
  pollMsgKey: { type: String, default: null },
},
```

And export:

```ts
export const FRESH_DEFAULTS = {
  model: 'sonnet' as const,
  permissions: { send: true, schedule: true, history: true, archive: true },
  debugLevel: 'trace' as const,
};
export function applyConversationDefaults(doc: any): void {
  if (!doc.model) doc.model = FRESH_DEFAULTS.model;
  if (!doc.permissions) doc.permissions = { ...FRESH_DEFAULTS.permissions };
  if (!doc.debugLevel) doc.debugLevel = FRESH_DEFAULTS.debugLevel;
}
```

- [ ] **Step 4: Run test to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(btgpt): persist model/permissions/debugLevel per conversation"`

---

## Task 2: Deterministic settings-command parser + option catalog

**Files:**
- Create: `blueticks-api/backend/src/services/btgpt/settings-commands.ts`
- Test: `blueticks-api/backend/src/services/btgpt/settings-commands.test.ts`

**Interfaces:**
- Produces:
  - `parseSettingsCommand(text: string): { setting: 'model'|'permissions'|'trace'; arg?: string } | null`
  - `MODEL_CHOICES: string[]`, `TRACE_CHOICES: string[]`, `PERMISSION_CHOICES: string[]` (`['allow-all','ask-before-sending']`)
  - `applyPermissionChoice(choice: string): {send,schedule,history,archive} | null`
  - `describePermissions(p): 'Allow all'|'Ask before sending'`
  - `normalizeArg(setting, arg): string | null` (validates arg against the setting's catalog; returns canonical value or null)

- [ ] **Step 1: Write failing tests**

```ts
import { parseSettingsCommand, normalizeArg, applyPermissionChoice, describePermissions } from './settings-commands';

test('parses bare commands', () => {
  expect(parseSettingsCommand('/model')).toEqual({ setting: 'model' });
  expect(parseSettingsCommand('/permissions')).toEqual({ setting: 'permissions' });
  expect(parseSettingsCommand('/trace-level')).toEqual({ setting: 'trace' });
});
test('parses command with arg (case/space tolerant)', () => {
  expect(parseSettingsCommand('/model sonnet')).toEqual({ setting: 'model', arg: 'sonnet' });
  expect(parseSettingsCommand('  /Model   Opus ')).toEqual({ setting: 'model', arg: 'opus' });
});
test('non-commands return null', () => {
  expect(parseSettingsCommand('what model are you?')).toBeNull();
  expect(parseSettingsCommand('/models')).toBeNull();
});
test('normalizeArg validates against catalog', () => {
  expect(normalizeArg('model', 'sonnet')).toBe('sonnet');
  expect(normalizeArg('model', 'gpt-4o')).toBeNull();
  expect(normalizeArg('trace', 'trace')).toBe('trace');
  expect(normalizeArg('permissions', 'allow-all')).toBe('allow-all');
});
test('permission mapping', () => {
  expect(applyPermissionChoice('allow-all')).toEqual({ send: true, schedule: true, history: true, archive: true });
  expect(applyPermissionChoice('ask-before-sending')).toEqual({ send: false, schedule: true, history: true, archive: true });
  expect(describePermissions({ send: true, schedule: true, history: true, archive: true })).toBe('Allow all');
  expect(describePermissions({ send: false, schedule: true, history: true, archive: true })).toBe('Ask before sending');
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/services/btgpt/settings-commands.test.ts` → FAIL.

- [ ] **Step 3: Implement `settings-commands.ts`**

```ts
export type SettingKey = 'model' | 'permissions' | 'trace';
export const MODEL_CHOICES = ['haiku', 'sonnet', 'opus', 'fable', 'local'];
export const TRACE_CHOICES = ['thinking', 'debug', 'trace'];
export const PERMISSION_CHOICES = ['allow-all', 'ask-before-sending'];

const COMMAND_MAP: Record<string, SettingKey> = {
  '/model': 'model',
  '/permissions': 'permissions',
  '/trace-level': 'trace',
};

export function parseSettingsCommand(text: string): { setting: SettingKey; arg?: string } | null {
  if (!text) return null;
  const trimmed = text.trim();
  const [rawCmd, ...rest] = trimmed.split(/\s+/);
  const setting = COMMAND_MAP[rawCmd.toLowerCase()];
  if (!setting) return null;
  const arg = rest.join(' ').trim().toLowerCase();
  return arg ? { setting, arg } : { setting };
}

export function normalizeArg(setting: SettingKey, arg: string): string | null {
  const v = arg.trim().toLowerCase();
  const catalog = setting === 'model' ? MODEL_CHOICES : setting === 'trace' ? TRACE_CHOICES : PERMISSION_CHOICES;
  return catalog.includes(v) ? v : null;
}

export function applyPermissionChoice(choice: string) {
  if (choice === 'allow-all') return { send: true, schedule: true, history: true, archive: true };
  if (choice === 'ask-before-sending') return { send: false, schedule: true, history: true, archive: true };
  return null;
}

export function describePermissions(p: { send: boolean; schedule: boolean; history: boolean; archive: boolean }): 'Allow all' | 'Ask before sending' {
  return p && p.send && p.schedule && p.history && p.archive ? 'Allow all' : 'Ask before sending';
}
```

- [ ] **Step 4: Run to verify pass** — PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(btgpt): deterministic settings-command parser + option catalog"`

---

## Task 3: Resolve config from the record (existing) or seed/default (new) in `handleTurn`

**Files:**
- Modify: `blueticks-api/backend/src/services/btgpt/btgpt.service.ts` (`handleTurn`, find-or-create in `POST /btgpt`)
- Test: `blueticks-api/backend/src/services/btgpt/btgpt.service.config.test.ts` (create)

**Interfaces:**
- Consumes: `applyConversationDefaults`, `FRESH_DEFAULTS` (Task 1).
- Produces: `resolveTurnConfig(conv, body, isNew): { model, permissions, debugLevel }` — exported helper used by both web + headless paths.

- [ ] **Step 1: Write failing test** for `resolveTurnConfig`:

```ts
import { resolveTurnConfig } from './btgpt.service';
test('existing conversation reads config from record, ignoring body', () => {
  const conv: any = { model: 'opus', permissions: { send:false,schedule:true,history:true,archive:true }, debugLevel: 'debug' };
  const cfg = resolveTurnConfig(conv, { model: 'haiku', debugLevel: 'thinking' }, false);
  expect(cfg.model).toBe('opus');
  expect(cfg.debugLevel).toBe('debug');
  expect(cfg.permissions.send).toBe(false);
});
test('new conversation seeds from body then defaults', () => {
  const conv: any = {};
  const cfg = resolveTurnConfig(conv, { model: 'haiku' }, true);
  expect(cfg.model).toBe('haiku');           // seeded from body
  expect(cfg.debugLevel).toBe('trace');       // default (body absent)
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `resolveTurnConfig`** and wire it into `handleTurn`. For a new conversation, write the resolved config onto the conversation doc before save (so it persists); for an existing conversation, read the doc fields. Replace the current per-request reads of `req.body.model` / `parsePermissions` / `parseDebugLevel` with `resolveTurnConfig`.

```ts
export function resolveTurnConfig(conv: any, body: any, isNew: boolean) {
  if (!isNew) {
    return {
      model: conv.model ?? FRESH_DEFAULTS.model,
      permissions: conv.permissions ?? { ...FRESH_DEFAULTS.permissions },
      debugLevel: conv.debugLevel ?? FRESH_DEFAULTS.debugLevel,
    };
  }
  const cfg = {
    model: body?.model ?? FRESH_DEFAULTS.model,
    permissions: body?.permissions ?? { ...FRESH_DEFAULTS.permissions },
    debugLevel: body?.debugLevel ?? FRESH_DEFAULTS.debugLevel,
  };
  conv.model = cfg.model; conv.permissions = cfg.permissions; conv.debugLevel = cfg.debugLevel;
  return cfg;
}
```

  Then `modelChoice = resolveModelChoice(app, cfg.model)`, `permissions = cfg.permissions`, `debugLevel = cfg.debugLevel`.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** — `git commit -m "feat(btgpt): resolve turn config from conversation record with seed/default"`

---

## Task 4: PATCH endpoint accepts the three settings

**Files:**
- Modify: `blueticks-api/backend/src/services/btgpt/btgpt.hooks.ts` (or the `/btgpt/conversations` service config)
- Test: `blueticks-api/backend/src/services/btgpt/btgpt.patch.test.ts` (create)

**Interfaces:**
- Produces: `PATCH /btgpt/conversations/:id` with body `{ model? , permissions?, debugLevel? }` validates + persists; rejects out-of-catalog values.

- [ ] **Step 1: Write failing test** — patching with `model:'opus'` persists; `model:'gpt-4o'` is rejected (validated via `normalizeArg`).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Add a `before patch` hook** that whitelists the three fields and validates each via `normalizeArg` / permission shape; strips everything else.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(btgpt): validate + persist settings on conversation PATCH"`

---

## Task 5: Command interception in the btgpt web (SSE) path

**Files:**
- Modify: `blueticks-api/backend/src/services/btgpt/btgpt.service.ts` (`handleTurn` entry)
- Test: `blueticks-api/backend/src/services/btgpt/btgpt.command.test.ts` (create)

**Interfaces:**
- Consumes: `parseSettingsCommand`, `normalizeArg`, `applyPermissionChoice`, `describePermissions` (Task 2); `resolveTurnConfig` (Task 3).
- Produces: SSE chunks `{ type: 'settings-picker', setting, current, options }` (no-arg) and `{ type: 'settings-changed', setting, value, current }` (arg or applied), and the LLM turn is skipped when a command is detected.

- [ ] **Step 1: Write failing test** — `handleTurn` with `message:'/model'` on an existing conv emits a `settings-picker` chunk with `current` = the record's model and `options` = MODEL_CHOICES, and does **not** invoke `runTurnCore`. With `message:'/model opus'` it PATCHes the record to `opus` and emits `settings-changed`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — at the top of `handleTurn`, `const cmd = parseSettingsCommand(message)`. If `cmd`:
  - Resolve `current` from the record (via `resolveTurnConfig(conv, {}, false)`).
  - If `cmd.arg`: `const val = normalizeArg(cmd.setting, cmd.arg)`; if null → emit a `settings-picker` chunk with an "invalid option" note; else write to the record (`model`/`debugLevel` directly, `permissions` via `applyPermissionChoice`), save, emit `settings-changed`.
  - If no arg: emit `settings-picker` with `current` + option list.
  - Return before `runTurnCore` (skip LLM). Persist a lightweight assistant transcript line so the picker/confirmation survives reload.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(btgpt): intercept settings commands in web turn path, skip LLM"`

---

## Task 6: btgpt web view — settings-picker widget + live sync

**Files:**
- Create: `whatsapp-scheduler/src/website/views/btgpt/btgptUi/settings-picker-block.tsx`
- Modify: `whatsapp-scheduler/src/website/views/btgpt/btgptUi/widget-factory.ts`
- Modify: `whatsapp-scheduler/src/website/views/btgpt/services/btgpt-server-client.ts` + `types/btgpt-types.ts`
- Modify: `whatsapp-scheduler/src/website/views/btgpt/btgpt-view.tsx`

**Interfaces:**
- Consumes: SSE `settings-picker` / `settings-changed` chunks (Task 5).
- Produces: rendered inline picker; clicking an option calls `agent.patchConversationSettings(convId, { [setting]: value })` then updates the header control.

- [ ] **Step 1:** Add `settings-picker` block type + `settings-changed` chunk to `btgpt-types.ts`; add `patchConversationSettings` + `getConversationSettings` to `btgpt-server-client.ts` (GET/PATCH `/btgpt/conversations/:id`). (Write a client-level test if a harness exists; otherwise type-check.)
- [ ] **Step 2:** Implement `settings-picker-block.tsx` — renders "Currently: **{current}**" + a button per option; onClick → `patchConversationSettings` + optimistic header update. Register in `widget-factory.ts`.
- [ ] **Step 3:** In `btgpt-view.tsx`: on `onDone`/chunk handling, route `settings-picker`/`settings-changed`; on `settings-changed`, set the corresponding control state (`setModel`/`setPermissions`/`setDebugLevel`).
- [ ] **Step 4:** Verify by type-check/build watch; manual smoke in Task 9.
- [ ] **Step 5: Commit** — `git commit -m "feat(btgpt-web): inline settings picker + live control sync"`

---

## Task 7: btgpt web view — per-conversation load/save, inherit, hints, drop localStorage globals

**Files:**
- Modify: `whatsapp-scheduler/src/website/views/btgpt/btgpt-view.tsx`

- [ ] **Step 1:** On conversation open (URL `/btgpt/:id` load), call `getConversationSettings(id)` and set `model`/`permissions`/`debugLevel`. Remove the `MODEL_STORAGE_KEY`/`PERMISSIONS_STORAGE_KEY`/`DEBUG_LEVEL_STORAGE_KEY` reads/writes; initialize state from `FRESH_DEFAULTS` (sonnet/all-true/trace) when no conversation is loaded.
- [ ] **Step 2:** Dropdown/popover `onChange` → `patchConversationSettings(convId, …)` when a conversation exists; local state only otherwise.
- [ ] **Step 3:** `handleNewChat` keeps current control values (inherit) and navigates to `/btgpt`; the first message sends them as the create-seed (already carried in the stream body).
- [ ] **Step 4:** Add command-hint labels: `/model` under the model dropdown, `/trace-level` under the trace dropdown, and a "Tip: type /permissions in chat" line under the "Agent permissions" popover title.
- [ ] **Step 5: Commit** — `git commit -m "feat(btgpt-web): per-conversation config load/save, inherit, command hints"`

---

## Task 8: WhatsApp — poll on command + deterministic vote apply

**Files:**
- Modify: `blueticks-api/backend/src/services/btgpt/btgpt.service.ts` (`runHeadlessBtgptTurn` + a poll-vote entry)
- Verify/Modify: `whatsapp-scheduler/src/extension/context/content/services/contentMessageServiceHandlers.ts` + `blueticks-api/backend/src/bt-common/wa-events/wa-event-relevance.ts` (poll-vote routing to btgpt groups)
- Test: `blueticks-api/backend/src/services/btgpt/btgpt.wa-settings.test.ts` (create)

**Interfaces:**
- Consumes: `parseSettingsCommand`, catalogs, `pendingSetting` field (Task 1).

- [ ] **Step 1: Verify routing** — trace whether a poll vote in a btgpt AI-conversation group reaches `runHeadlessBtgptTurn`. Document the finding at the top of the test file. If votes are dropped (`botRelevant:false`), add a btgpt-group carve-out so `poll_vote` events for linked chats are delivered.
- [ ] **Step 2: Write failing test** — `runHeadlessBtgptTurn` with text `/model` sends a poll (assert on a mocked poll sender) and sets `conv.pendingSetting = { setting:'model', pollMsgKey }`; a following `poll_vote` for that poll with option `opus` sets `conv.model='opus'`, clears `pendingSetting`, and sends a confirmation; the LLM is not invoked in either.
- [ ] **Step 3: Implement** — in the headless path, `parseSettingsCommand(text)` first:
  - Command → build poll (title `"{Setting} — currently: {current}"`, options from catalog; permissions options `Allow all`/`Ask before sending`; local only in debug), send via the existing poll sender (`createChatbotMessage` poll build / harness low-level send), store `pendingSetting`, return (skip LLM).
  - Incoming `poll_vote` while `pendingSetting` set and matching `pollMsgKey` → map option → write field (model/debugLevel direct, permissions via `applyPermissionChoice`), clear `pendingSetting`, send `"… set to X ✅"`, return (skip LLM). Non-matching vote → fall through to normal handling.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(btgpt-wa): settings poll + deterministic vote apply"`

---

## Task 9: End-to-end verification

- [ ] **Step 1:** btgpt web (watch already running; user reloads tab): open a conversation, type `/model` → picker shows real current model (e.g. Sonnet), not a hallucination; pick Opus → header dropdown flips to Opus and persists across reload. `/model haiku` sets directly. Repeat for `/permissions`, `/trace-level`.
- [ ] **Step 2:** New-Chat from a conversation inherits its config; fresh `/btgpt` shows sonnet/allow-all/trace.
- [ ] **Step 3:** WhatsApp AI-conversation group: `/model` → poll appears; vote → confirmation + persisted (verify by opening the same conversation in btgpt web).
- [ ] **Step 4:** Run backend suite: `npx vitest run src/services/btgpt` (Node 22 binary if required per repo). Confirm green.
- [ ] **Step 5: Commit** any test/fixup — `git commit -m "test(btgpt): e2e settings commands verification"`

---

## Self-Review Notes

- **Spec coverage:** §1 persistence → Tasks 1,3; §2 parser → Task 2; §3 WA poll+vote → Task 8; §4 btgpt UI (picker, hints, inherit, defaults) → Tasks 5,6,7; PATCH → Task 4; defaults → Tasks 1,3,7; hallucination fix → Task 5 (deterministic current from record).
- **Type consistency:** `resolveTurnConfig`, `parseSettingsCommand`, `normalizeArg`, `applyPermissionChoice`, `describePermissions`, `applyConversationDefaults`, `FRESH_DEFAULTS`, `patchConversationSettings`/`getConversationSettings`, chunk types `settings-picker`/`settings-changed`, field `pendingSetting.pollMsgKey` used consistently across tasks.
- **Open integration point:** Task 8 Step 1 (poll-vote delivery to btgpt groups) is the one unknown; it is isolated to Task 8 and does not block Tasks 1–7 (the visible btgpt-web fix).
