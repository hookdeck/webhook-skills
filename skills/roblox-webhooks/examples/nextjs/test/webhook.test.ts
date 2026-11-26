// Generated with: roblox-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/roblox/route';
import { verifyRobloxSignature, parseRobloxSignatureHeader, parseEventTime } from '../lib/verify-roblox';
import { jobQueue, seenNotificationIds } from '../lib/notifications';

// Synthetic secret: Roblox secrets are whatever you type into the Creator Dashboard.
const SECRET = 'roblox_synthetic_webhook_secret_7c41';

// Compact JSON, as Roblox sends it. IDs above 2^31 are normal for Roblox.
const ERASURE = '{"NotificationId":"5f0c2b1e-8d3a-4b6f-9e21-0a7c4d9e1001","EventType":"RightToErasureRequest","EventTime":"2026-11-20T16:24:24.2118874Z","EventPayload":{"UserId":3141592653,"GameIds":[4483381587,920587237]}}';
const SAMPLE = '{"NotificationId":"5f0c2b1e-8d3a-4b6f-9e21-0a7c4d9e1002","EventType":"SampleNotification","EventTime":"2026-11-20T16:25:00.1000000Z","EventPayload":{"UserId":1}}';
const ALERT = '{"NotificationId":"5f0c2b1e-8d3a-4b6f-9e21-0a7c4d9e1003","EventType":"AnalyticsAlert","EventTime":"2026-11-20T16:26:10.8590762Z","EventPayload":{"TargetType":"Universe","TargetId":"1234567890","AlertMessage":"{\\"summary\\":\\"Client crash rate alert fired\\",\\"metric\\":\\"ClientCrashRate\\"}"}}';
// Not a real Roblox EventType: stands in for the triggers whose wire names aren't published.
const UNKNOWN = '{"NotificationId":"5f0c2b1e-8d3a-4b6f-9e21-0a7c4d9e1004","EventType":"PlaceholderUndocumentedEvent","EventTime":"2026-11-20T16:27:00.0000000Z","EventPayload":{"Example":true}}';

const nowSeconds = () => Math.floor(Date.now() / 1000);

const sign = (body: string, t: number = nowSeconds(), key: string = SECRET) =>
  crypto.createHmac('sha256', key).update(`${t}.${body}`).digest('base64');

const header = (body: string, t: number = nowSeconds(), key: string = SECRET) => `t=${t},v1=${sign(body, t, key)}`;

const post = async (body: string, signatureHeader?: string) => {
  const res = await POST(
    new Request('http://localhost/webhooks/roblox', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(signatureHeader === undefined ? {} : { 'roblox-signature': signatureHeader }),
      },
      body,
    })
  );
  return { status: res.status, body: await res.json() };
};

let enqueue: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.ROBLOX_WEBHOOK_SECRET = SECRET;
  delete process.env.ROBLOX_WEBHOOK_TOLERANCE_SECONDS;
  seenNotificationIds.clear();
  enqueue = vi.spyOn(jobQueue, 'enqueue').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyRobloxSignature', () => {
  it('accepts base64 HMAC-SHA256 of "<t>.<raw body>"', () => {
    const t = nowSeconds();
    expect(verifyRobloxSignature(ERASURE, header(ERASURE, t), SECRET)).toEqual({ valid: true, timestamp: t });
  });

  it('matches a fixed test vector', () => {
    const body = '{"NotificationId":"test","EventType":"SampleNotification","EventTime":"2023-12-30T16:24:24.2118874Z","EventPayload":{"UserId":1}}';
    const result = verifyRobloxSignature(
      body,
      't=1700000000,v1=9gGo8glBNiM69Kw9sLT69cG12dTQovB+C6KacIvo1i4=',
      'roblox_test_secret',
      { now: 1700000000 * 1000 }
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a hex digest: Roblox uses base64', () => {
    const t = nowSeconds();
    const hex = crypto.createHmac('sha256', SECRET).update(`${t}.${ERASURE}`).digest('hex');
    expect((verifyRobloxSignature(ERASURE, `t=${t},v1=${hex}`, SECRET) as { reason: string }).reason).toBe('signature_mismatch');
  });

  it('rejects a base string with the body first', () => {
    const t = nowSeconds();
    const wrong = crypto.createHmac('sha256', SECRET).update(`${ERASURE}.${t}`).digest('base64');
    expect(verifyRobloxSignature(ERASURE, `t=${t},v1=${wrong}`, SECRET).valid).toBe(false);
  });

  it('rejects a header with t but no v1 (webhook saved without a secret)', () => {
    expect((verifyRobloxSignature(ERASURE, `t=${nowSeconds()}`, SECRET) as { reason: string }).reason).toBe('missing_v1');
  });

  it('rejects when no secret is configured', () => {
    expect((verifyRobloxSignature(ERASURE, header(ERASURE), '') as { reason: string }).reason).toBe('secret_not_configured');
  });

  it('agrees with the vendor sample (JSON.stringify of the parsed body) for compact JSON', () => {
    // Roblox's sample signs JSON.stringify(req.body). For the compact JSON
    // Roblox sends, that's byte-identical to the raw body.
    expect(JSON.stringify(JSON.parse(ERASURE))).toBe(ERASURE);
    expect(JSON.parse(ERASURE).EventPayload.UserId).toBe(3141592653);
  });
});

describe('parseRobloxSignatureHeader', () => {
  it('reads members in any order and keeps base64 padding', () => {
    expect(parseRobloxSignatureHeader('v1=abc+/==, t=1700000000, x=ignored')).toEqual({
      timestamp: '1700000000',
      signatures: ['abc+/=='],
    });
  });
});

describe('parseEventTime', () => {
  it('parses 7 fractional digits', () => {
    expect(parseEventTime('2023-12-30T16:24:24.2118874Z')!.toISOString()).toBe('2023-12-30T16:24:24.211Z');
  });

  it('returns null for garbage', () => {
    expect(parseEventTime('not a date')).toBeNull();
  });
});

describe('POST /webhooks/roblox (App Router)', () => {
  it('accepts a RightToErasureRequest and queues the erasure', async () => {
    const res = await post(ERASURE, header(ERASURE));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      received: true,
      notificationId: '5f0c2b1e-8d3a-4b6f-9e21-0a7c4d9e1001',
      eventType: 'RightToErasureRequest',
      action: 'erasure_queued',
    });
    expect(enqueue).toHaveBeenCalledWith({
      type: 'erase-user',
      notificationId: '5f0c2b1e-8d3a-4b6f-9e21-0a7c4d9e1001',
      userId: 3141592653,
      gameIds: [4483381587, 920587237],
    });
  });

  it('accepts a SampleNotification (Test Response button)', async () => {
    const res = await post(SAMPLE, header(SAMPLE));
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('sample_received');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('accepts an AnalyticsAlert and parses its AlertMessage string', async () => {
    const res = await post(ALERT, header(ALERT));
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('alert_received');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Client crash rate alert fired'));
  });

  it('returns 2xx for an EventType it does not know', async () => {
    const res = await post(UNKNOWN, header(UNKNOWN));
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('unhandled');
  });

  it('accepts header members in a different order', async () => {
    const t = nowSeconds();
    const res = await post(SAMPLE, `v1=${sign(SAMPLE, t)},t=${t}`);
    expect(res.status).toBe(200);
  });

  it('treats a repeated NotificationId as a duplicate', async () => {
    const first = await post(ERASURE, header(ERASURE));
    const second = await post(ERASURE, header(ERASURE));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing header', async () => {
    const res = await post(ERASURE);
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('missing_header');
  });

  it('rejects a header without v1', async () => {
    const res = await post(ERASURE, `t=${nowSeconds()}`);
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('missing_v1');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('rejects a signature made with another secret', async () => {
    const res = await post(ERASURE, header(ERASURE, nowSeconds(), 'some_other_secret'));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const tampered = ERASURE.replace('3141592653', '3141592654');
    const res = await post(tampered, header(ERASURE));
    expect(res.status).toBe(401);
  });

  it('rejects a body that was re-serialised with different whitespace', async () => {
    const pretty = JSON.stringify(JSON.parse(ERASURE), null, 2);
    const res = await post(pretty, header(ERASURE));
    expect(res.status).toBe(401);
  });

  it('rejects a timestamp older than 300 seconds', async () => {
    const t = nowSeconds() - 330;
    const res = await post(ERASURE, header(ERASURE, t));
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('timestamp_outside_tolerance');
  });

  it('rejects a timestamp too far in the future', async () => {
    const res = await post(ERASURE, header(ERASURE, nowSeconds() + 330));
    expect(res.status).toBe(401);
  });

  it('accepts a timestamp inside the window', async () => {
    const res = await post(ERASURE, header(ERASURE, nowSeconds() - 270));
    expect(res.status).toBe(200);
  });

  it('honours ROBLOX_WEBHOOK_TOLERANCE_SECONDS', async () => {
    process.env.ROBLOX_WEBHOOK_TOLERANCE_SECONDS = '600';
    const res = await post(ERASURE, header(ERASURE, nowSeconds() - 500));
    expect(res.status).toBe(200);
  });

  it('rejects a millisecond timestamp', async () => {
    const t = Date.now();
    const res = await post(ERASURE, header(ERASURE, t));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, header(body));
    expect(res.status).toBe(400);
  });

  it('fails closed with 500 when ROBLOX_WEBHOOK_SECRET is unset', async () => {
    delete process.env.ROBLOX_WEBHOOK_SECRET;
    const res = await post(ERASURE, header(ERASURE));
    expect(res.status).toBe(500);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
