// Generated with: close-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Close's documented sample signature_key (hex, 32 bytes). Not a real credential.
const SECRET = '058bfb6a3d8cfdc4da7c3be5901b16ae11da982b46a25fb2cd7016e97a140a1c';
const KEY = Buffer.from(SECRET, 'hex');
const OTHER_KEY = crypto.createHash('sha256').update('another-close-subscription').digest();
// The same 32 bytes written as base64: not what Close returns, so the handler refuses it.
const BAD_SECRET = 'BYv7aj2M/cTafDvlkBsWrhHamCtGol+yzXAW6XoUChw=';
const SIGNATURE_HEADER = 'close-sig-hash';
const TIMESTAMP = '1731924900';

// Check vector: Close's sample key and timestamp with a fixed body. (Close's sample hash
// can't be reproduced: the docs don't show the payload it was computed over.)
const VECTOR_BODY = '{"id":"evt_1","type":"test","data":{"a":1}}';
const VECTOR_TIMESTAMP = '1544271440';
const VECTOR_HASH = '80aef193499f656f34626d9beb748f6eeddd96f6af433706d201746f83fe6ba4';

// Illustrative lead.created event (IDs made up), pretty-printed so a re-serialised body would not match.
const BODY = JSON.stringify(
  {
    subscription_id: 'whsub_test0001',
    event: {
      id: 'ev_test0001',
      object_type: 'lead',
      action: 'created',
      object_id: 'lead_test0001',
      lead_id: 'lead_test0001',
      organization_id: 'orga_test0001',
      changed_fields: [],
      data: { id: 'lead_test0001', display_name: 'Acme Corp' },
      previous_data: {},
    },
  },
  null,
  2
);
const TAMPER_FROM = 'Acme Corp';
const TAMPER_TO = 'Acme Inc';
process.env.CLOSE_WEBHOOK_SIGNATURE_KEY = SECRET;

const { app, verifyCloseWebhook } = require('../src/index');

/** Sign like Close: hex HMAC-SHA256 of timestamp + body (no delimiter), keyed with the hex-decoded key. */
function sign(body, { key = KEY, timestamp = TIMESTAMP, delimiter = '' } = {}) {
  const digest = crypto.createHmac('sha256', key).update(`${timestamp}${delimiter}`).update(body).digest('hex');
  return { 'close-sig-hash': digest, 'close-sig-timestamp': timestamp };
}

const post = (body, headers = {}, contentType = 'application/json') => {
  const req = request(app).post('/webhooks/close').set('Content-Type', contentType);
  for (const [name, value] of Object.entries(headers)) req.set(name, value);
  return req.send(body);
};

/** Drop one header from a signed set. */
const without = (headers, name) => Object.fromEntries(Object.entries(headers).filter(([key]) => key !== name));

beforeEach(() => {
  process.env.CLOSE_WEBHOOK_SIGNATURE_KEY = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyCloseWebhook', () => {
  it('matches the check vector built from the sample key', () => {
    expect(verifyCloseWebhook(VECTOR_BODY, VECTOR_HASH, VECTOR_TIMESTAMP, SECRET)).toBe(true);
    expect(verifyCloseWebhook(Buffer.from(VECTOR_BODY), VECTOR_HASH, VECTOR_TIMESTAMP, SECRET)).toBe(true);
  });

  it('rejects the vector with another timestamp or a key that is not hex', () => {
    expect(verifyCloseWebhook(VECTOR_BODY, VECTOR_HASH, '1544271441', SECRET)).toBe(false);
    expect(verifyCloseWebhook(VECTOR_BODY, VECTOR_HASH, VECTOR_TIMESTAMP, BAD_SECRET)).toBe(false);
  });
});

describe('POST /webhooks/close', () => {
  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event: 'lead.created' });
  });

  it('rejects a signature keyed with the secret as UTF-8 text instead of its decoded bytes', async () => {
    const res = await post(BODY, sign(BODY, { key: Buffer.from(SECRET, 'utf8') }));
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with another secret', async () => {
    expect((await post(BODY, sign(BODY, { key: OTHER_KEY }))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(BODY.replace(TAMPER_FROM, TAMPER_TO), sign(BODY))).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(BODY, without(sign(BODY), SIGNATURE_HEADER))).status).toBe(401);
  });

  it('accepts a secret with a trailing newline', async () => {
    process.env.CLOSE_WEBHOOK_SIGNATURE_KEY = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when CLOSE_WEBHOOK_SIGNATURE_KEY is not set', async () => {
    delete process.env.CLOSE_WEBHOOK_SIGNATURE_KEY;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });

  it('returns 500 when the secret is not valid hex', async () => {
    process.env.CLOSE_WEBHOOK_SIGNATURE_KEY = BAD_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });

  it('rejects a signature keyed with the hex key decoded as base64', async () => {
    // A 64-character hex string is also valid base64: it decodes to 48 wrong bytes.
    expect((await post(BODY, sign(BODY, { key: Buffer.from(SECRET, 'base64') }))).status).toBe(401);
  });

  it('rejects a signature over timestamp + "." + body', async () => {
    expect((await post(BODY, sign(BODY, { delimiter: '.' }))).status).toBe(401);
  });

  it('rejects a changed or missing timestamp', async () => {
    expect((await post(BODY, { ...sign(BODY), 'close-sig-timestamp': '1731924901' })).status).toBe(401);
    expect((await post(BODY, without(sign(BODY), 'close-sig-timestamp'))).status).toBe(401);
  });
});
