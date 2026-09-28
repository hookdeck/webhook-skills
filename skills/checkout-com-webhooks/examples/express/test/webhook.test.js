// Generated with: checkout-com-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');

// Set env BEFORE requiring the app — the handler reads process.env per request,
// but the startup warning reads it at require time.
//
// Checkout.com signature keys are arbitrary UTF-8 strings used AS-IS as the
// HMAC key. This is the shape used in Checkout.com's own SDK tests.
process.env.CHECKOUT_WEBHOOK_SIGNATURE_KEY = '8V8x0dLK%AyD*DNS8JJr';
delete process.env.CHECKOUT_WEBHOOK_AUTHORIZATION_KEY;

const request = require('supertest');
const { app, verifyCkoSignature, verifyAuthorizationKey, formatAmount } = require('../src/index');

const SIGNATURE_KEY = process.env.CHECKOUT_WEBHOOK_SIGNATURE_KEY;

/**
 * Generate a real Cko-Signature exactly as Checkout.com does:
 * HMAC-SHA256 over the RAW body, keyed with the signature key used as-is,
 * hex-encoded (Base16). No prefix, no timestamp, no version tag.
 */
function generateSignature(rawBody, key = SIGNATURE_KEY) {
  return crypto.createHmac('sha256', key).update(rawBody).digest('hex');
}

// The documented payment_approved envelope, trimmed from Checkout.com's documented example.
const PAYMENT_APPROVED = {
  id: 'evt_caxmnvuvbe4elkbdx2imwbnjxu',
  type: 'payment_approved',
  version: '1.0.29',
  created_on: '2023-05-22T11:56:04.8821546Z',
  data: {
    id: 'pay_griq7wyqkggu7mnk7ecm6ysrl4',
    action_id: 'act_gl5cpqgccxeulozrvaassd4lta',
    reference: 'ORD-5023-4E89',
    amount: 20,
    currency: 'USD',
    response_code: '10000',
    response_summary: 'Approved',
    metadata: { coupon_code: 'NY2018' },
  },
  _links: {
    self: {
      href: 'https://api.checkout.com/workflows/events/evt_caxmnvuvbe4elkbdx2imwbnjxu',
    },
  },
};

// payment_captured uses `timestamp`, NOT `created_on` — the field name really
// does vary by event in Checkout.com's own documented examples.
const PAYMENT_CAPTURED = {
  id: 'evt_2ifvgjxdzcuevoqdmsbybjfhtm',
  type: 'payment_captured',
  version: '1.0.29',
  timestamp: '2023-05-22T12:02:11.1234567Z',
  data: {
    id: 'pay_griq7wyqkggu7mnk7ecm6ysrl4',
    action_id: 'act_x6sbfnzkhcpezjqrbwqaa7cdwe',
    amount: 20,
    currency: 'USD',
    response_code: '10000',
    response_summary: 'Approved',
  },
};

const DISPUTE_RECEIVED = {
  id: 'evt_lbyzcfnm3wtuxnwqbdo2xqfpwm',
  type: 'dispute_received',
  version: '1.0.29',
  created_on: '2023-06-01T09:14:33.4820000Z',
  data: {
    id: 'dsp_vgy3kkv2qqgurmkzqj5d3lzwya',
    payment_id: 'pay_griq7wyqkggu7mnk7ecm6ysrl4',
    amount: 20,
    currency: 'USD',
    reason_code: '10.4',
  },
};

function post(payload, { signature, authorization, rawBody } = {}) {
  const body = rawBody ?? JSON.stringify(payload);
  const req = request(app)
    .post('/webhooks/checkout-com')
    .set('Content-Type', 'application/json');

  const sig = signature === undefined ? generateSignature(body) : signature;
  if (sig !== null) req.set('Cko-Signature', sig);
  if (authorization) req.set('Authorization', authorization);

  return req.send(body);
}

describe('Cko-Signature verification', () => {
  test('accepts a valid signature', async () => {
    const res = await post(PAYMENT_APPROVED);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('rejects a tampered body with the original signature', async () => {
    const original = JSON.stringify(PAYMENT_APPROVED);
    const signature = generateSignature(original);
    const tampered = JSON.stringify({
      ...PAYMENT_APPROVED,
      data: { ...PAYMENT_APPROVED.data, amount: 9999999 },
    });

    const res = await post(null, { rawBody: tampered, signature });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with the wrong key', async () => {
    const body = JSON.stringify(PAYMENT_APPROVED);
    const res = await post(null, {
      rawBody: body,
      signature: generateSignature(body, 'not-the-right-key'),
    });
    expect(res.status).toBe(401);
  });

  test('rejects a missing Cko-Signature header with 401', async () => {
    const res = await post(PAYMENT_APPROVED, { signature: null });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing Cko-Signature header');
  });

  test('rejects a garbage signature without throwing (length guard)', async () => {
    // A short value would make crypto.timingSafeEqual throw RangeError without
    // the length guard, surfacing as a 500 that Checkout.com would retry.
    const res = await post(PAYMENT_APPROVED, { signature: 'nope' });
    expect(res.status).toBe(401);
  });

  test('accepts an UPPERCASE hex signature', async () => {
    const body = JSON.stringify(PAYMENT_APPROVED);
    const res = await post(null, {
      rawBody: body,
      signature: generateSignature(body).toUpperCase(),
    });
    expect(res.status).toBe(200);
  });

  test('tolerates surrounding whitespace in the header', async () => {
    const body = JSON.stringify(PAYMENT_APPROVED);
    const res = await post(null, { rawBody: body, signature: `  ${generateSignature(body)}  ` });
    expect(res.status).toBe(200);
  });

  test('rejects a sha256=-prefixed signature (Checkout.com sends a bare digest)', async () => {
    const body = JSON.stringify(PAYMENT_APPROVED);
    const res = await post(null, {
      rawBody: body,
      signature: `sha256=${generateSignature(body)}`,
    });
    expect(res.status).toBe(401);
  });

  test('rejects a base64 digest (Checkout.com uses hex)', async () => {
    const body = JSON.stringify(PAYMENT_APPROVED);
    const base64 = crypto.createHmac('sha256', SIGNATURE_KEY).update(body).digest('base64');
    const res = await post(null, { rawBody: body, signature: base64 });
    expect(res.status).toBe(401);
  });

  test('verifies the RAW bytes, not a re-serialized body', async () => {
    // Checkout.com signs the exact bytes it sent. This body is semantically
    // identical to PAYMENT_APPROVED but formatted differently — a handler that
    // re-serialized before hashing would compute a different digest.
    const pretty = JSON.stringify(PAYMENT_APPROVED, null, 2);
    const res = await post(null, { rawBody: pretty, signature: generateSignature(pretty) });
    expect(res.status).toBe(200);
  });

  test('verifies a body containing special characters (©, ®, ™)', async () => {
    // Checkout.com warns that re-serializing can mangle these.
    const payload = {
      ...PAYMENT_APPROVED,
      data: { ...PAYMENT_APPROVED.data, reference: 'Acme© Ltd® — Widget™' },
    };
    const body = JSON.stringify(payload);
    const res = await post(null, { rawBody: body, signature: generateSignature(body) });
    expect(res.status).toBe(200);
  });

  test('returns 400 for a verified request with an unparseable body', async () => {
    const body = 'not json at all';
    const res = await post(null, { rawBody: body, signature: generateSignature(body) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });
});

describe('Authorization key (optional second mechanism)', () => {
  afterEach(() => {
    delete process.env.CHECKOUT_WEBHOOK_AUTHORIZATION_KEY;
  });

  test('is skipped entirely when no key is configured', async () => {
    const res = await post(PAYMENT_APPROVED);
    expect(res.status).toBe(200);
  });

  test('accepts the configured key sent verbatim (no Bearer prefix)', async () => {
    process.env.CHECKOUT_WEBHOOK_AUTHORIZATION_KEY = 'secret-key';
    const res = await post(PAYMENT_APPROVED, { authorization: 'secret-key' });
    expect(res.status).toBe(200);
  });

  test('rejects a wrong Authorization key even with a valid signature', async () => {
    process.env.CHECKOUT_WEBHOOK_AUTHORIZATION_KEY = 'secret-key';
    const res = await post(PAYMENT_APPROVED, { authorization: 'wrong-key' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid Authorization key');
  });

  test('rejects a missing Authorization header when a key is configured', async () => {
    process.env.CHECKOUT_WEBHOOK_AUTHORIZATION_KEY = 'secret-key';
    const res = await post(PAYMENT_APPROVED);
    expect(res.status).toBe(401);
  });

  test('rejects a Bearer-prefixed value — Checkout.com sends the key verbatim', async () => {
    process.env.CHECKOUT_WEBHOOK_AUTHORIZATION_KEY = 'secret-key';
    const res = await post(PAYMENT_APPROVED, { authorization: 'Bearer secret-key' });
    expect(res.status).toBe(401);
  });
});

describe('fail-closed behaviour', () => {
  test('returns 500 when the signature key is unset (never accepts unverified)', async () => {
    const saved = process.env.CHECKOUT_WEBHOOK_SIGNATURE_KEY;
    delete process.env.CHECKOUT_WEBHOOK_SIGNATURE_KEY;
    try {
      const res = await request(app)
        .post('/webhooks/checkout-com')
        .set('Content-Type', 'application/json')
        .set('Cko-Signature', 'anything')
        .send(JSON.stringify(PAYMENT_APPROVED));
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Webhook signature key not configured');
    } finally {
      process.env.CHECKOUT_WEBHOOK_SIGNATURE_KEY = saved;
    }
  });
});

describe('event handling', () => {
  test('handles payment_captured, which carries `timestamp` not `created_on`', async () => {
    const res = await post(PAYMENT_CAPTURED);
    expect(res.status).toBe(200);
    expect(PAYMENT_CAPTURED.created_on).toBeUndefined();
    expect(PAYMENT_CAPTURED.created_on ?? PAYMENT_CAPTURED.timestamp).toBe(
      '2023-05-22T12:02:11.1234567Z'
    );
  });

  test('handles dispute_received, where data.id is a dispute and data.payment_id the payment', async () => {
    const res = await post(DISPUTE_RECEIVED);
    expect(res.status).toBe(200);
    expect(DISPUTE_RECEIVED.data.id.startsWith('dsp_')).toBe(true);
    expect(DISPUTE_RECEIVED.data.payment_id.startsWith('pay_')).toBe(true);
  });

  test('acknowledges an unknown event type with 200', async () => {
    const res = await post({
      id: 'evt_unknownunknownunknownunknow',
      type: 'not_a_real_event_type',
      version: '1.0.29',
      created_on: '2023-05-22T11:56:04.8821546Z',
      data: { id: 'crd_abc' },
    });
    expect(res.status).toBe(200);
  });
});

describe('verifyCkoSignature (unit)', () => {
  test('returns true for a matching signature', () => {
    const body = Buffer.from(JSON.stringify(PAYMENT_APPROVED), 'utf8');
    expect(verifyCkoSignature(body, generateSignature(body), SIGNATURE_KEY)).toBe(true);
  });

  test('returns false when the key is undefined (fails closed)', () => {
    const body = Buffer.from(JSON.stringify(PAYMENT_APPROVED), 'utf8');
    expect(verifyCkoSignature(body, generateSignature(body), undefined)).toBe(false);
  });

  test('returns false when the header is undefined (fails closed)', () => {
    const body = Buffer.from(JSON.stringify(PAYMENT_APPROVED), 'utf8');
    expect(verifyCkoSignature(body, undefined, SIGNATURE_KEY)).toBe(false);
  });

  test('uses the key AS-IS — a hex/base64-decoded key does not match', () => {
    const body = Buffer.from('{}', 'utf8');
    const correct = generateSignature(body, SIGNATURE_KEY);
    const decodedKeyDigest = crypto
      .createHmac('sha256', Buffer.from(SIGNATURE_KEY, 'base64'))
      .update(body)
      .digest('hex');
    expect(correct).not.toBe(decodedKeyDigest);
  });

  test('produces a 64-character lowercase hex digest', () => {
    const sig = generateSignature('{}');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verifyAuthorizationKey (unit)', () => {
  test('returns true when no key is configured', () => {
    expect(verifyAuthorizationKey(undefined, undefined)).toBe(true);
    expect(verifyAuthorizationKey('anything', '')).toBe(true);
  });

  test('compares the whole value', () => {
    expect(verifyAuthorizationKey('secret-key', 'secret-key')).toBe(true);
    expect(verifyAuthorizationKey('secret-key-extra', 'secret-key')).toBe(false);
    expect(verifyAuthorizationKey(undefined, 'secret-key')).toBe(false);
  });
});

describe('formatAmount', () => {
  test('treats amount as the minor currency unit', () => {
    // The documented example: amount 20, currency USD, is $0.20 — not $20.
    expect(formatAmount(20, 'USD')).toBe('0.20 USD');
    expect(formatAmount(1999, 'GBP')).toBe('19.99 GBP');
  });

  test('handles a missing amount', () => {
    expect(formatAmount(undefined, 'USD')).toBe('n/a');
  });
});

describe('health check', () => {
  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
