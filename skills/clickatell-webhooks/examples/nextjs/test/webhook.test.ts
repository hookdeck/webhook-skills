import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/clickatell/route';
import { verifyClickatellRequest } from '../lib/verify-clickatell';

const HEADER = 'X-Webhook-Secret';
const SECRET = 'Bearer test_clickatell_secret_0123456789';

const EVENTS = [
  'messageStatusUpdate', 'messageFallback', 'statusIsTyping', 'moText', 'moMedia',
  'moLocation', 'moContacts', 'moSuggestedResponse', 'moListPickerResponse', 'moButtonResponse',
];

beforeAll(() => {
  process.env.CLICKATELL_WEBHOOK_HEADER = HEADER;
  process.env.CLICKATELL_WEBHOOK_SECRET = SECRET;
});

function samplePayload(kind = 'messageStatusUpdate') {
  return {
    integrationId: 'fa8090815f05d5ed015f0b5b56080cd2',
    integrationName: 'My integration',
    event: {
      [kind]: [{
        channel: 'whatsapp',
        timestamp: 1506607698860,
        statusCode: 5,
        status: 'DEVICE_ACK',
        messageId: '3a89680503414383af44dcd0e4e5f184',
        from: '2799900001',
        content: 'hello',
      }],
    },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/clickatell', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/clickatell', () => {
  describe('Custom Security Header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent under a different header name', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('defaults the header name to Authorization', () => {
      const headers = new Headers({ authorization: 'Bearer abc' });
      delete process.env.CLICKATELL_WEBHOOK_HEADER;
      expect(verifyClickatellRequest(headers, undefined, 'Bearer abc')).toBe(true);
      process.env.CLICKATELL_WEBHOOK_HEADER = HEADER;
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyClickatellRequest(headers, HEADER, '')).toBe(false);
      expect(verifyClickatellRequest(headers, HEADER, SECRET)).toBe(true);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/clickatell', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', [HEADER]: SECRET },
        body: JSON.stringify(samplePayload()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 400 when there is no event object', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '{"integrationId":"abc"}'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (kind) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(kind))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown event kinds', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('somethingNew')))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled event: somethingNew'))).toBe(true);
      spy.mockRestore();
    });
  });
});
