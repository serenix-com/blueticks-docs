import { describe, it, expect } from 'vitest';
import { forwardResource, forwardMethod, buildInverseMap, resolveSampleCall } from '../sdk-mapping';

const miniSpec = {
  paths: {
    '/v1/scheduled-messages': { post: { summary: 'Send message' } },
    '/v1/audiences': { post: {}, get: {} },
    '/v1/audiences/{id}': { get: {} },
  },
};

describe('sdk-mapping forward', () => {
  it('maps POST /v1/scheduled-messages to scheduled_messages.create (override)', () => {
    // NOTE: forwardResource returns the first path segment with hyphens→underscores,
    // so /v1/scheduled-messages → "scheduled_messages", NOT "messages".
    // SDK_METHOD_OVERRIDES overrides only the method ("create"), not the resource.
    expect(forwardResource('/v1/scheduled-messages')).toBe('scheduled_messages');
    expect(forwardMethod('post', '/v1/scheduled-messages')).toBe('create');
  });
  it('maps POST /v1/audiences to audiences.create (convention)', () => {
    expect(forwardResource('/v1/audiences')).toBe('audiences');
    expect(forwardMethod('post', '/v1/audiences')).toBe('create');
  });

  // Regression: the /v1/messages/* family belongs to the `chats` SDK resource,
  // not a `messages` resource. Broken when message routes moved from
  // /v1/chats/{chat_id}/messages/... to /v1/messages/..., which left these
  // reference pages showing cURL only.
  it('maps /v1/messages/* to the chats resource', () => {
    expect(forwardResource('/v1/messages/{chat_id}')).toBe('chats');
    expect(forwardResource('/v1/messages/ack/{chat_id}/{key}')).toBe('chats');
    expect(forwardResource('/v1/messages')).toBe('chats');
  });
  it('maps message operations to the real chats SDK methods', () => {
    expect(forwardMethod('post', '/v1/messages/{chat_id}')).toBe('send_message');
    expect(forwardMethod('get', '/v1/messages/{chat_id}/{key}')).toBe('get_message');
    expect(forwardMethod('post', '/v1/messages/reactions/{chat_id}/{key}')).toBe('react');
    expect(forwardMethod('post', '/v1/messages/acks')).toBe('batch_message_acks');
    expect(forwardMethod('get', '/v1/messages')).toBe('list_messages');
  });
  it('uses `retrieve` for the non-conventional singleton GETs', () => {
    expect(forwardMethod('get', '/v1/account')).toBe('retrieve');
    expect(forwardMethod('get', '/v1/engines')).toBe('retrieve');
    expect(forwardMethod('get', '/v1/scheduled-messages/{id}')).toBe('retrieve');
    expect(forwardMethod('get', '/v1/newsletters/{id}')).toBe('retrieve');
  });
  it('leaves pinned messages unmapped for Python (no SDK method yet)', () => {
    expect(forwardMethod('get', '/v1/messages/pinned/{chat_id}')).toBeNull();
  });
});

describe('resolveSampleCall (per-language)', () => {
  it('send-message uses the divergent resource+method per language', () => {
    expect(resolveSampleCall('python', 'post', '/v1/messages/{chat_id}')).toEqual({
      resource: 'chats', method: 'send_message', callable: false,
    });
    expect(resolveSampleCall('node', 'post', '/v1/messages/{chat_id}')).toEqual({
      resource: 'messages', method: 'send', callable: false,
    });
    expect(resolveSampleCall('php', 'post', '/v1/messages/{chat_id}')).toEqual({
      resource: 'chats', method: 'sendMessage', callable: false,
    });
  });

  it('single-resource GET is `get` in Python/Node but `retrieve` in PHP', () => {
    expect(resolveSampleCall('python', 'get', '/v1/campaigns/{id}')?.method).toBe('get');
    expect(resolveSampleCall('node', 'get', '/v1/campaigns/{id}')?.method).toBe('get');
    expect(resolveSampleCall('php', 'get', '/v1/campaigns/{id}')?.method).toBe('retrieve');
  });

  it('ping is a callable client method in every SDK', () => {
    for (const lang of ['python', 'node', 'php'] as const) {
      expect(resolveSampleCall(lang, 'get', '/v1/ping')).toEqual({
        resource: 'ping', method: '', callable: true,
      });
    }
  });

  it('list-engines is `retrieve` in Python/PHP but `status` in Node', () => {
    expect(resolveSampleCall('python', 'get', '/v1/engines')?.method).toBe('retrieve');
    expect(resolveSampleCall('node', 'get', '/v1/engines')?.method).toBe('status');
    expect(resolveSampleCall('php', 'get', '/v1/engines')?.method).toBe('retrieve');
  });

  it('send-message resolves correctly for Ruby and Go', () => {
    expect(resolveSampleCall('ruby', 'post', '/v1/messages/{chat_id}')).toEqual({
      resource: 'chats', method: 'send_message', callable: false,
    });
    expect(resolveSampleCall('go', 'post', '/v1/messages/{chat_id}')).toEqual({
      resource: 'Chats', method: 'SendMessage', callable: false,
    });
  });

  it('Go uses PascalCase resources and methods (incl GetMediaURL, ScheduledMessages)', () => {
    expect(resolveSampleCall('go', 'get', '/v1/messages/media_url/{chat_id}/{key}')).toEqual({
      resource: 'Chats', method: 'GetMediaURL', callable: false,
    });
    expect(resolveSampleCall('go', 'get', '/v1/scheduled-messages/{id}')).toEqual({
      resource: 'ScheduledMessages', method: 'Retrieve', callable: false,
    });
    expect(resolveSampleCall('go', 'get', '/v1/campaigns/{id}')?.method).toBe('Get');
  });

  it('ping is a resource (retrieve) in Ruby/Go, callable in Python/Node/PHP', () => {
    expect(resolveSampleCall('ruby', 'get', '/v1/ping')).toEqual({ resource: 'ping', method: 'retrieve', callable: false });
    expect(resolveSampleCall('go', 'get', '/v1/ping')).toEqual({ resource: 'Ping', method: 'Retrieve', callable: false });
    expect(resolveSampleCall('php', 'get', '/v1/ping')?.callable).toBe(true);
  });

  it('engines is `status` in Node/Ruby/Go, `retrieve` in Python/PHP', () => {
    expect(resolveSampleCall('ruby', 'get', '/v1/engines')?.method).toBe('status');
    expect(resolveSampleCall('go', 'get', '/v1/engines')?.method).toBe('Status');
    expect(resolveSampleCall('python', 'get', '/v1/engines')?.method).toBe('retrieve');
  });

  it('pinned messages emit a sample only for Node', () => {
    expect(resolveSampleCall('python', 'get', '/v1/messages/pinned/{chat_id}')).toBeNull();
    expect(resolveSampleCall('php', 'get', '/v1/messages/pinned/{chat_id}')).toBeNull();
    expect(resolveSampleCall('node', 'get', '/v1/messages/pinned/{chat_id}')).toEqual({
      resource: 'messages', method: 'listPinned', callable: false,
    });
  });
});

describe('sdk-mapping inverse (derived from spec)', () => {
  it('resolves scheduled_messages.create back to POST /v1/scheduled-messages', () => {
    const inv = buildInverseMap(miniSpec as any);
    expect(inv.get('scheduled_messages.create')).toEqual({ verb: 'post', path: '/v1/scheduled-messages' });
  });
  it('resolves audiences.list back to GET /v1/audiences', () => {
    const inv = buildInverseMap(miniSpec as any);
    expect(inv.get('audiences.list')).toEqual({ verb: 'get', path: '/v1/audiences' });
  });
});
