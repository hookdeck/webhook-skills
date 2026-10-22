const crypto = require('crypto');
const request = require('supertest');

// The endpoint signing secret is used as a raw UTF-8 string
const SECRET = 'test_signing_secret';
process.env.MEDUSA_WEBHOOK_SECRET = SECRET;

const { app, verifyMedusaWebhook } = require('../src/index');

function sign(body, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

const event = (type, data = {}) => ({
  id: 'whev_01HXYZ4567ABCDEF',
  type,
  created_at: '2024-11-12T10:03:00.000Z',
  data: {
    organization: { id: 'org_01HXYZ9012ABCDEF', name: 'Acme Corp' },
    project: { id: 'proj_01HXYZ3456ABCDEF', name: 'My Storefront', handle: 'my-storefront' },
    environment: { id: 'projenv_01HXYZ7890ABCDEF', name: 'Production', handle: 'production', branch: 'main' },
    ...data,
  },
});

const post = (body, header, contentType = 'application/json') => {
  const r = request(app).post('/webhooks/medusa').set('Content-Type', contentType);
  if (header) r.set('X-Medusa-Signature', header);
  return r.send(body);
};

describe('verifyMedusaWebhook', () => {
  const body = JSON.stringify(event('build.created'));

  test('accepts a valid signature', () => {
    expect(verifyMedusaWebhook(body, sign(body), SECRET)).toBe(true);
  });

  test('rejects wrong secret', () => {
    expect(verifyMedusaWebhook(body, sign(body, 'other_secret'), SECRET)).toBe(false);
  });

  test('rejects tampered body', () => {
    expect(verifyMedusaWebhook(body + ' ', sign(body), SECRET)).toBe(false);
  });

  test('accepts an old timestamp by default (Hookdeck retries keep the original t)', () => {
    delete process.env.MEDUSA_TIMESTAMP_TOLERANCE_SECONDS;
    const old = Math.floor(Date.now() / 1000) - 86400;
    expect(verifyMedusaWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
  });

  test('rejects an old timestamp with an explicit tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyMedusaWebhook(body, sign(body, SECRET, old), SECRET, 300)).toBe(false);
  });

  test('rejects an old timestamp when MEDUSA_TIMESTAMP_TOLERANCE_SECONDS is set', () => {
    process.env.MEDUSA_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyMedusaWebhook(body, sign(body, SECRET, old), SECRET)).toBe(false);
    } finally {
      delete process.env.MEDUSA_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  test('treats a non-numeric MEDUSA_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', () => {
    process.env.MEDUSA_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyMedusaWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
    } finally {
      delete process.env.MEDUSA_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });

  test('stale timestamp passes with a wider tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyMedusaWebhook(body, sign(body, SECRET, old), SECRET, 3600)).toBe(true);
  });

  test('rejects malformed headers', () => {
    expect(verifyMedusaWebhook(body, 'garbage', SECRET)).toBe(false);
    expect(verifyMedusaWebhook(body, 't=abc,v1=00', SECRET)).toBe(false);
    expect(verifyMedusaWebhook(body, `t=${Math.floor(Date.now() / 1000)}`, SECRET)).toBe(false);
    expect(verifyMedusaWebhook(body, undefined, SECRET)).toBe(false);
  });

  test('accepts when any v1 signature matches', () => {
    const header = `${sign(body)},v1=deadbeef`;
    expect(verifyMedusaWebhook(body, header, SECRET)).toBe(true);
  });
});

describe('POST /webhooks/medusa', () => {
  const types = [
    'build.created',
    'build.succeeded',
    'build.failed',
    'build.canceled',
    'deployment.created',
    'deployment.succeeded',
    'deployment.failed',
    'deployment.canceled',
    'something.new',
  ];

  test.each(types)('returns 200 for %s', async (type) => {
    const body = JSON.stringify(event(type, { build: { id: 'build_1' }, deployment: { id: 'depl_1' } }));
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  test('verifies regardless of content type (express.raw type */*)', async () => {
    const body = JSON.stringify(event('build.succeeded'));
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  test('returns 400 for an invalid signature', async () => {
    const body = JSON.stringify(event('build.created'));
    const res = await post(body, sign(body, 'wrong_secret'));
    expect(res.status).toBe(400);
  });

  test('returns 400 for a missing header', async () => {
    const res = await post(JSON.stringify(event('build.created')));
    expect(res.status).toBe(400);
  });

  test('returns 400 for a validly signed array body', async () => {
    const body = JSON.stringify([event('build.created')]);
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
