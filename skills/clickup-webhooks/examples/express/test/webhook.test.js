const request = require('supertest');
const crypto = require('crypto');

// ClickUp secrets are 64-char uppercase alphanumeric strings (webhook.secret from the API)
process.env.CLICKUP_WEBHOOK_SECRET = 'O94IM25S7PXBPYTMNXLLET230SRP0S89COR7B1YOJ2ZIE8WQNK5UUKEF26W0Z5GA';

const { app, verifyClickUpWebhook } = require('../src/index');

const webhookSecret = process.env.CLICKUP_WEBHOOK_SECRET;
const webhookId = '7fa3ec74-69a8-4530-a251-8a13730bd204';

/**
 * Generate an X-Signature value the same way ClickUp does:
 * hex(HMAC-SHA256(secret, rawBody))
 */
function generateClickUpSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function postSigned(payload, signature = generateClickUpSignature(payload, webhookSecret)) {
  return request(app)
    .post('/webhooks/clickup')
    .set('Content-Type', 'application/json')
    .set('X-Signature', signature)
    .send(payload);
}

describe('verifyClickUpWebhook', () => {
  const payload = Buffer.from('{"webhook_id":"7689a169-a000-4985-8676-6902b96d6627","event":"taskCreated","task_id":"c0j"}');

  it('accepts a valid signature', () => {
    const signature = generateClickUpSignature(payload, webhookSecret);
    expect(verifyClickUpWebhook(payload, signature, webhookSecret)).toBe(true);
  });

  it('accepts an uppercase hex signature', () => {
    const signature = generateClickUpSignature(payload, webhookSecret).toUpperCase();
    expect(verifyClickUpWebhook(payload, signature, webhookSecret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyClickUpWebhook(payload, 'invalid', webhookSecret)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyClickUpWebhook(payload, undefined, webhookSecret)).toBe(false);
  });

  it('rejects when the secret is not configured', () => {
    const signature = generateClickUpSignature(payload, webhookSecret);
    expect(verifyClickUpWebhook(payload, signature, undefined)).toBe(false);
  });

  it('rejects a signature made with the wrong secret', () => {
    const signature = generateClickUpSignature(payload, 'wrong_secret');
    expect(verifyClickUpWebhook(payload, signature, webhookSecret)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const signature = generateClickUpSignature(payload, webhookSecret);
    const tampered = Buffer.from(payload.toString().replace('c0j', 'xyz'));
    expect(verifyClickUpWebhook(tampered, signature, webhookSecret)).toBe(false);
  });

  it('rejects a valid signature with trailing characters', () => {
    const signature = generateClickUpSignature(payload, webhookSecret) + 'zz';
    expect(verifyClickUpWebhook(payload, signature, webhookSecret)).toBe(false);
  });

  it('rejects a sha256= prefixed signature (ClickUp sends bare hex)', () => {
    const signature = `sha256=${generateClickUpSignature(payload, webhookSecret)}`;
    expect(verifyClickUpWebhook(payload, signature, webhookSecret)).toBe(false);
  });
});

describe('POST /webhooks/clickup', () => {
  it('returns 400 when X-Signature is missing', async () => {
    const response = await request(app)
      .post('/webhooks/clickup')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ event: 'taskCreated', task_id: 'abc', webhook_id: webhookId }));

    expect(response.status).toBe(400);
    expect(response.text).toBe('Missing X-Signature header');
  });

  it('returns 400 (never 401) for an invalid signature', async () => {
    const payload = JSON.stringify({ event: 'taskCreated', task_id: 'abc', webhook_id: webhookId });
    const response = await postSigned(payload, 'a'.repeat(64));

    expect(response.status).toBe(400);
    expect(response.text).toBe('Invalid signature');
  });

  it('verifies against the raw body, not re-serialized JSON', async () => {
    // Extra whitespace: a JSON.stringify round-trip would change these bytes
    const payload = '{ "event": "taskCreated",  "task_id": "abc", "webhook_id": "' + webhookId + '" }';
    const response = await postSigned(payload);

    expect(response.status).toBe(200);
  });

  it('returns 400 for a signed body that is not valid JSON', async () => {
    const payload = 'not json';
    const response = await postSigned(payload);

    expect(response.status).toBe(400);
    expect(response.text).toBe('Invalid JSON');
  });

  it('handles taskCreated', async () => {
    const payload = JSON.stringify({
      event: 'taskCreated',
      history_items: [{ id: '2800763136700363640', field: 'task_creation', user: { id: 183 } }],
      task_id: '1vj37mc',
      webhook_id: webhookId,
    });
    const response = await postSigned(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
  });

  it('handles taskUpdated', async () => {
    const payload = JSON.stringify({ event: 'taskUpdated', task_id: '1vj37mc', webhook_id: webhookId });
    const response = await postSigned(payload);

    expect(response.status).toBe(200);
  });

  it('handles taskStatusUpdated', async () => {
    const payload = JSON.stringify({
      event: 'taskStatusUpdated',
      history_items: [{
        id: '2800763136717140857',
        field: 'status',
        before: { status: 'to do' },
        after: { status: 'in progress' },
      }],
      task_id: '1vj37mc',
      webhook_id: webhookId,
    });
    const response = await postSigned(payload);

    expect(response.status).toBe(200);
  });

  it('handles taskCommentPosted', async () => {
    const payload = JSON.stringify({ event: 'taskCommentPosted', task_id: '1vj37mc', webhook_id: webhookId });
    const response = await postSigned(payload);

    expect(response.status).toBe(200);
  });

  it('handles goal events without history_items', async () => {
    const payload = JSON.stringify({
      event: 'goalCreated',
      goal_id: 'a23e5a3d-74b5-44c2-ab53-917ebe85045a',
      webhook_id: 'd5eddb2d-db2b-49e9-87d4-bc6cfbe2313b',
    });
    const response = await postSigned(payload);

    expect(response.status).toBe(200);
  });

  it('acknowledges unknown events', async () => {
    const payload = JSON.stringify({ event: 'somethingNew', webhook_id: webhookId });
    const response = await postSigned(payload);

    expect(response.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
