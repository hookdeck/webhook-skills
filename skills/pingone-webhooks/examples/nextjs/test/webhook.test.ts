import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/pingone/route';
import { parseEvents, verifyPingOneRequest } from '../lib/verify-pingone';

const SECRET = 'Bearer test_pingone_header_value_0123456789';

beforeAll(() => {
  process.env.PINGONE_WEBHOOK_SECRET = SECRET;
  process.env.PINGONE_WEBHOOK_HEADER = 'Authorization';
});

// Shape of a PingOne ACTIVITY audit event
function sampleEvent(type = 'USER.CREATED', id = 'evt-1') {
  return {
    id,
    createdAt: '2026-10-25T10:00:00.000Z',
    action: { type, description: type },
    actors: { user: { id: 'u-1', name: 'jane' } },
    resources: [{ id: 'r-1', type: 'USER' }],
  };
}

const jsonArray = (...types: string[]) =>
  JSON.stringify(types.map((t, i) => sampleEvent(t, `evt-${i}`)));
const ndjson = (...types: string[]) =>
  types.map((t, i) => JSON.stringify(sampleEvent(t, `evt-${i}`))).join('\n') + '\n';

function makeRequest(
  headers: Record<string, string> = {},
  body: string = jsonArray('USER.CREATED'),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/pingone', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/pingone', () => {
  describe('Credential check', () => {
    it('accepts the exact header value', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: 1 });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value: the bare token without "Bearer " is rejected', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ Authorization: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ Authorization: 'short' }));
      expect(res.status).toBe(401);
    });

    it('returns 401 when the header is missing', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('authenticates before parsing: bad credentials plus bad body is 401, not 400', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Body formats', () => {
    it('handles a JSON_ARRAY batch', async () => {
      const body = jsonArray('USER.CREATED', 'USER.UPDATED', 'AUTHENTICATION.CREATED');
      const res = await POST(makeRequest({ Authorization: SECRET }, body));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: 3 });
    });

    it('handles ND_JSON, one event per line', async () => {
      const res = await POST(
        makeRequest({ Authorization: SECRET }, ndjson('USER.CREATED', 'USER.UPDATED'), 'application/x-ndjson')
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: 2 });
    });

    it('reads the body whatever the content type is', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, jsonArray('USER.CREATED'), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('handles every example event and unknown events', async () => {
      const types = ['USER.CREATED', 'USER.UPDATED', 'USER.DELETED', 'AUTHENTICATION.CREATED', 'PASSWORD.RESET', 'SOMETHING.ELSE'];
      const res = await POST(makeRequest({ Authorization: SECRET }, jsonArray(...types)));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: types.length });
    });

    it('returns 400 for an invalid body', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 when the array holds non-objects', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '[1,2,3]'));
      expect(res.status).toBe(400);
    });
  });
});

describe('verifyPingOneRequest', () => {
  it('rejects everything when no secret is configured', () => {
    expect(verifyPingOneRequest(new Headers({ authorization: '' }), {})).toBe(false);
    expect(verifyPingOneRequest(new Headers({ authorization: 'anything' }), {})).toBe(false);
  });

  it('uses a custom header name', () => {
    const config = { PINGONE_WEBHOOK_SECRET: 's3cret', PINGONE_WEBHOOK_HEADER: 'X-PingOne-Token' };
    expect(verifyPingOneRequest(new Headers({ 'x-pingone-token': 's3cret' }), config)).toBe(true);
    expect(verifyPingOneRequest(new Headers({ authorization: 's3cret' }), config)).toBe(false);
  });

  it('does not parse Basic values: the whole header must match', () => {
    const config = { PINGONE_WEBHOOK_SECRET: 'Basic username:password' };
    expect(verifyPingOneRequest(new Headers({ authorization: 'Basic username:password' }), config)).toBe(true);
    expect(verifyPingOneRequest(new Headers({ authorization: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=' }), config)).toBe(false);
  });
});

describe('parseEvents', () => {
  it('parses a pretty-printed JSON array', () => {
    expect(parseEvents(JSON.stringify([sampleEvent()], null, 2))).toHaveLength(1);
  });

  it('rejects an empty body', () => {
    expect(() => parseEvents('  ')).toThrow();
  });
});
