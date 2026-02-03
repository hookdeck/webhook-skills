const request = require('supertest');
const crypto = require('crypto');

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.ELEVENLABS_WEBHOOK_SECRET = 'test_webhook_secret';

const app = require('../src/index.js');

/**
 * Generate a test signature matching ElevenLabs format
 */
function generateTestSignature(payload, secret, timestamp = null) {
  const ts = timestamp || Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return {
    header: `t=${ts},v0=${signature}`,
    timestamp: ts
  };
}

describe('ElevenLabs Webhook Handler', () => {
  const webhookSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;

  describe('POST /webhooks/elevenlabs', () => {
    it('should accept valid webhook with correct signature', async () => {
      const payload = JSON.stringify({
        type: 'post_call_transcription',
        data: {
          call_id: 'test_call_123',
          transcript: {
            text: 'Test transcription',
            segments: []
          }
        },
        event_timestamp: new Date().toISOString()
      });

      const { header } = generateTestSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/elevenlabs')
        .set('ElevenLabs-Signature', header)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should reject webhook with invalid signature', async () => {
      const payload = JSON.stringify({
        type: 'post_call_transcription',
        data: { call_id: 'test_call_123' },
        event_timestamp: new Date().toISOString()
      });

      const response = await request(app)
        .post('/webhooks/elevenlabs')
        .set('ElevenLabs-Signature', 't=123456,v0=invalid_signature')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toContain('Invalid signature');
    });

    it('should reject webhook without signature header', async () => {
      const payload = JSON.stringify({
        type: 'post_call_transcription',
        data: { call_id: 'test_call_123' },
        event_timestamp: new Date().toISOString()
      });

      const response = await request(app)
        .post('/webhooks/elevenlabs')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toContain('Invalid signature');
    });

    it('should reject webhook with expired timestamp', async () => {
      const payload = JSON.stringify({
        type: 'post_call_transcription',
        data: { call_id: 'test_call_123' },
        event_timestamp: new Date().toISOString()
      });

      // Create signature with timestamp 40 minutes ago
      const oldTimestamp = Math.floor(Date.now() / 1000) - 2400;
      const { header } = generateTestSignature(payload, webhookSecret, oldTimestamp);

      const response = await request(app)
        .post('/webhooks/elevenlabs')
        .set('ElevenLabs-Signature', header)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toContain('Invalid signature');
    });

    it('should handle lowercase signature header', async () => {
      const payload = JSON.stringify({
        type: 'voice_removed',
        data: { voice_id: 'test_voice_456' },
        event_timestamp: new Date().toISOString()
      });

      const { header } = generateTestSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/elevenlabs')
        .set('elevenlabs-signature', header) // lowercase header
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle multiple signatures in header', async () => {
      const payload = JSON.stringify({
        type: 'voice_removal_notice',
        data: { voice_id: 'test_voice_789' },
        event_timestamp: new Date().toISOString()
      });

      const { header, timestamp } = generateTestSignature(payload, webhookSecret);
      // Add an invalid signature to the header
      const multiSigHeader = `${header},v0=invalid_signature_here`;

      const response = await request(app)
        .post('/webhooks/elevenlabs')
        .set('ElevenLabs-Signature', multiSigHeader)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle all event types', async () => {
      const eventTypes = [
        'post_call_transcription',
        'voice_removal_notice',
        'voice_removal_notice_withdrawn',
        'voice_removed'
      ];

      for (const eventType of eventTypes) {
        const payload = JSON.stringify({
          type: eventType,
          data: { test_id: `test_${eventType}` },
          event_timestamp: new Date().toISOString()
        });

        const { header } = generateTestSignature(payload, webhookSecret);

        const response = await request(app)
          .post('/webhooks/elevenlabs')
          .set('ElevenLabs-Signature', header)
          .set('Content-Type', 'application/json')
          .send(payload);

        expect(response.status).toBe(200);
      }
    });
  });

  describe('GET /health', () => {
    it('should return health check status', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});