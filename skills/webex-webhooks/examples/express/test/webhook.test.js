const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.WEBEX_WEBHOOK_SECRET = 'test_webex_webhook_secret';

const { app, verifyWebexWebhook } = require('../src/index');

const SECRET = process.env.WEBEX_WEBHOOK_SECRET;

/**
 * Generate a valid Webex signature for testing.
 * Matches Webex: X-Spark-Signature = hex HMAC-SHA1(rawBody, secret)
 */
function generateWebexSignature(payload, secret) {
  return crypto.createHmac('sha1', secret).update(payload).digest('hex');
}

function webexBody(resource, event, data = {}) {
  return JSON.stringify({
    id: 'Y2lzY29zcGFyazovL3VzL1dFQkhPT0svZjRlNjA1NjA',
    name: 'Test webhook',
    resource,
    event,
    status: 'active',
    data,
  });
}

function post(payload, signature) {
  const req = request(app)
    .post('/webhooks/webex')
    .set('Content-Type', 'application/json');
  if (signature) req.set('X-Spark-Signature', signature);
  return req.send(payload);
}

describe('verifyWebexWebhook', () => {
  it('should return true for a valid signature', () => {
    const payload = webexBody('messages', 'created');
    const signature = generateWebexSignature(payload, SECRET);

    expect(verifyWebexWebhook(payload, signature, SECRET)).toBe(true);
  });

  it('should return true when given a Buffer body', () => {
    const payload = webexBody('rooms', 'updated');
    const signature = generateWebexSignature(payload, SECRET);

    expect(verifyWebexWebhook(Buffer.from(payload), signature, SECRET)).toBe(true);
  });

  it('should return false for an invalid signature', () => {
    const payload = webexBody('messages', 'created');

    expect(verifyWebexWebhook(payload, 'invalid', SECRET)).toBe(false);
  });

  it('should return false for a tampered body', () => {
    const payload = webexBody('messages', 'created');
    const signature = generateWebexSignature(payload, SECRET);

    expect(verifyWebexWebhook(webexBody('messages', 'deleted'), signature, SECRET)).toBe(false);
  });

  it('should return false for the wrong secret', () => {
    const payload = webexBody('messages', 'created');
    const signature = generateWebexSignature(payload, SECRET);

    expect(verifyWebexWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should return false for a missing signature', () => {
    expect(verifyWebexWebhook(webexBody('messages', 'created'), undefined, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/webex', () => {
  it('should return 400 for a missing signature', async () => {
    const response = await post(webexBody('messages', 'created'));

    expect(response.status).toBe(400);
    expect(response.text).toBe('Invalid signature');
  });

  it('should return 400 for an invalid signature', async () => {
    const response = await post(webexBody('messages', 'created'), 'invalid');

    expect(response.status).toBe(400);
  });

  it('should return 200 for a valid messages.created event', async () => {
    const payload = webexBody('messages', 'created', {
      id: 'msg_1',
      roomId: 'room_1',
      personEmail: 'matt@example.com',
    });

    const response = await post(payload, generateWebexSignature(payload, SECRET));

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
  });

  it.each([
    ['messages', 'deleted'],
    ['memberships', 'created'],
    ['memberships', 'deleted'],
    ['rooms', 'created'],
    ['rooms', 'updated'],
    ['meetings', 'started'],
    ['meetings', 'ended'],
    ['attachmentActions', 'created'],
  ])('should handle %s.%s event', async (resource, event) => {
    const payload = webexBody(resource, event, { id: 'obj_1' });

    const response = await post(payload, generateWebexSignature(payload, SECRET));

    expect(response.status).toBe(200);
  });

  it('should acknowledge unhandled events', async () => {
    const payload = webexBody('recordings', 'created', { id: 'rec_1' });

    const response = await post(payload, generateWebexSignature(payload, SECRET));

    expect(response.status).toBe(200);
  });

  it('should return 400 for a validly signed non-JSON body', async () => {
    const payload = 'not json';

    const response = await post(payload, generateWebexSignature(payload, SECRET));

    expect(response.status).toBe(400);
    expect(response.text).toBe('Invalid JSON');
  });
});

describe('GET /health', () => {
  it('should return health status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
