import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/demodesk/route';
import { verifyDemodeskRequest } from '../lib/verify-demodesk';

const HEADER = 'X-Demodesk-Secret';
const SECRET = 'Bearer test_demodesk_secret_0123456789';

const EVENTS = [
  'demo.scheduled', 'demo.rescheduled', 'demo.event_response_updated', 'demo.handovered',
  'demo.canceled', 'demo.started', 'demo.call_note_updated', 'demo.ended',
  'recording.uploaded', 'recording.transcription_postprocessed',
];

beforeAll(() => {
  process.env.DEMODESK_WEBHOOK_HEADER = HEADER;
  process.env.DEMODESK_WEBHOOK_SECRET = SECRET;
});

function samplePayload(action = 'demo.scheduled') {
  return { meta: { event: { action } }, data: { demo: { id: 'demo_123' } } };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/demodesk', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/demodesk', () => {
  describe('custom header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toUpperCase()]: SECRET }));
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

    it('rejects everything when DEMODESK_WEBHOOK_SECRET is unset', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyDemodeskRequest(headers, HEADER, '')).toBe(false);
      delete process.env.DEMODESK_WEBHOOK_SECRET;
      expect(verifyDemodeskRequest(headers, HEADER)).toBe(false);
      process.env.DEMODESK_WEBHOOK_SECRET = SECRET;
    });

    it('defaults the header name to Authorization', () => {
      delete process.env.DEMODESK_WEBHOOK_HEADER;
      expect(verifyDemodeskRequest(new Headers({ Authorization: SECRET }))).toBe(true);
      expect(verifyDemodeskRequest(new Headers({ [HEADER]: SECRET }))).toBe(false);
      process.env.DEMODESK_WEBHOOK_HEADER = HEADER;
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

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (action) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(action))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('demo.something_new')))
      );
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
