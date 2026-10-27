const crypto = require('crypto');
const request = require('supertest');

// Set test environment variables before importing the app
process.env.CREEM_WEBHOOK_SECRET = 'whsec_test_creem_secret_0123456789';

const app = require('../src/index');
const { verifyCreemSignature } = require('../src/index');

const SECRET = process.env.CREEM_WEBHOOK_SECRET;

// Shape follows Creem's documented samples: top-level id (evt_...), eventType, created_at and
// the resource under `object`.
function samplePayload(eventType = 'checkout.completed') {
  return {
    id: 'evt_5WHHcZPv7VS0YUsberIuOz',
    eventType,
    created_at: 1728734325927,
    object: { id: 'ch_4l0N34kxo16AhRKUHFUuXr', object: 'checkout', status: 'completed' },
  };
}

// creem-signature = lowercase hex HMAC-SHA256 of the raw body, keyed with the signing secret
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app).post('/webhooks/creem').set('Content-Type', contentType).send(body);
}

describe('Creem webhook endpoint', () => {
  it('accepts a valid signature', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await post(body).set('creem-signature', sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts an uppercase hex signature', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await post(body).set('creem-signature', sign(body).toUpperCase());
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await post(body, 'text/plain').set('creem-signature', sign(body));
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes received, including odd whitespace', async () => {
    const body = '{ "eventType" :   "checkout.completed" }\n';
    const res = await post(body).set('creem-signature', sign(body));
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await post(body).set('creem-signature', sign(body, 'wrong_secret'));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await post(JSON.stringify(samplePayload('refund.created'))).set(
      'creem-signature',
      sign(body)
    );
    expect(res.status).toBe(401);
  });

  it('rejects a random 64-hex signature', async () => {
    const random = crypto.randomBytes(32).toString('hex');
    const res = await post().set('creem-signature', random);
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature', async () => {
    const res = await post();
    expect(res.status).toBe(401);
  });

  it('rejects a signature that is not 64 hex characters', async () => {
    const body = JSON.stringify(samplePayload());
    const good = sign(body);
    for (const bad of ['', 'abc', good.slice(0, 62), good + '00', 'z'.repeat(64), `sha256=${good}`]) {
      const res = await post(body).set('creem-signature', bad);
      expect(res.status).toBe(401);
    }
  });

  it('rejects a signature with trailing junk that hex decoding would truncate', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await post(body).set('creem-signature', sign(body).slice(0, 62) + 'zz');
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON after verifying the signature', async () => {
    const res = await post('not json').set('creem-signature', sign('not json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    const res = await post('[1,2]').set('creem-signature', sign('[1,2]'));
    expect(res.status).toBe(400);
  });

  it.each([
    'checkout.completed',
    'subscription.active',
    'subscription.paid',
    'subscription.canceled',
    'subscription.scheduled_cancel',
    'subscription.past_due',
    'subscription.unpaid',
    'subscription.expired',
    'subscription.update',
    'subscription.trialing',
    'subscription.paused',
    'refund.created',
    'dispute.created',
    'credits.granted',
    'credits.consumed',
    'credits.auto_recharged',
    'customer_credits.exhausted',
    'something.else'
  ])('returns 200 for %s', async (eventType) => {
    const body = JSON.stringify(samplePayload(eventType));
    const res = await post(body).set('creem-signature', sign(body));
    expect(res.status).toBe(200);
  });

  describe('verifyCreemSignature', () => {
    const body = Buffer.from(JSON.stringify(samplePayload()));

    it('accepts a matching signature', () => {
      expect(verifyCreemSignature(body, sign(body), SECRET)).toBe(true);
    });

    it('rejects when no secret is configured', () => {
      expect(verifyCreemSignature(body, sign(body, ''), '')).toBe(false);
      // An undefined argument falls back to the env var, so unset it to test "not configured"
      delete process.env.CREEM_WEBHOOK_SECRET;
      try {
        expect(verifyCreemSignature(body, sign(body))).toBe(false);
      } finally {
        process.env.CREEM_WEBHOOK_SECRET = SECRET;
      }
    });

    it('rejects non-string and non-hex signatures without throwing', () => {
      expect(verifyCreemSignature(body, undefined, SECRET)).toBe(false);
      expect(verifyCreemSignature(body, ['a'], SECRET)).toBe(false);
      expect(verifyCreemSignature(body, 'é'.repeat(64), SECRET)).toBe(false);
    });
  });
});
