import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT } from '../app/webhooks/sigfox/route';
import { classifyCallback, verifySigfoxRequest } from '../lib/verify-sigfox';

const SECRET = 'Bearer sigfox_test_secret_0123456789';

const UPLINK = {
  device: '1A2B3C', deviceTypeId: '5f3c8a1b', time: 1700000000, data: '0102030405', seqNumber: 42,
};

const CALLBACKS: Record<string, Record<string, unknown>> = {
  'data uplink': UPLINK,
  'data bidir': { ...UPLINK, longPolling: false, ack: true },
  'data advanced': { ...UPLINK, lqi: 'GOOD', linkQuality: 2 },
  'service status': { device: '1A2B3C', time: 1700000000, batt: 2.9, temp: 21.5 },
  'service acknowledge': { device: '1A2B3C', time: 1700000000, infoCode: 0, downlinkAck: true },
  'service repeater': { device: '1A2B3C', time: 1700000000, batt: 3.1, repeatedMsg: 12 },
  error: { device: '1A2B3C', time: 1700000000, info: 'last message 2h ago', severity: 'ERROR' },
};

beforeAll(() => {
  process.env.SIGFOX_WEBHOOK_SECRET = SECRET;
  delete process.env.SIGFOX_WEBHOOK_HEADER; // default: Authorization
});

afterEach(() => {
  delete process.env.SIGFOX_WEBHOOK_HEADER;
  process.env.SIGFOX_WEBHOOK_SECRET = SECRET;
});

function makeRequest(
  method: string,
  headers: Record<string, string> = {},
  body?: string,
  contentType = 'application/json',
  path = '/webhooks/sigfox'
): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: body === undefined ? headers : { 'content-type': contentType, ...headers },
    body,
  });
}

const json = (obj: unknown) => JSON.stringify(obj);

describe('/webhooks/sigfox', () => {
  describe('credential header verification', () => {
    it('accepts the correct Authorization value', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }, json(UPLINK)));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, type: 'data uplink' });
    });

    it('looks the header up case-insensitively', async () => {
      const res = await POST(makeRequest('POST', { authorization: SECRET }, json(UPLINK)));
      expect(res.status).toBe(200);
    });

    it('compares the whole value, not a stripped Bearer token', async () => {
      const res = await POST(
        makeRequest('POST', { Authorization: SECRET.replace('Bearer ', '') }, json(UPLINK))
      );
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(
        makeRequest('POST', { Authorization: 'x'.repeat(SECRET.length) }, json(UPLINK))
      );
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest('POST', { Authorization: 'short' }, json(UPLINK)));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest('POST', {}, json(UPLINK)));
      expect(res.status).toBe(401);
    });

    it('does not throw on non-ASCII header values', async () => {
      const res = await POST(makeRequest('POST', { Authorization: 'café-secret' }, json(UPLINK)));
      expect(res.status).toBe(401);
    });

    it('uses SIGFOX_WEBHOOK_HEADER as the header name', async () => {
      process.env.SIGFOX_WEBHOOK_HEADER = 'X-Sigfox-Token';
      expect((await POST(makeRequest('POST', { 'X-Sigfox-Token': SECRET }, json(UPLINK)))).status).toBe(200);
      expect((await POST(makeRequest('POST', { Authorization: SECRET }, json(UPLINK)))).status).toBe(401);
    });

    it('rejects everything when SIGFOX_WEBHOOK_SECRET is unset', () => {
      const headers = new Headers({ authorization: SECRET });
      expect(verifySigfoxRequest(headers, '')).toBe(false);
      delete process.env.SIGFOX_WEBHOOK_SECRET;
      expect(verifySigfoxRequest(headers)).toBe(false);
    });
  });

  describe('methods and bodies', () => {
    it('handles GET with variables in the query string and no body', async () => {
      const res = await GET(
        makeRequest('GET', { Authorization: SECRET }, undefined, undefined,
          '/webhooks/sigfox?device=1A2B3C&data=0102030405&time=1700000000')
      );
      expect(res.status).toBe(200);
      expect((await res.json()).type).toBe('data uplink');
    });

    it('rejects GET without the credential', async () => {
      const res = await GET(makeRequest('GET', {}, undefined, undefined, '/webhooks/sigfox?device=1A2B3C&data=01'));
      expect(res.status).toBe(401);
    });

    it('handles PUT with a JSON body', async () => {
      const res = await PUT(makeRequest('PUT', { Authorization: SECRET }, json(UPLINK)));
      expect(res.status).toBe(200);
    });

    it('handles a form-encoded POST body', async () => {
      const res = await POST(
        makeRequest('POST', { Authorization: SECRET }, 'device=1A2B3C&data=0102030405&time=1700000000',
          'application/x-www-form-urlencoded')
      );
      expect(res.status).toBe(200);
      expect((await res.json()).type).toBe('data uplink');
    });

    it('accepts any content type (raw body)', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }, json(UPLINK), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('handles an empty POST body', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect((await res.json()).type).toBe('unknown');
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the credential', async () => {
      const res = await POST(makeRequest('POST', {}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('callback types', () => {
    Object.entries(CALLBACKS).forEach(([type, payload]) => {
      it(`handles ${type}`, async () => {
        expect(classifyCallback(payload)).toBe(type);
        const res = await POST(makeRequest('POST', { Authorization: SECRET }, json(payload)));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ received: true, type });
      });
    });
  });
});
