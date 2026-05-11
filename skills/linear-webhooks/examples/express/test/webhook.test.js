const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.LINEAR_WEBHOOK_SECRET = 'test_linear_secret';

const { app, verifyLinearWebhook, isFreshTimestamp } = require('../src/index');

const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET;

/**
 * Generate a valid Linear-Signature header value (hex-encoded HMAC-SHA256,
 * no `sha256=` prefix).
 */
function generateLinearSignature(payload, secret) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function freshTimestamp() {
  return Date.now();
}

function buildPayload(overrides = {}) {
  return JSON.stringify({
    action: 'create',
    type: 'Issue',
    createdAt: new Date().toISOString(),
    data: { id: 'issue-1', title: 'Test issue' },
    webhookId: 'webhook-uuid',
    webhookTimestamp: freshTimestamp(),
    organizationId: 'org-uuid',
    ...overrides,
  });
}

describe('verifyLinearWebhook', () => {
  it('returns true for a valid signature', () => {
    const payload = Buffer.from('{"action":"create","type":"Issue"}');
    const signature = generateLinearSignature(payload, webhookSecret);

    expect(verifyLinearWebhook(payload, signature, webhookSecret)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const payload = Buffer.from('{"action":"create"}');

    expect(verifyLinearWebhook(payload, 'a'.repeat(64), webhookSecret)).toBe(false);
  });

  it('returns false for a missing signature', () => {
    const payload = Buffer.from('{"action":"create"}');

    expect(verifyLinearWebhook(payload, null, webhookSecret)).toBe(false);
  });

  it('returns false when the secret is wrong', () => {
    const payload = Buffer.from('{"action":"create"}');
    const signature = generateLinearSignature(payload, webhookSecret);

    expect(verifyLinearWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('returns false when the body has been tampered with', () => {
    const original = Buffer.from('{"action":"create","id":1}');
    const signature = generateLinearSignature(original, webhookSecret);
    const tampered = Buffer.from('{"action":"create","id":2}');

    expect(verifyLinearWebhook(tampered, signature, webhookSecret)).toBe(false);
  });

  it('returns false for a malformed (non-hex) signature header', () => {
    const payload = Buffer.from('{"action":"create"}');

    expect(verifyLinearWebhook(payload, 'not a hex string!!!', webhookSecret)).toBe(false);
  });
});

describe('isFreshTimestamp', () => {
  it('accepts a timestamp within the 1 minute tolerance', () => {
    expect(isFreshTimestamp(Date.now())).toBe(true);
    expect(isFreshTimestamp(Date.now() - 30_000)).toBe(true);
  });

  it('rejects a timestamp older than 1 minute', () => {
    expect(isFreshTimestamp(Date.now() - 5 * 60_000)).toBe(false);
  });

  it('rejects a timestamp in the far future', () => {
    expect(isFreshTimestamp(Date.now() + 5 * 60_000)).toBe(false);
  });

  it('rejects non-numeric values', () => {
    expect(isFreshTimestamp(undefined)).toBe(false);
    expect(isFreshTimestamp('not a number')).toBe(false);
  });
});

describe('POST /webhooks/linear', () => {
  it('returns 400 when the signature header is missing', async () => {
    const payload = buildPayload();

    const response = await request(app)
      .post('/webhooks/linear')
      .set('Content-Type', 'application/json')
      .set('Linear-Event', 'Issue')
      .set('Linear-Delivery', 'delivery-uuid')
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.text).toBe('Invalid signature');
  });

  it('returns 400 when the signature is invalid', async () => {
    const payload = buildPayload();

    const response = await request(app)
      .post('/webhooks/linear')
      .set('Content-Type', 'application/json')
      .set('Linear-Signature', 'a'.repeat(64))
      .set('Linear-Event', 'Issue')
      .set('Linear-Delivery', 'delivery-uuid')
      .send(payload);

    expect(response.status).toBe(400);
  });

  it('returns 200 for a valid signature and fresh timestamp', async () => {
    const payload = buildPayload();
    const signature = generateLinearSignature(payload, webhookSecret);

    const response = await request(app)
      .post('/webhooks/linear')
      .set('Content-Type', 'application/json')
      .set('Linear-Signature', signature)
      .set('Linear-Event', 'Issue')
      .set('Linear-Delivery', 'delivery-uuid')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
  });

  it('returns 400 for a stale webhookTimestamp', async () => {
    const payload = buildPayload({ webhookTimestamp: Date.now() - 10 * 60_000 });
    const signature = generateLinearSignature(payload, webhookSecret);

    const response = await request(app)
      .post('/webhooks/linear')
      .set('Content-Type', 'application/json')
      .set('Linear-Signature', signature)
      .set('Linear-Event', 'Issue')
      .set('Linear-Delivery', 'delivery-uuid')
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.text).toBe('Stale webhook');
  });

  it('handles a Comment event', async () => {
    const payload = buildPayload({
      type: 'Comment',
      data: { id: 'comment-1', issueId: 'issue-1', body: 'Looks good!' },
    });
    const signature = generateLinearSignature(payload, webhookSecret);

    const response = await request(app)
      .post('/webhooks/linear')
      .set('Content-Type', 'application/json')
      .set('Linear-Signature', signature)
      .set('Linear-Event', 'Comment')
      .set('Linear-Delivery', 'delivery-uuid')
      .send(payload);

    expect(response.status).toBe(200);
  });

  it('handles a Project event', async () => {
    const payload = buildPayload({
      type: 'Project',
      data: { id: 'project-1', name: 'New project' },
    });
    const signature = generateLinearSignature(payload, webhookSecret);

    const response = await request(app)
      .post('/webhooks/linear')
      .set('Content-Type', 'application/json')
      .set('Linear-Signature', signature)
      .set('Linear-Event', 'Project')
      .set('Linear-Delivery', 'delivery-uuid')
      .send(payload);

    expect(response.status).toBe(200);
  });

  it('handles an IssueSLA event', async () => {
    const payload = JSON.stringify({
      action: 'highRisk',
      type: 'IssueSLA',
      issueData: { id: 'issue-1' },
      webhookTimestamp: freshTimestamp(),
    });
    const signature = generateLinearSignature(payload, webhookSecret);

    const response = await request(app)
      .post('/webhooks/linear')
      .set('Content-Type', 'application/json')
      .set('Linear-Signature', signature)
      .set('Linear-Event', 'IssueSLA')
      .set('Linear-Delivery', 'delivery-uuid')
      .send(payload);

    expect(response.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('returns the health status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
