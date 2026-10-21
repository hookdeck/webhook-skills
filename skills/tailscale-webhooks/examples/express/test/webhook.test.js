const crypto = require('crypto');
const request = require('supertest');

// Tailscale secrets look like tskey-webhook-xxxxx and are used as a raw string
const SECRET = 'tskey-webhook-test123';
process.env.TAILSCALE_WEBHOOK_SECRET = SECRET;

const { app, verifyTailscaleWebhook } = require('../src/index');

function sign(body, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

const event = (type, data = null) => ({
  timestamp: '2022-09-21T13:59:02.949217-04:00',
  version: 1,
  type,
  tailnet: 'example.com',
  message: `${type} happened`,
  data,
});

const post = (body, header) => {
  const r = request(app).post('/webhooks/tailscale').set('Content-Type', 'application/json');
  if (header) r.set('Tailscale-Webhook-Signature', header);
  return r.send(body);
};

describe('verifyTailscaleWebhook', () => {
  const body = JSON.stringify([event('test')]);

  test('accepts a valid signature', () => {
    expect(verifyTailscaleWebhook(body, sign(body), SECRET)).toBe(true);
  });

  test('rejects wrong secret', () => {
    expect(verifyTailscaleWebhook(body, sign(body, 'tskey-webhook-other'), SECRET)).toBe(false);
  });

  test('rejects tampered body', () => {
    expect(verifyTailscaleWebhook(body + ' ', sign(body), SECRET)).toBe(false);
  });

  test('accepts an old timestamp by default (retries keep the original t)', () => {
    delete process.env.TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS;
    const old = Math.floor(Date.now() / 1000) - 86400;
    expect(verifyTailscaleWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
  });

  test('rejects an old timestamp with an explicit tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyTailscaleWebhook(body, sign(body, SECRET, old), SECRET, 300)).toBe(false);
  });

  test('rejects an old timestamp when TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS is set', () => {
    process.env.TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyTailscaleWebhook(body, sign(body, SECRET, old), SECRET)).toBe(false);
    } finally {
      delete process.env.TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  test('treats a non-numeric TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', () => {
    process.env.TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyTailscaleWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
    } finally {
      delete process.env.TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });

  test('stale timestamp passes with a wider tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyTailscaleWebhook(body, sign(body, SECRET, old), SECRET, 3600)).toBe(true);
  });

  test('rejects malformed headers', () => {
    expect(verifyTailscaleWebhook(body, 'garbage', SECRET)).toBe(false);
    expect(verifyTailscaleWebhook(body, 't=abc,v1=00', SECRET)).toBe(false);
    expect(verifyTailscaleWebhook(body, `t=${Math.floor(Date.now() / 1000)}`, SECRET)).toBe(false);
    expect(verifyTailscaleWebhook(body, undefined, SECRET)).toBe(false);
  });

  test('accepts when any v1 signature matches', () => {
    const header = `${sign(body)},v1=deadbeef`;
    expect(verifyTailscaleWebhook(body, header, SECRET)).toBe(true);
  });
});

describe('POST /webhooks/tailscale', () => {
  test('returns 200 for a valid batch of events', async () => {
    const body = JSON.stringify([
      event('test'),
      event('nodeCreated', { nodeID: 'nFJw3SRKTM59', deviceName: 'alice-ws1.ts.net' }),
      event('nodeNeedsApproval', { deviceName: 'alice-ws1.ts.net' }),
      event('nodeApproved', { deviceName: 'alice-ws1.ts.net' }),
      event('nodeKeyExpiringInOneDay', { deviceName: 'alice-ws1.ts.net' }),
      event('nodeDeleted', { deviceName: 'alice-ws1.ts.net' }),
      event('policyUpdate', { actor: 'admin@example.com' }),
      event('userCreated', { user: 'bob@example.com' }),
      event('somethingNew'),
    ]);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  test('returns 400 for an invalid signature', async () => {
    const body = JSON.stringify([event('test')]);
    const res = await post(body, sign(body, 'tskey-webhook-wrong'));
    expect(res.status).toBe(400);
  });

  test('returns 400 for a missing header', async () => {
    const res = await post(JSON.stringify([event('test')]));
    expect(res.status).toBe(400);
  });

  test('returns 400 for a validly signed non-array body', async () => {
    const body = JSON.stringify({ type: 'test' });
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });

  test('returns 400 for validly signed invalid JSON', async () => {
    const body = 'not json';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });

  test('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
