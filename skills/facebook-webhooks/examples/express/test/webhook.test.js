const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing the app
process.env.FACEBOOK_APP_SECRET = 'test_app_secret';
process.env.FACEBOOK_VERIFY_TOKEN = 'test_verify_token';

const { app, verifyFacebookSignature } = require('../src/index');

/**
 * Generate a valid Facebook X-Hub-Signature-256 value for testing.
 */
function generateSignature(payload, appSecret) {
  const signature = crypto
    .createHmac('sha256', appSecret)
    .update(payload)
    .digest('hex');
  return `sha256=${signature}`;
}

describe('verifyFacebookSignature', () => {
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  it('returns true for a valid signature', () => {
    const payload = Buffer.from('{"object":"page","entry":[]}');
    const signature = generateSignature(payload, appSecret);

    expect(verifyFacebookSignature(payload, signature, appSecret)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const payload = Buffer.from('{"object":"page","entry":[]}');

    expect(verifyFacebookSignature(payload, 'sha256=deadbeef', appSecret)).toBe(false);
  });

  it('returns false for a missing signature', () => {
    const payload = Buffer.from('{"object":"page","entry":[]}');

    expect(verifyFacebookSignature(payload, null, appSecret)).toBe(false);
  });

  it('returns false for the legacy sha1 header format', () => {
    const payload = Buffer.from('{"object":"page","entry":[]}');
    const sha1 = crypto.createHmac('sha1', appSecret).update(payload).digest('hex');

    expect(verifyFacebookSignature(payload, `sha1=${sha1}`, appSecret)).toBe(false);
  });

  it('returns false for a tampered payload', () => {
    const original = Buffer.from('{"object":"page","entry":[{"id":"1"}]}');
    const signature = generateSignature(original, appSecret);
    const tampered = Buffer.from('{"object":"page","entry":[{"id":"999"}]}');

    expect(verifyFacebookSignature(tampered, signature, appSecret)).toBe(false);
  });

  it('returns false for the wrong secret', () => {
    const payload = Buffer.from('{"object":"page","entry":[]}');
    const signature = generateSignature(payload, appSecret);

    expect(verifyFacebookSignature(payload, signature, 'wrong_secret')).toBe(false);
  });
});

describe('GET /webhooks/facebook (verification handshake)', () => {
  it('echoes hub.challenge when mode and verify_token match', async () => {
    const response = await request(app)
      .get('/webhooks/facebook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'test_verify_token',
        'hub.challenge': '1234567890'
      });

    expect(response.status).toBe(200);
    expect(response.text).toBe('1234567890');
  });

  it('returns 403 when the verify_token does not match', async () => {
    const response = await request(app)
      .get('/webhooks/facebook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': '1234567890'
      });

    expect(response.status).toBe(403);
  });

  it('returns 403 when the mode is not subscribe', async () => {
    const response = await request(app)
      .get('/webhooks/facebook')
      .query({
        'hub.mode': 'unsubscribe',
        'hub.verify_token': 'test_verify_token',
        'hub.challenge': '1234567890'
      });

    expect(response.status).toBe(403);
  });
});

describe('POST /webhooks/facebook (event delivery)', () => {
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  it('returns 401 for a missing signature', async () => {
    const response = await request(app)
      .post('/webhooks/facebook')
      .set('Content-Type', 'application/json')
      .send('{"object":"page","entry":[]}');

    expect(response.status).toBe(401);
    expect(response.text).toBe('Invalid signature');
  });

  it('returns 401 for an invalid signature', async () => {
    const payload = JSON.stringify({ object: 'page', entry: [] });

    const response = await request(app)
      .post('/webhooks/facebook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=invalid')
      .send(payload);

    expect(response.status).toBe(401);
  });

  it('returns 200 for a valid page feed event', async () => {
    const payload = JSON.stringify({
      object: 'page',
      entry: [
        {
          id: 'page-1',
          time: 1458692752,
          changes: [{ field: 'feed', value: { item: 'comment', verb: 'add' } }]
        }
      ]
    });
    const signature = generateSignature(payload, appSecret);

    const response = await request(app)
      .post('/webhooks/facebook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signature)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.text).toBe('EVENT_RECEIVED');
  });

  it('handles an instagram comments event', async () => {
    const payload = JSON.stringify({
      object: 'instagram',
      entry: [
        {
          id: 'ig-1',
          time: 1458692752,
          changes: [{ field: 'comments', value: { id: 'comment-1' } }]
        }
      ]
    });
    const signature = generateSignature(payload, appSecret);

    const response = await request(app)
      .post('/webhooks/facebook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signature)
      .send(payload);

    expect(response.status).toBe(200);
  });

  it('handles a Messenger messaging event', async () => {
    const payload = JSON.stringify({
      object: 'page',
      entry: [
        {
          id: 'page-1',
          time: 1458692752,
          messaging: [
            { sender: { id: 'psid-1' }, recipient: { id: 'page-1' }, message: { text: 'Hello' } }
          ]
        }
      ]
    });
    const signature = generateSignature(payload, appSecret);

    const response = await request(app)
      .post('/webhooks/facebook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signature)
      .send(payload);

    expect(response.status).toBe(200);
  });

  it('handles a batch of multiple entries', async () => {
    const payload = JSON.stringify({
      object: 'page',
      entry: [
        { id: 'page-1', time: 1, changes: [{ field: 'feed', value: {} }] },
        { id: 'page-2', time: 2, changes: [{ field: 'mention', value: {} }] }
      ]
    });
    const signature = generateSignature(payload, appSecret);

    const response = await request(app)
      .post('/webhooks/facebook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signature)
      .send(payload);

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
