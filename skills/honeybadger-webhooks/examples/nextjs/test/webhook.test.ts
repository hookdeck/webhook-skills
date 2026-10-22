import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/honeybadger/route';
import { verifyHoneybadgerRequest } from '../lib/verify-honeybadger';

const TOKEN = 'test_honeybadger_token_0123456789';

const EVENTS = [
  'occurred', 'resolved', 'unresolved', 'assigned', 'commented', 'rate_exceeded',
  'volume_spike', 'deployed', 'down', 'up', 'cert_will_expire', 'check_in_missing',
  'check_in_reporting',
];

beforeAll(() => {
  process.env.HONEYBADGER_TOKEN = TOKEN;
});

function samplePayload(event = 'occurred') {
  return {
    event,
    message: '[Crywolf/test] RuntimeError - oops',
    fault: { id: 3151009, project_id: 1717, klass: 'RuntimeError', environment: 'development' },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/honeybadger', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/honeybadger', () => {
  describe('Honeybadger-Token verification', () => {
    it('accepts the correct token', async () => {
      const res = await POST(makeRequest({ 'Honeybadger-Token': TOKEN }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'honeybadger-token': TOKEN }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await POST(makeRequest({ 'Honeybadger-Token': 'x'.repeat(TOKEN.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await POST(makeRequest({ 'Honeybadger-Token': 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing token', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('does not accept the token as an Authorization bearer', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer ${TOKEN}` }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when no token is configured', () => {
      const headers = new Headers({ 'honeybadger-token': TOKEN });
      expect(verifyHoneybadgerRequest(headers, '')).toBe(false);
      expect(verifyHoneybadgerRequest(headers, TOKEN)).toBe(true);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/honeybadger', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', 'honeybadger-token': TOKEN },
        body: JSON.stringify(samplePayload()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ 'Honeybadger-Token': TOKEN }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ 'Honeybadger-Token': TOKEN }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a token', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ 'Honeybadger-Token': TOKEN }, JSON.stringify(samplePayload(event)))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ 'Honeybadger-Token': TOKEN }, JSON.stringify(samplePayload('something_new')))
      );
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
