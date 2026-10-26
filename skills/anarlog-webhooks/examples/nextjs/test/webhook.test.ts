import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyAnarlogWebhook } from '../lib/verify';
import { POST } from '../app/webhooks/anarlog/route';

// Anarlog secrets look like whsec_... but the WHOLE string is the HMAC key (not Standard Webhooks)
const SECRET = 'whsec_test_anarlog_secret';

beforeAll(() => {
  process.env.ANARLOG_WEBHOOK_SECRET = SECRET;
});

/**
 * Generate a valid Anarlog signature for testing (sha256=<hex> of the raw body)
 */
function generateAnarlogSignature(payload: string, secret: string): string {
  const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${digest}`;
}

const meetingPayload = (event: string) => ({
  id: 'evt_123',
  event,
  created_at: '2026-07-28T09:00:00.000Z',
  data: {
    meeting: {
      id: 'mtg_1',
      title: 'Weekly sync',
      note: {},
      summaries: [],
      participants: [],
      action_items: [{ text: 'Send follow-up' }],
    },
    transcript_text: 'Hello everyone',
  },
});

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/anarlog', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('verifyAnarlogWebhook', () => {
  const body = '{"event":"webhook.test"}';

  it('returns true for a valid signature', () => {
    expect(verifyAnarlogWebhook(body, generateAnarlogSignature(body, SECRET), SECRET)).toBe(true);
  });

  it('accepts uppercase hex', () => {
    const header = 'sha256=' + generateAnarlogSignature(body, SECRET).slice(7).toUpperCase();
    expect(verifyAnarlogWebhook(body, header, SECRET)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(verifyAnarlogWebhook(body, 'sha256=invalid', SECRET)).toBe(false);
  });

  it('returns false for a missing signature', () => {
    expect(verifyAnarlogWebhook(body, null, SECRET)).toBe(false);
  });

  it('returns false when no secret is configured', () => {
    expect(verifyAnarlogWebhook(body, generateAnarlogSignature(body, SECRET), undefined)).toBe(false);
  });

  it('requires the sha256= prefix', () => {
    expect(verifyAnarlogWebhook(body, generateAnarlogSignature(body, SECRET).slice(7), SECRET)).toBe(false);
  });

  it('rejects a 64-char value that is not hex', () => {
    expect(verifyAnarlogWebhook(body, 'sha256=' + 'z'.repeat(64), SECRET)).toBe(false);
  });

  it('rejects a valid signature with trailing junk', () => {
    expect(verifyAnarlogWebhook(body, generateAnarlogSignature(body, SECRET) + 'zz', SECRET)).toBe(false);
  });

  it('uses the whole whsec_ secret as the key (not stripped or base64-decoded)', () => {
    const stripped = crypto.createHmac('sha256', SECRET.slice('whsec_'.length)).update(body).digest('hex');
    expect(verifyAnarlogWebhook(body, `sha256=${stripped}`, SECRET)).toBe(false);

    const decoded = crypto
      .createHmac('sha256', Buffer.from(SECRET.slice('whsec_'.length), 'base64'))
      .update(body)
      .digest('hex');
    expect(verifyAnarlogWebhook(body, `sha256=${decoded}`, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/anarlog', () => {
  it('returns 401 for a missing signature', async () => {
    const res = await POST(makeRequest(JSON.stringify(meetingPayload('meeting.completed'))));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const res = await POST(
      makeRequest(JSON.stringify(meetingPayload('meeting.completed')), {
        'x-anarlog-signature': 'sha256=' + '0'.repeat(64),
      })
    );
    expect(res.status).toBe(401);
  });

  it.each(['meeting.completed', 'note.enhanced', 'webhook.test'])('returns 200 for a valid %s', async (event) => {
    const body = JSON.stringify(meetingPayload(event));
    const res = await POST(
      makeRequest(body, {
        'x-anarlog-event': event,
        'x-anarlog-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-anarlog-signature': generateAnarlogSignature(body, SECRET),
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 200 for an unhandled event type', async () => {
    const body = JSON.stringify(meetingPayload('meeting.deleted'));
    const res = await POST(makeRequest(body, { 'x-anarlog-signature': generateAnarlogSignature(body, SECRET) }));
    expect(res.status).toBe(200);
  });

  it('verifies a body sent with a non-JSON content type', async () => {
    const body = JSON.stringify(meetingPayload('webhook.test'));
    const res = await POST(
      makeRequest(body, {
        'content-type': 'text/plain',
        'x-anarlog-signature': generateAnarlogSignature(body, SECRET),
      })
    );
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-anarlog-signature': generateAnarlogSignature(body, SECRET) }));
    expect(res.status).toBe(400);
  });
});
