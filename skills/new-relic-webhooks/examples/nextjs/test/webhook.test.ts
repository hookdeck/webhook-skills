import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/new-relic/route';
import { verifyNewRelicRequest } from '../lib/verify-new-relic';

const USER = 'newrelic';
const PASS = 'p@ss:word, with: colons';

const STATES = ['CREATED', 'ACTIVATED', 'CLOSED'];

beforeAll(() => {
  process.env.NEW_RELIC_WEBHOOK_USERNAME = USER;
  process.env.NEW_RELIC_WEBHOOK_PASSWORD = PASS;
});

function basic(user: string, pass: string, scheme = 'Basic'): string {
  return `${scheme} ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

// Illustrative payload from the Handlebars template in references/setup.md
function samplePayload(state = 'ACTIVATED', acknowledged = false) {
  return {
    issueId: 'a1b2c3d4-0000-4000-8000-000000000001',
    title: 'High CPU on web-1',
    state,
    acknowledged,
    priority: 'CRITICAL',
    issuePageUrl: 'https://one.newrelic.com/alerts-ai/issues/a1b2c3d4',
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/new-relic', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/new-relic', () => {
  describe('Basic authentication', () => {
    it('accepts the correct credentials', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS) }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts the scheme case-insensitively', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS, 'basic') }));
      expect(res.status).toBe(200);
    });

    it('splits on the first colon only (password contains colons)', () => {
      const headers = new Headers({ authorization: basic(USER, PASS) });
      expect(verifyNewRelicRequest(headers)).toBe(true);
    });

    it('handles non-ASCII credentials', () => {
      const headers = new Headers({ authorization: basic('üser', 'pässwörd:✓') });
      expect(verifyNewRelicRequest(headers, 'üser', 'pässwörd:✓')).toBe(true);
      expect(verifyNewRelicRequest(headers, 'user', 'password')).toBe(false);
    });

    it('rejects a wrong password', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, 'x'.repeat(PASS.length)) }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await POST(makeRequest({ Authorization: basic('nobody', PASS) }));
      expect(res.status).toBe(401);
    });

    it('rejects a different-length password without throwing', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, 'short') }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects the Bearer scheme', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer ${PASS}` }));
      expect(res.status).toBe(401);
    });

    it('rejects credentials with no colon', async () => {
      const res = await POST(
        makeRequest({ Authorization: `Basic ${Buffer.from('nocolon').toString('base64')}` })
      );
      expect(res.status).toBe(401);
    });

    it('rejects a malformed header', async () => {
      expect((await POST(makeRequest({ Authorization: 'Basic' }))).status).toBe(401);
      expect((await POST(makeRequest({ Authorization: '!!!' }))).status).toBe(401);
    });

    it('rejects everything when credentials are unconfigured', () => {
      const headers = new Headers({ authorization: basic(USER, PASS) });
      expect(verifyNewRelicRequest(headers, '', PASS)).toBe(false);
      expect(verifyNewRelicRequest(headers, USER, '')).toBe(false);
      expect(verifyNewRelicRequest(headers, USER, PASS)).toBe(true);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/new-relic', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', Authorization: basic(USER, PASS) },
        body: JSON.stringify(samplePayload()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS) }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS) }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without credentials', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Issue state handling', () => {
    it.each(STATES)('handles %s', async (state) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ Authorization: basic(USER, PASS) }, JSON.stringify(samplePayload(state)))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('handles an acknowledged issue via the acknowledged boolean', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ Authorization: basic(USER, PASS) }, JSON.stringify(samplePayload('ACTIVATED', true)))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Issue acknowledged'))).toBe(true);
      spy.mockRestore();
    });

    it('acknowledges unknown states', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ Authorization: basic(USER, PASS) }, JSON.stringify(samplePayload('SOMETHING_NEW')))
      );
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
