import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/streak/route';
import { verifyStreakRequest } from '../lib/verify-streak';

const TOKEN = 'test_streak_token_0123456789';

const EVENTS = [
  'BOX_CREATE', 'BOX_DELETE', 'STAGE_CREATE', 'BOX_NEW_EMAIL_ADDRESS', 'BOX_EDIT',
  'BOX_CHANGE_STAGE', 'BOX_CHANGE_PIPELINE', 'COMMENT_CREATE', 'MEETING_CREATE',
  'MEETING_UPDATE', 'TASK_CREATE', 'TASK_COMPLETE', 'TASK_DUE', 'TASK_UPDATED',
  'CONTACT_CREATE', 'ORG_CREATE', 'CONTACT_UPDATE', 'ORG_UPDATE', 'CONTACT_DELETE',
  'ORG_DELETE',
];

beforeAll(() => {
  process.env.STREAK_WEBHOOK_TOKEN = TOKEN;
});

const samplePayload = () => [
  { key: 'gICIxYzv9QoM', pipelineKey: 'agxzfm1hZaXCgw', name: 'Acme deal', creationDate: 1507226274178 },
];

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  event: string | null = 'BOX_CREATE',
  contentType = 'application/json'
): NextRequest {
  const url = `http://localhost:3000/webhooks/streak${event ? `?event=${event}` : ''}`;
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/streak', () => {
  describe('X-Streak-Webhook-Token verification', () => {
    it('accepts the correct token', async () => {
      const res = await POST(makeRequest({ 'X-Streak-Webhook-Token': TOKEN }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'x-streak-webhook-token': TOKEN }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await POST(makeRequest({ 'X-Streak-Webhook-Token': 'x'.repeat(TOKEN.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await POST(makeRequest({ 'X-Streak-Webhook-Token': 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a token with extra suffix (whole value must match)', async () => {
      const res = await POST(makeRequest({ 'X-Streak-Webhook-Token': `${TOKEN}-extra` }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing token', async () => {
      expect((await POST(makeRequest())).status).toBe(401);
    });

    it('does not accept the token as an Authorization bearer', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer ${TOKEN}` }));
      expect(res.status).toBe(401);
    });

    it('rejects every request when no token is configured', () => {
      const h = new Headers({ 'x-streak-webhook-token': TOKEN });
      expect(verifyStreakRequest(h, '')).toBe(false);
    });

    it('authenticates before parsing the body', async () => {
      expect((await POST(makeRequest({}, 'not json'))).status).toBe(401);
    });
  });

  describe('body handling', () => {
    const auth = { 'X-Streak-Webhook-Token': TOKEN };

    it.each(EVENTS)('handles %s', async (event) => {
      const res = await POST(makeRequest(auth, JSON.stringify(samplePayload()), event));
      expect(res.status).toBe(200);
    });

    it('accepts a request with no event query parameter', async () => {
      expect((await POST(makeRequest(auth, JSON.stringify(samplePayload()), null))).status).toBe(200);
    });

    it('accepts a single object as well as an array', async () => {
      const res = await POST(makeRequest(auth, JSON.stringify(samplePayload()[0]), 'BOX_EDIT'));
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await POST(makeRequest(auth, JSON.stringify(samplePayload()), 'BOX_CREATE', 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      expect((await POST(makeRequest(auth, 'not json'))).status).toBe(400);
    });

    it('returns 400 for a non-object body', async () => {
      expect((await POST(makeRequest(auth, '"hello"'))).status).toBe(400);
    });
  });
});
