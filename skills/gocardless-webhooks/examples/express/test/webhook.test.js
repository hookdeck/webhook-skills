const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing the app
process.env.GOCARDLESS_WEBHOOK_SECRET = 'test_webhook_secret';

const { app } = require('../src/index');

const WEBHOOK_SECRET = process.env.GOCARDLESS_WEBHOOK_SECRET;

/**
 * Generate a valid GoCardless Webhook-Signature: HMAC-SHA256 (hex) over the raw body.
 * This matches exactly how GoCardless (and the gocardless-nodejs SDK) sign requests.
 */
function sign(rawBody, secret) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

function eventsBody(events) {
  return JSON.stringify({ events });
}

describe('POST /webhooks/gocardless', () => {
  it('returns 204 for a valid signature and processes the batch', async () => {
    const body = eventsBody([
      {
        id: 'EV123',
        created_at: '2014-08-04T12:00:00.000Z',
        resource_type: 'payments',
        action: 'confirmed',
        links: { payment: 'PM123' },
      },
    ]);

    const response = await request(app)
      .post('/webhooks/gocardless')
      .set('Content-Type', 'application/json')
      .set('Webhook-Signature', sign(body, WEBHOOK_SECRET))
      .send(body);

    expect(response.status).toBe(204);
  });

  it('processes a batch of multiple events', async () => {
    const body = eventsBody([
      { id: 'EV1', resource_type: 'payments', action: 'failed', links: { payment: 'PM1' } },
      { id: 'EV2', resource_type: 'mandates', action: 'cancelled', links: { mandate: 'MD1' } },
      { id: 'EV3', resource_type: 'payouts', action: 'paid', links: { payout: 'PO1' } },
    ]);

    const response = await request(app)
      .post('/webhooks/gocardless')
      .set('Content-Type', 'application/json')
      .set('Webhook-Signature', sign(body, WEBHOOK_SECRET))
      .send(body);

    expect(response.status).toBe(204);
  });

  it('returns 498 for an invalid signature', async () => {
    const body = eventsBody([
      { id: 'EV123', resource_type: 'payments', action: 'confirmed', links: {} },
    ]);

    const response = await request(app)
      .post('/webhooks/gocardless')
      .set('Content-Type', 'application/json')
      .set('Webhook-Signature', 'deadbeef')
      .send(body);

    expect(response.status).toBe(498);
  });

  it('returns 498 for a signature made with the wrong secret', async () => {
    const body = eventsBody([
      { id: 'EV123', resource_type: 'payments', action: 'confirmed', links: {} },
    ]);

    const response = await request(app)
      .post('/webhooks/gocardless')
      .set('Content-Type', 'application/json')
      .set('Webhook-Signature', sign(body, 'the_wrong_secret'))
      .send(body);

    expect(response.status).toBe(498);
  });

  it('returns 498 when the signature header is missing', async () => {
    const body = eventsBody([
      { id: 'EV123', resource_type: 'payments', action: 'confirmed', links: {} },
    ]);

    const response = await request(app)
      .post('/webhooks/gocardless')
      .set('Content-Type', 'application/json')
      .send(body);

    // No header -> SDK cannot verify -> treated as invalid
    expect(response.status).toBe(498);
  });

  it('is verified against the RAW body (tampering breaks the signature)', async () => {
    const body = eventsBody([
      { id: 'EV123', resource_type: 'payments', action: 'confirmed', links: {} },
    ]);
    const signature = sign(body, WEBHOOK_SECRET);
    const tampered = eventsBody([
      { id: 'EV123', resource_type: 'payments', action: 'paid_out', links: {} },
    ]);

    const response = await request(app)
      .post('/webhooks/gocardless')
      .set('Content-Type', 'application/json')
      .set('Webhook-Signature', signature)
      .send(tampered);

    expect(response.status).toBe(498);
  });
});

describe("GoCardless official public test vector", () => {
  // From gocardless-nodejs (src/fixtures/webhook_body.json), minified. Ties this
  // skill's signing to GoCardless's own published fixture. Reproduced 2026-08.
  const VECTOR_SECRET = 'ED7D658C-D8EB-4941-948B-3973214F2D49';
  const VECTOR_BODY = '{"events":[{"id":"EV00BD05S5VM2T","created_at":"2018-07-05T09:13:51.404Z","resource_type":"subscriptions","action":"created","links":{"subscription":"SB0003JJQ2MR06"},"details":{"origin":"api","cause":"subscription_created","description":"Subscription created via the API."},"metadata":{}},{"id":"EV00BD05TB8K63","created_at":"2018-07-05T09:13:56.893Z","resource_type":"mandates","action":"created","links":{"mandate":"MD000AMA19XGEC"},"details":{"origin":"api","cause":"mandate_created","description":"Mandate created via the API."},"metadata":{}}]}';
  const VECTOR_SIG = '2693754819d3e32d7e8fcb13c729631f316c6de8dc1cf634d6527f1c07276e7e';

  it("reproduces the published signature exactly", () => {
    expect(sign(VECTOR_BODY, VECTOR_SECRET)).toBe(VECTOR_SIG);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
