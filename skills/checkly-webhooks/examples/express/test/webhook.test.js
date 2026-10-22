const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'checkly_test_secret';
process.env.CHECKLY_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function send(body, headers = {}) {
  return request(app).post('/webhooks/checkly').set(headers).send(body);
}

const payload = (alertType) =>
  JSON.stringify({ alertType, checkName: 'Homepage', checkId: 'a1b2c3' });

describe('Checkly webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  test.each(['ALERT_FAILURE', 'ALERT_RECOVERY', 'ALERT_DEGRADED', 'ALERT_SSL'])(
    'accepts a validly signed %s',
    async (type) => {
      const body = payload(type);
      const res = await send(body, {
        'Content-Type': 'application/json',
        'x-checkly-signature': sign(body),
        'x-checkly-timestamp': String(Date.now()),
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    }
  );

  test('verifies bodies sent with any content type', async () => {
    const body = payload('ALERT_FAILURE');
    const res = await send(body, {
      'Content-Type': 'text/plain',
      'x-checkly-signature': sign(body),
    });
    expect(res.status).toBe(200);
  });

  test('verifies the exact raw bytes, not re-serialized JSON', async () => {
    const body = '{ "alertType":  "ALERT_FAILURE",\n "checkName": "Homepage", "checkId": "a1b2c3" }';
    const res = await send(body, {
      'Content-Type': 'application/json',
      'x-checkly-signature': sign(body),
    });
    expect(res.status).toBe(200);
  });

  test('rejects a missing signature', async () => {
    const res = await send(payload('ALERT_FAILURE'), { 'Content-Type': 'application/json' });
    expect(res.status).toBe(400);
  });

  test('rejects a wrong signature', async () => {
    const body = payload('ALERT_FAILURE');
    const res = await send(body, {
      'Content-Type': 'application/json',
      'x-checkly-signature': sign(body, 'wrong_secret'),
    });
    expect(res.status).toBe(400);
  });

  test('rejects a signature of the wrong length', async () => {
    const res = await send(payload('ALERT_FAILURE'), {
      'Content-Type': 'application/json',
      'x-checkly-signature': 'abc',
    });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const signature = sign(payload('ALERT_FAILURE'));
    const res = await send(payload('ALERT_RECOVERY'), {
      'Content-Type': 'application/json',
      'x-checkly-signature': signature,
    });
    expect(res.status).toBe(400);
  });

  test('rejects a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await send(body, {
      'Content-Type': 'text/plain',
      'x-checkly-signature': sign(body),
    });
    expect(res.status).toBe(400);
  });
});
