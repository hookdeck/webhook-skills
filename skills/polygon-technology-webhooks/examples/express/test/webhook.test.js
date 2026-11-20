// Generated with: polygon-technology-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Synthetic signing key. OMS uses the cleartext signingKey as-is (UTF-8 bytes).
const SIGNING_KEY = 'oms_synthetic_signing_key_3f9a1c7e';
process.env.OMS_WEBHOOK_SIGNING_KEY = SIGNING_KEY;

const { app, verifyOmsSignature, parseSignatureHeader, effectiveSubStatus, resetStore } = require('../src/index');

const envelope = (overrides = {}) => ({
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
function sign(body, { key = SIGNING_KEY, t = now() } = {}) {
  const v1 = crypto.createHmac('sha256', key).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

const post = (body, signature) => {
  const req = request(app).post('/webhooks/polygon-technology').set('Content-Type', 'application/json');
  if (signature !== undefined) req.set('Webhook-Signature', signature);
  return req.send(body);
};

beforeEach(() => {
  process.env.OMS_WEBHOOK_SIGNING_KEY = SIGNING_KEY;
  resetStore();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyOmsSignature', () => {
  const body = JSON.stringify(envelope());

  it('accepts the docs fixture shape: t=1767225600,v1=<hex HMAC of "1767225600.<body>">', () => {
    const header = sign(body, { t: 1767225600 });
    expect(verifyOmsSignature(body, header, SIGNING_KEY, 1767225600)).toBe(true);
  });

  it('reads t and v1 by key, not position', () => {
    const t = 1767225600;
    const v1 = crypto.createHmac('sha256', SIGNING_KEY).update(`${t}.${body}`).digest('hex');
    expect(verifyOmsSignature(body, `v1=${v1}, t=${t}`, SIGNING_KEY, t)).toBe(true);
  });

  it('rejects a header missing t or v1', () => {
    const header = sign(body, { t: 1767225600 });
    const parts = parseSignatureHeader(header);
    expect(verifyOmsSignature(body, `v1=${parts.get('v1')}`, SIGNING_KEY, 1767225600)).toBe(false);
    expect(verifyOmsSignature(body, 't=1767225600', SIGNING_KEY, 1767225600)).toBe(false);
  });

  it('rejects a base64 digest: OMS sends hex', () => {
    const t = 1767225600;
    const b64 = crypto.createHmac('sha256', SIGNING_KEY).update(`${t}.${body}`).digest('base64');
    expect(verifyOmsSignature(body, `t=${t},v1=${b64}`, SIGNING_KEY, t)).toBe(false);
  });

  it('rejects an HMAC over the body alone (timestamp must be prefixed)', () => {
    const t = 1767225600;
    const v1 = crypto.createHmac('sha256', SIGNING_KEY).update(body).digest('hex');
    expect(verifyOmsSignature(body, `t=${t},v1=${v1}`, SIGNING_KEY, t)).toBe(false);
  });

  it('rejects a short signature without throwing', () => {
    expect(verifyOmsSignature(body, 't=1767225600,v1=abcd', SIGNING_KEY, 1767225600)).toBe(false);
  });

  it('applies the 300 second window in both directions', () => {
    const t = 1767225600;
    const header = sign(body, { t });
    expect(verifyOmsSignature(body, header, SIGNING_KEY, t + 300)).toBe(true);
    expect(verifyOmsSignature(body, header, SIGNING_KEY, t + 301)).toBe(false); // stale
    expect(verifyOmsSignature(body, header, SIGNING_KEY, t - 301)).toBe(false); // future-dated
  });
});

describe('effectiveSubStatus', () => {
  it('falls back to the part before the dot for unknown sub-statuses', () => {
    expect(effectiveSubStatus('processing.payoutHeld')).toBe('processing');
    expect(effectiveSubStatus('processing.underReview')).toBe('processing.underReview');
  });
});

describe('POST /webhooks/polygon-technology', () => {
  it('accepts a valid transfer.statusChanged delivery', async () => {
    const body = JSON.stringify(envelope());
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      received: true,
      id: 'evt_01m48wyjzsf4sadyyn9ts7wdrr',
      type: 'transfer.statusChanged',
      result: 'processed',
    });
  });

  it('handles a sub-status-only transaction.statusChanged (previousStatus === status)', async () => {
    const body = JSON.stringify(TRANSACTION);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('processed');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('sub-status now processing'));
  });

  it('rejects a signature made with another key', async () => {
    const body = JSON.stringify(envelope());
    expect((await post(body, sign(body, { key: 'wrong_key' }))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(envelope());
    expect((await post(body.replace('settled', 'failed'), sign(body))).status).toBe(401);
  });

  it('rejects a missing Webhook-Signature header', async () => {
    expect((await post(JSON.stringify(envelope()))).status).toBe(401);
  });

  it('rejects a stale timestamp', async () => {
    const body = JSON.stringify(envelope());
    expect((await post(body, sign(body, { t: now() - 600 }))).status).toBe(401);
  });

  it('dedupes on id (a retry)', async () => {
    const body = JSON.stringify(envelope());
    await post(body, sign(body));
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('duplicate');
  });

  it('dedupes on idempotencyKey (same change, new id)', async () => {
    const first = JSON.stringify(envelope());
    const second = JSON.stringify(envelope({ id: 'evt_01m48wyjzsf4sadyyn9ts7wdzz' }));
    await post(first, sign(first));
    const res = await post(second, sign(second));
    expect(res.body.result).toBe('duplicate');
  });

  it('skips an event older than the last one applied for the resource', async () => {
    const newer = JSON.stringify(envelope());
    const older = JSON.stringify(envelope({
      id: 'evt_01m48wyjzsf4sadyyn9ts7wd000',
      idempotencyKey: '00000000-5b34-5dcd-be8c-d1942d27e62b',
      createdAt: '2026-10-06T15:22:39.100Z',
      data: { resource: { id: 'trf_01mt5c8e0g2j4k6m8p0r2t4v6x', status: 'pending' }, previousStatus: 'initiated' },
    }));
    await post(newer, sign(newer));
    const res = await post(older, sign(older));
    expect(res.body.result).toBe('stale');
  });

  it('acknowledges an unknown event type with 200', async () => {
    const body = JSON.stringify(envelope({ type: 'somethingNew.created' }));
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('ignored');
  });

  it('ignores a pre-v1 event (empty schema)', async () => {
    const body = JSON.stringify(envelope({ schema: '' }));
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('ignored');
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
