const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'YoUrSeCreT'; // Oh Dear secrets are used as plain UTF-8 text
process.env.OH_DEAR_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

// Based on the monitorAddedNotification example in Oh Dear's docs
const monitorAdded = JSON.stringify({
  type: 'monitorAddedNotification',
  date_time: '20191001113659',
  monitor: {
    id: 1,
    url: 'https://yoursite.tld',
    uses_https: true,
    sort_url: 'yoursite.tld',
    label: 'yoursite.tld',
    team_id: 1,
    latest_run_date: null,
    summarized_check_result: 'pending',
    created_at: '2019-10-01 09:36:59',
    updated_at: '2019-10-01 09:36:59',
    checks: [
      { id: 39675, type: 'uptime', enabled: true, monitor_id: 1, latest_run_result: null },
    ],
  },
}, null, 2);

const uptimeFailed = (kind) => JSON.stringify({
  uuid: '860e04a8-2025-4793-a45c-c9ad71710cf2',
  type: `${kind}UptimeCheckFailedNotification`,
  date_time: '20180312092737',
  result_url: 'https://ohdear.app/monitors/1/check/uptime/report/2',
});

function sign(body, secret = SECRET) {
  // hash_hmac('sha256', $payload, $secret): lowercase hex of the raw body
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/oh-dear').set('Content-Type', contentType);
  if (signature !== undefined) req.set('OhDear-Signature', signature);
  return req.send(body);
}

describe('Oh Dear webhook', () => {
  beforeAll(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterAll(() => jest.restoreAllMocks());

  it('accepts the documented monitorAddedNotification with a valid signature', async () => {
    const res = await post(monitorAdded, sign(monitorAdded));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it.each(['http', 'tcp', 'ping'])('accepts %s uptime failures', async (kind) => {
    const body = uptimeFailed(kind);
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    expect((await post(monitorAdded, sign(monitorAdded).toUpperCase())).status).toBe(200);
  });

  it('verifies raw bytes whatever the content type is', async () => {
    const res = await post(monitorAdded, sign(monitorAdded), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 200 for unhandled event types', async () => {
    const body = JSON.stringify({ uuid: 'u', type: 'lighthouseIssuesFixedNotification' });
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('returns 401 when the signature header is missing', async () => {
    expect((await post(monitorAdded)).status).toBe(401);
  });

  it('returns 401 when the signature header is empty', async () => {
    expect((await post(monitorAdded, '')).status).toBe(401);
  });

  it('returns 401 for a signature with a sha256= prefix', async () => {
    expect((await post(monitorAdded, `sha256=${sign(monitorAdded)}`)).status).toBe(401);
  });

  it.each([
    ['too short', 'abc123'],
    ['too long', 'a'.repeat(66)],
    ['non-hex characters', 'z'.repeat(64)],
  ])('returns 401 for a malformed signature (%s)', async (_name, sig) => {
    expect((await post(monitorAdded, sig)).status).toBe(401);
  });

  it('returns 401 for a signature made with the wrong secret', async () => {
    expect((await post(monitorAdded, sign(monitorAdded, 'other'))).status).toBe(401);
  });

  it('returns 401 when the body was tampered with', async () => {
    const tampered = monitorAdded.replace('yoursite.tld', 'evil.tld');
    expect((await post(tampered, sign(monitorAdded))).status).toBe(401);
  });

  it('returns 401 when the body was re-serialized (different bytes)', async () => {
    const compact = JSON.stringify(JSON.parse(monitorAdded));
    expect((await post(compact, sign(monitorAdded))).status).toBe(401);
  });

  it('returns 400 for a correctly signed body that is not JSON', async () => {
    const body = 'not json';
    expect((await post(body, sign(body), 'text/plain')).status).toBe(400);
  });
});
