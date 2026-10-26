// Generated with: sahha-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Any string from the Sahha Dashboard; it is used as UTF-8 bytes, not decoded.
const SECRET = 'sahha_test_secret_key_123';
process.env.SAHHA_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

/** Sign exactly like Sahha: lowercase hex HMAC-SHA256 of the raw body, no prefix. */
function sign(rawBody, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

function post(rawBody, { eventType = 'ScoreCreatedIntegrationEvent', signature, headers = {} } = {}) {
  const h = {
    'content-type': 'application/json',
    'x-event-type': eventType,
    'x-external-id': 'user_12345',
    'x-signature': signature ?? sign(rawBody),
    ...headers,
  };
  for (const k of Object.keys(h)) if (h[k] === undefined) delete h[k];
  return request(app).post('/webhooks/sahha').set(h).send(rawBody);
}

const events = {
  ScoreCreatedIntegrationEvent: { id: 's1', externalId: 'user_12345', type: 'sleep', state: 'high', score: 0.85, factors: [] },
  BiomarkerCreatedIntegrationEvent: { id: 'b1', externalId: 'user_12345', type: 'steps', value: '8547', unit: 'count' },
  ArchetypeCreatedIntegrationEvent: { id: 'a1', externalId: 'user_12345', name: 'chronotype', value: 'early_bird' },
  TagReceivedIntegrationEvent: { id: 't1', externalId: 'user_12345', type: 'state', name: 'night_shift', value: null },
  DataLogReceivedIntegrationEvent: { logType: 'activity', dataType: 'steps', dataLogs: [{ id: 'd1', value: 1250 }] },
};

describe('Sahha webhook', () => {
  let logSpy;
  beforeEach(() => {
    process.env.SAHHA_WEBHOOK_SECRET = SECRET;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('valid signatures', () => {
    it.each(Object.entries(events))('accepts %s', async (eventType, payload) => {
      const body = JSON.stringify(payload);
      const res = await post(body, { eventType });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(logSpy).toHaveBeenCalled();
    });

    it('accepts an uppercase hex signature (compared case-insensitively)', async () => {
      const body = JSON.stringify(events.ScoreCreatedIntegrationEvent);
      const res = await post(body, { signature: sign(body).toUpperCase() });
      expect(res.status).toBe(200);
    });

    it('verifies the exact bytes, including whitespace and non-ASCII', async () => {
      const body = '{ "type" :  "sleep",\n "note": "café ✓" }';
      const res = await post(body);
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const body = JSON.stringify(events.ScoreCreatedIntegrationEvent);
      const res = await post(body, { headers: { 'content-type': 'text/plain' } });
      expect(res.status).toBe(200);
    });

    it('logs unknown event types and still returns 200', async () => {
      const body = JSON.stringify({ hello: 'world' });
      const res = await post(body, { eventType: 'SomethingNewIntegrationEvent' });
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled Sahha event type: SomethingNewIntegrationEvent');
    });
  });

  describe('invalid signatures', () => {
    const body = JSON.stringify(events.ScoreCreatedIntegrationEvent);

    it('rejects a missing signature with 401', async () => {
      const res = await post(body, { headers: { 'x-signature': undefined } });
      expect(res.status).toBe(401);
    });

    it('rejects an empty signature with 401', async () => {
      const res = await post(body, { signature: '' });
      expect(res.status).toBe(401);
    });

    it('rejects a signature signed with the wrong secret', async () => {
      const res = await post(body, { signature: sign(body, 'wrong_secret') });
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const res = await post(body.replace('0.85', '0.99'), { signature: sign(body) });
      expect(res.status).toBe(401);
    });

    it('rejects wrong-length and non-hex signatures', async () => {
      for (const signature of [
        sign(body).slice(0, 62),
        sign(body) + 'ab',
        'z'.repeat(64),
        'sha256=' + sign(body),
      ]) {
        const res = await post(body, { signature });
        expect(res.status).toBe(401);
      }
    });

    it('does not accept a signature that covers a parsed-and-reserialized body', async () => {
      const raw = '{"a": 1}';
      const res = await post(raw, { signature: sign(JSON.stringify(JSON.parse(raw))) });
      expect(res.status).toBe(401);
    });
  });

  describe('after verification', () => {
    it('returns 400 for non-JSON bodies', async () => {
      const body = 'not json';
      const res = await post(body);
      expect(res.status).toBe(400);
    });

    it('returns 400 for JSON that is not an object', async () => {
      for (const body of ['[]', '"x"', '42', 'null']) {
        const res = await post(body);
        expect(res.status).toBe(400);
      }
    });

    it('returns 400 when X-Event-Type is missing', async () => {
      const body = JSON.stringify({});
      const res = await post(body, { eventType: undefined, headers: { 'x-event-type': undefined } });
      expect(res.status).toBe(400);
    });

    it('ignores wrong-typed fields instead of failing with 500', async () => {
      const cases = [
        ['ScoreCreatedIntegrationEvent', { type: 5, state: {}, score: 'x' }],
        ['BiomarkerCreatedIntegrationEvent', { type: [], value: 1, unit: null }],
        ['ArchetypeCreatedIntegrationEvent', { name: {}, value: [] }],
        ['TagReceivedIntegrationEvent', { name: 1, type: null }],
        ['DataLogReceivedIntegrationEvent', { dataLogs: 'nope' }],
        ['DataLogReceivedIntegrationEvent', { dataLogs: [1, null, 'x', []] }],
        ['DataLogReceivedIntegrationEvent', { dataLogs: { a: 1 }, dataType: 7 }],
      ];
      for (const [eventType, payload] of cases) {
        const res = await post(JSON.stringify(payload), { eventType });
        expect(res.status).toBe(200);
      }
    });
  });

  it('fails closed with 500 when the secret is not configured', async () => {
    delete process.env.SAHHA_WEBHOOK_SECRET;
    const body = JSON.stringify(events.ScoreCreatedIntegrationEvent);
    const res = await post(body);
    expect(res.status).toBe(500);
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
