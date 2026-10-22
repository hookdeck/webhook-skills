const request = require('supertest');

// Set test environment variables before importing the app
process.env.STIGG_WEBHOOK_SECRET = 'test_stigg_webhook_secret_123';

const { app, verifyStiggSecret } = require('../src/index');

const SECRET = process.env.STIGG_WEBHOOK_SECRET;
const HEADER = 'Stigg-Webhooks-Secret';

const subscriptionCreated = {
  type: 'subscription.created',
  messageId: 'a6ce1f4e-0000-4000-8000-000000000001',
  traceId: '549a1f4e-0000-4000-8000-000000000002',
  entityId: 'customer-uuid',
  id: 'subscription-id',
  status: 'ACTIVE',
  customer: { id: 'customer-test-id', email: 'john@example.com' },
  plan: { id: 'plan-test-id', name: 'plan-test-name', pricingType: 'PAID' },
};

describe('verifyStiggSecret', () => {
  it('accepts a matching secret', () => {
    expect(verifyStiggSecret(SECRET, SECRET)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifyStiggSecret('wrong', SECRET)).toBe(false);
  });

  it('rejects a secret of different length', () => {
    expect(verifyStiggSecret(SECRET + 'x', SECRET)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyStiggSecret(undefined, SECRET)).toBe(false);
  });

  it('rejects when no secret is configured', () => {
    expect(verifyStiggSecret(SECRET, undefined)).toBe(false);
  });
});

describe('POST /webhooks/stigg', () => {
  it('returns 401 when the header is missing', async () => {
    const res = await request(app).post('/webhooks/stigg').send(subscriptionCreated);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong secret', async () => {
    const res = await request(app)
      .post('/webhooks/stigg')
      .set(HEADER, 'wrong')
      .send(subscriptionCreated);
    expect(res.status).toBe(401);
  });

  it('returns 200 for a valid secret', async () => {
    const res = await request(app)
      .post('/webhooks/stigg')
      .set(HEADER, SECRET)
      .send(subscriptionCreated);
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('verifies regardless of content type', async () => {
    const res = await request(app)
      .post('/webhooks/stigg')
      .set(HEADER, SECRET)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(subscriptionCreated));
    expect(res.status).toBe(200);
  });

  it('returns 500 when the secret is not configured (fails closed)', async () => {
    delete process.env.STIGG_WEBHOOK_SECRET;
    try {
      const res = await request(app)
        .post('/webhooks/stigg')
        .set(HEADER, SECRET)
        .send(subscriptionCreated);
      expect(res.status).toBe(500);
    } finally {
      process.env.STIGG_WEBHOOK_SECRET = SECRET;
    }
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await request(app)
      .post('/webhooks/stigg')
      .set(HEADER, SECRET)
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
  });

  it('returns 400 when type is missing', async () => {
    const res = await request(app)
      .post('/webhooks/stigg')
      .set(HEADER, SECRET)
      .send({ messageId: 'x' });
    expect(res.status).toBe(400);
  });

  it('handles known and unknown events', async () => {
    const types = [
      'customer.created', 'customer.updated', 'customer.deleted', 'customer.payment_failed',
      'subscription.created', 'subscription.updated', 'subscription.canceled',
      'subscription.expired', 'subscription.trial_started', 'subscription.trial_converted',
      'subscription.trial_expired', 'subscription.trial.ends_soon',
      'entitlements.updated', 'entitlement.usage_exceeded', 'some.future_event',
    ];
    for (const type of types) {
      const res = await request(app)
        .post('/webhooks/stigg')
        .set(HEADER, SECRET)
        .send({ ...subscriptionCreated, type });
      expect(res.status).toBe(200);
    }
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
