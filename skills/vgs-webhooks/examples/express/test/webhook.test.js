const request = require('supertest');
const crypto = require('crypto');

// VGS integration secrets are opaque strings; this one is only for tests
const SECRET = 'test_vgs_integration_secret_5f2a';
process.env.VGS_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

function sign(body, t = Math.floor(Date.now() / 1000), secret = SECRET) {
  const v0 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v0=${v0}`;
}

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/vgs').set('Content-Type', contentType);
  if (signature) req.set('vgs-signature', signature);
  return req.send(body);
}

const routeUpdated = JSON.stringify({
  event: 'route.updated',
  details: { route_id: 'r1', route_name: 'inbound', environment: 'sandbox' },
});

describe('VGS webhook signature verification', () => {
  it('accepts a valid signature', async () => {
    const res = await post(routeUpdated, sign(routeUpdated));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies any content type (raw body)', async () => {
    const res = await post(routeUpdated, sign(routeUpdated), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects a missing header', async () => {
    expect((await post(routeUpdated)).status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const res = await post(routeUpdated.replace('inbound', 'outbound'), sign(routeUpdated));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await post(routeUpdated, sign(routeUpdated, undefined, 'other_secret'));
    expect(res.status).toBe(400);
  });

  it('rejects a modified timestamp (it is part of the signed content)', async () => {
    const t = Math.floor(Date.now() / 1000);
    const v0 = sign(routeUpdated, t).split('v0=')[1];
    expect((await post(routeUpdated, `t=${t + 1},v0=${v0}`)).status).toBe(400);
  });

  it('rejects a signature of different length without throwing', async () => {
    expect((await post(routeUpdated, 't=1623691785,v0=abc')).status).toBe(400);
  });

  it('rejects a malformed header', async () => {
    expect((await post(routeUpdated, 'garbage')).status).toBe(400);
    expect((await post(routeUpdated, 't=1623691785')).status).toBe(400);
  });

  it('accepts an old timestamp by default (retries and replays keep the original)', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await post(routeUpdated, sign(routeUpdated, old))).status).toBe(200);
  });

  it('rejects an old timestamp when VGS_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
    process.env.VGS_TIMESTAMP_TOLERANCE_SECONDS = '60';
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      expect((await post(routeUpdated, sign(routeUpdated, old))).status).toBe(400);
      expect((await post(routeUpdated, sign(routeUpdated))).status).toBe(200);
    } finally {
      delete process.env.VGS_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  it('treats a non-numeric VGS_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', async () => {
    process.env.VGS_TIMESTAMP_TOLERANCE_SECONDS = 'one minute';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      expect((await post(routeUpdated, sign(routeUpdated, old))).status).toBe(200);
    } finally {
      delete process.env.VGS_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });
});

describe('VGS events', () => {
  it.each([
    ['route.created', { details: { route_id: 'r1', route_name: 'a', environment: 'sandbox' } }],
    ['route.updated', { details: { route_id: 'r1', route_name: 'a', environment: 'sandbox' } }],
    ['route.delete', { details: { route_id: 'r1', route_name: 'a', environment: 'live' } }],
    ['vault.created', { details: { vault_id: 'tntabc', vault_name: 'v', environment: 'sandbox' } }],
    ['user.permissions_updated', { details: { user_email: 'a@example.com', org_id: 'o1' } }],
    ['user.permissions_deleted', { details: { user_email: 'a@example.com', org_id: 'o1' } }],
    ['user.logged_in', { details: { user_email: 'a@example.com', user_ip: '203.0.113.5' } }],
    ['user.password_updated', { details: { user_email: 'a@example.com', user_ip: '203.0.113.5' } }],
    ['user.mfa_created', { details: { user_email: 'a@example.com', user_ip: '203.0.113.5' } }],
    ['user.mfa_deleted', { details: { user_email: 'a@example.com', user_ip: '203.0.113.5' } }],
    ['proxy.upstream_error', { occurrence: 10, details: { upstream_host: 'api.example.com', upstream_error: 'timeout' } }],
    ['alias.reveal_failed', { occurrence: 1, details: { environment: 'sandbox', storage: 'persistent' } }],
    ['something.else', {}],
  ])('handles %s', async (event, rest) => {
    const body = JSON.stringify({ event, ...rest });
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('rejects verified but invalid JSON', async () => {
    const body = '{not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });
});
