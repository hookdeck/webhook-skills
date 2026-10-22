import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyMistralWebhook } from '../lib/verify';
import { POST } from '../app/webhooks/mistral/route';

const SECRET = 'test_mistral_endpoint_secret';

beforeAll(() => {
  process.env.MISTRAL_WEBHOOK_SECRET = SECRET;
});

function sign(body: string, secret = SECRET): string {
  return 'hmac-sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/mistral', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

const events = {
  call_started: { session_id: 'RM_1', agent_id: 'ag_1', model: 'mistral-small-latest', started_at: 1725802330 },
  call_ended: { session_id: 'RM_1', agent_id: 'ag_1', model: 'mistral-small-latest', duration_seconds: 212, started_at: 1725802330, ended_at: 1725802542, transcript: null },
  call_failed: { session_id: 'RM_1', agent_id: 'ag_1', model: 'mistral-small-latest', error: 'livekit_error' },
};

describe('verifyMistralWebhook', () => {
  const body = JSON.stringify({ event: 'call_started', data: events.call_started });

  it('accepts a valid signature', () => {
    expect(verifyMistralWebhook(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects wrong secret, missing prefix, tampered body, missing header, length mismatch', () => {
    expect(verifyMistralWebhook(body, sign(body, 'other'), SECRET)).toBe(false);
    expect(verifyMistralWebhook(body, sign(body).replace('hmac-sha256=', ''), SECRET)).toBe(false);
    expect(verifyMistralWebhook(body + ' ', sign(body), SECRET)).toBe(false);
    expect(verifyMistralWebhook(body, null, SECRET)).toBe(false);
    expect(verifyMistralWebhook(body, 'hmac-sha256=abc', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/mistral', () => {
  for (const [event, data] of Object.entries(events)) {
    it(`accepts a signed ${event} event`, async () => {
      const body = JSON.stringify({ event, created_at: '2026-09-08T14:32:10Z', data });
      const res = await POST(makeRequest(body, { 'x-mistral-signature': sign(body) }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ok' });
    });
  }

  it('returns 400 for an invalid signature', async () => {
    const body = JSON.stringify({ event: 'call_started', data: events.call_started });
    const res = await POST(makeRequest(body, { 'x-mistral-signature': sign(body, 'wrong') }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a missing signature', async () => {
    const body = JSON.stringify({ event: 'call_started', data: events.call_started });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-mistral-signature': sign(body) }));
    expect(res.status).toBe(400);
  });
});
