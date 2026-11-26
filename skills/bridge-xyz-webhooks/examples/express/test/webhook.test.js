const request = require('supertest');
const crypto = require('crypto');

// Generate a throwaway RSA keypair for the test. Bridge signs with its private
// key; we verify with the matching public key set on the env var.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Must be set BEFORE importing the app (the handler reads it at module load).
process.env.BRIDGE_WEBHOOK_PUBLIC_KEY = publicKey;

const app = require('../src/index');

/**
 * Sign a payload exactly the way Bridge does:
 *   digest = SHA256("<timestamp>.<body>")
 *   signature = RSA-SHA256(digest)  <-- the digest is hashed again inside sign()
 */
function signBridge(payload, privateKeyPem, timestamp = Date.now()) {
  const digest = crypto.createHash('sha256').update(`${timestamp}.${payload}`).digest();
  const signer = crypto.createSign('sha256');
  signer.update(digest);
  signer.end();
  const signature = signer.sign(privateKeyPem, 'base64');
  return `t=${timestamp},v0=${signature}`;
}

describe('Bridge Webhook Endpoint', () => {
  describe('POST /webhooks/bridge-xyz', () => {
    it('should return 400 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/bridge-xyz')
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid signature', async () => {
      const payload = JSON.stringify({
        event_type: 'customer.updated.status_transitioned',
        event_object_id: 'cust_123',
      });

      const response = await request(app)
        .post('/webhooks/bridge-xyz')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Signature', `t=${Date.now()},v0=bm90LWEtcmVhbC1zaWc=`)
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 400 for a tampered payload', async () => {
      const original = JSON.stringify({
        event_type: 'transfer.updated.status_transitioned',
        event_object_id: 'transfer_123',
      });
      const signature = signBridge(original, privateKey);

      const tampered = JSON.stringify({
        event_type: 'transfer.updated.status_transitioned',
        event_object_id: 'transfer_tampered',
      });

      const response = await request(app)
        .post('/webhooks/bridge-xyz')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Signature', signature)
        .send(tampered);

      expect(response.status).toBe(400);
    });

    it('should return 400 for a stale timestamp (replay protection)', async () => {
      const payload = JSON.stringify({
        event_type: 'customer.updated.status_transitioned',
        event_object_id: 'cust_123',
      });
      // 11 minutes ago — beyond the 10-minute tolerance.
      const oldTimestamp = Date.now() - 11 * 60 * 1000;
      const signature = signBridge(payload, privateKey, oldTimestamp);

      const response = await request(app)
        .post('/webhooks/bridge-xyz')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Signature', signature)
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for a valid signature', async () => {
      const payload = JSON.stringify({
        event_type: 'customer.updated.status_transitioned',
        event_object_id: 'cust_valid',
      });
      const signature = signBridge(payload, privateKey);

      const response = await request(app)
        .post('/webhooks/bridge-xyz')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should handle all documented event types', async () => {
      const eventTypes = [
        'customer.created',
        'customer.updated.status_transitioned',
        'kyc_link.updated.status_transitioned',
        'transfer.created',
        'transfer.updated.status_transitioned',
        'virtual_account.activity.created',
        'unknown.event',
      ];

      for (const eventType of eventTypes) {
        const payload = JSON.stringify({
          event_type: eventType,
          event_object_id: 'obj_123',
        });
        const signature = signBridge(payload, privateKey);

        const response = await request(app)
          .post('/webhooks/bridge-xyz')
          .set('Content-Type', 'application/json')
          .set('X-Webhook-Signature', signature)
          .send(payload);

        expect(response.status).toBe(200);
      }
    });
  });

  describe('verifyBridgeSignature helper', () => {
    it('validates a correctly signed payload', () => {
      const payload = '{"event_type":"customer.updated.status_transitioned"}';
      const signature = signBridge(payload, privateKey);
      expect(app.verifyBridgeSignature(payload, signature, publicKey)).toBe(true);
    });

    it('rejects a malformed header', () => {
      expect(app.verifyBridgeSignature('{}', 'not-a-valid-header', publicKey)).toBe(false);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
