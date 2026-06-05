// Single source of truth for SDK resource/method <-> OpenAPI path mapping.
// Forward logic copied verbatim from lib/openapi.ts; inverse derived by walking the spec.

// Map (VERB + path) → SDK method name when convention doesn't match.
// Source of truth: sdks/python/src/blueticks/resources/*.py.
// Path params here must use the literal name used in openapi.json
// (e.g. `{contactId}`, `{chat_id}`, `{key}`) for the lookup to hit.
const SDK_METHOD_OVERRIDES: Record<string, string> = {
  'GET /v1/account': 'retrieve',
  'POST /v1/scheduled-messages': 'send',
  'POST /v1/campaigns/{id}/pause': 'pause',
  'POST /v1/campaigns/{id}/resume': 'resume',
  'POST /v1/campaigns/{id}/cancel': 'cancel',
  'POST /v1/webhooks/{id}/rotate-secret': 'rotate_secret',
  'POST /v1/audiences/{id}/contacts': 'append_contacts',
  'PATCH /v1/audiences/{id}/contacts/{contactId}': 'update_contact',
  'DELETE /v1/audiences/{id}/contacts/{contactId}': 'delete_contact',
  'POST /v1/groups/{id}/members': 'add_member',
  'DELETE /v1/groups/{id}/members/me': 'leave',
  'DELETE /v1/groups/{id}/members/{chatId}': 'remove_member',
  'POST /v1/groups/{id}/members/{chatId}/admin': 'promote_admin',
  'DELETE /v1/groups/{id}/members/{chatId}/admin': 'demote_admin',
  'PUT /v1/groups/{id}/picture': 'set_picture',
  'GET /v1/chats/{chat_id}/messages': 'list_messages',
  'GET /v1/chats/{chat_id}/messages/{key}': 'get_message',
  'GET /v1/chats/{chat_id}/messages/{key}/ack': 'get_message_ack',
  'GET /v1/chats/{chat_id}/messages/{key}/media': 'get_media',
  'GET /v1/chats/{chat_id}/messages/{key}/media_url': 'get_media_url',
  'POST /v1/chats/{chat_id}/messages/{key}/reactions': 'react',
  'POST /v1/chats/{chat_id}/messages/load_older': 'load_older_messages',
  'POST /v1/chats/message_acks': 'batch_message_acks',
  'GET /v1/chats/{chat_id}/participants': 'list_participants',
  'POST /v1/chats/{chat_id}/mark_read': 'mark_read',
  'POST /v1/chats/{chat_id}/open': 'open',
};

/**
 * Maps an OpenAPI path to its Python SDK resource name.
 * Extracts the first segment after /v1/ and replaces hyphens with underscores.
 * Copied verbatim from lib/openapi.ts pyResource.
 */
export function forwardResource(path: string): string | null {
  const m = path.match(/^\/v1\/([^/]+)/);
  return m ? m[1].replace(/-/g, '_') : null;
}

/**
 * Maps an OpenAPI path to its JavaScript/Node SDK resource name.
 * Extracts the first segment after /v1/ and camelCases hyphenated segments.
 * Copied verbatim from lib/openapi.ts jsResource.
 */
export function forwardJsResource(path: string): string | null {
  const m = path.match(/^\/v1\/([^/]+)/);
  return m ? m[1].replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()) : null;
}

/**
 * Maps (verb, path) to the Python SDK method name.
 * Accepts lowercase or uppercase verb — normalizes to uppercase internally
 * to match SDK_METHOD_OVERRIDES keys.
 * Copied verbatim from lib/openapi.ts pyMethod.
 */
export function forwardMethod(verb: string, path: string): string | null {
  const key = `${verb.toUpperCase()} ${path}`;
  if (SDK_METHOD_OVERRIDES[key]) return SDK_METHOD_OVERRIDES[key];
  const m = path.match(/^\/v1\/[^/]+(\/\{[^}]+\})?(\/.+)?$/);
  if (!m) return null;
  if (m[2]) return null; // unmapped sub-resource — emit no sample
  const hasId = !!m[1];
  const verbUp = verb.toUpperCase();
  if (!hasId) {
    if (verbUp === 'GET') return 'list';
    if (verbUp === 'POST') return 'create';
    return null;
  }
  return (
    ({ GET: 'get', PATCH: 'update', PUT: 'update', DELETE: 'delete' } as Record<string, string>)[verbUp] ?? null
  );
}

/**
 * Maps (verb, path) to the JavaScript/Node SDK method name.
 * Converts underscored pyMethod result to camelCase.
 * Copied verbatim from lib/openapi.ts jsMethod.
 */
export function forwardJsMethod(verb: string, path: string): string | null {
  const py = forwardMethod(verb, path);
  return py ? py.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()) : null;
}

export interface OpRef { verb: string; path: string; }

/** Walk every operation in the spec, run the forward map, index the inverse. */
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
