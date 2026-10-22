const request = require('supertest');

// Set test environment variables before importing the app
process.env.CARTESIA_WEBHOOK_SECRET = 'test_cartesia_webhook_secret_0123456789';

const app = require('../src/index');
const { verifyCartesiaRequest } = require('../src/index');

const SECRET = process.env.CARTESIA_WEBHOOK_SECRET;

// Shapes follow the Cartesia docs' envelope: type, call_id, agent_id, webhook_id, webhook_request_id, timestamp
function samplePayload(type = 'call_completed', requestId = `webhook_req_${Math.random()}`) {
  const base = {
    type,
    call_id: 'ac_test_123',
    agent_id: 'agent_demo',
    webhook_id: 'agent_webhook_test',
    webhook_request_id: requestId,
    timestamp: '2026-01-01T00:00:00.000000000Z'
  };
  if (type === 'call_turn') return { ...base, turn: { id: 0, role: 'user', text: 'Hello' } };
  if (type === 'post_call_analysis') return { ...base, analysis: { summary: 'A short call.' } };
  return {
    ...base,
    call: { id: 'ac_test_123', agent_id: 'agent_demo', status: type.replace('call_', ''), end_reason: 'client_hangup' }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app).post('/webhooks/cartesia').set('Content-Type', contentType).send(body);
}

describe('Cartesia webhook endpoint', () => {
  describe('x-webhook-secret verification', () => {
    it('accepts the correct secret', async () => {
      const res = await post().set('x-webhook-secret', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await post().set('x-webhook-secret', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await post().set('x-webhook-secret', 'short');
      expect(res.status).toBe(401);
    });

    it('does not accept a prefixed secret (Cartesia sends it raw)', async () => {
      const res = await post().set('x-webhook-secret', `Bearer ${SECRET}`);
      expect(res.status).toBe(401);
    });

    it('verifies regardless of content type', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set('x-webhook-secret', SECRET);
      expect(res.status).toBe(200);
    });
  });

  describe('Request handling', () => {
    it('returns 400 for an invalid JSON body', async () => {
      const res = await post('{not json').set('x-webhook-secret', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2,3]').set('x-webhook-secret', SECRET);
      expect(res.status).toBe(400);
    });

    it('handles every documented event type and unknown types', async () => {
      const types = ['call_started', 'call_completed', 'call_failed', 'call_turn', 'post_call_analysis', 'something_else'];
      for (const type of types) {
        const res = await post(JSON.stringify(samplePayload(type))).set('x-webhook-secret', SECRET);
        expect(res.status).toBe(200);
        expect(res.body.duplicate).toBeUndefined();
      }
    });

    it('skips a retried event with the same webhook_request_id', async () => {
      const body = JSON.stringify(samplePayload('call_started', 'webhook_req_retry_1'));
      const first = await post(body).set('x-webhook-secret', SECRET);
      const second = await post(body).set('x-webhook-secret', SECRET);
      expect(first.body).toEqual({ received: true });
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ received: true, duplicate: true });
    });
  });

  describe('verifyCartesiaRequest', () => {
    it('rejects everything when no secret is configured', () => {
      expect(verifyCartesiaRequest({ 'x-webhook-secret': '' }, '')).toBe(false);
      expect(verifyCartesiaRequest({ 'x-webhook-secret': 'anything' }, undefined)).toBe(false);
    });

    it('accepts a matching header and rejects a mismatch', () => {
      expect(verifyCartesiaRequest({ 'x-webhook-secret': 's3cret' }, 's3cret')).toBe(true);
      expect(verifyCartesiaRequest({ 'x-webhook-secret': 's3cre7' }, 's3cret')).toBe(false);
    });
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});
