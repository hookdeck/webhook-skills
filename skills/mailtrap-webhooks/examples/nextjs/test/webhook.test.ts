// Generated with: mailtrap-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

const SECRET = '0123456789abcdef0123456789abcdef'; // 32 hex chars, used as plain text
// Must be in the environment before the route handler reads it.
process.env.MAILTRAP_WEBHOOK_SECRET = SECRET;

import { NextRequest } from 'next/server';
import { POST, verifySignature, parseEvents } from '../app/webhooks/mailtrap/route';

/** hex(HMAC_SHA256(secret_as_utf8, raw_body)), no timestamp, no prefix. */
function sign(rawBody: string, secret: string = SECRET): string {
  return crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

function makeRequest(body: string, signature?: string, contentType = 'application/json'): NextRequest {
  const headers = new Headers({ 'content-type': contentType });
  if (signature !== undefined) headers.set('Mailtrap-Signature', signature);
  return new NextRequest('https://example.com/webhooks/mailtrap', { method: 'POST', headers, body });
}

const deliveryEvent = {
  event: 'delivery',
  timestamp: 1728669700,
  sending_stream: 'transactional',
  message_id: '1df37d17-0286-4d8b-8edf-bc4ec5be86e6',
  email: 'receiver@example.com',
  event_id: 'bede7236-2284-43d6-a953-1fdcafd0fdbc',
  sending_domain_name: 'examplesender.com',
};
const jsonBody = JSON.stringify({ events: [deliveryEvent] });
const jsonlBody =
  JSON.stringify(deliveryEvent) + '\n' + JSON.stringify({ ...deliveryEvent, event: 'open', event_id: 'e2' }) + '\n';

describe('verifySignature', () => {
  it('accepts a valid signature, including uppercase hex', () => {
    expect(verifySignature(jsonBody, sign(jsonBody), SECRET)).toBe(true);
    expect(verifySignature(jsonBody, sign(jsonBody).toUpperCase(), SECRET)).toBe(true);
  });

  it('uses the secret as plain text, not hex-decoded', () => {
    const decoded = crypto.createHmac('sha256', Buffer.from(SECRET, 'hex')).update(jsonBody).digest('hex');
    expect(verifySignature(jsonBody, decoded, SECRET)).toBe(false);
  });

  it('rejects wrong secret, tampered body and re-serialised body', () => {
    expect(verifySignature(jsonBody, sign(jsonBody, 'f'.repeat(32)), SECRET)).toBe(false);
    expect(verifySignature(jsonBody + ' ', sign(jsonBody), SECRET)).toBe(false);
    const pretty = JSON.stringify(JSON.parse(jsonBody), null, 2);
    expect(verifySignature(pretty, sign(jsonBody), SECRET)).toBe(false);
  });

  it('rejects malformed signatures without throwing', () => {
    for (const bad of ['', 'abc', 'zz'.repeat(32), sign(jsonBody) + 'ab', 'é'.repeat(64)]) {
      expect(verifySignature(jsonBody, bad, SECRET)).toBe(false);
    }
  });
});

describe('parseEvents', () => {
  it('parses JSON, JSON Lines and single-line JSON Lines', () => {
    expect(parseEvents(jsonBody)).toEqual([deliveryEvent]);
    expect(parseEvents(jsonlBody)).toHaveLength(2);
    expect(parseEvents(JSON.stringify(deliveryEvent))).toEqual([deliveryEvent]);
  });
  it('throws on garbage', () => {
    expect(() => parseEvents('not json')).toThrow();
  });
});

describe('POST /webhooks/mailtrap', () => {
  it('returns 200 for a valid JSON delivery', async () => {
    const res = await POST(makeRequest(jsonBody, sign(jsonBody)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 200 for JSON Lines (application/jsonl) and any content type', async () => {
    expect((await POST(makeRequest(jsonlBody, sign(jsonlBody), 'application/jsonl'))).status).toBe(200);
    expect((await POST(makeRequest(jsonBody, sign(jsonBody), 'text/plain'))).status).toBe(200);
  });

  it('handles every sending event, "soft bounce" and audit log events', async () => {
    const names = ['delivery', 'open', 'click', 'unsubscribe', 'spam', 'soft bounce', 'bounce', 'suspension', 'reject'];
    const events: Record<string, unknown>[] = names.map((event, i) => ({ ...deliveryEvent, event, event_id: `x${i}` }));
    events.push({ event: 'activity_log.user.login', description: 'logged in', actor: { id: 1 }, timestamp: 1 });
    const body = JSON.stringify({ events });
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });

  it('returns 401 for an invalid or malformed signature', async () => {
    expect((await POST(makeRequest(jsonBody, sign(jsonBody, 'f'.repeat(32))))).status).toBe(401);
    expect((await POST(makeRequest(jsonBody, 'abc'))).status).toBe(401);
    expect((await POST(makeRequest(jsonBody, 'zz'.repeat(32)))).status).toBe(401);
  });

  it('returns 400 when the signature header is missing', async () => {
    expect((await POST(makeRequest(jsonBody))).status).toBe(400);
  });

  it('returns 400 for a validly signed but malformed payload', async () => {
    const body = 'not json at all';
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(400);
  });
});
