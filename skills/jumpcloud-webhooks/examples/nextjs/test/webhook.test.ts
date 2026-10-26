import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/jumpcloud/route';
import { verifyJumpCloudRequest, parseBasicAuth } from '../lib/verify-jumpcloud';

const USER = 'jc_channel_user';
const PASS = 'p@ss:word:with:colons';

beforeAll(() => {
  process.env.JUMPCLOUD_WEBHOOK_USERNAME = USER;
  process.env.JUMPCLOUD_WEBHOOK_PASSWORD = PASS;
});

const basic = (u: string, p: string, scheme = 'Basic') =>
  `${scheme} ${Buffer.from(`${u}:${p}`).toString('base64')}`;

// Illustrative only: JumpCloud documents the field names, not an example body.
const samplePayload = () => ({
  alert_id: 'alert-0001',
  alert_title: 'Illustrative alert',
  category: 'illustrative',
  di_event: 'illustrative_event',
  event_description: 'Illustrative description',
  priority: 'High',
  rule_id: 'rule-0001',
  status: 'Open',
  occurred_at: '2026-01-01T00:00:00Z',
});

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/jumpcloud', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/jumpcloud', () => {
  describe('Basic authentication', () => {
    it('accepts the correct credentials', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS) }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('treats the scheme as case-insensitive', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS, 'basic') }));
      expect(res.status).toBe(200);
    });

    it('splits on the first colon only', () => {
      expect(parseBasicAuth(basic('a', 'b:c:d'))).toEqual({ username: 'a', password: 'b:c:d' });
    });

    it('rejects a wrong password', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, 'wrong') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await POST(makeRequest({ Authorization: basic('someone', PASS) }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects a non-Basic scheme', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer ${PASS}` }));
      expect(res.status).toBe(401);
    });

    it('rejects malformed Basic values', async () => {
      const noColon = await POST(
        makeRequest({ Authorization: `Basic ${Buffer.from('nocolon').toString('base64')}` })
      );
      expect(noColon.status).toBe(401);
      const junk = await POST(makeRequest({ Authorization: 'Basic !!!' }));
      expect(junk.status).toBe(401);
    });

    it('fails closed when credentials are not configured', () => {
      const headers = new Headers({ authorization: basic('', '') });
      expect(verifyJumpCloudRequest(headers, '', '')).toBe(false);
      expect(verifyJumpCloudRequest(new Headers({ authorization: basic(USER, PASS) }), USER, '')).toBe(false);
    });

    it('handles non-ASCII credentials', () => {
      const headers = new Headers({ authorization: basic('üser', 'pässwörd') });
      expect(verifyJumpCloudRequest(headers, 'üser', 'pässwörd')).toBe(true);
      expect(verifyJumpCloudRequest(headers, 'user', 'pässwörd')).toBe(false);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest({ Authorization: basic(USER, PASS) }, JSON.stringify(samplePayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('returns 401 (not 400) for bad credentials with an invalid body', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, 'wrong') }, 'not json'));
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid JSON with valid credentials', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS) }, 'not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS) }, '[1,2]'));
      expect(res.status).toBe(400);
    });
  });
});
