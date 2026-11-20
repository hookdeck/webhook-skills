// Generated with: polygon-technology-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/polygon-technology/route';
import { verifyOmsSignature, effectiveSubStatus, resetStore } from '../lib/polygon-technology';

// Synthetic signing key. OMS uses the cleartext signingKey as-is (UTF-8 bytes).
const SIGNING_KEY = 'oms_synthetic_signing_key_3f9a1c7e';

const envelope = (overrides: Record<string, unknown> = {}) => ({
  id: 'evt_01m48wyjzsf4sadyyn9ts7wdrr',
  idempotencyKey: '36edb21c-5b34-5dcd-be8c-d1942d27e62b',
  type: 'transfer.statusChanged',
  createdAt: '2026-10-06T15:22:40.505Z',
  schema: 'v1',
  data: {
    resource: { id: 'trf_01mt5c8e0g2j4k6m8p0r2t4v6x', status: 'settled' },
    previousStatus: 'pending',
  },
  ...overrides,
});

const TRANSACTION = {
  id: 'evt_01m3vwfty8f9a96p8vzvc8yc5n',
  idempotencyKey: '9ab1f992-0f66-5ecf-be2d-dc7efa707933',
  type: 'transaction.statusChanged',
  createdAt: '2026-10-01T14:04:29.512Z',
  schema: 'v1',
  data: {
    resource: { id: 'txn_01mqyagza72777t0paefp51exd', status: 'processing', subStatus: 'processing.awaitingFiatOut' },
    previousStatus: 'processing',
  },
};

const now = () => Math.floor(Date.now() / 1000);

/** Build a Webhook-Signature header exactly as OMS does. */
function sign(body: string, { key = SIGNING_KEY, t = now() }: { key?: string; t?: number } = {}) {
  const v1 = crypto.createHmac('sha256', key).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

const post = (body: string, signature?: string) =>
  POST(
    new Request('http://localhost/webhooks/polygon-technology', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(signature === undefined ? {} : { 'webhook-signature': signature }),
      },
      body,
    })
  );

beforeEach(() => {
  process.env.OMS_WEBHOOK_SIGNING_KEY = SIGNING_KEY;
  resetStore();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyOmsSignature', () => {
  const body = JSON.stringify(envelope());
  const t = 1767225600;

  it('accepts t=1767225600,v1=<hex HMAC of "1767225600.<body>">', () => {
    expect(verifyOmsSignature(body, sign(body, { t }), SIGNING_KEY, t)).toBe(true);
  });

  it('reads t and v1 by key, and rejects a missing part', () => {
    const v1 = crypto.createHmac('sha256', SIGNING_KEY).update(`${t}.${body}`).digest('hex');
    expect(verifyOmsSignature(body, `v1=${v1},t=${t}`, SIGNING_KEY, t)).toBe(true);
    expect(verifyOmsSignature(body, `v1=${v1}`, SIGNING_KEY, t)).toBe(false);
    expect(verifyOmsSignature(body, `t=${t}`, SIGNING_KEY, t)).toBe(false);
  });

  it('rejects base64, an unprefixed HMAC and a short signature', () => {
    const b64 = crypto.createHmac('sha256', SIGNING_KEY).update(`${t}.${body}`).digest('base64');
    const bodyOnly = crypto.createHmac('sha256', SIGNING_KEY).update(body).digest('hex');
    expect(verifyOmsSignature(body, `t=${t},v1=${b64}`, SIGNING_KEY, t)).toBe(false);
    expect(verifyOmsSignature(body, `t=${t},v1=${bodyOnly}`, SIGNING_KEY, t)).toBe(false);
    expect(verifyOmsSignature(body, `t=${t},v1=abcd`, SIGNING_KEY, t)).toBe(false);
  });

  it('applies the 300 second window in both directions', () => {
    const header = sign(body, { t });
    expect(verifyOmsSignature(body, header, SIGNING_KEY, t + 300)).toBe(true);
    expect(verifyOmsSignature(body, header, SIGNING_KEY, t + 301)).toBe(false);
    expect(verifyOmsSignature(body, header, SIGNING_KEY, t - 301)).toBe(false);
  });

  it('falls back to the sub-status prefix for unknown values', () => {
    expect(effectiveSubStatus('processing.payoutHeld')).toBe('processing');
    expect(effectiveSubStatus('processing.underReview')).toBe('processing.underReview');
  });
});

describe('POST /webhooks/polygon-technology', () => {
  it('accepts a valid transfer.statusChanged delivery', async () => {
    const body = JSON.stringify(envelope());
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      received: true,
      id: 'evt_01m48wyjzsf4sadyyn9ts7wdrr',
      type: 'transfer.statusChanged',
      result: 'processed',
    });
  });

  it('handles a sub-status-only transaction.statusChanged', async () => {
    const body = JSON.stringify(TRANSACTION);
    const res = await post(body, sign(body));
    expect((await res.json()).result).toBe('processed');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('sub-status now processing'));
  });

  it('rejects another key, a tampered body, a missing header and a stale timestamp', async () => {
    const body = JSON.stringify(envelope());
    expect((await post(body, sign(body, { key: 'wrong_key' }))).status).toBe(401);
    expect((await post(body.replace('settled', 'failed'), sign(body))).status).toBe(401);
    expect((await post(body)).status).toBe(401);
    expect((await post(body, sign(body, { t: now() - 600 }))).status).toBe(401);
  });

  it('dedupes on id and on idempotencyKey', async () => {
    const first = JSON.stringify(envelope());
    const sameId = first;
    const sameKey = JSON.stringify(envelope({ id: 'evt_01m48wyjzsf4sadyyn9ts7wdzz' }));
    await post(first, sign(first));
    expect((await (await post(sameId, sign(sameId))).json()).result).toBe('duplicate');
    expect((await (await post(sameKey, sign(sameKey))).json()).result).toBe('duplicate');
  });

  it('skips an event older than the last one applied for the resource', async () => {
    const newer = JSON.stringify(envelope());
    const older = JSON.stringify(envelope({
      id: 'evt_01m48wyjzsf4sadyyn9ts7wd000',
      idempotencyKey: '00000000-5b34-5dcd-be8c-d1942d27e62b',
      createdAt: '2026-10-06T15:22:39.100Z',
    }));
    await post(newer, sign(newer));
    expect((await (await post(older, sign(older))).json()).result).toBe('stale');
  });

  it('acknowledges an unknown type and a pre-v1 event with 200', async () => {
    const unknown = JSON.stringify(envelope({ type: 'somethingNew.created' }));
    const legacy = JSON.stringify(envelope({ id: 'evt_legacy', idempotencyKey: 'legacy', schema: '' }));
    const r1 = await post(unknown, sign(unknown));
    const r2 = await post(legacy, sign(legacy));
    expect(r1.status).toBe(200);
    expect((await r1.json()).result).toBe('ignored');
    expect(r2.status).toBe(200);
    expect((await r2.json()).result).toBe('ignored');
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when OMS_WEBHOOK_SIGNING_KEY is not set', async () => {
    delete process.env.OMS_WEBHOOK_SIGNING_KEY;
    const body = JSON.stringify(envelope());
    expect((await post(body, sign(body))).status).toBe(500);
  });
});
