const crypto = require('crypto');
const request = require('supertest');

// Set test environment variables before importing the app
const SECRET = 'test_purchasely_webhook_secret_0123456789';
process.env.PURCHASELY_WEBHOOK_SECRET = SECRET;
delete process.env.PURCHASELY_WEBHOOK_TOLERANCE_SECONDS;

const app = require('../src/index');
const { verifyPurchaselyRequest, computePurchaselySignature } = require('../src/index');

// Independent signer: HMAC-SHA256 hex over timestamp + body, no separator.
function sign(body, timestamp, secret = SECRET) {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from(body)]))
    .digest('hex');
}

const nowTs = () => String(Math.floor(Date.now() / 1000));

// Payload shapes follow the documented samples (SUBSCRIPTION_STARTED, TRANSACTION_PROCESSED, ...)
function samplePayload(eventName = 'SUBSCRIPTION_STARTED', eventId = `evt_${Math.random()}`) {
  return {
    api_version: 3,
    event_id: eventId,
    event_name: eventName,
    event_created_at: '2023-12-12T13:51:04.953Z',
    environment: 'SANDBOX',
    plan: 'monthly',
    product: 'PURCHASELY_PLUS',
    purchasely_subscription_id: 'subs_D7GnVQbUxvY6YxoeK6nhyPDkmyCVcfe',
    store: 'GOOGLE_PLAY_STORE',
    subscription_status: 'AUTO_RENEWING',
    user_id: 'user_123',
    amount_in_eur: 9.99,
  };
}

function post(body, headers = {}, contentType = 'application/json') {
  const text = body === undefined ? JSON.stringify(samplePayload()) : body;
  return request(app)
    .post('/webhooks/purchasely')
    .set('Content-Type', contentType)
    .set(headers)
    .send(text);
}

function signedPost(body, { timestamp = nowTs(), secret = SECRET, contentType } = {}) {
  const text = body === undefined ? JSON.stringify(samplePayload()) : body;
  return post(
    text,
    {
      'X-PURCHASELY-TIMESTAMP': timestamp,
      'X-PURCHASELY-REQUEST-SIGNATURE': sign(text, timestamp, secret),
    },
    contentType
  );
}

describe('Purchasely webhook endpoint', () => {
  describe('Published test vector (docs example)', () => {
    // From https://docs.purchasely.com/docs/webhook: secret "foobar", timestamp 1698322022
    const vector = {
      secret: 'foobar',
      body: '{"a_random_key":"a_random_value_ad"}',
      headers: {
        'x-purchasely-timestamp': '1698322022',
        'x-purchasely-request-signature': 'f3c2a452e9ea72f41107321aeaf7999f1054148866a710c9b23f9f501785e2a4',
      },
    };

    it('computes the documented signature', () => {
      const sig = computePurchaselySignature(vector.headers['x-purchasely-timestamp'], Buffer.from(vector.body), vector.secret);
      expect(sig).toBe('f3c2a452e9ea72f41107321aeaf7999f1054148866a710c9b23f9f501785e2a4');
    });

    it('verifies the documented request', () => {
      expect(verifyPurchaselyRequest(vector.headers, Buffer.from(vector.body), vector.secret, 0)).toBe(true);
    });

    it('rejects the documented request under a different secret', () => {
      expect(verifyPurchaselyRequest(vector.headers, Buffer.from(vector.body), 'foobaz', 0)).toBe(false);
    });
  });

  describe('Signature verification', () => {
    it('accepts a correctly signed request', async () => {
      const res = await signedPost();
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts any content type (raw body is verified)', async () => {
      const res = await signedPost(undefined, { contentType: 'text/plain' });
      expect(res.status).toBe(200);
    });

    it('accepts an uppercase hex digest', async () => {
      const body = JSON.stringify(samplePayload());
      const ts = nowTs();
      const res = await post(body, {
        'X-PURCHASELY-TIMESTAMP': ts,
        'X-PURCHASELY-REQUEST-SIGNATURE': sign(body, ts).toUpperCase(),
      });
      expect(res.status).toBe(200);
    });

    it('verifies multi-byte bodies byte for byte', async () => {
      const res = await signedPost(JSON.stringify({ ...samplePayload(), plan: 'mensuel é €' }));
      expect(res.status).toBe(200);
    });

    it('rejects a missing signature', async () => {
      const res = await post(undefined, { 'X-PURCHASELY-TIMESTAMP': nowTs() });
      expect(res.status).toBe(401);
    });

    it('rejects a missing timestamp', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await post(body, { 'X-PURCHASELY-REQUEST-SIGNATURE': sign(body, '') });
      expect(res.status).toBe(401);
    });

    it('rejects an empty signature header', async () => {
      const res = await post(undefined, { 'X-PURCHASELY-TIMESTAMP': nowTs(), 'X-PURCHASELY-REQUEST-SIGNATURE': '' });
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const ts = nowTs();
      const signed = JSON.stringify(samplePayload('SUBSCRIPTION_STARTED', 'evt_a'));
      const res = await post(JSON.stringify(samplePayload('SUBSCRIPTION_STARTED', 'evt_b')), {
        'X-PURCHASELY-TIMESTAMP': ts,
        'X-PURCHASELY-REQUEST-SIGNATURE': sign(signed, ts),
      });
      expect(res.status).toBe(401);
    });

    it('rejects a signature made over a different timestamp', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await post(body, {
        'X-PURCHASELY-TIMESTAMP': nowTs(),
        'X-PURCHASELY-REQUEST-SIGNATURE': sign(body, '1698322022'),
      });
      expect(res.status).toBe(401);
    });

    it('rejects a signature made with another secret', async () => {
      const res = await signedPost(undefined, { secret: 'another_secret' });
      expect(res.status).toBe(401);
    });

    it('rejects a prefixed digest (Purchasely sends bare hex)', async () => {
      const body = JSON.stringify(samplePayload());
      const ts = nowTs();
      const res = await post(body, {
        'X-PURCHASELY-TIMESTAMP': ts,
        'X-PURCHASELY-REQUEST-SIGNATURE': `sha256=${sign(body, ts)}`,
      });
      expect(res.status).toBe(401);
    });

    it('rejects a 64-character value that is not hex', async () => {
      const res = await post(undefined, {
        'X-PURCHASELY-TIMESTAMP': nowTs(),
        'X-PURCHASELY-REQUEST-SIGNATURE': 'z'.repeat(64),
      });
      expect(res.status).toBe(401);
    });

    it('rejects a digest of the wrong length', async () => {
      const body = JSON.stringify(samplePayload());
      const ts = nowTs();
      const res = await post(body, {
        'X-PURCHASELY-TIMESTAMP': ts,
        'X-PURCHASELY-REQUEST-SIGNATURE': sign(body, ts).slice(0, 62),
      });
      expect(res.status).toBe(401);
    });

    it('does not use the deprecated X-PURCHASELY-SIGNATURE header', async () => {
      const body = JSON.stringify(samplePayload());
      const ts = nowTs();
      const res = await post(body, { 'X-PURCHASELY-TIMESTAMP': ts, 'X-PURCHASELY-SIGNATURE': sign(body, ts) });
      expect(res.status).toBe(401);
    });
  });

  describe('Timestamp tolerance (opt-in)', () => {
    const body = '{"event_name":"SUBSCRIPTION_STARTED"}';
    const oldTs = String(Math.floor(Date.now() / 1000) - 86400);
    const headers = { 'x-purchasely-timestamp': oldTs, 'x-purchasely-request-signature': sign(body, oldTs) };

    it('accepts old timestamps by default (retries and replays resend them)', async () => {
      const res = await post(body, headers);
      expect(res.status).toBe(200);
    });

    it('rejects old timestamps when a tolerance is set', () => {
      expect(verifyPurchaselyRequest(headers, Buffer.from(body), SECRET, 300)).toBe(false);
    });

    it('accepts recent timestamps when a tolerance is set', () => {
      const ts = nowTs();
      const h = { 'x-purchasely-timestamp': ts, 'x-purchasely-request-signature': sign(body, ts) };
      expect(verifyPurchaselyRequest(h, Buffer.from(body), SECRET, 300)).toBe(true);
    });

    it('treats 0 as off', () => {
      expect(verifyPurchaselyRequest(headers, Buffer.from(body), SECRET, 0)).toBe(true);
    });
  });

  describe('Request handling', () => {
    it('returns 400 for a signed body that is not JSON', async () => {
      const res = await signedPost('{not json');
      expect(res.status).toBe(400);
    });

    it('returns 400 for a signed JSON array', async () => {
      const res = await signedPost('[1,2,3]');
      expect(res.status).toBe(400);
    });

    it('answers exactly 200 for every handled event and unknown events', async () => {
      const names = [
        'SUBSCRIPTION_STARTED', 'SUBSCRIPTION_RENEWED', 'RENEWAL_DISABLED', 'GRACE_PERIOD_STARTED',
        'ENTERED_BILLING_RETRY', 'SUBSCRIPTION_TERMINATED', 'TRANSACTION_PROCESSED', 'ACTIVATE',
        'SOMETHING_NEW',
      ];
      for (const name of names) {
        const res = await signedPost(JSON.stringify(samplePayload(name)));
        expect(res.status).toBe(200);
        expect(res.body.duplicate).toBeUndefined();
      }
    });

    it('skips a retried event with the same event_id', async () => {
      const body = JSON.stringify(samplePayload('SUBSCRIPTION_RENEWED', 'evt_retry_1'));
      const first = await signedPost(body);
      const second = await signedPost(body);
      expect(first.body).toEqual({ received: true });
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ received: true, duplicate: true });
    });
  });

  describe('verifyPurchaselyRequest', () => {
    it('rejects everything when no secret is configured', () => {
      const body = Buffer.from('{}');
      const h = { 'x-purchasely-timestamp': '1', 'x-purchasely-request-signature': sign('{}', '1', '') };
      expect(verifyPurchaselyRequest(h, body, '', 0)).toBe(false);
      expect(verifyPurchaselyRequest(h, body, undefined, 0)).toBe(false);
    });
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});
