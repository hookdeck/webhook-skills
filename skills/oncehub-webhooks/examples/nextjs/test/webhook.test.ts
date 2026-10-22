import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyOncehubWebhook } from '../lib/oncehub';

// The endpoint secret (View secret in the dashboard) is used as a UTF-8 string
const SECRET = 'oncehub_test_secret_123';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.ONCEHUB_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/oncehub/route'));
});

function sign(body: string, secret = SECRET, t = Math.floor(Date.now() / 1000)): string {
  const s = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},s=${s}`;
}

const event = (type: string, data: Record<string, unknown> = { object: 'booking', id: 'BKNG-YNMGHKQ24XV5' }) => ({
  id: 'EVNT-2AB8RJY3LF',
  object: 'event',
  creation_time: '2021-01-20T12:10:03.140Z',
  type,
  api_version: 'v2',
  data,
});

function makeRequest(body: string, header?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (header) headers['oncehub-signature'] = header;
  return new NextRequest('http://localhost:3000/webhooks/oncehub', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyOncehubWebhook', () => {
  const body = JSON.stringify(event('booking.scheduled'));

  it('accepts a valid signature', () => {
    expect(verifyOncehubWebhook(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects wrong secret', () => {
    expect(verifyOncehubWebhook(body, sign(body, 'other_secret'), SECRET)).toBe(false);
  });

  it('rejects tampered body', () => {
    expect(verifyOncehubWebhook(body + ' ', sign(body), SECRET)).toBe(false);
  });

  it('accepts an old timestamp by default (retries keep the original t)', () => {
    delete process.env.ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS;
    const old = Math.floor(Date.now() / 1000) - 86400;
    expect(verifyOncehubWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
  });

  it('rejects an old timestamp with an explicit tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyOncehubWebhook(body, sign(body, SECRET, old), SECRET, 300)).toBe(false);
  });

  it('rejects an old timestamp when ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS is set', () => {
    process.env.ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyOncehubWebhook(body, sign(body, SECRET, old), SECRET)).toBe(false);
    } finally {
      delete process.env.ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  it('treats a non-numeric ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', () => {
    process.env.ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyOncehubWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
    } finally {
      delete process.env.ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });

  it('rejects malformed headers', () => {
    expect(verifyOncehubWebhook(body, 'garbage', SECRET)).toBe(false);
    expect(verifyOncehubWebhook(body, 't=abc,s=00', SECRET)).toBe(false);
    expect(verifyOncehubWebhook(body, null, SECRET)).toBe(false);
  });

  it('accepts when any s signature matches', () => {
    expect(verifyOncehubWebhook(body, `${sign(body)},s=deadbeef`, SECRET)).toBe(true);
  });
});

describe('POST /webhooks/oncehub', () => {
  it.each([
    'booking.scheduled',
    'booking.rescheduled',
    'booking.reassigned',
    'booking.canceled_then_rescheduled',
    'booking.canceled_reschedule_requested',
    'booking.canceled',
    'booking.completed',
    'booking.no_show',
    'conversation.started',
    'conversation.closed',
    'conversation.abandoned',
    'something.new',
  ])('returns 200 for a validly signed %s event', async (type) => {
    const body = JSON.stringify(event(type));
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const body = JSON.stringify(event('booking.scheduled'));
    const res = await POST(makeRequest(body, sign(body, 'wrong_secret')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a missing header', async () => {
    const res = await POST(makeRequest(JSON.stringify(event('booking.scheduled'))));
    expect(res.status).toBe(400);
  });

  it('returns 400 for validly signed invalid JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(400);
  });
});
