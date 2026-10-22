const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'census_test_secret_8f2d1c';
process.env.CENSUS_WEBHOOK_SECRET = SECRET;

const { app, verifyCensusWebhook } = require('../src/index');

// Census signs the raw body: HMAC-SHA256, standard base64, in X-Signature
function sign(payload, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

function send(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/census').set('Content-Type', contentType);
  if (signature) req.set('X-Signature', signature);
  return req.send(body);
}

const base = { workspace_id: 3167, sync_id: 3167956, sync_run_id: 324399613 };

describe('verifyCensusWebhook', () => {
  const body = Buffer.from(JSON.stringify({ ...base, event: 'sync.started' }));

  test('accepts a valid base64 signature', () => {
    expect(verifyCensusWebhook(body, sign(body), SECRET)).toBe(true);
  });

  test('rejects hex-encoded signature', () => {
    const hex = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifyCensusWebhook(body, hex, SECRET)).toBe(false);
  });

  test('rejects signature from another secret', () => {
    expect(verifyCensusWebhook(body, sign(body, 'other'), SECRET)).toBe(false);
  });

  test('rejects missing signature or secret', () => {
    expect(verifyCensusWebhook(body, undefined, SECRET)).toBe(false);
    expect(verifyCensusWebhook(body, sign(body), '')).toBe(false);
  });
});

describe('POST /webhooks/census', () => {
  test('returns 400 when X-Signature is missing', async () => {
    const res = await send(JSON.stringify({ ...base, event: 'sync.started' }));
    expect(res.status).toBe(400);
  });

  test('returns 400 for an invalid signature', async () => {
    const res = await send(JSON.stringify({ ...base, event: 'sync.started' }), 'bm9wZQ==');
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  test('returns 400 when the body is altered after signing', async () => {
    const sig = sign(JSON.stringify({ ...base, event: 'sync.success' }));
    const res = await send(JSON.stringify({ ...base, event: 'sync.failed' }), sig);
    expect(res.status).toBe(400);
  });

  test.each([
    [{ ...base, event: 'sync.triggered' }],
    [{ ...base, event: 'sync.started' }],
    [{ ...base, event: 'sync.completed', status: 'ok' }],
    [{ ...base, event: 'sync.completed', status: 'emergency' }],
    [{ ...base, event: 'sync.success' }],
    [{ ...base, event: 'sync.failed' }],
    [{
      ...base,
      alert_instance_id: 626248,
      alert_type: 'FailureAlertConfiguration',
      message: 'Sync Failed',
      details: 'Sync has failed with error: A mapped source column has been deleted: email',
      followup_url: 'https://app.getcensus.com/workspaces/3167/syncs/3167956/sync-history',
      event: 'sync.alert.raised',
    }],
    [{ ...base, alert_instance_id: 626248, alert_type: 'FailureAlertConfiguration', message: 'Sync Recovered', details: 'Sync has recovered', event: 'sync.alert.resolved' }],
  ])('accepts a signed %j', async (payload) => {
    const body = JSON.stringify(payload);
    const res = await send(body, sign(body));
    expect(res.status).toBe(200);
  });

  test('verifies regardless of Content-Type', async () => {
    const body = JSON.stringify({ ...base, event: 'sync.success' });
    const res = await send(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  test('verifies against the exact bytes, including whitespace', async () => {
    const body = '{ "workspace_id" : 3167 , "event" : "sync.started" }';
    const res = await send(body, sign(body));
    expect(res.status).toBe(200);
  });

  test('accepts unknown events once signed', async () => {
    const body = JSON.stringify({ ...base, event: 'sync.something_new' });
    const res = await send(body, sign(body));
    expect(res.status).toBe(200);
  });

  test('returns 400 for a signed non-JSON body', async () => {
    const body = 'not json';
    const res = await send(body, sign(body), 'text/plain');
    expect(res.status).toBe(400);
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.CENSUS_WEBHOOK_SECRET;
    const body = JSON.stringify({ ...base, event: 'sync.started' });
    const res = await send(body, sign(body));
    process.env.CENSUS_WEBHOOK_SECRET = SECRET;
    expect(res.status).toBe(500);
  });
});
