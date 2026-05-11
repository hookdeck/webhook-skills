const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.HUBSPOT_CLIENT_SECRET = 'test_client_secret';

const { app, verifyHubSpotWebhook } = require('../src/index');

const SECRET = process.env.HUBSPOT_CLIENT_SECRET;
const HOST = 'example.com';
const PATH = '/webhooks/hubspot';
const URI = `http://${HOST}${PATH}`;

/**
 * Generate a valid HubSpot v3 signature for testing.
 * signed_content = method + uri + body + timestamp
 */
function signHubSpot({ method = 'POST', uri = URI, body, timestamp, secret = SECRET }) {
  const signedContent = `${method}${uri}${body}${timestamp}`;
  return crypto.createHmac('sha256', secret).update(signedContent, 'utf8').digest('base64');
}

function nowMs() {
  return Date.now().toString();
}

describe('HubSpot Webhook Endpoint', () => {
  describe('verifyHubSpotWebhook', () => {
    it('returns true for a valid signature', () => {
      const body = '[{"subscriptionType":"contact.creation","objectId":1}]';
      const timestamp = nowMs();
      const signature = signHubSpot({ body, timestamp });

      expect(
        verifyHubSpotWebhook({
          method: 'POST',
          uri: URI,
          rawBody: Buffer.from(body),
          timestamp,
          signature,
          secret: SECRET,
        })
      ).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      expect(
        verifyHubSpotWebhook({
          method: 'POST',
          uri: URI,
          rawBody: Buffer.from('{}'),
          timestamp: nowMs(),
          signature: 'not-a-real-signature',
          secret: SECRET,
        })
      ).toBe(false);
    });

    it('returns false for a stale timestamp (older than 5 minutes)', () => {
      const body = '{}';
      const stale = (Date.now() - 6 * 60 * 1000).toString();
      const signature = signHubSpot({ body, timestamp: stale });

      expect(
        verifyHubSpotWebhook({
          method: 'POST',
          uri: URI,
          rawBody: Buffer.from(body),
          timestamp: stale,
          signature,
          secret: SECRET,
        })
      ).toBe(false);
    });

    it('returns false when the body has been tampered with', () => {
      const original = '{"objectId":1}';
      const tampered = '{"objectId":999}';
      const timestamp = nowMs();
      const signature = signHubSpot({ body: original, timestamp });

      expect(
        verifyHubSpotWebhook({
          method: 'POST',
          uri: URI,
          rawBody: Buffer.from(tampered),
          timestamp,
          signature,
          secret: SECRET,
        })
      ).toBe(false);
    });

    it('returns false when the URI changes', () => {
      const body = '{}';
      const timestamp = nowMs();
      const signature = signHubSpot({ uri: URI, body, timestamp });

      expect(
        verifyHubSpotWebhook({
          method: 'POST',
          uri: 'http://attacker.example.com/webhooks/hubspot',
          rawBody: Buffer.from(body),
          timestamp,
          signature,
          secret: SECRET,
        })
      ).toBe(false);
    });

    it('returns false when the signature header is missing', () => {
      expect(
        verifyHubSpotWebhook({
          method: 'POST',
          uri: URI,
          rawBody: Buffer.from('{}'),
          timestamp: nowMs(),
          signature: undefined,
          secret: SECRET,
        })
      ).toBe(false);
    });
  });

  describe('POST /webhooks/hubspot', () => {
    it('returns 400 when the signature header is missing', async () => {
      const response = await request(app)
        .post(PATH)
        .set('Host', HOST)
        .set('Content-Type', 'application/json')
        .set('X-HubSpot-Request-Timestamp', nowMs())
        .send('[]');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('returns 400 for an invalid signature', async () => {
      const response = await request(app)
        .post(PATH)
        .set('Host', HOST)
        .set('Content-Type', 'application/json')
        .set('X-HubSpot-Signature-v3', 'invalid')
        .set('X-HubSpot-Request-Timestamp', nowMs())
        .send('[]');

      expect(response.status).toBe(400);
    });

    it('returns 200 for a valid signature', async () => {
      const body = JSON.stringify([
        { subscriptionType: 'contact.creation', objectId: 123 },
      ]);
      const timestamp = nowMs();
      const signature = signHubSpot({ body, timestamp });

      const response = await request(app)
        .post(PATH)
        .set('Host', HOST)
        .set('Content-Type', 'application/json')
        .set('X-HubSpot-Signature-v3', signature)
        .set('X-HubSpot-Request-Timestamp', timestamp)
        .send(body);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('handles a batch of multiple event types', async () => {
      const body = JSON.stringify([
        { subscriptionType: 'contact.creation', objectId: 1 },
        { subscriptionType: 'contact.propertyChange', objectId: 1, propertyName: 'email', propertyValue: 'a@b.com' },
        { subscriptionType: 'contact.deletion', objectId: 2 },
        { subscriptionType: 'company.creation', objectId: 3 },
        { subscriptionType: 'company.propertyChange', objectId: 3, propertyName: 'name' },
        { subscriptionType: 'deal.creation', objectId: 4 },
        { subscriptionType: 'deal.propertyChange', objectId: 4, propertyName: 'amount', propertyValue: 100 },
        { subscriptionType: 'ticket.creation', objectId: 5 },
      ]);
      const timestamp = nowMs();
      const signature = signHubSpot({ body, timestamp });

      const response = await request(app)
        .post(PATH)
        .set('Host', HOST)
        .set('Content-Type', 'application/json')
        .set('X-HubSpot-Signature-v3', signature)
        .set('X-HubSpot-Request-Timestamp', timestamp)
        .send(body);

      expect(response.status).toBe(200);
    });

    it('rejects requests with a stale timestamp', async () => {
      const body = '[]';
      const stale = (Date.now() - 6 * 60 * 1000).toString();
      const signature = signHubSpot({ body, timestamp: stale });

      const response = await request(app)
        .post(PATH)
        .set('Host', HOST)
        .set('Content-Type', 'application/json')
        .set('X-HubSpot-Signature-v3', signature)
        .set('X-HubSpot-Request-Timestamp', stale)
        .send(body);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
