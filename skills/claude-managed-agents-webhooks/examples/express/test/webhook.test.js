const request = require('supertest');
const crypto = require('crypto');

// Test secret: whsec_ + base64("test_secret_key_for_testing")
process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvcl90ZXN0aW5n';

const app = require('../src/index');

const ENDPOINT = '/webhooks/claude-managed-agents';

/**
 * Generate a valid Standard Webhooks signature.
 */
function generateSignature(payload, secret, webhookId, webhookTimestamp) {
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, 'base64');

  const signedContent = `${webhookId}.${webhookTimestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest('base64');

  return `v1,${signature}`;
}

describe('Claude Managed Agents Webhook Endpoint', () => {
  const secret = process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY;

  describe(`POST ${ENDPOINT}`, () => {
    it('returns 400 when signature headers are missing', async () => {
      const response = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('returns 400 for malformed signature header', async () => {
      const payload = JSON.stringify({
        type: 'event',
        id: 'event_test_123',
        data: { type: 'session.status_idled', id: 'sesn_ABC123' },
      });

      const response = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('webhook-id', 'msg_test123')
        .set('webhook-timestamp', Math.floor(Date.now() / 1000).toString())
        .set('webhook-signature', 'not_in_v1_format')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('returns 400 for an expired timestamp (>5 minutes)', async () => {
      const payload = JSON.stringify({
        type: 'event',
        id: 'event_test_123',
        data: { type: 'session.status_idled', id: 'sesn_ABC123' },
      });

      const webhookId = 'msg_test123';
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString();
      const signature = generateSignature(payload, secret, webhookId, oldTimestamp);

      const response = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', oldTimestamp)
        .set('webhook-signature', signature)
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('returns 400 for a forged signature', async () => {
      const payload = JSON.stringify({
        type: 'event',
        id: 'event_test_123',
        data: { type: 'session.status_idled', id: 'sesn_ABC123' },
      });

      const response = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('webhook-id', 'msg_test123')
        .set('webhook-timestamp', Math.floor(Date.now() / 1000).toString())
        .set('webhook-signature', 'v1,forged_signature_value')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('returns 400 when the payload was tampered with after signing', async () => {
      const original = JSON.stringify({
        type: 'event',
        id: 'event_test_123',
        data: { type: 'session.status_idled', id: 'sesn_ORIGINAL' },
      });

      const webhookId = 'msg_test123';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
      const signature = generateSignature(original, secret, webhookId, webhookTimestamp);

      const tampered = JSON.stringify({
        type: 'event',
        id: 'event_test_123',
        data: { type: 'session.status_idled', id: 'sesn_TAMPERED' },
      });

      const response = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', webhookTimestamp)
        .set('webhook-signature', signature)
        .send(tampered);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('returns 200 for a valid signature', async () => {
      const payload = JSON.stringify({
        type: 'event',
        id: 'event_test_valid',
        created_at: '2026-03-18T14:05:22Z',
        data: {
          type: 'session.status_idled',
          id: 'sesn_01XYZ',
          organization_id: '8a3d2f1e-aaaa-bbbb-cccc-ddddeeeeffff',
          workspace_id: 'c7b0e4d9-0000-1111-2222-333344445555',
        },
      });

      const webhookId = 'msg_test123';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
      const signature = generateSignature(payload, secret, webhookId, webhookTimestamp);

      const response = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', webhookTimestamp)
        .set('webhook-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    const eventTypes = [
      'session.status_run_started',
      'session.status_idled',
      'session.status_rescheduled',
      'session.status_terminated',
      'session.thread_created',
      'session.thread_idled',
      'session.thread_terminated',
      'session.outcome_evaluation_ended',
      'vault.created',
      'vault.archived',
      'vault.deleted',
      'vault_credential.created',
      'vault_credential.archived',
      'vault_credential.deleted',
      'vault_credential.refresh_failed',
    ];

    eventTypes.forEach((eventType) => {
      it(`handles ${eventType}`, async () => {
        const payload = JSON.stringify({
          type: 'event',
          id: `event_test_${eventType}`,
          created_at: new Date().toISOString(),
          data: { type: eventType, id: 'resource_123' },
        });

        const webhookId = `msg_${eventType}`;
        const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
        const signature = generateSignature(payload, secret, webhookId, webhookTimestamp);

        const response = await request(app)
          .post(ENDPOINT)
          .set('Content-Type', 'application/json')
          .set('webhook-id', webhookId)
          .set('webhook-timestamp', webhookTimestamp)
          .set('webhook-signature', signature)
          .send(payload);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });
      });
    });

    it('handles an unrecognised event type gracefully', async () => {
      const payload = JSON.stringify({
        type: 'event',
        id: 'event_test_unknown',
        data: { type: 'session.status_future_event', id: 'sesn_X' },
      });

      const webhookId = 'msg_unknown';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
      const signature = generateSignature(payload, secret, webhookId, webhookTimestamp);

      const response = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', webhookTimestamp)
        .set('webhook-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('accepts case-insensitive headers', async () => {
      const payload = JSON.stringify({
        type: 'event',
        id: 'event_test_case',
        data: { type: 'session.status_idled', id: 'sesn_ABC123' },
      });

      const webhookId = 'msg_case';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
      const signature = generateSignature(payload, secret, webhookId, webhookTimestamp);

      const response = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('Webhook-Id', webhookId)
        .set('WEBHOOK-TIMESTAMP', webhookTimestamp)
        .set('webhook-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('accepts a multi-signature header (rotation)', async () => {
      const payload = JSON.stringify({
        type: 'event',
        id: 'event_test_rotation',
        data: { type: 'session.status_idled', id: 'sesn_ABC123' },
      });

      const webhookId = 'msg_rotation';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
      const validSignature = generateSignature(payload, secret, webhookId, webhookTimestamp);
      // First sig is bogus (e.g. old key), second sig is valid — should still accept
      const multiSignature = `v1,bogus_signature ${validSignature}`;

      const response = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', webhookTimestamp)
        .set('webhook-signature', multiSignature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });
  });

  describe('GET /health', () => {
    it('returns 200 OK', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
