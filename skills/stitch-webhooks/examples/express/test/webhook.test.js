import request from 'supertest';
import crypto from 'node:crypto';

// Svix secrets are 'whsec_' + base64(key). base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';
process.env.STITCH_WEBHOOK_SECRET = TEST_SECRET;

// Dynamic import so the env var is set before the app module loads.
const { app } = await import('../src/index.js');

// Sign exactly as Svix does: base64(HMAC_SHA256(base64Decode(after whsec_), `${id}.${ts}.${body}`))
function sign(payload, timestamp, msgId, secret = TEST_SECRET) {
  const key = Buffer.from(secret.split('_')[1], 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${sig}`;
}

function now() {
  return Math.floor(Date.now() / 1000).toString();
}

function msgId() {
  return 'msg_' + crypto.randomBytes(12).toString('hex');
}

function send(payload, { timestamp = now(), id = msgId(), signature } = {}) {
  return request(app)
    .post('/webhooks/stitch')
    .set('Content-Type', 'application/json')
    .set('svix-id', id)
    .set('svix-timestamp', timestamp)
    .set('svix-signature', signature ?? sign(payload, timestamp, id))
    .send(payload);
}

// Payload shapes from https://docs.stitch.money/webhooks/types
const payloads = {
  payment: {
    data: { client: { paymentInitiationRequests: { node: {
      __typename: 'PaymentInitiationRequest',
      id: 'cGF5cmVxLzk2YjUy',
      externalReference: '79261d16-c53b-48eb-9019-dc9cfb6c5126',
      state: { __typename: 'PaymentInitiationRequestCompleted' },
      paymentConfirmation: { __typename: 'PaymentPending' },
    } } } },
  },
  'payment-consent-request': {
    id: 'payment-consent-request:status:granted:abc',
    type: 'payment-consent-request',
    datetime: '2023-05-10T12:22:42.865Z',
    data: { id: 'cmVjdXJy', status: 'GRANTED', type: 'DEBICHECK' },
  },
  transaction: {
    id: 'transaction:status:success:40431E69',
    type: 'transaction',
    datetime: '2023-05-10T12:22:42.865Z',
    data: { id: 'Y2FyZHRy', status: 'SUCCESS', type: 'CARD' },
  },
  collection: {
    id: 'collection:status:completed:43986ec5',
    type: 'collection',
    datetime: '2026-08-21T12:22:42.865Z',
    data: { id: 'cGF5bWVu', status: 'completed' },
  },
  refund: {
    data: { client: { refunds: { node: {
      __typename: 'Refund', id: 'cmVmdW5k', status: { __typename: 'RefundCompleted' },
    } } } },
  },
  disbursement: {
    data: { client: { disbursements: { node: {
      __typename: 'Disbursement', id: 'ZGlzYnVy', status: { __typename: 'DisbursementCompleted' },
    } } } },
  },
};

describe('Stitch webhook handler', () => {
  test.each(Object.entries(payloads))('accepts a signed %s event', async (type, body) => {
    const res = await send(JSON.stringify(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, type });
  });

  test('accepts a signature list with a v2 entry and rotated secrets', async () => {
    const payload = JSON.stringify(payloads.transaction);
    const timestamp = now();
    const id = msgId();
    const other = sign(payload, timestamp, id, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const header = `v2,MzJsNDk4MzI0K2VvdSMjMTEjQEBAQDEyMzMzMzEyMwo= ${other} ${sign(payload, timestamp, id)}`;
    const res = await send(payload, { timestamp, id, signature: header });
    expect(res.status).toBe(200);
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ type: 'something-new', data: {} }));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('something-new');
  });

  test('rejects missing svix headers', async () => {
    const res = await request(app)
      .post('/webhooks/stitch')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(payloads.payment));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send(JSON.stringify(payloads.payment), {
      signature: 'v1,aW52YWxpZF9zaWduYXR1cmVfdmFsdWVfaGVyZV8xMjM0NTY=',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = JSON.stringify(payloads.refund);
    const timestamp = now();
    const id = msgId();
    const res = await send(payload, {
      timestamp, id, signature: sign(payload, timestamp, id, 'whsec_d3Jvbmdfc2VjcmV0'),
    });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const payload = JSON.stringify(payloads.disbursement);
    const timestamp = now();
    const id = msgId();
    const signature = sign(payload, timestamp, id);
    const res = await send(payload.replace('DisbursementCompleted', 'DisbursementReversed'), {
      timestamp, id, signature,
    });
    expect(res.status).toBe(400);
  });

  test('rejects a stale timestamp', async () => {
    const res = await send(JSON.stringify(payloads.payment), {
      timestamp: (Math.floor(Date.now() / 1000) - 600).toString(),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid timestamp');
  });

  test('returns 500 when the secret is not configured', async () => {
    const saved = process.env.STITCH_WEBHOOK_SECRET;
    delete process.env.STITCH_WEBHOOK_SECRET;
    try {
      const res = await send(JSON.stringify(payloads.payment));
      expect(res.status).toBe(500);
    } finally {
      process.env.STITCH_WEBHOOK_SECRET = saved;
    }
  });

  test('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
