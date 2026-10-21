const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'test_dbt_cloud_secret'; // dbt's hmac_secret is a raw string
process.env.DBT_CLOUD_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifyDbtCloudSignature } = require('../src/index');

// Real dbt Cloud algorithm: lowercase hex HMAC-SHA256 of the raw body, sent bare in Authorization
function sign(payload, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function makePayload(eventType, extra = {}) {
  return JSON.stringify({
    accountId: 1,
    webhookId: 'wsu_12345abcde',
    eventId: 'wev_2L6Z3l8uPedXKPq9D2nWbPIip7Z',
    timestamp: '2023-01-31T19:28:15.742843678Z',
    eventType,
    webhookName: 'test',
    data: { jobId: '123', jobName: 'Daily Job (dbt build)', runId: '12345', runStatus: 'Success', ...extra },
  });
}

function post(payload, auth) {
  const req = request(app).post('/webhooks/dbt-cloud').set('Content-Type', 'application/json');
  if (auth !== undefined) req.set('Authorization', auth);
  return req.send(payload);
}

describe('verifyDbtCloudSignature', () => {
  const body = '{"a":1}';

  it('accepts a valid signature', () => {
    expect(verifyDbtCloudSignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifyDbtCloudSignature(Buffer.from(body), sign(body, 'other'), SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyDbtCloudSignature(Buffer.from('{"a":2}'), sign(body), SECRET)).toBe(false);
  });

  it('rejects a Bearer-prefixed value', () => {
    expect(verifyDbtCloudSignature(Buffer.from(body), `Bearer ${sign(body)}`, SECRET)).toBe(false);
  });

  it('rejects a missing header or a length mismatch without throwing', () => {
    expect(verifyDbtCloudSignature(Buffer.from(body), undefined, SECRET)).toBe(false);
    expect(verifyDbtCloudSignature(Buffer.from(body), 'abc', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/dbt-cloud', () => {
  it.each(['job.run.started', 'job.run.completed', 'job.run.errored'])(
    'accepts a valid %s event',
    async (eventType) => {
      const payload = makePayload(eventType);
      const res = await post(payload, sign(payload));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    }
  );

  it('accepts an unknown event type with a valid signature', async () => {
    const payload = makePayload('job.run.unknown');
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);
  });

  it('returns 400 when the Authorization header is missing', async () => {
    const res = await post(makePayload('job.run.completed'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post(makePayload('job.run.completed'), 'a'.repeat(64));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body is modified after signing', async () => {
    const payload = makePayload('job.run.completed');
    const res = await post(payload.replace('Success', 'Errored'), sign(payload));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a validly signed but non-JSON body', async () => {
    const payload = 'not json';
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(400);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
