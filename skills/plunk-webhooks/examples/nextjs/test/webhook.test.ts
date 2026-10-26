import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/plunk/route';
import { classifyEvent, verifyPlunkRequest } from '../lib/verify-plunk';

const SECRET = 'Bearer test_plunk_secret_0123456789';

beforeAll(() => {
  process.env.PLUNK_WEBHOOK_HEADER = 'Authorization';
  process.env.PLUNK_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Default body shape from the Plunk docs: { contact, workflow, execution, event }
function defaultBody(event: Record<string, unknown> = { bounceType: 'Permanent', bouncedAt: '2025-01-15T10:30:00.000Z' }) {
  return {
    contact: { email: 'user@example.com', subscribed: true, data: { name: 'John' } },
    workflow: { id: 'wf_abc123', name: 'Bounce Notifications' },
    execution: { id: 'exec_xyz789', startedAt: '2025-01-15T10:30:00.000Z' },
    event: { subject: 'Welcome to Plunk', emailId: 'ac32f08e-c6b9-45d3-9824-a73dff1e3bbf', ...event },
  };
}

function makeRequest(
  method: string,
  headers: Record<string, string> = {},
  body?: string
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/plunk', {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    body,
  });
}

const handlers: Record<string, (req: NextRequest) => Promise<Response>> = { GET, POST, PUT, PATCH, DELETE };
const METHODS = Object.keys(handlers);

describe('/webhooks/plunk', () => {
  describe('secret header verification', () => {
    const send = (headers: Record<string, string> = {}, body = JSON.stringify(defaultBody())) =>
      POST(makeRequest('POST', headers, body));

    it('accepts the exact whole header value', async () => {
      const res = await send({ Authorization: SECRET });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      expect((await send({ authorization: SECRET })).status).toBe(200);
    });

    it('does not strip the Bearer prefix', async () => {
      expect((await send({ Authorization: 'test_plunk_secret_0123456789' })).status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      expect((await send({ Authorization: 'x'.repeat(SECRET.length) })).status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      expect((await send({ Authorization: 'short' })).status).toBe(401);
    });

    it('rejects a missing header', async () => {
      expect((await send()).status).toBe(401);
    });

    it('does not accept the secret in another header', async () => {
      expect((await send({ 'X-Plunk-Secret': SECRET })).status).toBe(401);
    });

    it('checks the credential before parsing the body', async () => {
      expect((await send({}, '{not json')).status).toBe(401);
    });
  });

  describe('verifyPlunkRequest', () => {
    it('reads a custom header name', () => {
      const h = new Headers({ 'X-Plunk-Secret': 's3cret' });
      expect(verifyPlunkRequest(h, 's3cret', 'x-plunk-secret')).toBe(true);
      expect(verifyPlunkRequest(new Headers({ Authorization: 's3cret' }), 's3cret', 'X-Plunk-Secret')).toBe(false);
    });

    it('defaults to Authorization', () => {
      expect(verifyPlunkRequest(new Headers({ Authorization: 's3cret' }), 's3cret')).toBe(true);
    });

    it('fails closed when no secret is configured', () => {
      const h = new Headers({ Authorization: 'anything' });
      expect(verifyPlunkRequest(h, '')).toBe(false);
      expect(verifyPlunkRequest(h, undefined)).toBe(false);
    });
  });

  describe('methods', () => {
    it.each(METHODS)('accepts %s with a valid secret and an empty body', async (method) => {
      const res = await handlers[method](makeRequest(method, { Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it.each(METHODS)('rejects %s without the secret', async (method) => {
      const res = await handlers[method](makeRequest(method));
      expect(res.status).toBe(401);
    });

    it.each(['PUT', 'PATCH', 'DELETE'])('accepts %s with a JSON body', async (method) => {
      const res = await handlers[method](
        makeRequest(method, { Authorization: SECRET }, JSON.stringify(defaultBody()))
      );
      expect(res.status).toBe(200);
    });
  });

  describe('bodies', () => {
    const send = (body: string, headers: Record<string, string> = { Authorization: SECRET }) =>
      POST(makeRequest('POST', headers, body));

    it.each([
      ['bounce', { bounceType: 'Permanent', bouncedAt: '2025-01-15T10:30:00.000Z' }],
      ['complaint', { complainedAt: '2025-01-15T10:30:00.000Z' }],
      ['click', { link: 'https://example.com', clickedAt: '2025-01-15T11:05:00.000Z' }],
      ['open', { openedAt: '2025-01-15T11:00:00.000Z', opens: 1 }],
      ['delivery', { deliveredAt: '2025-01-15T10:30:05.000Z' }],
      ['sent', { sentAt: '2025-01-15T10:30:00.000Z' }],
      ['segment', { segmentId: 'seg_abc123', segmentName: 'VIP Users' }],
      ['contact event with no data', {}],
    ])('handles the default body for %s', async (_name, event) => {
      expect((await send(JSON.stringify(defaultBody(event)))).status).toBe(200);
    });

    it('handles a custom body as plain JSON', async () => {
      const res = await send(JSON.stringify({ email: 'user@example.com', plan: 'pro' }));
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest('POST', { Authorization: SECRET, 'content-type': 'text/plain' }, JSON.stringify(defaultBody()))
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      expect((await send('{not json')).status).toBe(400);
    });
  });

  describe('classifyEvent', () => {
    it('infers the kind from documented event fields', () => {
      expect(classifyEvent({ bounceType: 'Permanent' })).toBe('email.bounce');
      expect(classifyEvent({ complainedAt: 'x' })).toBe('email.complaint');
      expect(classifyEvent({ segmentId: 'seg_1' })).toBe('segment');
      expect(classifyEvent({})).toBeNull();
      expect(classifyEvent(undefined)).toBeNull();
    });
  });
});
