const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app.
// Mux signing secrets are opaque strings used as-is as the HMAC key.
process.env.MUX_WEBHOOK_SECRET = 'test_mux_signing_secret';

const app = require('../src/index');

const webhookSecret = process.env.MUX_WEBHOOK_SECRET;

/**
 * Generate a valid mux-signature header:
 * t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
 */
function generateMuxSignature(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function eventPayload(type, dataId = 'asset_test_123') {
  return JSON.stringify({
    type,
    id: '3a56ac3d-33da-4366-855b-f592d898409d',
    object: { type: type.split('.')[1], id: dataId },
    environment: { name: 'Test', id: 'j0863n' },
    data: { id: dataId, status: 'ready', playback_ids: [{ id: 'pb_123', policy: 'public' }] },
    created_at: '2026-10-20T12:00:00.000Z',
    accessor_source: null,
    accessor: null,
    request_id: null,
  });
}

function post(payload, signature) {
  const req = request(app)
    .post('/webhooks/mux')
    .set('Content-Type', 'application/json');
  if (signature) req.set('Mux-Signature', signature);
  return req.send(payload);
}

describe('Mux Webhook Endpoint', () => {
  describe('POST /webhooks/mux', () => {
    it('returns 400 for a missing signature header', async () => {
      const response = await post(eventPayload('video.asset.ready'));
      expect(response.status).toBe(400);
    });

    it('returns 400 for an invalid signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const response = await post(eventPayload('video.asset.ready'), `t=${timestamp},v1=deadbeef`);
      expect(response.status).toBe(400);
      expect(response.text).toContain('Webhook Error');
    });

    it('returns 400 for a malformed header', async () => {
      const response = await post(eventPayload('video.asset.ready'), 'not-a-valid-header');
      expect(response.status).toBe(400);
    });

    it('returns 400 for a signature made with the wrong secret', async () => {
      const payload = eventPayload('video.asset.ready');
      const response = await post(payload, generateMuxSignature(payload, 'wrong_secret'));
      expect(response.status).toBe(400);
    });

    it('returns 400 for a tampered payload', async () => {
      const signature = generateMuxSignature(eventPayload('video.asset.ready'), webhookSecret);
      const response = await post(eventPayload('video.asset.ready', 'asset_tampered'), signature);
      expect(response.status).toBe(400);
    });

    it('returns 400 for a timestamp older than 5 minutes', async () => {
      const payload = eventPayload('video.asset.ready');
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400;
      const response = await post(payload, generateMuxSignature(payload, webhookSecret, oldTimestamp));
      expect(response.status).toBe(400);
    });

    it('returns 200 for a valid signature', async () => {
      const payload = eventPayload('video.asset.ready');
      const response = await post(payload, generateMuxSignature(payload, webhookSecret));
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('accepts a header with multiple signatures if one matches', async () => {
      const payload = eventPayload('video.asset.ready');
      const timestamp = Math.floor(Date.now() / 1000);
      const valid = generateMuxSignature(payload, webhookSecret, timestamp);
      const response = await post(payload, `${valid},v1=${'0'.repeat(64)}`);
      expect(response.status).toBe(200);
    });

    it('handles all supported and unknown event types', async () => {
      const eventTypes = [
        'video.asset.created',
        'video.asset.ready',
        'video.asset.errored',
        'video.asset.deleted',
        'video.asset.live_stream_completed',
        'video.upload.asset_created',
        'video.live_stream.active',
        'video.live_stream.idle',
        'video.asset.track.ready',
      ];

      for (const eventType of eventTypes) {
        const payload = eventPayload(eventType);
        const response = await post(payload, generateMuxSignature(payload, webhookSecret));
        expect(response.status).toBe(200);
      }
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
