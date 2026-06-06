import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  exampleForSchema,
  resolveOp,
  buildRequestExample,
  buildResponseExample,
} from '../../../lib/example-engine';

const spec = JSON.parse(readFileSync(join(__dirname, 'fixtures/mini-openapi.json'), 'utf8'));

// ---------------------------------------------------------------------------
// exampleForSchema — value synthesis
// ---------------------------------------------------------------------------

describe('exampleForSchema', () => {
  it('returns explicit example when present', () => {
    const schema = { type: 'string', example: 'hello' };
    expect(exampleForSchema(spec, schema)).toBe('hello');
  });

  it('returns first examples[] entry when no example', () => {
    const schema = { type: 'string', examples: ['first', 'second'] };
    expect(exampleForSchema(spec, schema)).toBe('first');
  });

  it('returns default when no example or examples[]', () => {
    const schema = { type: 'string', default: 'defaultVal' };
    expect(exampleForSchema(spec, schema)).toBe('defaultVal');
  });

  it('returns first enum value', () => {
    const schema = { type: 'string', enum: ['alpha', 'beta'] };
    expect(exampleForSchema(spec, schema)).toBe('alpha');
  });

  it('synthesizes email format', () => {
    const schema = { type: 'string', format: 'email' };
    expect(exampleForSchema(spec, schema)).toBe('user@example.com');
  });

  it('synthesizes date-time format', () => {
    const schema = { type: 'string', format: 'date-time' };
    expect(exampleForSchema(spec, schema)).toBe('2026-01-01T00:00:00Z');
  });

  it('synthesizes date format', () => {
    const schema = { type: 'string', format: 'date' };
    expect(exampleForSchema(spec, schema)).toBe('2026-01-01');
  });

  it('synthesizes uri format', () => {
    const schema = { type: 'string', format: 'uri' };
    expect(exampleForSchema(spec, schema)).toBe('https://example.com');
  });

  it('synthesizes uuid format', () => {
    const schema = { type: 'string', format: 'uuid' };
    expect(exampleForSchema(spec, schema)).toBe('01H7XYZ0000000000000000000');
  });

  it('synthesizes plain string (no format)', () => {
    const schema = { type: 'string' };
    expect(exampleForSchema(spec, schema)).toBe('string');
  });

  it('synthesizes integer → 0', () => {
    expect(exampleForSchema(spec, { type: 'integer' })).toBe(0);
  });

  it('synthesizes number → 0', () => {
    expect(exampleForSchema(spec, { type: 'number' })).toBe(0);
  });

  it('synthesizes boolean → false', () => {
    expect(exampleForSchema(spec, { type: 'boolean' })).toBe(false);
  });

  it('synthesizes array with item example', () => {
    const schema = { type: 'array', items: { type: 'string' } };
    expect(exampleForSchema(spec, schema)).toEqual(['string']);
  });

  it('builds object from required properties only', () => {
    // CreateAudience has required: ["name"], properties: { name: string }
    const schema = { $ref: '#/components/schemas/CreateAudience' };
    const result = exampleForSchema(spec, schema);
    expect(result).toEqual({ name: 'string' });
  });

  it('follows $ref correctly', () => {
    const schema = { $ref: '#/components/schemas/CreateAudience' };
    const result = exampleForSchema(spec, schema) as Record<string, unknown>;
    expect(result).toHaveProperty('name');
    expect(typeof result.name).toBe('string');
  });

  it('oneOf → first concrete variant (SendText: type="text")', () => {
    // SendMessageRequest is oneOf [SendText, SendPoll]
    // SendText has required: ["type","to","text"], type.enum: ["text"]
    const schema = { $ref: '#/components/schemas/SendMessageRequest' };
    const result = exampleForSchema(spec, schema) as Record<string, unknown>;
    // Should resolve to first variant (SendText)
    expect(result).toHaveProperty('type', 'text');
    expect(result).toHaveProperty('to', 'string');
    expect(result).toHaveProperty('text', 'string');
  });

  it('depth backstop returns null beyond depth 12', () => {
    const schema = { type: 'string', example: 'x' };
    // Call with depth 13 — should return null
    expect(exampleForSchema(spec, schema, 13)).toBeNull();
  });

  it('allOf merges properties from all parts', () => {
    const schema = {
      allOf: [
        { type: 'object', required: ['a'], properties: { a: { type: 'string' } } },
        { type: 'object', required: ['b'], properties: { b: { type: 'integer' } } },
      ],
    };
    const result = exampleForSchema(spec, schema) as Record<string, unknown>;
    expect(result).toMatchObject({ a: 'string', b: 0 });
  });

  it('does not throw or hang on a self-referential $ref (cycle guard)', () => {
    const cyclicSpec = {
      paths: {},
      components: {
        schemas: {
          Node: {
            type: 'object',
            required: ['child'],
            properties: { child: { $ref: '#/components/schemas/Node' } },
          },
        },
      },
    } as any;
    // Should terminate (cycle guard in deref + depth backstop) and not throw.
    expect(() =>
      exampleForSchema(cyclicSpec, { $ref: '#/components/schemas/Node' }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// resolveOp
// ---------------------------------------------------------------------------

describe('resolveOp', () => {
  it('resolves POST /v1/scheduled-messages', () => {
    const result = resolveOp(spec, 'POST /v1/scheduled-messages');
    expect(result).not.toBeNull();
    expect(result?.verb).toBe('post');
    expect(result?.path).toBe('/v1/scheduled-messages');
    expect(result?.op).toBeDefined();
  });

  it('resolves GET /v1/things/{id}', () => {
    const result = resolveOp(spec, 'GET /v1/things/{id}');
    expect(result).not.toBeNull();
    expect(result?.verb).toBe('get');
    expect(result?.path).toBe('/v1/things/{id}');
  });

  it('is case-insensitive for the verb', () => {
    const result = resolveOp(spec, 'post /v1/audiences');
    expect(result).not.toBeNull();
    expect(result?.verb).toBe('post');
  });

  it('returns null for unknown path', () => {
    expect(resolveOp(spec, 'GET /v1/nonexistent')).toBeNull();
  });

  it('returns null for malformed opKey', () => {
    expect(resolveOp(spec, 'not valid')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(resolveOp(spec, '')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildRequestExample
// ---------------------------------------------------------------------------

describe('buildRequestExample', () => {
  it('returns null for unknown operation', () => {
    expect(buildRequestExample(spec, 'GET /v1/nonexistent')).toBeNull();
  });

  it('includes Authorization header', () => {
    const result = buildRequestExample(spec, 'POST /v1/audiences');
    expect(result?.headers['Authorization']).toBe('Bearer BLUETICKS_API_KEY');
  });

  it('sets method to uppercase verb', () => {
    const result = buildRequestExample(spec, 'POST /v1/audiences');
    expect(result?.method).toBe('POST');
  });

  it('includes server base URL', () => {
    const result = buildRequestExample(spec, 'POST /v1/audiences');
    expect(result?.url).toContain('https://api.blueticks.co');
  });

  it('substitutes path params', () => {
    const result = buildRequestExample(spec, 'GET /v1/things/{id}');
    expect(result?.url).not.toContain('{id}');
    expect(result?.url).toContain('https://api.blueticks.co/v1/things/');
  });

  it('substitutes multiple path params', () => {
    const result = buildRequestExample(spec, 'POST /v1/chats/{chat_id}/messages/{key}/reactions');
    expect(result?.url).not.toContain('{chat_id}');
    expect(result?.url).not.toContain('{key}');
  });

  it('includes JSON body for POST with requestBody', () => {
    const result = buildRequestExample(spec, 'POST /v1/audiences');
    // CreateAudience requires "name"
    expect(result?.body).toMatchObject({ name: 'string' });
  });

  it('body is null for operation without requestBody', () => {
    const result = buildRequestExample(spec, 'GET /v1/things/{id}');
    expect(result?.body).toBeNull();
  });

  it('perLang.curl contains "curl"', () => {
    const result = buildRequestExample(spec, 'POST /v1/audiences');
    expect(result?.perLang.curl).toContain('curl');
  });

  it('perLang.curl contains the method', () => {
    const result = buildRequestExample(spec, 'POST /v1/audiences');
    expect(result?.perLang.curl).toContain('POST');
  });

  it('perLang.curl contains the URL', () => {
    const result = buildRequestExample(spec, 'POST /v1/audiences');
    expect(result?.perLang.curl).toContain('https://api.blueticks.co/v1/audiences');
  });

  it('perLang.json contains body JSON when body present', () => {
    const result = buildRequestExample(spec, 'POST /v1/audiences');
    expect(result?.perLang.json).toBeDefined();
    expect(result?.perLang.json).toContain('{');
  });

  it('perLang.json is undefined when no body', () => {
    const result = buildRequestExample(spec, 'GET /v1/things/{id}');
    expect(result?.perLang.json).toBeUndefined();
  });

  it('POST /v1/scheduled-messages resolves oneOf to SendText body', () => {
    const result = buildRequestExample(spec, 'POST /v1/scheduled-messages');
    // SendMessageRequest is oneOf[SendText, SendPoll] → first = SendText
    const body = result?.body as Record<string, unknown>;
    expect(body).toHaveProperty('type', 'text');
    expect(body).toHaveProperty('to');
    expect(body).toHaveProperty('text');
  });
});

// ---------------------------------------------------------------------------
// buildResponseExample
// ---------------------------------------------------------------------------

describe('buildResponseExample', () => {
  it('returns null for unknown operation', () => {
    expect(buildResponseExample(spec, 'GET /v1/nonexistent')).toBeNull();
  });

  it('returns null when operation has no responses', () => {
    // /v1/things/{id}/rotate POST has no responses defined in the fixture
    const result = buildResponseExample(spec, 'POST /v1/things/{id}/rotate');
    expect(result).toBeNull();
  });

  it('perLang.json contains "{"', () => {
    // For operations with no 2xx response schema, body defaults to {}
    // We test with an operation that does have responses if available,
    // but since the fixture has no responses on most paths, we still check the contract.
    // Use a schema-less fallback: body = {} → JSON is "{}"
    const op = 'POST /v1/audiences';
    // The fixture has no responses block on audiences, so we cannot test 2xx body.
    // Instead, inject a minimal spec variant to test the actual response path.
    const miniSpec = {
      paths: {
        '/v1/test': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
                  },
                },
              },
            },
          },
        },
      },
    } as any;
    const result = buildResponseExample(miniSpec, 'GET /v1/test');
    expect(result).not.toBeNull();
    expect(result?.status).toBe('200');
    expect(result?.perLang.json).toContain('{');
    expect(result?.body).toMatchObject({ id: 'string' });
  });

  it('uses first 2xx response by default', () => {
    const miniSpec = {
      paths: {
        '/v1/foo': {
          post: {
            responses: {
              '400': { description: 'Bad request' },
              '201': { content: { 'application/json': { schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } } } } },
            },
          },
        },
      },
    } as any;
    const result = buildResponseExample(miniSpec, 'POST /v1/foo');
    expect(result?.status).toBe('201');
    expect(result?.body).toMatchObject({ ok: false });
  });

  it('uses specified status code when provided', () => {
    const miniSpec = {
      paths: {
        '/v1/bar': {
          get: {
            responses: {
              '200': { content: { 'application/json': { schema: { type: 'object', required: ['a'], properties: { a: { type: 'string' } } } } } },
              '404': { content: { 'application/json': { schema: { type: 'object', required: ['error'], properties: { error: { type: 'string' } } } } } },
            },
          },
        },
      },
    } as any;
    const result = buildResponseExample(miniSpec, 'GET /v1/bar', '404');
    expect(result?.status).toBe('404');
    expect(result?.body).toMatchObject({ error: 'string' });
  });

  it('body defaults to {} when no application/json schema', () => {
    const miniSpec = {
      paths: {
        '/v1/baz': {
          delete: {
            responses: {
              '204': { description: 'No content' },
            },
          },
        },
      },
    } as any;
    const result = buildResponseExample(miniSpec, 'DELETE /v1/baz');
    expect(result?.status).toBe('204');
    expect(result?.body).toEqual({});
    expect(result?.perLang.json).toBe('{}');
  });
});
