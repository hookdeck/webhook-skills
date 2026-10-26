import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/socure/route';
import { parseBasicAuth, verifySocureRequest } from '../lib/verify-socure';

const USER = 'riskos-hook';
const PASS = 'p@ss:word-with-colon_0123456789';

const EVENTS = [
  'evaluation_completed', 'evaluation_paused', 'reevaluation', 'workflow_execution_failed',
  'decision_update', 'fraud_confirming', 'review_case_assigned', 'review_case_unassigned',
  'case_status_updated', 'case_notes_added', 'case_attachment_added',
  'watchlist_notification_monitored_search_updated', 'case_management_notification_case_closure',
];

beforeAll(() => {
  process.env.SOCURE_WEBHOOK_USERNAME = USER;
  process.env.SOCURE_WEBHOOK_PASSWORD = PASS;
});

function basic(user: string, pass: string, scheme = 'Basic'): string {
  return `${scheme} ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

function samplePayload(eventType = 'evaluation_completed') {
  return {
    event_id: '336ccd2a-b3a8-49a8-b2cc-89a4ae90feeb',
    event_at: '2025-01-15T13:04:11.468Z',
    event_type: eventType,
    data: { id: 'onb-12345', eval_id: '6dc8f39c-ecc3-4fe0-9283-fc8e5f99e816', decision: 'ACCEPT' },
  };
}

function post(authorization?: string, body: string = JSON.stringify(samplePayload()), contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (authorization !== undefined) headers.authorization = authorization;
  return POST(
    new NextRequest('http://localhost:3000/webhooks/socure', { method: 'POST', headers, body })
  );
}

describe('Socure webhook route', () => {
  describe('Basic auth verification', () => {
    it('accepts the correct credentials', async () => {
      const res = await post(basic(USER, PASS));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts a lowercase scheme', async () => {
      expect((await post(basic(USER, PASS, 'basic'))).status).toBe(200);
    });

    it('rejects a missing Authorization header', async () => {
      expect((await post()).status).toBe(401);
    });

    it('rejects a wrong password', async () => {
      expect((await post(basic(USER, 'wrong'))).status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      expect((await post(basic('someone-else', PASS))).status).toBe(401);
    });

    it('rejects a Bearer token', async () => {
      expect((await post('Bearer 6dc8f39c-ecc3-4fe0-9283-fc8e5f99e816')).status).toBe(401);
    });

    it('rejects malformed Basic values', async () => {
      for (const value of ['Basic', 'Basic !!!notbase64', `Basic ${Buffer.from('nocolon').toString('base64')}`]) {
        expect((await post(value)).status).toBe(401);
      }
    });

    it('rejects different-length and non-ASCII credentials without throwing', async () => {
      expect((await post(basic('x', 'y'))).status).toBe(401);
      expect((await post(basic('üser', 'pässwörd'))).status).toBe(401);
    });

    it('rejects every request when credentials are not configured', () => {
      const headers = new Headers({ authorization: basic(USER, PASS) });
      expect(verifySocureRequest(headers, '', '')).toBe(false);
      expect(verifySocureRequest(headers, USER, '')).toBe(false);
    });

    it('authenticates before parsing the body', async () => {
      expect((await post(undefined, 'not json')).status).toBe(401);
    });
  });

  describe('parseBasicAuth', () => {
    it('splits on the first colon', () => {
      expect(parseBasicAuth(basic('a', 'b:c'))).toEqual({ username: 'a', password: 'b:c' });
    });

    it('returns null for missing values and other schemes', () => {
      expect(parseBasicAuth(null)).toBeNull();
      expect(parseBasicAuth('Bearer abc')).toBeNull();
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (eventType) => {
      const res = await post(basic(USER, PASS), JSON.stringify(samplePayload(eventType)));
      expect(res.status).toBe(200);
    });

    it('acknowledges unknown event types', async () => {
      expect((await post(basic(USER, PASS), JSON.stringify(samplePayload('something_new')))).status).toBe(200);
    });

    it('accepts any content type', async () => {
      expect((await post(basic(USER, PASS), JSON.stringify(samplePayload()), 'text/plain')).status).toBe(200);
    });

    it('rejects invalid JSON with 400', async () => {
      expect((await post(basic(USER, PASS), 'not json')).status).toBe(400);
    });

    it('rejects a non-object body with 400', async () => {
      expect((await post(basic(USER, PASS), '[1,2]')).status).toBe(400);
    });
  });
});
