const request = require('supertest');
const crypto = require('crypto');

// MaintainX secrets are used as raw strings (no encoding/prefix)
const SECRET = 'test_maintainx_secret';
process.env.MAINTAINX_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifyMaintainxSignature } = require('../src/index');

// Generate a real signature using MaintainX's algorithm: HMAC-SHA256 hex of "{t}.{body}"
function sign(body, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

const HEADER = 'x-maintainx-webhook-body-signature';

function post(body, header) {
  const req = request(app).post('/webhooks/maintainx').set('Content-Type', 'application/json');
  if (header) req.set(HEADER, header);
  return req.send(body);
}

const events = {
  NEW_WORK_ORDER: { eventType: 'NEW_WORK_ORDER', workOrderId: 123456, orgId: 321, occurredAt: '2022-01-01T00:00:00.000Z' },
  WORK_ORDER_CHANGE: { eventType: 'WORK_ORDER_CHANGE', workOrderId: 123456, orgId: 321, occurredAt: '2022-01-01T00:00:00.000Z' },
  WORK_ORDER_STATUS_CHANGE: { eventType: 'WORK_ORDER_STATUS_CHANGE', workOrderId: 123456, orgId: 321, occurredAt: '2022-01-01T00:00:00.000Z', oldStatus: 'OPEN', newStatus: 'IN_PROGRESS' },
  NEW_WORK_REQUEST: { eventType: 'NEW_WORK_REQUEST', workRequestId: 55, orgId: 321, occurredAt: '2022-01-01T00:00:00.000Z' },
  ASSET_STATUS_CHANGE: { eventType: 'ASSET_STATUS_CHANGE', assetId: 42, orgId: 321, occurredAt: '2022-01-01T00:00:00.000Z', oldStatus: { id: 1 }, newStatus: { id: 2 } },
};

describe('MaintainX webhook', () => {
  describe('valid signatures', () => {
    test.each(Object.keys(events))('accepts %s', async (name) => {
      const body = JSON.stringify(events[name]);
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    test('accepts an unhandled event type', async () => {
      const body = JSON.stringify({ eventType: 'NEW_PART', orgId: 321 });
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
    });

    test('ignores extra header elements and unknown schemes', async () => {
      const body = JSON.stringify(events.NEW_WORK_ORDER);
      const res = await post(body, `${sign(body)},v2=deadbeef`);
      expect(res.status).toBe(200);
    });
  });

  describe('invalid requests', () => {
    test('rejects a missing signature header', async () => {
      const res = await post(JSON.stringify(events.NEW_WORK_ORDER));
      expect(res.status).toBe(400);
    });

    test('rejects a wrong secret', async () => {
      const body = JSON.stringify(events.NEW_WORK_ORDER);
      const res = await post(body, sign(body, 'other_secret'));
      expect(res.status).toBe(400);
    });

    test('rejects a tampered body', async () => {
      const body = JSON.stringify(events.NEW_WORK_ORDER);
      const header = sign(body);
      const res = await post(JSON.stringify({ ...events.NEW_WORK_ORDER, workOrderId: 1 }), header);
      expect(res.status).toBe(400);
    });

    test('rejects a malformed header', async () => {
      const body = JSON.stringify(events.NEW_WORK_ORDER);
      const res = await post(body, 'garbage');
      expect(res.status).toBe(400);
    });

    test('accepts an old timestamp by default (retries and replays keep the original)', async () => {
      const old = Math.floor(Date.now() / 1000) - 3600;
      const body = JSON.stringify(events.NEW_WORK_ORDER);
      const res = await post(body, sign(body, SECRET, old));
      expect(res.status).toBe(200);
    });

    test('rejects an old timestamp when MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
      process.env.MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS = '300';
      try {
        const old = Math.floor(Date.now() / 1000) - 3600;
        const body = JSON.stringify(events.NEW_WORK_ORDER);
        const res = await post(body, sign(body, SECRET, old));
        expect(res.status).toBe(400);
      } finally {
        delete process.env.MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS;
      }
    });

    test('treats a non-numeric MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', async () => {
      process.env.MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const old = Math.floor(Date.now() / 1000) - 3600;
        const body = JSON.stringify(events.NEW_WORK_ORDER);
        const res = await post(body, sign(body, SECRET, old));
        expect(res.status).toBe(200);
      } finally {
        delete process.env.MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS;
        warn.mockRestore();
      }
    });

    test('rejects a non-hex signature of the wrong length', async () => {
      const body = JSON.stringify(events.NEW_WORK_ORDER);
      const res = await post(body, `t=${Math.floor(Date.now() / 1000)},v1=abc`);
      expect(res.status).toBe(400);
    });

    test('rejects a validly signed body that is not JSON', async () => {
      const body = 'not json';
      const res = await post(body, sign(body));
      expect(res.status).toBe(400);
    });
  });

  describe('verifyMaintainxSignature', () => {
    test('works with a Buffer body', () => {
      const body = JSON.stringify(events.NEW_WORK_ORDER);
      expect(verifyMaintainxSignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
    });

    test('honours the tolerance argument', () => {
      const body = '{}';
      const header = sign(body, SECRET, Math.floor(Date.now() / 1000) - 100);
      expect(verifyMaintainxSignature(body, header, SECRET, 60)).toBe(false);
      expect(verifyMaintainxSignature(body, header, SECRET, 300)).toBe(true);
    });
  });

  test('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
