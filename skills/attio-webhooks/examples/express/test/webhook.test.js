const request = require('supertest');
const crypto = require('crypto');

// Attio webhook secrets are 64-char hex strings, used as-is (UTF-8) as the HMAC key
process.env.ATTIO_WEBHOOK_SECRET =
  'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb';

const { app, verifyAttioSignature } = require('../src/index');

const secret = process.env.ATTIO_WEBHOOK_SECRET;

/** Sign a payload exactly like Attio: hex HMAC-SHA256 of the raw body. */
function signAttio(payload, key = secret) {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function attioPayload(eventType, extra = {}) {
  return JSON.stringify({
    webhook_id: '23e42eaf-323a-41da-b5bb-fd67eebda553',
    events: [
      {
        event_type: eventType,
        id: {
          workspace_id: '14beef7a-99f7-4534-a87e-70b564330a4c',
          object_id: '97052eb9-e65e-443f-a297-f2d9a4a7f795',
          record_id: 'bf071e1f-6035-429d-b874-d83ea64ea13b',
        },
        actor: { type: 'workspace-member', id: '50cf242c-7fa3-4cad-87d0-75b1af71c57b' },
        ...extra,
      },
    ],
  });
}

let keyCounter = 0;
const newKey = () => `idem-${Date.now()}-${keyCounter++}`;

function post(payload, headers = {}) {
  const req = request(app).post('/webhooks/attio').set('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(headers)) req.set(k, v);
  return req.send(payload);
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('verifyAttioSignature', () => {
  const body = Buffer.from(attioPayload('record.created'));

  it('accepts a valid signature', () => {
    expect(verifyAttioSignature(body, signAttio(body), secret)).toBe(true);
  });

  it('accepts an uppercase hex signature', () => {
    expect(verifyAttioSignature(body, signAttio(body).toUpperCase(), secret)).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifyAttioSignature(body, signAttio(body, 'wrong_secret'), secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const sig = signAttio(body);
    const tampered = Buffer.from(attioPayload('record.deleted'));
    expect(verifyAttioSignature(tampered, sig, secret)).toBe(false);
  });

  it('rejects malformed signatures without throwing', () => {
    expect(verifyAttioSignature(body, 'invalid', secret)).toBe(false);
    expect(verifyAttioSignature(body, `sha256=${signAttio(body)}`, secret)).toBe(false);
    expect(verifyAttioSignature(body, signAttio(body).slice(0, 40), secret)).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    expect(verifyAttioSignature(body, undefined, secret)).toBe(false);
    expect(verifyAttioSignature(body, signAttio(body), undefined)).toBe(false);
  });
});

describe('POST /webhooks/attio', () => {
  it('returns 400 when the signature header is missing', async () => {
    const res = await post(attioPayload('record.created'));
    expect(res.status).toBe(400);
    expect(res.text).toBe('Missing signature header');
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post(attioPayload('record.created'), { 'Attio-Signature': 'a'.repeat(64) });
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 400 when the body was modified after signing', async () => {
    const sig = signAttio(attioPayload('record.created'));
    const res = await post(attioPayload('record.deleted'), { 'Attio-Signature': sig });
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid Attio-Signature', async () => {
    const payload = attioPayload('record.created');
    const res = await post(payload, {
      'Attio-Signature': signAttio(payload),
      'Idempotency-Key': newKey(),
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts the legacy X-Attio-Signature header', async () => {
    const payload = attioPayload('record.updated', {
      id: {
        workspace_id: '14beef7a-99f7-4534-a87e-70b564330a4c',
        object_id: '97052eb9-e65e-443f-a297-f2d9a4a7f795',
        record_id: 'bf071e1f-6035-429d-b874-d83ea64ea13b',
        attribute_id: '41252299-f8c7-4b5e-99c9-4ff8321d2f96',
      },
    });
    const res = await post(payload, { 'X-Attio-Signature': signAttio(payload) });
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed but non-JSON body', async () => {
    const payload = 'not json';
    const res = await post(payload, { 'Attio-Signature': signAttio(payload) });
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid JSON');
  });

  it.each([
    'record.created',
    'record.updated',
    'record.deleted',
    'record.merged',
    'list-entry.created',
    'list-entry.updated',
    'list-entry.deleted',
    'note.created',
    'task.created',
    'comment.created',
    'workspace-member.created',
  ])('handles %s', async (eventType) => {
    const payload = attioPayload(eventType);
    const res = await post(payload, {
      'Attio-Signature': signAttio(payload),
      'Idempotency-Key': newKey(),
    });
    expect(res.status).toBe(200);
  });

  it('skips duplicate deliveries with the same Idempotency-Key', async () => {
    const payload = attioPayload('record.created');
    const headers = { 'Attio-Signature': signAttio(payload), 'Idempotency-Key': newKey() };

    const first = await post(payload, headers);
    expect(first.body).toEqual({ received: true });

    const retry = await post(payload, headers);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual({ received: true, duplicate: true });
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
