import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/aimfox/route';
import { verifyAimfoxRequest } from '../lib/verify-aimfox';

const SECRET = 'Bearer test_aimfox_secret_0123456789';

const EVENTS = [
  'account_logged_in', 'account_logged_out', 'new_connection', 'view', 'connect', 'accepted',
  'inmail', 'message', 'new_reply', 'reply', 'inmail_reply', 'lead_label_added',
  'campaign_created', 'campaign_started', 'campaign_ended', 'inbox_event', 'campaign_reply',
];

beforeAll(() => {
  process.env.AIMFOX_WEBHOOK_HEADER = 'Authorization';
  process.env.AIMFOX_WEBHOOK_SECRET = SECRET;
});

function samplePayload(type = 'new_connection') {
  return {
    id: 'b82dce4c-34ef-4d08-875b-bf53a7432661',
    event_type: type,
    event: { timestamp: '2024-11-24T21:08:27.966Z' },
    workspace: { id: '47973863-0513-4ee6-910a-c5bc55782ed2', name: 'Aimfox Workspace' },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/aimfox', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/aimfox', () => {
  describe('Authentication Header verification', () => {
    it('accepts the correct whole value', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }));
      expect(res.status).toBe(200);
    });

    it('does not strip a Bearer prefix', async () => {
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

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects when the credential is in a different header', async () => {
      const res = await POST(makeRequest({ 'X-Aimfox-Secret': SECRET }));
      expect(res.status).toBe(401);
    });

    it('reads a custom header name from AIMFOX_WEBHOOK_HEADER', () => {
      process.env.AIMFOX_WEBHOOK_HEADER = 'X-Aimfox-Secret';
      try {
        expect(verifyAimfoxRequest(new Headers({ 'x-aimfox-secret': SECRET }))).toBe(true);
        expect(verifyAimfoxRequest(new Headers({ authorization: SECRET }))).toBe(false);
      } finally {
        process.env.AIMFOX_WEBHOOK_HEADER = 'Authorization';
      }
    });

    it('defaults to Authorization when AIMFOX_WEBHOOK_HEADER is unset', () => {
      delete process.env.AIMFOX_WEBHOOK_HEADER;
      try {
        expect(verifyAimfoxRequest(new Headers({ authorization: SECRET }))).toBe(true);
      } finally {
        process.env.AIMFOX_WEBHOOK_HEADER = 'Authorization';
      }
    });

    it('accepts a whole Basic value', () => {
      const basic = 'Basic dXNlcjpwYXNz';
      expect(verifyAimfoxRequest(new Headers({ authorization: basic }), basic)).toBe(true);
      expect(verifyAimfoxRequest(new Headers({ authorization: 'dXNlcjpwYXNz' }), basic)).toBe(false);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ authorization: SECRET });
      expect(verifyAimfoxRequest(headers, '')).toBe(false);
      expect(verifyAimfoxRequest(headers, SECRET)).toBe(true);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/aimfox', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', authorization: SECRET },
        body: JSON.stringify(samplePayload()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (type) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload(type)))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload('something_new')))
      );
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
