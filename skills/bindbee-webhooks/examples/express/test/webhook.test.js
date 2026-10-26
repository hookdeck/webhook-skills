const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'bb_sig_test_secret_Value-123'; // Bindbee secrets have no prefix; used as raw UTF-8 bytes
process.env.BINDBEE_WEBHOOK_SECRET = SECRET;

const { app, verifyBindbeeSignature } = require('../src/index');

function sign(id, timestamp, body, secret = SECRET) {
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'utf8');
  const content = Buffer.concat([Buffer.from(`${id}.${timestamp}.`), Buffer.from(body)]);
  return `v1,${crypto.createHmac('sha256', key).update(content).digest('base64')}`;
}

function payload(event) {
  return JSON.stringify({
    id: 'evt_123',
    event,
    version: '2026.10.06',
    sequence: 7,
    occurred_at: '2026-10-06T10:00:00Z',
    webhook: { event },
    connector: { id: 'con_1' },
    data: { id: 'emp_1' },
  });
}

function send(body, { id = 'msg_1', ts = String(Math.floor(Date.now() / 1000)), sig } = {}) {
  return request(app)
    .post('/webhooks/bindbee')
    .set('Content-Type', 'application/json')
    .set('webhook-id', id)
    .set('webhook-timestamp', ts)
    .set('webhook-signature', sig ?? sign(id, ts, body))
    .send(body);
}

describe('Bindbee webhook', () => {
  const events = [
    'connector.linked',
    'connector.relinked',
    'connector.relink_needed',
    'connector.sync.started',
    'connector.sync.completed',
    'connector.sync.failed',
    'hris.employee.created',
    'hris.employee.updated',
    'hris.location.created',
  ];

  test.each(events)('accepts a valid %s delivery', async (event) => {
    const res = await send(payload(event));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('rejects a wrong signature', async () => {
    const res = await send(payload('connector.linked'), { sig: sign('msg_1', '1', 'x', 'other') });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = sign('msg_1', ts, payload('connector.linked'));
    const res = await send(payload('hris.employee.created'), { ts, sig });
    expect(res.status).toBe(400);
  });

  test('rejects missing headers', async () => {
    const res = await request(app)
      .post('/webhooks/bindbee')
      .set('Content-Type', 'application/json')
      .send(payload('connector.linked'));
    expect(res.status).toBe(400);
  });

  test('accepts any content type (raw bytes are verified)', async () => {
    const body = payload('connector.linked');
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await request(app)
      .post('/webhooks/bindbee')
      .set('Content-Type', 'text/plain')
      .set('webhook-id', 'msg_1')
      .set('webhook-timestamp', ts)
      .set('webhook-signature', sign('msg_1', ts, body))
      .send(body);
    expect(res.status).toBe(200);
  });
});

describe('verifyBindbeeSignature', () => {
  const body = Buffer.from(payload('connector.linked'));
  const ts = String(Math.floor(Date.now() / 1000));
  const headers = (sig) => ({ 'webhook-id': 'm1', 'webhook-timestamp': ts, 'webhook-signature': sig });
  const good = sign('m1', ts, body);

  test('accepts a valid signature', () => {
    expect(verifyBindbeeSignature(body, headers(good), SECRET)).toBe(true);
  });

  test('accepts any matching v1 entry and ignores other versions', () => {
    const sig = `v1a,${good.slice(3)} v1,AAAA ${good}`;
    expect(verifyBindbeeSignature(body, headers(sig), SECRET)).toBe(true);
    expect(verifyBindbeeSignature(body, headers(`v1a,${good.slice(3)}`), SECRET)).toBe(false);
  });

  test('uses the secret as raw UTF-8 bytes (no base64 decoding)', () => {
    const b64Decoded = Buffer.from(SECRET, 'base64');
    const wrong = crypto
      .createHmac('sha256', b64Decoded)
      .update(Buffer.concat([Buffer.from(`m1.${ts}.`), body]))
      .digest('base64');
    expect(verifyBindbeeSignature(body, headers(`v1,${wrong}`), SECRET)).toBe(false);
  });

  test('decodes a whsec_ secret like Hookdeck does', () => {
    const whsec = 'whsec_' + Buffer.from('some key bytes').toString('base64');
    expect(verifyBindbeeSignature(body, headers(sign('m1', ts, body, whsec)), whsec)).toBe(true);
  });

  test('fails closed on empty or missing secret', () => {
    expect(verifyBindbeeSignature(body, headers(good), undefined)).toBe(false);
    expect(verifyBindbeeSignature(body, headers(good), '')).toBe(false);
    expect(verifyBindbeeSignature(body, headers(good), 'whsec_')).toBe(false);
  });

  test('requires a plain positive integer timestamp', () => {
    for (const bad of ['0', '-5', '1.5', '01', 'abc', '1e3', ' 12']) {
      const h = { 'webhook-id': 'm1', 'webhook-timestamp': bad, 'webhook-signature': sign('m1', bad, body) };
      expect(verifyBindbeeSignature(body, h, SECRET)).toBe(false);
    }
  });

  test('has no timestamp window by default, but can opt in', () => {
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    const h = { 'webhook-id': 'm1', 'webhook-timestamp': old, 'webhook-signature': sign('m1', old, body) };
    expect(verifyBindbeeSignature(body, h, SECRET)).toBe(true);
    expect(verifyBindbeeSignature(body, h, SECRET, 300)).toBe(false);
  });

  test('handles signatures of a different length without throwing', () => {
    expect(verifyBindbeeSignature(body, headers('v1,short'), SECRET)).toBe(false);
    expect(verifyBindbeeSignature(body, headers('garbage'), SECRET)).toBe(false);
  });
});
