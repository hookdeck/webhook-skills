import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyLumaWebhook } from '../lib/luma';

// Luma secrets start with whsec_ and are used whole as a UTF-8 key (NOT base64-decoded)
const SECRET = 'whsec_test_secret_123';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.LUMA_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/luma/route'));
});

function sign(body: string, secret = SECRET, t = Math.floor(Date.now() / 1000)): string {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

const event = (type: string, data: Record<string, unknown> = {}) => ({ type, data });

function makeRequest(body: string, header?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (header) headers['webhook-signature'] = header;
  return new NextRequest('http://localhost:3000/webhooks/luma', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyLumaWebhook', () => {
  const body = JSON.stringify(event('guest.registered'));

  it('accepts a valid signature', () => {
    expect(verifyLumaWebhook(body, sign(body), SECRET)).toBe(true);
  });

  it('uses the whole whsec_ secret, not a stripped or base64-decoded one', () => {
    const stripped = SECRET.slice('whsec_'.length);
    expect(verifyLumaWebhook(body, sign(body, stripped), SECRET)).toBe(false);
    const decoded = Buffer.from(stripped, 'base64');
    const t = Math.floor(Date.now() / 1000);
    const v1 = crypto.createHmac('sha256', decoded).update(`${t}.${body}`).digest('hex');
    expect(verifyLumaWebhook(body, `t=${t},v1=${v1}`, SECRET)).toBe(false);
  });

  it('rejects wrong secret', () => {
    expect(verifyLumaWebhook(body, sign(body, 'whsec_other'), SECRET)).toBe(false);
  });

  it('rejects tampered body', () => {
    expect(verifyLumaWebhook(body + ' ', sign(body), SECRET)).toBe(false);
  });

  it('accepts an old timestamp by default (retries keep the original t)', () => {
    delete process.env.LUMA_TIMESTAMP_TOLERANCE_SECONDS;
    const old = Math.floor(Date.now() / 1000) - 86400;
    expect(verifyLumaWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
  });

  it('rejects an old timestamp with an explicit tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyLumaWebhook(body, sign(body, SECRET, old), SECRET, 300)).toBe(false);
  });

  it('rejects an old timestamp when LUMA_TIMESTAMP_TOLERANCE_SECONDS is set', () => {
    process.env.LUMA_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyLumaWebhook(body, sign(body, SECRET, old), SECRET)).toBe(false);
    } finally {
      delete process.env.LUMA_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  it('treats a non-numeric LUMA_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', () => {
    process.env.LUMA_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyLumaWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
    } finally {
      delete process.env.LUMA_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });

  it('rejects malformed headers', () => {
    expect(verifyLumaWebhook(body, 'garbage', SECRET)).toBe(false);
    expect(verifyLumaWebhook(body, 't=abc,v1=00', SECRET)).toBe(false);
    expect(verifyLumaWebhook(body, null, SECRET)).toBe(false);
  });

  it('accepts when any v1 signature matches', () => {
    expect(verifyLumaWebhook(body, `${sign(body)},v1=deadbeef`, SECRET)).toBe(true);
  });
});

describe('POST /webhooks/luma', () => {
  const types = [
    'calendar.event.added',
    'calendar.event.submitted',
    'calendar.person.subscribed',
    'calendar.person.unsubscribed',
    'event.created',
    'event.updated',
    'event.canceled',
    'guest.registered',
    'guest.updated',
    'guest.refunded',
    'ticket.registered',
    'something.new',
  ];

  it.each(types)('returns 200 for a valid %s event', async (type) => {
    const body = JSON.stringify(event(type, { id: 'x', user_email: 'a@example.com', email: 'a@example.com' }));
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify(event('guest.registered'));
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const body = JSON.stringify(event('guest.registered'));
    const res = await POST(makeRequest(body, sign(body, 'whsec_wrong')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a missing header', async () => {
    const res = await POST(makeRequest(JSON.stringify(event('guest.registered'))));
    expect(res.status).toBe(400);
  });

  it('returns 400 for validly signed invalid JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(400);
  });
});
