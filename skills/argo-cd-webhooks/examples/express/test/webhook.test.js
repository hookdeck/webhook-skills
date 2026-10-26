const request = require('supertest');

const HEADER = 'X-Argo-Secret';
const SECRET = 'test_argo_cd_secret_0123456789';

process.env.ARGO_CD_WEBHOOK_HEADER = HEADER;
process.env.ARGO_CD_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifyArgoCdRequest } = app;

// Illustrative payload from the template in references/setup.md.
const payloadFor = (trigger) => ({
  trigger,
  app: 'guestbook',
  sync_status: 'Synced',
  health: 'Healthy',
});

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const TRIGGERS = ['on-sync-succeeded', 'on-sync-failed', 'on-health-degraded'];

function send(method, headers = {}, body) {
  let r = request(app)[method]('/webhooks/argo-cd');
  for (const [k, v] of Object.entries(headers)) r = r.set(k, v);
  return body === undefined ? r : r.set('Content-Type', 'application/json').send(body);
}

describe('credential verification', () => {
  it('accepts the correct header value', async () => {
    const res = await send('post', { [HEADER]: SECRET }, JSON.stringify(payloadFor('on-sync-succeeded')));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('matches the header name case-insensitively', async () => {
    const res = await send('post', { 'x-argo-secret': SECRET }, JSON.stringify(payloadFor('on-sync-succeeded')));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong value of the same length', async () => {
    const res = await send('post', { [HEADER]: 'x'.repeat(SECRET.length) }, '{}');
    expect(res.status).toBe(401);
  });

  it('rejects a value of a different length without throwing', async () => {
    const res = await send('post', { [HEADER]: 'short' }, '{}');
    expect(res.status).toBe(401);
  });

  it('rejects a missing header', async () => {
    const res = await send('post', {}, JSON.stringify(payloadFor('on-sync-succeeded')));
    expect(res.status).toBe(401);
  });

  it('does not accept the secret in a different header', async () => {
    const res = await send('post', { Authorization: SECRET }, '{}');
    expect(res.status).toBe(401);
  });

  it('compares the whole value and does not strip a Bearer prefix', () => {
    const bearer = `Bearer ${SECRET}`;
    expect(verifyArgoCdRequest({ authorization: bearer }, bearer, 'Authorization')).toBe(true);
    expect(verifyArgoCdRequest({ authorization: bearer }, SECRET, 'Authorization')).toBe(false);
    expect(verifyArgoCdRequest({ authorization: SECRET }, bearer, 'Authorization')).toBe(false);
  });

  it('defaults the header name to Authorization', () => {
    const saved = process.env.ARGO_CD_WEBHOOK_HEADER;
    delete process.env.ARGO_CD_WEBHOOK_HEADER;
    try {
      expect(verifyArgoCdRequest({ authorization: SECRET }, SECRET)).toBe(true);
    } finally {
      process.env.ARGO_CD_WEBHOOK_HEADER = saved;
    }
  });

  it('rejects everything when no secret is configured', () => {
    expect(verifyArgoCdRequest({ 'x-argo-secret': SECRET }, '', HEADER)).toBe(false);
    expect(verifyArgoCdRequest({ 'x-argo-secret': SECRET }, SECRET, HEADER)).toBe(true);
  });
});

describe('methods', () => {
  it.each(METHODS)('accepts %s with the credential', async (method) => {
    const body = method === 'get' ? undefined : JSON.stringify(payloadFor('on-sync-succeeded'));
    const res = await send(method, { [HEADER]: SECRET }, body);
    expect(res.status).toBe(200);
  });

  it.each(METHODS)('checks the credential first on %s', async (method) => {
    const res = await send(method, {});
    expect(res.status).toBe(401);
  });

  it('handles an empty GET (the Argo CD default) as success', async () => {
    const res = await send('get', { [HEADER]: SECRET });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('handles an empty POST body', async () => {
    const res = await request(app).post('/webhooks/argo-cd').set(HEADER, SECRET);
    expect(res.status).toBe(200);
  });
});

describe('body handling', () => {
  it('accepts any content type', async () => {
    const res = await request(app)
      .post('/webhooks/argo-cd')
      .set(HEADER, SECRET)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(payloadFor('on-sync-succeeded')));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON after authenticating', async () => {
    const res = await send('post', { [HEADER]: SECRET }, '{not json');
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-object JSON body', async () => {
    const res = await send('post', { [HEADER]: SECRET }, '[1,2]');
    expect(res.status).toBe(400);
  });

  it('returns 401, not 400, for invalid JSON without the credential', async () => {
    const res = await send('post', {}, '{not json');
    expect(res.status).toBe(401);
  });
});

describe('notification handling', () => {
  it.each(TRIGGERS)('handles %s', async (trigger) => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const res = await send('post', { [HEADER]: SECRET }, JSON.stringify(payloadFor(trigger)));
    expect(res.status).toBe(200);
    expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
    spy.mockRestore();
  });

  it('acknowledges unknown triggers', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const res = await send('post', { [HEADER]: SECRET }, JSON.stringify(payloadFor('on-something-new')));
    expect(res.status).toBe(200);
    spy.mockRestore();
  });
});
