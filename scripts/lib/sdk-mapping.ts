// Single source of truth for SDK resource/method <-> OpenAPI path mapping.
//
// The five SDKs do NOT share one shape — they diverge in ways that string
// transforms can't capture, so resolution is per-language and driven by tables
// verified against the real SDK source (sdks/{python,node,php,ruby,go}/...):
//   - The /v1/messages/* family lives on a `messages` resource in Node
//     (`bt.messages.send`) but on `chats` in Python/PHP/Ruby/Go
//     (`bt.chats.send_message`, `$bt->chats->sendMessage`,
//     `client.chats.send_message`, `client.Chats.SendMessage`). There is no
//     `messages` resource in those four.
//   - Single-resource GETs are `get` in Python/Node/Ruby/Go but `retrieve` in PHP.
//   - `engines` is `status` in Node/Ruby/Go but `retrieve` in Python/PHP.
//   - `ping` is a callable client method in Python/Node/PHP (`bt.ping()`), but a
//     resource in Ruby/Go (`client.ping.retrieve` / `client.Ping.Retrieve(ctx)`).
//   - Go uses PascalCase resources+methods (`client.Chats.SendMessage`,
//     `GetMessageAck`); the others use snake/camel.
//
// Two consumers:
//   - resolveSampleCall() — drives the per-language code samples on every
//     reference page (lib/openapi.ts buildCodeSamples).
//   - forwardResource/forwardMethod + buildInverseMap — resolve Python-style
//     `bt.<resource>.<method>(...)` calls in the guides back to a spec
//     operation (scripts/lib/resolve-operation.ts, for validate-examples).

export type SdkLang = 'python' | 'node' | 'php' | 'ruby' | 'go';

// `VERB path` → per-language method name, for operations that deviate from the
// shared list/create/get/update/delete convention OR are sub-resources the
// convention can't derive. `null` = that language has no such method (emit no
// sample / no inverse entry). `()` = the resource itself is callable (Python
// `bt.ping()`). Verified against the SDK source — keep in sync on SDK changes.
const SAMPLE_METHODS: Record<string, Record<SdkLang, string | null>> = {
  // Singletons / connectivity. `ping` is callable in Python/Node/PHP
  // (`bt.ping()`), but a resource with `retrieve` in Ruby/Go.
  'GET /v1/ping':                                   { python: '()',              node: '()',             php: '()',              ruby: 'retrieve',          go: 'Retrieve' },
  'GET /v1/account':                                { python: 'retrieve',        node: 'retrieve',       php: 'retrieve',        ruby: 'retrieve',          go: 'Retrieve' },
  'GET /v1/engines':                                { python: 'retrieve',        node: 'status',         php: 'retrieve',        ruby: 'status',            go: 'Status' },
  'GET /v1/newsletters/{id}':                       { python: 'retrieve',        node: 'retrieve',       php: 'retrieve',        ruby: 'retrieve',          go: 'Retrieve' },
  'GET /v1/scheduled-messages/{id}':                { python: 'retrieve',        node: 'retrieve',       php: 'retrieve',        ruby: 'retrieve',          go: 'Retrieve' },
  'POST /v1/scheduled-messages':                    { python: 'create',          node: 'create',         php: 'create',          ruby: 'create',            go: 'Create' },
  // Campaign transitions.
  'POST /v1/campaigns/{id}/pause':                  { python: 'pause',           node: 'pause',          php: 'pause',           ruby: 'pause',             go: 'Pause' },
  'POST /v1/campaigns/{id}/resume':                 { python: 'resume',          node: 'resume',         php: 'resume',          ruby: 'resume',            go: 'Resume' },
  'POST /v1/campaigns/{id}/cancel':                 { python: 'cancel',          node: 'cancel',         php: 'cancel',          ruby: 'cancel',            go: 'Cancel' },
  // Audience sub-resources.
  'POST /v1/audiences/{id}/contacts':               { python: 'append_contacts', node: 'appendContacts', php: 'appendContacts',  ruby: 'append_contacts',   go: 'AppendContacts' },
  'PATCH /v1/audiences/{id}/contacts/{contactId}':  { python: 'update_contact',  node: 'updateContact',  php: 'updateContact',   ruby: 'update_contact',    go: 'UpdateContact' },
  'DELETE /v1/audiences/{id}/contacts/{contactId}': { python: 'delete_contact',  node: 'deleteContact',  php: 'deleteContact',   ruby: 'delete_contact',    go: 'DeleteContact' },
  // Group membership / admin.
  'POST /v1/groups/{id}/members':                   { python: 'add_member',      node: 'addMember',      php: 'addMember',       ruby: 'add_member',        go: 'AddMember' },
  'DELETE /v1/groups/{id}/members/me':              { python: 'leave',           node: 'leave',          php: 'leave',           ruby: 'leave',             go: 'Leave' },
  'DELETE /v1/groups/{id}/members/{chatId}':        { python: 'remove_member',   node: 'removeMember',   php: 'removeMember',    ruby: 'remove_member',     go: 'RemoveMember' },
  'POST /v1/groups/{id}/members/{chatId}/admin':    { python: 'promote_admin',   node: 'promoteAdmin',   php: 'promoteAdmin',    ruby: 'promote_admin',     go: 'PromoteAdmin' },
  'DELETE /v1/groups/{id}/members/{chatId}/admin':  { python: 'demote_admin',    node: 'demoteAdmin',    php: 'demoteAdmin',     ruby: 'demote_admin',      go: 'DemoteAdmin' },
  'PUT /v1/groups/{id}/picture':                    { python: 'set_picture',     node: 'setPicture',     php: 'setPicture',      ruby: 'set_picture',       go: 'SetPicture' },
  // Chat reads.
  'GET /v1/chats/{chat_id}/participants':           { python: 'list_participants', node: 'listParticipants', php: 'listParticipants', ruby: 'list_participants', go: 'ListParticipants' },
  'POST /v1/chats/{chat_id}/mark_read':             { python: 'mark_read',       node: 'markRead',       php: 'markRead',        ruby: 'mark_read',         go: 'MarkRead' },
  'POST /v1/chats/{chat_id}/open':                  { python: 'open',            node: 'open',           php: 'open',            ruby: 'open',              go: 'Open' },
  // Message family — resource is `messages` in Node, `chats` elsewhere (see
  // sampleResource). Method names diverge per language; verified 1:1.
  'GET /v1/messages':                               { python: 'list_messages',         node: 'list',        php: 'listMessages',        ruby: 'list_messages',         go: 'ListMessages' },
  'POST /v1/messages/{chat_id}':                    { python: 'send_message',          node: 'send',        php: 'sendMessage',         ruby: 'send_message',          go: 'SendMessage' },
  'GET /v1/messages/{chat_id}/{key}':               { python: 'get_message',           node: 'get',         php: 'getMessage',          ruby: 'get_message',           go: 'GetMessage' },
  'GET /v1/messages/ack/{chat_id}/{key}':           { python: 'get_message_ack',       node: 'getAck',      php: 'getMessageAck',       ruby: 'get_message_ack',       go: 'GetMessageAck' },
  'POST /v1/messages/reactions/{chat_id}/{key}':    { python: 'react',                 node: 'react',       php: 'react',               ruby: 'react',                 go: 'React' },
  'POST /v1/messages/load_older/{chat_id}':         { python: 'load_older_messages',   node: 'loadOlder',   php: 'loadOlderMessages',   ruby: 'load_older_messages',   go: 'LoadOlderMessages' },
  'GET /v1/messages/media/{chat_id}/{key}':         { python: 'get_media',             node: 'getMedia',    php: 'getMedia',            ruby: 'get_media',             go: 'GetMedia' },
  'POST /v1/messages/acks':                         { python: 'batch_message_acks',    node: 'batchAcks',   php: 'batchMessageAcks',    ruby: 'batch_message_acks',    go: 'BatchMessageAcks' },
  // Pinned messages exist only on the Node SDK so far → others emit no sample.
  'GET /v1/messages/pinned/{chat_id}':              { python: null,                    node: 'listPinned',  php: null,                  ruby: null,                    go: null },
  'POST /v1/messages/pin/{waMessageKey}':           { python: 'pin',                   node: 'pin',         php: 'pin',                 ruby: 'pin',                   go: 'Pin' },
  'POST /v1/messages/unpin/{waMessageKey}':         { python: 'unpin',                 node: 'unpin',       php: 'unpin',               ruby: 'unpin',                 go: 'Unpin' },
};

/** PascalCase a hyphenated resource segment for Go (e.g. scheduled-messages → ScheduledMessages). */
function pascalCase(seg: string): string {
  return seg.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

/** SDK resource (client property) name for `path` in `lang`. */
export function sampleResource(lang: SdkLang, path: string): string | null {
  if (/^\/v1\/messages(?:\/|$)/.test(path)) {
    if (lang === 'node') return 'messages';
    return lang === 'go' ? 'Chats' : 'chats';
  }
  const seg = path.match(/^\/v1\/([^/]+)/)?.[1];
  if (!seg) return null;
  if (lang === 'node') return seg.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()); // camelCase
  if (lang === 'go') return pascalCase(seg); // PascalCase
  return seg.replace(/-/g, '_'); // Python / PHP / Ruby snake_case
}

/** SDK method name for (verb, path) in `lang`, or null when the SDK has none. */
export function sampleMethod(lang: SdkLang, verb: string, path: string): string | null {
  const key = `${verb.toUpperCase()} ${path}`;
  if (key in SAMPLE_METHODS) return SAMPLE_METHODS[key][lang];
  // Convention for plain resources (no extra sub-resource segment).
  const m = path.match(/^\/v1\/[^/]+(\/\{[^}]+\})?(\/.+)?$/);
  if (!m || m[2]) return null; // unmapped sub-resource — emit no sample
  const v = verb.toUpperCase();
  if (lang === 'go') {
    // Go uses PascalCase methods.
    if (!m[1]) return v === 'GET' ? 'List' : v === 'POST' ? 'Create' : null;
    if (v === 'GET') return 'Get';
    if (v === 'PATCH' || v === 'PUT') return 'Update';
    if (v === 'DELETE') return 'Delete';
    return null;
  }
  if (!m[1]) return v === 'GET' ? 'list' : v === 'POST' ? 'create' : null;
  if (v === 'GET') return lang === 'php' ? 'retrieve' : 'get'; // PHP diverges; Python/Node/Ruby use get
  if (v === 'PATCH' || v === 'PUT') return 'update';
  if (v === 'DELETE') return 'delete';
  return null;
}

export interface SampleCall {
  resource: string;
  method: string;
  /** When true the resource itself is invoked (Python `bt.ping()`); `method` is ''. */
  callable: boolean;
}

/** Resolve a fully-typed SDK call for one language, or null if unsupported. */
export function resolveSampleCall(lang: SdkLang, verb: string, path: string): SampleCall | null {
  const method = sampleMethod(lang, verb, path);
  if (method === null) return null;
  const resource = sampleResource(lang, path);
  if (!resource) return null;
  if (method === '()') return { resource, method: '', callable: true };
  return { resource, method, callable: false };
}

// ---------------------------------------------------------------------------
// Python-flavored forward/inverse helpers, used by resolve-operation.ts to map
// `bt.<resource>.<method>(...)` snippets in the guides back to a spec op.
// ---------------------------------------------------------------------------

/** Python SDK resource name for a path. */
export function forwardResource(path: string): string | null {
  return sampleResource('python', path);
}

/** Node SDK resource name for a path. */
export function forwardJsResource(path: string): string | null {
  return sampleResource('node', path);
}

/** Python SDK method name for (verb, path); null for callables and unmapped ops. */
export function forwardMethod(verb: string, path: string): string | null {
  const m = sampleMethod('python', verb, path);
  return m === '()' ? null : m; // `bt.ping()` has no resource.method form
}

/** Node SDK method name for (verb, path). */
export function forwardJsMethod(verb: string, path: string): string | null {
  return sampleMethod('node', verb, path);
}

export interface OpRef { verb: string; path: string; }

/** Walk every operation in the spec, run the Python forward map, index the inverse. */
export function buildInverseMap(spec: { paths: Record<string, Record<string, unknown>> }): Map<string, OpRef> {
  const inv = new Map<string, OpRef>();
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const verb of Object.keys(item)) {
      const resource = forwardResource(path);
      const method = forwardMethod(verb, path);
      if (!resource || !method) continue;
      const key = `${resource}.${method}`;
      if (!inv.has(key)) inv.set(key, { verb: verb.toLowerCase(), path });
    }
  }
  return inv;
}
