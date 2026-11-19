// Generated with: mindbody-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { HEAD, POST } from '../app/webhooks/mindbody/route';
import { verifyMindbodySignature } from '../lib/verify-mindbody';

const SECRET = 'c3ludGhldGljLW1pbmRib2R5LXNpZ25hdHVyZS1rZXk=';
const BODY = '{"messageId":"SynthMsg00000000000001","eventId":"classRosterBooking.created","eventSchemaVersion":1,"eventInstanceOriginationDateTime":"2026-11-18T10:15:00Z","eventData":{"siteId":-99,"locationId":1,"classId":201,"classRosterBookingId":11,"classStartDateTime":"2026-11-20T12:00:00Z","classEndDateTime":"2026-11-20T13:00:00Z","clientId":"100000009"}}';
const BODY2 = '{"messageId":"SynthMsg00000000000002","eventId":"client.created","eventSchemaVersion":1,"eventInstanceOriginationDateTime":"2026-11-18T10:20:00Z","eventData":{"siteId":-99,"clientId":"100000010","firstName":"Test","lastName":"Client"}}';

const sign = (body: string, key: string | Buffer = SECRET) =>
  'sha256=' + crypto.createHmac('sha256', key).update(body).digest('base64');

const post = (body: string, signature?: string, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/webhooks/mindbody', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
        ...(signature === undefined ? {} : { 'x-mindbody-signature': signature }),
      },
      body,
    })
  );

beforeEach(() => {
  process.env.MINDBODY_MESSAGE_SIGNATURE_KEY = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyMindbodySignature', () => {
  it('accepts base64 and rejects hex', () => {
    expect(verifyMindbodySignature(BODY, sign(BODY), SECRET)).toBe(true);
    const other = 'sha256=' + crypto.createHmac('sha256', SECRET).update(BODY).digest('hex');
    expect(verifyMindbodySignature(BODY, other, SECRET)).toBe(false);
  });

  it('uses messageSignatureKey as UTF-8 text and requires the sha256= prefix', () => {
    expect(verifyMindbodySignature(BODY, sign(BODY, Buffer.from(SECRET, 'base64')), SECRET)).toBe(false);
    expect(verifyMindbodySignature(BODY, sign(BODY).slice('sha256='.length), SECRET)).toBe(false);
  });
});

describe('/webhooks/mindbody', () => {
  it('answers the HEAD check with 200', async () => {
    expect((await HEAD()).status).toBe(200);
  });

  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, event_type: 'classRosterBooking.created', event_id: 'SynthMsg00000000000001' });
  });

  it('rejects another secret, a tampered body and a missing signature header', async () => {
    expect((await post(BODY, sign(BODY, 'wrong_secret'))).status).toBe(401);
    expect((await post(BODY.replace('"classId":201', '"classId":202'), sign(BODY))).status).toBe(401);
    expect((await post(BODY)).status).toBe(401);
  });

  it('accepts a secret with a trailing newline', async () => {
    process.env.MINDBODY_MESSAGE_SIGNATURE_KEY = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when MINDBODY_MESSAGE_SIGNATURE_KEY is not set', async () => {
    delete process.env.MINDBODY_MESSAGE_SIGNATURE_KEY;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
