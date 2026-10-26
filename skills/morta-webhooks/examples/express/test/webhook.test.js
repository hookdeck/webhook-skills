const crypto = require('crypto');
const request = require('supertest');

// The hub signing secret is used as-is, as UTF-8 text
const SECRET = 'morta_test_signing_secret';
process.env.MORTA_WEBHOOK_SECRET = SECRET;

const { app, verifyMortaWebhook } = require('../src/index');

function sign(body, secret = SECRET, t = String(Math.floor(Date.now() / 1000))) {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

const envelope = (event, extra = {}) => ({
  id: '1df6bd8a-b8a3-49a2-b07b-0de3f3cecbed',
  event,
  resourceId: '4e687ada-900a-4562-b493-6c6f67ffca6e',
  change: null,
  context: {},
  user: null,
  createdAt: '2020-08-27T14:20:28.405158',
  contextProjectId: '9f1c0e2a-1b2c-4d3e-8f4a-5b6c7d8e9f00',
  ...extra,
});

const post = (body, header, type = 'application/json') => {
  const r = request(app).post('/webhooks/morta').set('Content-Type', type);
  if (header) r.set('Morta-Signature', header);
  return r.send(body);
};

describe('verifyMortaWebhook', () => {
  const body = JSON.stringify(envelope('project.created'));

  test('accepts a valid signature', () => {
    expect(verifyMortaWebhook(body, sign(body), SECRET)).toBe(true);
  });

  test('accepts a Buffer body', () => {
    expect(verifyMortaWebhook(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  test('rejects wrong secret', () => {
    expect(verifyMortaWebhook(body, sign(body, 'other'), SECRET)).toBe(false);
  });

  test('rejects tampered body', () => {
    expect(verifyMortaWebhook(body + ' ', sign(body), SECRET)).toBe(false);
  });

  test('rejects a missing t', () => {
    const v1 = sign(body).split(',')[1];
    expect(verifyMortaWebhook(body, v1, SECRET)).toBe(false);
  });

  test('signs t exactly as sent (not re-formatted as a number)', () => {
    const t = '0001700000000';
    expect(verifyMortaWebhook(body, sign(body, SECRET, t), SECRET)).toBe(true);
    expect(verifyMortaWebhook(body, sign(body, SECRET, t).replace(t, '1700000000'), SECRET)).toBe(false);
  });

  test('accepts uppercase hex', () => {
    const [t, v1] = sign(body).split(',');
    expect(verifyMortaWebhook(body, `${t},${v1.toUpperCase().replace('V1=', 'v1=')}`, SECRET)).toBe(true);
  });

  test('accepts any matching v1 and ignores other keys', () => {
    const [t, v1] = sign(body).split(',');
    const bad = 'v1=' + 'a'.repeat(64);
    expect(verifyMortaWebhook(body, `${t},v0=abc,${bad},${v1}`, SECRET)).toBe(true);
  });

  test('rejects malformed v1 values (wrong length or alphabet)', () => {
    const t = String(Math.floor(Date.now() / 1000));
    expect(verifyMortaWebhook(body, `t=${t},v1=abcd`, SECRET)).toBe(false);
    expect(verifyMortaWebhook(body, `t=${t},v1=${'z'.repeat(64)}`, SECRET)).toBe(false);
  });

  test('accepts an old timestamp by default (retries keep the original t)', () => {
    delete process.env.MORTA_WEBHOOK_TOLERANCE_SECONDS;
    const old = String(Math.floor(Date.now() / 1000) - 86400);
    expect(verifyMortaWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
  });

  test('rejects an old timestamp with an explicit tolerance', () => {
    const old = String(Math.floor(Date.now() / 1000) - 600);
    expect(verifyMortaWebhook(body, sign(body, SECRET, old), SECRET, 300)).toBe(false);
    expect(verifyMortaWebhook(body, sign(body, SECRET, old), SECRET, 900)).toBe(true);
  });

  test('rejects an old timestamp when MORTA_WEBHOOK_TOLERANCE_SECONDS is set', () => {
    process.env.MORTA_WEBHOOK_TOLERANCE_SECONDS = '300';
    try {
      const old = String(Math.floor(Date.now() / 1000) - 600);
      expect(verifyMortaWebhook(body, sign(body, SECRET, old), SECRET)).toBe(false);
    } finally {
      delete process.env.MORTA_WEBHOOK_TOLERANCE_SECONDS;
    }
  });
});

describe('POST /webhooks/morta', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test('accepts a validly signed table.row_created event', async () => {
    const body = JSON.stringify(
      envelope('table.row_created', { change: '{"added": 2}', context: { rows: [{}, {}] } })
    );
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('2 row(s) created'));
  });

  test('verifies the exact bytes whatever the content type', async () => {
    const body = JSON.stringify(envelope('project.created'));
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  test.each(['project.created', 'member.created', 'process.response_submitted'])('handles %s', async (name) => {
    const body = JSON.stringify(envelope(name));
    expect((await post(body, sign(body))).status).toBe(200);
  });

  test('logs events it does not handle and still answers 200', async () => {
    const body = JSON.stringify(envelope('table.view_read'));
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled event type: table.view_read');
  });

  test('reads the double-encoded change field safely', async () => {
    const body = JSON.stringify(envelope('project.duplication_failed', { change: '{"error": "Duplication timed out"}' }));
    expect((await post(body, sign(body))).status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Duplication timed out'));
  });

  test('ignores wrong-typed fields instead of failing', async () => {
    const body = JSON.stringify({ event: 'table.row_created', resourceId: 5, change: 7, context: { rows: 'nope' } });
    expect((await post(body, sign(body))).status).toBe(200);
    const bad = JSON.stringify({ event: 'project.duplication_failed', change: '[1,2', context: [] });
    expect((await post(bad, sign(bad))).status).toBe(200);
  });

  test('returns 400 for a validly signed body that is not an object', async () => {
    for (const body of ['[1,2]', '"x"', 'null', '42']) {
      expect((await post(body, sign(body))).status).toBe(400);
    }
  });

  test('returns 400 for validly signed invalid JSON', async () => {
    const body = '{not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  test('returns 401 for a missing header', async () => {
    const body = JSON.stringify(envelope('project.created'));
    expect((await post(body)).status).toBe(401);
  });

  test('returns 401 for an empty header', async () => {
    const body = JSON.stringify(envelope('project.created'));
    expect((await post(body, ' ')).status).toBe(401);
  });

  test('returns 401 for a malformed header', async () => {
    const body = JSON.stringify(envelope('project.created'));
    expect((await post(body, 'garbage')).status).toBe(401);
  });

  test('returns 401 for a bad signature', async () => {
    const body = JSON.stringify(envelope('project.created'));
    expect((await post(body, sign(body, 'wrong'))).status).toBe(401);
  });

  test('returns 401 for an empty body without a header', async () => {
    expect((await request(app).post('/webhooks/morta')).status).toBe(401);
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.MORTA_WEBHOOK_SECRET;
    try {
      const body = JSON.stringify(envelope('project.created'));
      expect((await post(body, sign(body))).status).toBe(500);
    } finally {
      process.env.MORTA_WEBHOOK_SECRET = SECRET;
    }
  });
});
