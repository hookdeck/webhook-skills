// Generated with: autumn-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'node:crypto';
import { jest } from '@jest/globals';
import request from 'supertest';

// Svix secrets are "whsec_" + base64(key bytes). The HMAC key is the
// base64-DECODED part after "whsec_".
const SECRET = 'whsec_' + Buffer.from('autumn-test-signing-key-0123456').toString('base64');
const OTHER_SECRET = 'whsec_' + Buffer.from('some-other-webhook-signing-key00').toString('base64');

process.env.AUTUMN_WEBHOOK_SECRET = SECRET;

// Import after setting the env var
const { app } = await import('../src/index.js');

/** Sign exactly like Autumn (Svix). */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

function signedHeaders(rawBody, opts = {}) {
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'Content-Type': opts.contentType ?? 'application/json',
    'svix-id': id,
    'svix-timestamp': ts,
    'svix-signature': opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/autumn').set(headers).send(rawBody);
}

const PAYLOADS = {
  'billing.updated': {
    object: 'billing.updated',
    customer_id: 'user_123',
    plan_changes: [
      {
        action: 'updated',
        subscription: { plan_id: 'pro', status: 'active', past_due: false, canceled_at: 1761840000000 },
        previous_attributes: { canceled_at: null, expires_at: null },
        item_changes: [],
      },
    ],
    tags: ['trial_ended'],
  },
  'customer.products.updated': {
    customer_id: 'user_123',
    plan_changes: [{ action: 'activated', purchase: { plan_id: 'credits_pack', status: 'active' } }],
    tags: [],
  },
  'balances.limit_reached': { customer_id: 'user_123', feature_id: 'api_calls', limit_type: 'included' },
  'balances.usage_alert_triggered': {
    customer_id: 'user_123',
    feature_id: 'api_calls',
    usage_alert: { name: '80% usage warning', threshold: 80, threshold_type: 'usage_percentage' },
  },
  'billing.auto_topup_succeeded': {
    customer_id: 'user_123',
    feature_id: 'credits',
    quantity_granted: 1000,
    threshold: 500,
    balance_after: 1450,
    invoice_mode: false,
    invoice: { stripe_id: 'in_1A2B3C4D5E6F', status: 'paid', total: 1000, currency: 'usd' },
  },
  'billing.auto_topup_failed': {
    customer_id: 'user_123',
    feature_id: 'credits',
    reason: 'charge_failed',
    quantity: 1000,
    threshold: 500,
    balance: 250,
    invoice_mode: false,
    error: { code: 'card_declined', message: 'Your card was declined.', type: 'card_error' },
  },
  'invoice.finalized': {
    id: 'inv_123',
    stripe_id: 'in_1A2B3C4D5E6F',
    customer_id: 'user_123',
    status: 'paid',
    total: 2000,
    currency: 'usd',
    plan_ids: ['pro'],
    items: [],
  },
};

function eventBody(type, data = PAYLOADS[type]) {
  return JSON.stringify({ type, data });
}

beforeEach(() => {
  process.env.AUTUMN_WEBHOOK_SECRET = SECRET;
  delete process.env.AUTUMN_TIMESTAMP_TOLERANCE_SECONDS;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('valid signatures', () => {
  it.each(Object.keys(PAYLOADS))('accepts %s', async (type) => {
    const body = eventBody(type);
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('dispatches on the body type', async () => {
    const body = eventBody('balances.limit_reached');
    await post(body, signedHeaders(body));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Limit reached (included) on api_calls'));
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = eventBody('something.new', {});
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith('Unhandled Autumn event type: something.new');
  });

  it('verifies regardless of content type', async () => {
    const body = eventBody('billing.updated');
    for (const contentType of ['application/json; charset=utf-8', 'text/plain', 'application/octet-stream']) {
      const res = await post(body, signedHeaders(body, { contentType }));
      expect(res.status).toBe(200);
    }
  });

  it('accepts when any one of several space-delimited signatures matches', async () => {
    const body = eventBody('billing.updated');
    const headers = signedHeaders(body);
    headers['svix-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWduYXR1cmU= ${headers['svix-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });
});

describe('invalid requests', () => {
  it('rejects a tampered body', async () => {
    const body = eventBody('billing.updated');
    const headers = signedHeaders(body);
    const res = await post(body.replace('user_123', 'user_999'), headers);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid signature' });
  });

  it('rejects a signature made with another webhook secret', async () => {
    const body = eventBody('billing.updated');
    const res = await post(body, signedHeaders(body, { secret: OTHER_SECRET }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp in the future', async () => {
    const body = eventBody('billing.updated');
    const res = await post(body, signedHeaders(body, { timestamp: now() + 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects a malformed signature header', async () => {
    const body = eventBody('billing.updated');
    const res = await post(body, signedHeaders(body, { signature: 'garbage' }));
    expect(res.status).toBe(400);
  });

  it.each(['svix-id', 'svix-timestamp', 'svix-signature'])('rejects a missing %s header', async (name) => {
    const body = eventBody('billing.updated');
    const headers = signedHeaders(body);
    delete headers[name];
    const res = await post(body, headers);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Missing Svix signature headers' });
  });

  it('fails closed with 500 when the secret is not configured', async () => {
    delete process.env.AUTUMN_WEBHOOK_SECRET;
    const body = eventBody('billing.updated');
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});

describe('timestamp window (Hookdeck retries and replays resend the original timestamp)', () => {
  const tenMinutesAgo = () => now() - 600;
  const twoDaysAgo = () => now() - 2 * 24 * 3600;

  it('svix library rejects a valid signature older than 5 minutes', async () => {
    const body = eventBody('billing.updated');
    const res = await post(body, signedHeaders(body, { timestamp: tenMinutesAgo() }));
    expect(res.status).toBe(400);
  });

  it('manual verifier with a widened window accepts a late retry', async () => {
    process.env.AUTUMN_TIMESTAMP_TOLERANCE_SECONDS = '86400';
    const body = eventBody('billing.updated');
    const res = await post(body, signedHeaders(body, { timestamp: tenMinutesAgo() }));
    expect(res.status).toBe(200);
  });

  it('manual verifier still rejects timestamps outside the widened window', async () => {
    process.env.AUTUMN_TIMESTAMP_TOLERANCE_SECONDS = '86400';
    const body = eventBody('billing.updated');
    const res = await post(body, signedHeaders(body, { timestamp: twoDaysAgo() }));
    expect(res.status).toBe(400);
  });

  it('manual verifier with the window off accepts any age', async () => {
    process.env.AUTUMN_TIMESTAMP_TOLERANCE_SECONDS = 'off';
    const body = eventBody('billing.updated');
    const res = await post(body, signedHeaders(body, { timestamp: twoDaysAgo() }));
    expect(res.status).toBe(200);
  });

  it('manual verifier still rejects a bad signature and a wrong secret', async () => {
    process.env.AUTUMN_TIMESTAMP_TOLERANCE_SECONDS = 'off';
    const body = eventBody('billing.updated');
    const bad = await post(body, signedHeaders(body, { signature: 'v1,AAAA' }));
    expect(bad.status).toBe(400);
    const wrong = await post(body, signedHeaders(body, { secret: OTHER_SECRET }));
    expect(wrong.status).toBe(400);
  });

  it('manual verifier checks every v1 entry', async () => {
    process.env.AUTUMN_TIMESTAMP_TOLERANCE_SECONDS = 'off';
    const body = eventBody('billing.updated');
    const headers = signedHeaders(body);
    headers['svix-signature'] = `v1,AAAA v2,ignored ${headers['svix-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });
});

describe('deduplication', () => {
  it('acknowledges a retry with the same svix-id without reprocessing', async () => {
    const body = eventBody('billing.auto_topup_failed');
    const headers = signedHeaders(body, { id: 'msg_dedupe_1' });

    const first = await post(body, headers);
    expect(first.body).toEqual({ received: true });

    const second = await post(body, headers);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });
});

describe('health', () => {
  it('responds on /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
