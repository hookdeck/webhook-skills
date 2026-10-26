const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'test_autosana_signing_secret';
process.env.AUTOSANA_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');

function sign(body, secret = SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function payload(event = 'batch.completed') {
  return JSON.stringify({
    event,
    timestamp: '2025-01-31T12:34:56.789Z',
    app: { id: 'com.example.myapp', bundle_id: 'com.example.myapp', name: 'My App', platform: 'android' },
    git: { commit_sha: 'a1b2c3d4e5f6', branch: 'main' },
    summary: { total_groups: 3, passed_groups: 2, failed_groups: 1 },
    run_groups: [
      {
        name: 'Login Suite',
        status: 'passed',
        url: 'https://autosana.ai/runs/groups/f1e2d3c4',
        runs: [{ name: 'User can sign in with email', status: 'passed', url: 'https://autosana.ai/runs/flow/1234' }],
      },
    ],
  });
}

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/autosana').set('Content-Type', contentType);
  if (signature) req.set('X-Autosana-Signature-256', signature);
  return req.send(body);
}

describe('Autosana webhook', () => {
  test('accepts a valid batch.completed event', async () => {
    const body = payload();
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('verifies any content type (raw body)', async () => {
    const body = payload();
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  test('accepts an uppercase hex digest', async () => {
    const body = payload();
    const upper = 'sha256=' + sign(body).slice('sha256='.length).toUpperCase();
    const res = await post(body, upper);
    expect(res.status).toBe(200);
  });

  test('accepts unhandled event names with a valid signature', async () => {
    const body = payload('batch.started');
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  test('rejects missing signature (unsigned delivery)', async () => {
    const res = await post(payload());
    expect(res.status).toBe(400);
  });

  test('rejects wrong secret', async () => {
    const body = payload();
    const res = await post(body, sign(body, 'wrong_secret'));
    expect(res.status).toBe(400);
  });

  test('rejects tampered body', async () => {
    const body = payload();
    const res = await post(body.replace('My App', 'Other App'), sign(body));
    expect(res.status).toBe(400);
  });

  test('rejects signature without sha256= prefix', async () => {
    const body = payload();
    const res = await post(body, sign(body).slice('sha256='.length));
    expect(res.status).toBe(400);
  });

  test('rejects non-hex or wrong-length digests', async () => {
    const body = payload();
    const good = sign(body).slice('sha256='.length);
    for (const bad of ['sha256=', 'sha256=zz' + good.slice(2), 'sha256=' + good.slice(2), 'sha256=' + good + 'ab']) {
      const res = await post(body, bad);
      expect(res.status).toBe(400);
    }
  });

  test('rejects valid signature over invalid JSON', async () => {
    const body = 'not json';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });
});
