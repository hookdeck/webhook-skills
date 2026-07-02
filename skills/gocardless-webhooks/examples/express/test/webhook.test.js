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

    // No header -> SDK cannot verify -> treated as invalid (non-2xx triggers retry)
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

describe('GET /health', () => {
  it('returns health status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
