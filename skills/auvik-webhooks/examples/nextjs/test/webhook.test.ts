import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/auvik/route';
import { verifyAuvikRequest } from '../lib/verify-auvik';

const HEADER = 'X-Auvik-Key';
const SECRET = 'Bearer test_auvik_secret_0123456789';

beforeAll(() => {
  process.env.AUVIK_WEBHOOK_HEADER = HEADER;
  process.env.AUVIK_WEBHOOK_SECRET = SECRET;
});

function samplePayload(statusString = 'Triggered') {
  return {
    alertId: '1234',
    alertName: 'Device offline',
    alertStatus: statusString === 'Triggered' ? 0 : 1,
    alertStatusString: statusString,
    alertDescription: 'Switch is unreachable',
    entityName: 'core-switch-01',
    companyName: 'Acme MSP',
    date: '2026-10-25T10:00:00.000Z',
    link: 'https://example.auvik.com/alert/1234',
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/auvik', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/auvik', () => {
  describe('header authentication', () => {
    it('accepts the exact header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value: a stripped Bearer prefix is rejected', async () => {
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

    it('rejects the secret sent under a different header', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('authenticates before parsing: bad credential with bad JSON is 401', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'nope' }, 'not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it.each(['Triggered', 'Cleared'])('handles %s alerts', async (status) => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(status))));
      expect(res.status).toBe(200);
    });

    it('accepts an unknown status without failing', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('Other'))));
      expect(res.status).toBe(200);
    });

    it('accepts JSON sent with any content type', async () => {
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, 'not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });
  });

  describe('verifyAuvikRequest', () => {
    it('defaults the header name to Authorization', () => {
      const old = process.env.AUVIK_WEBHOOK_HEADER;
      delete process.env.AUVIK_WEBHOOK_HEADER;
      try {
        const headers = new Headers({ authorization: SECRET });
        expect(verifyAuvikRequest(headers, undefined, SECRET)).toBe(true);
      } finally {
        process.env.AUVIK_WEBHOOK_HEADER = old;
      }
    });

    it('fails closed when no secret is configured', () => {
      expect(verifyAuvikRequest(new Headers({ [HEADER]: '' }), HEADER, '')).toBe(false);
      expect(verifyAuvikRequest(new Headers({ [HEADER]: 'a' }), HEADER, undefined)).toBe(false);
    });
  });
});
