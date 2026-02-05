import request from 'supertest';
import crypto from 'crypto';
import { SignJWT } from 'jose';

// Set test environment variables before importing app
const TEST_SECRET = 'test_webhook_secret_for_hmac_signing';
process.env.FUSIONAUTH_WEBHOOK_SECRET = TEST_SECRET;

const { app, verifyFusionAuthWebhook } = await import('../src/index.js');

/**
 * Generate a valid FusionAuth signature JWT for testing
 * FusionAuth signs webhooks with a JWT containing request_body_sha256 claim
 */
async function generateFusionAuthSignature(payload, secret) {
  // Calculate SHA-256 hash of body (base64 encoded)
  const bodyHash = crypto
    .createHash('sha256')
    .update(payload)
    .digest('base64');

  // Create signing key from secret
  const key = new TextEncoder().encode(secret);

  // Sign JWT with body hash claim
  const jwt = await new SignJWT({ request_body_sha256: bodyHash })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .sign(key);

  return jwt;
}

describe('FusionAuth Webhook Endpoint', () => {
  const webhookSecret = TEST_SECRET;

  describe('POST /webhooks/fusionauth', () => {
    it('should return 401 for missing signature', async () => {
      const payload = JSON.stringify({
        event: {
          id: 'evt_test_123',
          type: 'user.create',
          user: { id: 'user_123' }
        }
      });

      const response = await request(app)
        .post('/webhooks/fusionauth')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should return 401 for invalid signature', async () => {
      const payload = JSON.stringify({
        event: {
          id: 'evt_test_123',
          type: 'user.create',
          user: { id: 'user_123' }
        }
      });

      const response = await request(app)
        .post('/webhooks/fusionauth')
        .set('Content-Type', 'application/json')
        .set('X-FusionAuth-Signature-JWT', 'invalid.jwt.signature')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should return 401 for tampered payload', async () => {
      const originalPayload = JSON.stringify({
        event: {
          id: 'evt_test_123',
          type: 'user.create',
          user: { id: 'user_123' }
        }
      });
      
      // Sign with original payload but send different payload
      const signature = await generateFusionAuthSignature(originalPayload, webhookSecret);
      const tamperedPayload = JSON.stringify({
        event: {
          id: 'evt_test_123',
          type: 'user.create',
          user: { id: 'user_tampered' }
        }
      });

      const response = await request(app)
        .post('/webhooks/fusionauth')
        .set('Content-Type', 'application/json')
        .set('X-FusionAuth-Signature-JWT', signature)
        .send(tamperedPayload);

      expect(response.status).toBe(401);
    });

    it('should return 200 for valid signature', async () => {
      const payload = JSON.stringify({
        event: {
          id: 'evt_test_valid',
          type: 'user.create',
          user: { id: 'user_valid' }
        }
      });
      const signature = await generateFusionAuthSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/fusionauth')
        .set('Content-Type', 'application/json')
        .set('X-FusionAuth-Signature-JWT', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should handle different event types', async () => {
      const eventTypes = [
        'user.create',
        'user.update',
        'user.delete',
        'user.deactivate',
        'user.reactivate',
        'user.login.success',
        'user.login.failed',
        'user.registration.create',
        'user.registration.update',
        'user.registration.delete',
        'user.email.verified',
        'unknown.event.type'
      ];

      for (const eventType of eventTypes) {
        const payload = JSON.stringify({
          event: {
            id: `evt_${eventType.replace(/\./g, '_')}`,
            type: eventType,
            user: { id: 'user_123', email: 'test@example.com' },
            applicationId: 'app_123'
          }
        });
        const signature = await generateFusionAuthSignature(payload, webhookSecret);

        const response = await request(app)
          .post('/webhooks/fusionauth')
          .set('Content-Type', 'application/json')
          .set('X-FusionAuth-Signature-JWT', signature)
          .send(payload);

        expect(response.status).toBe(200);
      }
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

describe('verifyFusionAuthWebhook', () => {
  const secret = TEST_SECRET;

  it('should return false for missing JWT', async () => {
    const result = await verifyFusionAuthWebhook(Buffer.from('{}'), null, secret);
    expect(result).toBe(false);
  });

  it('should return false for missing secret', async () => {
    const jwt = await generateFusionAuthSignature('{}', secret);
    const result = await verifyFusionAuthWebhook(Buffer.from('{}'), jwt, null);
    expect(result).toBe(false);
  });

  it('should return true for valid signature', async () => {
    const payload = '{"test": true}';
    const jwt = await generateFusionAuthSignature(payload, secret);
    const result = await verifyFusionAuthWebhook(Buffer.from(payload), jwt, secret);
    expect(result).toBe(true);
  });

  it('should return false for wrong secret', async () => {
    const payload = '{"test": true}';
    const jwt = await generateFusionAuthSignature(payload, secret);
    const result = await verifyFusionAuthWebhook(Buffer.from(payload), jwt, 'wrong_secret');
    expect(result).toBe(false);
  });

  it('should return false for modified payload', async () => {
    const originalPayload = '{"test": true}';
    const jwt = await generateFusionAuthSignature(originalPayload, secret);
    const result = await verifyFusionAuthWebhook(Buffer.from('{"test": false}'), jwt, secret);
    expect(result).toBe(false);
  });
});
