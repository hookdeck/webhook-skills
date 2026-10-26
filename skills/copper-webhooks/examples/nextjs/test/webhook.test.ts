import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/copper/route';
import { verifyCopperRequest } from '../lib/verify-copper';

const SECRET = 'test_copper_secret_0123456789';
const HEADER = 'X-Webhook-Secret';

const TYPES = ['lead', 'person', 'company', 'opportunity', 'project', 'task', 'activity_log'];
const EVENTS = ['new', 'update', 'delete'];

beforeAll(() => {
  process.env.COPPER_WEBHOOK_HEADER = HEADER;
  process.env.COPPER_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  process.env.COPPER_WEBHOOK_HEADER = HEADER;
  process.env.COPPER_WEBHOOK_SECRET = SECRET;
  vi.restoreAllMocks();
});

function samplePayload(type = 'person', event = 'update') {
  return {
    ids: [12345, 12346],
    type,
    event,
    subscription_id: 987,
    updated_attributes: { title: ['Engineer', 'Senior Engineer'] },
    timestamp: '2021-12-13T19:18:22.084Z',
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/copper', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/copper', () => {
  describe('secret header verification', () => {
    it('accepts the correct secret', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'x-webhook-secret': SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('does not accept the secret from the JSON body', async () => {
      const body = JSON.stringify({ ...samplePayload(), secret: SECRET });
      const res = await POST(makeRequest({}, body));
      expect(res.status).toBe(401);
    });

    it('compares the whole value, including a Bearer prefix', async () => {
      process.env.COPPER_WEBHOOK_SECRET = `Bearer ${SECRET}`;
      expect((await POST(makeRequest({ [HEADER]: `Bearer ${SECRET}` }))).status).toBe(200);
      expect((await POST(makeRequest({ [HEADER]: SECRET }))).status).toBe(401);
    });

    it('reads the header name from COPPER_WEBHOOK_HEADER', async () => {
      process.env.COPPER_WEBHOOK_HEADER = 'Authorization';
      expect((await POST(makeRequest({ Authorization: SECRET }))).status).toBe(200);
      expect((await POST(makeRequest({ [HEADER]: SECRET }))).status).toBe(401);
    });

    it('rejects everything when COPPER_WEBHOOK_SECRET is unset', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyCopperRequest(headers, '')).toBe(false);
      delete process.env.COPPER_WEBHOOK_SECRET;
      expect(verifyCopperRequest(headers)).toBe(false);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a body without ids, type and event', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '{"foo":1}'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    const combos = TYPES.flatMap((t) => EVENTS.map((e) => [t, e]));

    it.each(combos)('handles %s.%s', async (type, event) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(type, event))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
    });

    it('acknowledges unknown types', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('widget', 'new'))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
    });
  });
});
