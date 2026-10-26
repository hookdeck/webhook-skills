const request = require('supertest');

// Set test environment variables before importing the app
process.env.PROJECT44_WEBHOOK_SECRET = 'test_project44_secret_0123456789';
delete process.env.PROJECT44_WEBHOOK_HEADER; // default: X-Api-Key

const app = require('../src/index');
const { verifyProject44Request } = require('../src/index');

const SECRET = process.env.PROJECT44_WEBHOOK_SECRET;

const EVENTS = [
  'shipments.v1.shipment.created', 'shipments.v1.shipment.deleted',
  'shipments.v1.event.added', 'shipments.v1.event.updated', 'shipments.v1.event.removed',
  'shipments.v1.state.added', 'shipments.v1.state.updated', 'shipments.v1.state.removed',
  'shipments.v1.exception.addedOrUpdated'
];

function samplePayload(eventType = 'shipments.v1.event.added') {
  return {
    eventId: '333d2a1b-d332-4775-8f8e-960e5f538431',
    eventType,
    createdDateTime: '2025-03-31T17:01:42.92601441Z',
    dataType: 'EventChange',
    context: { shipment: { shipmentId: 'ac694c91-e308-4329-9584-ee10acb937b3', identifiers: [], attributes: [] } },
    data: {}
  };
}

function send(method = 'post', body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  const req = request(app)[method]('/webhooks/project44').set('Content-Type', contentType);
  return body === null ? req : req.send(body);
}

describe('project44 webhook endpoint', () => {
  describe('API key header verification', () => {
    it('accepts the correct value', async () => {
      const res = await send().set('X-Api-Key', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await send().set('x-api-key', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await send().set('X-Api-Key', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await send().set('X-Api-Key', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await send();
      expect(res.status).toBe(401);
    });

    it('compares the whole value and does not parse a Bearer prefix', async () => {
      const res = await send().set('X-Api-Key', `Bearer ${SECRET}`);
      expect(res.status).toBe(401);
    });

    it('requires the Bearer prefix when the secret includes it', () => {
      const env = { PROJECT44_WEBHOOK_SECRET: 'Bearer abc123' };
      expect(verifyProject44Request({ 'x-api-key': 'Bearer abc123' }, env)).toBe(true);
      expect(verifyProject44Request({ 'x-api-key': 'abc123' }, env)).toBe(false);
    });

    it('reads a custom header name from PROJECT44_WEBHOOK_HEADER', () => {
      const env = { PROJECT44_WEBHOOK_SECRET: SECRET, PROJECT44_WEBHOOK_HEADER: 'X-Project44-Key' };
      expect(verifyProject44Request({ 'x-project44-key': SECRET }, env)).toBe(true);
      expect(verifyProject44Request({ 'x-api-key': SECRET }, env)).toBe(false);
    });

    it('rejects everything when PROJECT44_WEBHOOK_SECRET is unset', () => {
      expect(verifyProject44Request({ 'x-api-key': SECRET }, {})).toBe(false);
      expect(verifyProject44Request({ 'x-api-key': '' }, { PROJECT44_WEBHOOK_SECRET: '' })).toBe(false);
    });
  });

  describe('HTTP methods and body handling', () => {
    it.each(['post', 'put', 'patch'])('accepts %s', async (method) => {
      const res = await send(method).set('X-Api-Key', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts GET with no body', async () => {
      const res = await request(app).get('/webhooks/project44').set('X-Api-Key', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('rejects GET without the header', async () => {
      const res = await request(app).get('/webhooks/project44');
      expect(res.status).toBe(401);
    });

    it('returns 405 for other methods', async () => {
      const res = await request(app).delete('/webhooks/project44').set('X-Api-Key', SECRET);
      expect(res.status).toBe(405);
    });

    it('accepts any content type (raw body)', async () => {
      const res = await send('post', JSON.stringify(samplePayload()), 'text/plain').set('X-Api-Key', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts a +json content type', async () => {
      const res = await send('post', JSON.stringify(samplePayload()), 'application/vnd.p44+json').set('X-Api-Key', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await send('post', '{not json').set('X-Api-Key', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await send('post', '[1,2]').set('X-Api-Key', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await send('post', '{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (eventType) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await send('post', JSON.stringify(samplePayload(eventType))).set('X-Api-Key', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await send('post', JSON.stringify(samplePayload('shipments.v1.something.new'))).set('X-Api-Key', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
