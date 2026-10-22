const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
// MailerLite secrets are short per-webhook strings (e.g. "ybmcD7PQ9R"), used as UTF-8
process.env.MAILERLITE_WEBHOOK_SECRET = 'ybmcD7PQ9R';

const { app, verifyMailerLiteWebhook } = require('../src/index');

/**
 * Generate a valid MailerLite signature: bare hex HMAC-SHA256 of the raw body
 */
function generateSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

const secret = process.env.MAILERLITE_WEBHOOK_SECRET;

const subscriberCreated = JSON.stringify({
  id: '100000000000000000',
  email: 'john.doe@example.com',
  status: 'active',
  fields: { name: '' },
  event: 'subscriber.created',
  account_id: 0,
});

const campaignSent = JSON.stringify({
  id: '100000000000000000',
  name: 'Campaign name',
  total_recipients: 1000,
  event: 'campaign.sent',
  account_id: 0,
});

const batched = JSON.stringify({
  events: [
    { type: 'campaign.open', subscriber: { email: 'a@example.com' }, campaign: { name: 'C' } },
    { type: 'campaign.click', subscriber: { email: 'b@example.com' }, campaign: { name: 'C' } },
  ],
  total: 2,
});

describe('verifyMailerLiteWebhook', () => {
  it('returns true for a valid signature', () => {
    const body = Buffer.from(subscriberCreated);
    expect(verifyMailerLiteWebhook(body, generateSignature(body, secret), secret)).toBe(true);
  });

  it('returns false for a wrong secret', () => {
    const body = Buffer.from(subscriberCreated);
    expect(verifyMailerLiteWebhook(body, generateSignature(body, 'other'), secret)).toBe(false);
  });

  it('returns false for a modified body', () => {
    const sig = generateSignature(subscriberCreated, secret);
    expect(verifyMailerLiteWebhook(Buffer.from(subscriberCreated + ' '), sig, secret)).toBe(false);
  });

  it('returns false for a missing or malformed signature', () => {
    const body = Buffer.from(subscriberCreated);
    expect(verifyMailerLiteWebhook(body, undefined, secret)).toBe(false);
    expect(verifyMailerLiteWebhook(body, 'abc', secret)).toBe(false);
  });

  it('rejects a sha256= prefixed signature (MailerLite sends bare hex)', () => {
    const body = Buffer.from(subscriberCreated);
    expect(verifyMailerLiteWebhook(body, `sha256=${generateSignature(body, secret)}`, secret)).toBe(false);
  });
});

describe('POST /webhooks/mailerlite', () => {
  const post = (body, signature, contentType = 'application/json') => {
    const req = request(app).post('/webhooks/mailerlite').set('Content-Type', contentType);
    if (signature) req.set('Signature', signature);
    return req.send(body);
  };

  it('accepts a signed subscriber.created event', async () => {
    const res = await post(subscriberCreated, generateSignature(subscriberCreated, secret));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a signed campaign.sent event', async () => {
    const res = await post(campaignSent, generateSignature(campaignSent, secret));
    expect(res.status).toBe(200);
  });

  it('accepts a signed batched payload', async () => {
    const res = await post(batched, generateSignature(batched, secret));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const res = await post(subscriberCreated, generateSignature(subscriberCreated, secret), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 400 for a missing signature', async () => {
    const res = await post(subscriberCreated);
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post(subscriberCreated, 'a'.repeat(64));
    expect(res.status).toBe(400);
  });

  it('returns 400 for signed but invalid JSON', async () => {
    const res = await post('not json', generateSignature('not json', secret));
    expect(res.status).toBe(400);
  });
});
