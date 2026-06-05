import { describe, it, expect } from 'vitest';
import { forwardResource, forwardMethod, buildInverseMap } from '../sdk-mapping';

const miniSpec = {
  paths: {
    '/v1/scheduled-messages': { post: { summary: 'Send message' } },
    '/v1/audiences': { post: {}, get: {} },
    '/v1/audiences/{id}': { get: {} },
  },
};

describe('sdk-mapping forward', () => {
  it('maps POST /v1/scheduled-messages to scheduled_messages.send (override)', () => {
    // NOTE: forwardResource returns the first path segment with hyphens→underscores,
    // so /v1/scheduled-messages → "scheduled_messages", NOT "messages".
    // SDK_METHOD_OVERRIDES overrides only the method ("send"), not the resource.
    expect(forwardResource('/v1/scheduled-messages')).toBe('scheduled_messages');
    expect(forwardMethod('post', '/v1/scheduled-messages')).toBe('send');
  });
  it('maps POST /v1/audiences to audiences.create (convention)', () => {
    expect(forwardResource('/v1/audiences')).toBe('audiences');
    expect(forwardMethod('post', '/v1/audiences')).toBe('create');
  });
});

describe('sdk-mapping inverse (derived from spec)', () => {
  it('resolves scheduled_messages.send back to POST /v1/scheduled-messages', () => {
    const inv = buildInverseMap(miniSpec as any);
    expect(inv.get('scheduled_messages.send')).toEqual({ verb: 'post', path: '/v1/scheduled-messages' });
  });
  it('resolves audiences.list back to GET /v1/audiences', () => {
    const inv = buildInverseMap(miniSpec as any);
    expect(inv.get('audiences.list')).toEqual({ verb: 'get', path: '/v1/audiences' });
  });
});
