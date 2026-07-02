const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.ZOOM_WEBHOOK_SECRET_TOKEN = 'test_zoom_secret_token';

const {
  app,
  verifyZoomWebhook,
  buildValidationResponse,
} = require('../src/index');

const SECRET = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;

/**
 * Generate a valid Zoom signature for testing.
 * Matches Zoom: v0=HMAC-SHA256("v0:{timestamp}:{body}", secretToken)
 */
function generateZoomSignature(payload, timestamp, secret) {
  const message = `v0:${timestamp}:${payload}`;
  const hash = crypto.createHmac('sha256', secret).update(message).digest('hex');
  return `v0=${hash}`;
}

describe('verifyZoomWebhook', () => {
  const timestamp = '1658940994';

  it('should return true for a valid signature', () => {
    const payload = '{"event":"meeting.started"}';
    const signature = generateZoomSignature(payload, timestamp, SECRET);

    expect(verifyZoomWebhook(payload, timestamp, signature, SECRET)).toBe(true);
  });

  it('should return true when given a Buffer body', () => {
    const payload = '{"event":"meeting.ended"}';
    const signature = generateZoomSignature(payload, timestamp, SECRET);

    expect(
      verifyZoomWebhook(Buffer.from(payload), timestamp, signature, SECRET)
    ).toBe(true);
  });

  it('should return false for an invalid signature', () => {
    const payload = '{"event":"meeting.started"}';

    expect(verifyZoomWebhook(payload, timestamp, 'v0=invalid', SECRET)).toBe(
      false
    );
  });

  it('should return false for a tampered body', () => {
    const payload = '{"event":"meeting.started"}';
    const signature = generateZoomSignature(payload, timestamp, SECRET);

    expect(
      verifyZoomWebhook('{"event":"meeting.ended"}', timestamp, signature, SECRET)
    ).toBe(false);
  });

  it('should return false for the wrong secret', () => {
    const payload = '{"event":"meeting.started"}';
    const signature = generateZoomSignature(payload, timestamp, SECRET);

    expect(
      verifyZoomWebhook(payload, timestamp, signature, 'wrong_secret')
    ).toBe(false);
  });

  it('should return false for a missing signature', () => {
    const payload = '{"event":"meeting.started"}';

    expect(verifyZoomWebhook(payload, timestamp, null, SECRET)).toBe(false);
  });

  it('should return false for a missing timestamp', () => {
    const payload = '{"event":"meeting.started"}';
    const signature = generateZoomSignature(payload, timestamp, SECRET);

    expect(verifyZoomWebhook(payload, null, signature, SECRET)).toBe(false);
  });
});

describe('buildValidationResponse', () => {
  it('should return plainToken and a hex encryptedToken', () => {
    const plainToken = 'qgg8vlvZRS6UYooatFL8Aw';
    const result = buildValidationResponse(plainToken, SECRET);

    const expected = crypto
      .createHmac('sha256', SECRET)
      .update(plainToken)
      .digest('hex');

    expect(result.plainToken).toBe(plainToken);
    expect(result.encryptedToken).toBe(expected);
    expect(result.encryptedToken).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('POST /webhooks/zoom', () => {
  const timestamp = '1658940994';

  it('should return 401 for a missing signature', async () => {
    const response = await request(app)
      .post('/webhooks/zoom')
      .set('Content-Type', 'application/json')
      .set('x-zm-request-timestamp', timestamp)
      .send('{"event":"meeting.started"}');

    expect(response.status).toBe(401);
    expect(response.text).toBe('Invalid signature');
  });

  it('should return 401 for an invalid signature', async () => {
    const payload = JSON.stringify({ event: 'meeting.started' });

    const response = await request(app)
      .post('/webhooks/zoom')
      .set('Content-Type', 'application/json')
      .set('x-zm-request-timestamp', timestamp)
      .set('x-zm-signature', 'v0=invalid')
      .send(payload);

    expect(response.status).toBe(401);
  });

  it('should complete the endpoint.url_validation handshake', async () => {
    const plainToken = 'qgg8vlvZRS6UYooatFL8Aw';
    const payload = JSON.stringify({
      event: 'endpoint.url_validation',
      payload: { plainToken },
      event_ts: 1654503849680,
    });
    const signature = generateZoomSignature(payload, timestamp, SECRET);

    const response = await request(app)
      .post('/webhooks/zoom')
      .set('Content-Type', 'application/json')
      .set('x-zm-request-timestamp', timestamp)
      .set('x-zm-signature', signature)
      .send(payload);

    const expectedEncrypted = crypto
      .createHmac('sha256', SECRET)
      .update(plainToken)
      .digest('hex');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      plainToken,
      encryptedToken: expectedEncrypted,
    });
  });

  it('should return 200 for a valid meeting.started event', async () => {
    const payload = JSON.stringify({
      event: 'meeting.started',
      payload: { object: { id: '123456789', topic: 'Standup' } },
    });
    const signature = generateZoomSignature(payload, timestamp, SECRET);

    const response = await request(app)
      .post('/webhooks/zoom')
      .set('Content-Type', 'application/json')
      .set('x-zm-request-timestamp', timestamp)
      .set('x-zm-signature', signature)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
  });

  it('should handle recording.completed event', async () => {
    const payload = JSON.stringify({
      event: 'recording.completed',
      payload: { object: { id: '123456789' } },
    });
    const signature = generateZoomSignature(payload, timestamp, SECRET);

    const response = await request(app)
      .post('/webhooks/zoom')
      .set('Content-Type', 'application/json')
      .set('x-zm-request-timestamp', timestamp)
      .set('x-zm-signature', signature)
      .send(payload);

    expect(response.status).toBe(200);
  });

  it('should handle meeting.participant_joined event', async () => {
    const payload = JSON.stringify({
      event: 'meeting.participant_joined',
      payload: {
        object: { id: '123456789', participant: { user_name: 'Jane' } },
      },
    });
    const signature = generateZoomSignature(payload, timestamp, SECRET);

    const response = await request(app)
      .post('/webhooks/zoom')
      .set('Content-Type', 'application/json')
      .set('x-zm-request-timestamp', timestamp)
      .set('x-zm-signature', signature)
      .send(payload);

    expect(response.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('should return health status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
