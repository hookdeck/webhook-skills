import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/cloudentity/route';
import { verifyCloudentityRequest } from '../lib/verify-cloudentity';

const KEY = 'test_cloudentity_api_key_0123456789';

const EVENTS = [
  'user.created', 'user.updated', 'user.deleted', 'user.authenticated',
  'group.created', 'login.failed', 'consent.revoked', 'client.created',
];

beforeAll(() => {
  process.env.CLOUDENTITY_WEBHOOK_API_KEY = KEY;
});

// Inferred shape: the event's subject_action name is the one key of `payload`.
function batch(...types: string[]) {
  return {
    audit_events: types.map((type, i) => ({
      tenant_id: 'example',
      server_id: 'demo',
      event_id: `evt_${i}`,
      payload: { [type.replace(/\./g, '_')]: {} },
    })),
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(batch('user.created')),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/cloudentity', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

function unhandledLogged(spy: ReturnType<typeof vi.spyOn>): boolean {
  return spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'));
}

describe('POST /webhooks/cloudentity', () => {
  describe('X-API-Key verification', () => {
    it('accepts the correct key', async () => {
      const res = await POST(makeRequest({ 'X-API-Key': KEY }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'x-api-key': KEY }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong key of the same length', async () => {
      const res = await POST(makeRequest({ 'X-API-Key': 'x'.repeat(KEY.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a key of a different length without throwing', async () => {
      const res = await POST(makeRequest({ 'X-API-Key': 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a key with extra characters (whole value is compared)', async () => {
      const res = await POST(makeRequest({ 'X-API-Key': `x${KEY}` }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing key', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('does not accept the key in the Authorization header', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer ${KEY}` }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when CLOUDENTITY_WEBHOOK_API_KEY is unset', () => {
      const headers = new Headers({ 'x-api-key': KEY });
      expect(verifyCloudentityRequest(headers, '')).toBe(false);
      delete process.env.CLOUDENTITY_WEBHOOK_API_KEY;
      expect(verifyCloudentityRequest(headers)).toBe(false);
      process.env.CLOUDENTITY_WEBHOOK_API_KEY = KEY;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest({ 'X-API-Key': KEY }, JSON.stringify(batch('user.created')), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ 'X-API-Key': KEY }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 when audit_events is missing', async () => {
      const res = await POST(makeRequest({ 'X-API-Key': KEY }, '{"hello":"world"}'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a key', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (type) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ 'X-API-Key': KEY }, JSON.stringify(batch(type))));
      expect(res.status).toBe(200);
      expect(unhandledLogged(spy)).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges an event whose payload has no recognisable key', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const body = { audit_events: [{ tenant_id: 'example', server_id: 'demo', event_id: 'evt_0' }] };
      const res = await POST(makeRequest({ 'X-API-Key': KEY }, JSON.stringify(body)));
      expect(res.status).toBe(200);
      expect(unhandledLogged(spy)).toBe(true);
      spy.mockRestore();
    });

    it('handles a batch of several events', async () => {
      const res = await POST(
        makeRequest({ 'X-API-Key': KEY }, JSON.stringify(batch('user.created', 'user.authenticated', 'group.created')))
      );
      expect(res.status).toBe(200);
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ 'X-API-Key': KEY }, JSON.stringify(batch('something.new'))));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
