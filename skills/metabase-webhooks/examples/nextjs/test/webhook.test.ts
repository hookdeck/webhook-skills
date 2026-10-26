import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/metabase/route';
import { verifyMetabaseRequest } from '../lib/verify-metabase';

const USER = 'metabase-hook';
const PASS = 'p@ss:w0rd/with+chars';

beforeAll(() => {
  process.env.METABASE_WEBHOOK_USERNAME = USER;
  process.env.METABASE_WEBHOOK_PASSWORD = PASS;
});

function basic(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}
const GOOD = basic(USER, PASS);

function samplePayload(overrides: Record<string, unknown> = {}) {
  return {
    type: 'alert',
    alert_id: 12,
    alert_creator_id: 2666,
    alert_creator_name: 'Roberto Bolaño',
    data: {
      type: 'question',
      question_id: 108,
      question_name: 'Sales',
      question_url: 'https://example.com/question/108',
      visualization: 'data:image/png;base64,iVBORw0KGgo=',
      raw_data: { cols: ['CREATED_AT', 'count'], rows: [['2024-08-01T00:00:00Z', 501]] },
    },
    sent_at: '2024-09-30T20:16:15.76582Z',
    ...overrides,
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/metabase', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/metabase', () => {
  describe('Basic authentication', () => {
    it('accepts the correct credentials', async () => {
      const res = await POST(makeRequest({ Authorization: GOOD }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts a case-insensitive scheme', async () => {
      const res = await POST(makeRequest({ Authorization: GOOD.replace('Basic', 'bAsIc') }));
      expect(res.status).toBe(200);
    });

    it('splits on the first colon (password may contain colons)', () => {
      const h = new Headers({ authorization: basic('üser', 'pä:ss') });
      expect(verifyMetabaseRequest(h, 'üser', 'pä:ss')).toBe(true);
    });

    it('rejects a wrong password', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, 'wrong') }));
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toMatch(/^Basic/);
    });

    it('rejects a wrong username', async () => {
      expect((await POST(makeRequest({ Authorization: basic('someone', PASS) }))).status).toBe(401);
    });

    it('rejects when both are wrong', async () => {
      expect((await POST(makeRequest({ Authorization: basic('a', 'b') }))).status).toBe(401);
    });

    it('rejects a password of the same length without throwing', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, 'x'.repeat(PASS.length)) }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing Authorization header', async () => {
      expect((await POST(makeRequest())).status).toBe(401);
    });

    it('rejects other schemes (Bearer)', async () => {
      expect((await POST(makeRequest({ Authorization: `Bearer ${PASS}` }))).status).toBe(401);
    });

    it('rejects non-base64 characters', async () => {
      expect((await POST(makeRequest({ Authorization: 'Basic !!!not-base64!!!' }))).status).toBe(401);
    });

    it('rejects valid credentials followed by junk', async () => {
      const b64 = GOOD.slice('Basic '.length);
      expect((await POST(makeRequest({ Authorization: `Basic ${b64}!!` }))).status).toBe(401);
      expect((await POST(makeRequest({ Authorization: `Basic ${b64}=` }))).status).toBe(401);
      expect((await POST(makeRequest({ Authorization: `${GOOD} extra` }))).status).toBe(401);
    });

    it('rejects credentials without a colon', async () => {
      const header = `Basic ${Buffer.from('nocolon').toString('base64')}`;
      expect((await POST(makeRequest({ Authorization: header }))).status).toBe(401);
    });

    it('rejects everything when credentials are not configured', () => {
      const h = new Headers({ authorization: GOOD });
      expect(verifyMetabaseRequest(h, '', '')).toBe(false);
      expect(verifyMetabaseRequest(new Headers({ authorization: basic('', '') }), '', '')).toBe(false);
      expect(verifyMetabaseRequest(h, USER, PASS)).toBe(true);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(makeRequest({ Authorization: GOOD }, JSON.stringify(samplePayload()), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      expect((await POST(makeRequest({ Authorization: GOOD }, '{not json'))).status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      expect((await POST(makeRequest({ Authorization: GOOD }, '[1,2]'))).status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without credentials', async () => {
      expect((await POST(makeRequest({}, '{not json'))).status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it('handles alert', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ Authorization: GOOD }));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Alert'))).toBe(true);
      spy.mockRestore();
    });

    it('handles a test alert (alert_id null)', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ Authorization: GOOD }, JSON.stringify(samplePayload({ alert_id: null }))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).includes('test alert'))).toBe(true);
      spy.mockRestore();
    });

    it('acknowledges unknown types', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ Authorization: GOOD }, JSON.stringify(samplePayload({ type: 'something_new' })))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
      spy.mockRestore();
    });
  });
});
