// Generated with: makeplans-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/makeplans/route';
import { verifyMakePlansSignature } from '../lib/verify-makeplans';

const SECRET = 'mp_synthetic_account_secret_9d2c';
const BODY = '{"event":"booking.created","idempotency_id":"b7c1e2d3-0000-4000-8000-000000000001","generated_at":"2026-11-18T10:15:00+01:00","performed_by":{"name":"Synthetic Staff"},"data":{"object":"booking","id":4401,"booking":{"id":4401,"state":"confirmed","booked_from":"2026-11-20T09:00:00+01:00","booked_to":"2026-11-20T10:00:00+01:00","service_id":12,"resource_id":34,"person_id":56}},"object":"booking","id":4401}';
const BODY2 = '{"event":"person.updated","idempotency_id":"b7c1e2d3-0000-4000-8000-000000000002","generated_at":"2026-11-18T10:20:00+01:00","performed_by":{"name":"Synthetic Staff"},"data":{"object":"person","id":56,"person":{"id":56,"name":"Test Person"}},"object":"person","id":56}';

const sign = (body: string, key: string | Buffer = SECRET) =>
  'sha256=' + crypto.createHmac('sha256', key).update(body).digest('hex');

const post = (body: string, signature?: string, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/webhooks/makeplans', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
        ...(signature === undefined ? {} : { 'x-makeplans-signature': signature }),
      },
      body,
    })
  );

beforeEach(() => {
  process.env.MAKEPLANS_ACCOUNT_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyMakePlansSignature', () => {
  it('accepts hex and rejects base64', () => {
    expect(verifyMakePlansSignature(BODY, sign(BODY), SECRET)).toBe(true);
    const other = 'sha256=' + crypto.createHmac('sha256', SECRET).update(BODY).digest('base64');
    expect(verifyMakePlansSignature(BODY, other, SECRET)).toBe(false);
  });

  it('requires the sha256= prefix', () => {
    expect(verifyMakePlansSignature(BODY, sign(BODY).slice('sha256='.length), SECRET)).toBe(false);
  });
});

describe('/webhooks/makeplans', () => {

  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, event_type: 'booking.created', event_id: 'b7c1e2d3-0000-4000-8000-000000000001' });
  });

  it('rejects another secret, a tampered body and a missing signature header', async () => {
    expect((await post(BODY, sign(BODY, 'wrong_secret'))).status).toBe(401);
    expect((await post(BODY.replace('"state":"confirmed"', '"state":"cancelled"'), sign(BODY))).status).toBe(401);
    expect((await post(BODY)).status).toBe(401);
  });

  it('accepts a secret with a trailing newline', async () => {
    process.env.MAKEPLANS_ACCOUNT_SECRET = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when MAKEPLANS_ACCOUNT_SECRET is not set', async () => {
    delete process.env.MAKEPLANS_ACCOUNT_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
