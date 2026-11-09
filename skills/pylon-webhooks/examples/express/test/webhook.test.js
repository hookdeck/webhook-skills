const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.PYLON_WEBHOOK_SECRET = 'test_pylon_secret';

const { app, verifyPylonWebhook } = require('../src/index');

/**
 * Sign the way Pylon signs X-Pylon-Signature-V2:
 * hex HMAC-SHA256 of `timestamp + "." + body`, keyed with the secret string.
 */
function signPylon(payload, timestamp, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(payload)
    .digest('hex');
}

const nowTimestamp = () => String(Math.floor(Date.now() / 1000));

const issuePayload = JSON.stringify({
  issue_id: 'b7c1a1d2-0000-4000-8000-000000000001',
  number: '42',
  title: 'Login is broken',
  tags: 'bug,urgent',
  requester_email: 'customer@example.com',
});

describe('Pylon Webhook Endpoint', () => {
  const secret = process.env.PYLON_WEBHOOK_SECRET;

  describe('verifyPylonWebhook', () => {
    const timestamp = '1731150000';
    const now = 1731150010;
    const body = Buffer.from(issuePayload);

    it('accepts a valid signature', () => {
      const signature = signPylon(body, timestamp, secret);
      expect(verifyPylonWebhook(body, timestamp, signature, secret, now)).toBe(true);
    });

    it('rejects a wrong secret', () => {
      const signature = signPylon(body, timestamp, 'wrong_secret');
      expect(verifyPylonWebhook(body, timestamp, signature, secret, now)).toBe(false);
    });

    it('rejects a changed timestamp', () => {
      const signature = signPylon(body, timestamp, secret);
      expect(verifyPylonWebhook(body, '1731150001', signature, secret, now)).toBe(false);
    });

    it('rejects a body-only signature (the legacy X-Pylon-Signature scheme)', () => {
      const legacy = crypto.createHmac('sha256', secret).update(body).digest('hex');
      expect(verifyPylonWebhook(body, timestamp, legacy, secret, now)).toBe(false);
    });

    it('rejects a timestamp more than 5 minutes old', () => {
      const signature = signPylon(body, timestamp, secret);
      expect(verifyPylonWebhook(body, timestamp, signature, secret, now + 301)).toBe(false);
    });

    it('rejects missing headers', () => {
      const signature = signPylon(body, timestamp, secret);
      expect(verifyPylonWebhook(body, undefined, signature, secret, now)).toBe(false);
      expect(verifyPylonWebhook(body, timestamp, undefined, secret, now)).toBe(false);
    });
  });

  describe('POST /webhooks/pylon', () => {
    it('returns 400 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/pylon')
        .set('Content-Type', 'application/json')
        .set('X-Pylon-Timestamp', nowTimestamp())
        .send(issuePayload);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('returns 400 when the payload is tampered', async () => {
      const timestamp = nowTimestamp();
      const signature = signPylon(issuePayload, timestamp, secret);

      const response = await request(app)
        .post('/webhooks/pylon')
        .set('Content-Type', 'application/json')
        .set('X-Pylon-Timestamp', timestamp)
        .set('X-Pylon-Signature-V2', signature)
        .send(issuePayload.replace('Login is broken', 'Nothing to see'));

      expect(response.status).toBe(400);
    });

    it('returns 200 for a signed delivery', async () => {
      const timestamp = nowTimestamp();
      const signature = signPylon(issuePayload, timestamp, secret);

      const response = await request(app)
        .post('/webhooks/pylon')
        .set('Content-Type', 'application/json')
        .set('X-Pylon-Timestamp', timestamp)
        .set('X-Pylon-Signature-V2', signature)
        .send(issuePayload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('returns 200 for a signed test ping', async () => {
      const ping = '{"data":{"type":"ping"}}';
      const timestamp = nowTimestamp();

      const response = await request(app)
        .post('/webhooks/pylon')
        .set('Content-Type', 'application/json')
        .set('X-Pylon-Timestamp', timestamp)
        .set('X-Pylon-Signature-V2', signPylon(ping, timestamp, secret))
        .send(ping);

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
});
