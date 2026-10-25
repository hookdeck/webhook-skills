import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/emarsys/route';
import { verifyEmarsysRequest } from '../lib/verify-emarsys';

const USER = 'emarsys-hook';
const PASS = 'p4ss:word/with+colon';

beforeAll(() => {
  process.env.EMARSYS_WEBHOOK_USERNAME = USER;
  process.env.EMARSYS_WEBHOOK_PASSWORD = PASS;
});

function basic(user = USER, pass = PASS): string {
  return 'Basic ' + Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
}

// Illustrative payloads: the real body is defined by the Webhook node preset.
let counter = 0;
function contactPayload(overrides: Record<string, unknown> = {}) {
  return {
    email: 'jane@example.com',
    first_name: 'Jane',
    campaign_name: 'spring-sale', // "Additional data" static key-value
    deduplication_id: `dd-${++counter}`,
    ems_program_id: 4242,
    event_time: '2026-10-25T12:00:00Z',
    ...overrides,
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(contactPayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/emarsys', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/emarsys', () => {
  describe('HTTP Basic authentication', () => {
    it('accepts correct credentials', async () => {
      const res = await POST(makeRequest({ Authorization: basic() }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('treats the scheme as case-insensitive', async () => {
      const res = await POST(makeRequest({ Authorization: basic().replace('Basic', 'bAsIc') }));
      expect(res.status).toBe(200);
    });

    it('accepts a non-ASCII password when configured', () => {
      const headers = new Headers({ authorization: basic('u', 'pässwörd') });
      expect(verifyEmarsysRequest(headers, 'u', 'pässwörd')).toBe(true);
      expect(verifyEmarsysRequest(headers, 'u', 'password')).toBe(false);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects the wrong username', async () => {
      const res = await POST(makeRequest({ Authorization: basic('someone-else', PASS) }));
      expect(res.status).toBe(401);
    });

    it('rejects the wrong password', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, 'wrong') }));
      expect(res.status).toBe(401);
    });

    it('rejects credentials of different lengths without throwing', async () => {
      const res = await POST(makeRequest({ Authorization: basic('x', 'y'.repeat(200)) }));
      expect(res.status).toBe(401);
    });

    it('rejects a different scheme', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer ${PASS}` }));
      expect(res.status).toBe(401);
    });

    it('rejects valid credentials followed by junk', async () => {
      const valid = basic().slice('Basic '.length);
      for (const junk of ['!!', 'AAAA', '=', ' extra']) {
        const res = await POST(makeRequest({ Authorization: `Basic ${valid}${junk}` }));
        expect(res.status).toBe(401);
      }
    });

    it('rejects non-base64 and non-canonical base64', async () => {
      for (const value of ['Basic %%%%', 'Basic', 'Basic YQ', 'Basic YR==']) {
        const res = await POST(makeRequest({ Authorization: value }));
        expect(res.status).toBe(401);
      }
    });

    it('rejects credentials without a colon', async () => {
      const header = 'Basic ' + Buffer.from('nocolon').toString('base64');
      const res = await POST(makeRequest({ Authorization: header }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when credentials are not configured', () => {
      expect(verifyEmarsysRequest(new Headers({ authorization: basic('', '') }), '', '')).toBe(false);
      expect(verifyEmarsysRequest(new Headers({ authorization: basic() }), null, null)).toBe(false);
    });

    it('authenticates before the body is parsed (401 beats 406)', async () => {
      const res = await POST(makeRequest({}, 'not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest({ Authorization: basic() }, JSON.stringify(contactPayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('handles a payload with event_data', async () => {
      const body = JSON.stringify(contactPayload({ event_data: { order_id: 'A-1', total: 99.5 } }));
      const res = await POST(makeRequest({ Authorization: basic() }, body));
      expect(res.status).toBe(200);
    });

    it('handles a payload without deduplication_id', async () => {
      const { deduplication_id, ...rest } = contactPayload();
      const res = await POST(makeRequest({ Authorization: basic() }, JSON.stringify(rest)));
      expect(res.status).toBe(200);
      expect((await res.json()).duplicate).toBeUndefined();
    });

    it('returns 406 (discard contact) for invalid JSON', async () => {
      const res = await POST(makeRequest({ Authorization: basic() }, 'not json'));
      expect(res.status).toBe(406);
    });

    it('returns 406 for a JSON body that is not an object', async () => {
      const res = await POST(makeRequest({ Authorization: basic() }, '[1,2]'));
      expect(res.status).toBe(406);
    });
  });

  describe('idempotency', () => {
    it('acknowledges a repeated deduplication_id without reprocessing', async () => {
      const body = JSON.stringify(contactPayload({ deduplication_id: 'dd-repeat' }));
      const first = await POST(makeRequest({ Authorization: basic() }, body));
      const second = await POST(makeRequest({ Authorization: basic() }, body));
      expect(await first.json()).toEqual({ received: true });
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ received: true, duplicate: true });
    });
  });
});
