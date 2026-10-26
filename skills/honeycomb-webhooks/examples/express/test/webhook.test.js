const request = require('supertest');

// Set test environment variables before importing the app
process.env.HONEYCOMB_WEBHOOK_SECRET = 'test_honeycomb_shared_secret_0123456789';

const app = require('../src/index');
const { verifyHoneycombRequest, classifyAlert } = require('../src/index');

const SECRET = process.env.HONEYCOMB_WEBHOOK_SECRET;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// Illustrative payloads: Honeycomb doesn't document the default payload field by field.
const TRIGGER = {
  name: 'Slow checkout requests',
  status: 'TRIGGERED',
  trigger_url: 'https://ui.honeycomb.io/example/triggers/abc123',
  threshold: { op: '>', value: 2000 }
};
const BURN_ALERT = {
  slo_name: 'Checkout availability',
  alert_type: 'exhaustion_time',
  budget_remaining: 0.12
};
const ANOMALY = { anomaly_id: 'an_123', summary: 'Error rate anomaly' };

let n = 0;
const uniqueId = () => `delivery-${++n}`;

function send(method, { token = SECRET, body, contentType = 'application/json', deliveryId } = {}) {
  let req = request(app)[method]('/webhooks/honeycomb');
  if (token !== null) req = req.set('X-Honeycomb-Webhook-Token', token);
  if (deliveryId) req = req.set('X-Honeycomb-Webhook-Delivery-ID', deliveryId);
  if (body === undefined) return req;
  return req.set('Content-Type', contentType).send(body);
}

describe('Honeycomb webhook endpoint', () => {
  describe('X-Honeycomb-Webhook-Token verification', () => {
    it.each(METHODS)('accepts the correct secret on %s', async (method) => {
      const body = method === 'get' ? undefined : JSON.stringify(TRIGGER);
      const res = await send(method, { body });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it.each(METHODS)('rejects a wrong secret on %s', async (method) => {
      const res = await send(method, { token: 'wrong', body: JSON.stringify(TRIGGER) });
      expect(res.status).toBe(401);
    });

    it.each(METHODS)('rejects a missing header on %s', async (method) => {
      const res = await send(method, { token: null, body: JSON.stringify(TRIGGER) });
      expect(res.status).toBe(401);
    });

    it('checks the credential before parsing the body', async () => {
      const res = await send('post', { token: 'wrong', body: '{not json' });
      expect(res.status).toBe(401);
    });

    it('compares the whole header value, not a prefix', async () => {
      for (const token of [`${SECRET}x`, SECRET.slice(0, -1), `Bearer ${SECRET}`]) {
        const res = await send('post', { token, body: JSON.stringify(TRIGGER) });
        expect(res.status).toBe(401);
      }
    });

    it('accepts any content type', async () => {
      const res = await send('post', { body: JSON.stringify(TRIGGER), contentType: 'text/plain' });
      expect(res.status).toBe(200);
    });
  });

  describe('verifyHoneycombRequest', () => {
    it('matches the header name case-insensitively via lowercased Node headers', () => {
      expect(verifyHoneycombRequest({ 'x-honeycomb-webhook-token': SECRET })).toBe(true);
    });

    it('fails closed when the secret is not configured', () => {
      expect(verifyHoneycombRequest({ 'x-honeycomb-webhook-token': 'anything' }, '')).toBe(false);
      expect(verifyHoneycombRequest({ 'x-honeycomb-webhook-token': '' }, '')).toBe(false);
    });

    it('does not throw on unequal lengths or non-ASCII values', () => {
      expect(verifyHoneycombRequest({ 'x-honeycomb-webhook-token': 'short' })).toBe(false);
      expect(verifyHoneycombRequest({ 'x-honeycomb-webhook-token': 'sécret-日本' })).toBe(false);
      expect(verifyHoneycombRequest({ 'x-honeycomb-webhook-token': 'sécret-日本' }, 'sécret-日本')).toBe(true);
    });
  });

  describe('body handling', () => {
    it('handles an empty body', async () => {
      const res = await send('post', { body: '' });
      expect(res.status).toBe(200);
    });

    it('rejects invalid JSON after authentication', async () => {
      const res = await send('post', { body: '{not json' });
      expect(res.status).toBe(400);
    });

    it('rejects a non-object JSON body', async () => {
      const res = await send('post', { body: JSON.stringify([1, 2]) });
      expect(res.status).toBe(400);
    });
  });

  describe('alert classification', () => {
    it('classifies a trigger payload', () => expect(classifyAlert(TRIGGER)).toBe('trigger'));
    it('classifies an SLO burn alert payload', () => expect(classifyAlert(BURN_ALERT)).toBe('slo_burn_alert'));
    it('classifies an anomaly payload', () => expect(classifyAlert(ANOMALY)).toBe('anomaly'));
    it('falls back to unknown for custom templates', () => expect(classifyAlert({ foo: 1 })).toBe('unknown'));

    it.each([TRIGGER, BURN_ALERT, ANOMALY, { foo: 1 }])('returns 200 for %j', async (payload) => {
      const res = await send('post', { body: JSON.stringify(payload) });
      expect(res.status).toBe(200);
    });
  });

  describe('idempotency', () => {
    it('acknowledges a repeated X-Honeycomb-Webhook-Delivery-ID without reprocessing', async () => {
      const id = uniqueId();
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      const first = await send('post', { body: JSON.stringify(TRIGGER), deliveryId: id });
      const second = await send('post', { body: JSON.stringify(TRIGGER), deliveryId: id });
      expect(first.body).toEqual({ received: true });
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ received: true, duplicate: true });
      expect(log.mock.calls.filter(([m]) => String(m).startsWith('Trigger alert'))).toHaveLength(1);
      log.mockRestore();
    });

    it('does not treat an unauthenticated request as a duplicate', async () => {
      const id = uniqueId();
      await send('post', { body: JSON.stringify(TRIGGER), deliveryId: id });
      const res = await send('post', { token: 'wrong', body: JSON.stringify(TRIGGER), deliveryId: id });
      expect(res.status).toBe(401);
    });
  });

  describe('health', () => {
    it('returns ok', async () => {
      const res = await request(app).get('/health');
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});
