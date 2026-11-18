// Generated with: millicast-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Synthetic Webhook Secret (base64 of 32 bytes), shaped like the one the dashboard shows.
const SECRET = '10ipEMzmyDx7MyTJS7uQrbkyuvpL38y7mLV9Uv8uolg=';
const KEY = Buffer.from(SECRET, 'base64');
const OTHER_KEY = crypto.createHash('sha256').update('another-millicast-webhook').digest();
const BAD_SECRET = 'not base64!';
const SIGNATURE_HEADER = 'x-millicast-signature';

// Check vector: synthetic secret and a fixed JSON body (Millicast publishes none).
const VECTOR_BODY = '{"id":"evt_1","type":"test","data":{"a":1}}';
const VECTOR_SIGNATURE = 'sha1=b021d0d11fdbdb96f07e548a06461ada81c78152';

// A JPEG-shaped binary body (thumbnail hooks send the image itself). It isn't valid UTF-8.
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.from('JFIF\0', 'latin1'),
  Buffer.from(Array.from({ length: 256 }, (_, index) => index)),
  Buffer.from([0xff, 0xd9]),
]);
const JPEG_SIGNATURE = 'sha1=c2194e698535f850aaf0756f51569f6ba4b6818c';

// Feed started event in the documented envelope (IDs are made up), pretty-printed so a
// re-serialised body would not match.
const BODY = JSON.stringify(
  {
    type: 'feeds',
    event: 'started',
    timestamp: 1731924900123,
    data: { feedId: 'feed-1', accountId: 'acct-1', name: 'demo-stream', streamId: 'acct-1/demo-stream', started: 1731924900000, active: true },
  },
  null,
  2
);
const TAMPER_FROM = 'demo-stream';
const TAMPER_TO = 'other-stream';
process.env.MILLICAST_WEBHOOK_SECRET = SECRET;

const { app, verifyMillicastWebhook } = require('../src/index');

/** Sign like Millicast: sha1= + hex HMAC-SHA1 of the raw body, keyed with the decoded secret. */
function sign(body, { key = KEY } = {}) {
  return { 'x-millicast-signature': `sha1=${crypto.createHmac('sha1', key).update(body).digest('hex')}` };
}

const post = (body, headers = {}, contentType = 'application/json') => {
  const req = request(app).post('/webhooks/millicast').set('Content-Type', contentType);
  for (const [name, value] of Object.entries(headers)) req.set(name, value);
  return req.send(body);
};

/** Drop one header from a signed set. */
const without = (headers, name) => Object.fromEntries(Object.entries(headers).filter(([key]) => key !== name));

beforeEach(() => {
  process.env.MILLICAST_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyMillicastWebhook', () => {
  it('matches the JSON and JPEG check vectors', () => {
    expect(verifyMillicastWebhook(Buffer.from(VECTOR_BODY), VECTOR_SIGNATURE, SECRET)).toBe(true);
    expect(verifyMillicastWebhook(JPEG, JPEG_SIGNATURE, SECRET)).toBe(true);
  });

  it('fails when the binary body is decoded to text before hashing', () => {
    expect(verifyMillicastWebhook(Buffer.from(JPEG.toString('utf8'), 'utf8'), JPEG_SIGNATURE, SECRET)).toBe(false);
  });

  it('rejects a malformed secret', () => {
    expect(verifyMillicastWebhook(Buffer.from(VECTOR_BODY), VECTOR_SIGNATURE, BAD_SECRET)).toBe(false);
  });
});

describe('POST /webhooks/millicast', () => {
  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, type: 'feeds', event: 'started' });
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
    process.env.MILLICAST_WEBHOOK_SECRET = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when MILLICAST_WEBHOOK_SECRET is not set', async () => {
    delete process.env.MILLICAST_WEBHOOK_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });

  it('returns 500 when the secret is not valid base64', async () => {
    process.env.MILLICAST_WEBHOOK_SECRET = BAD_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });

  it('accepts a signed JPEG thumbnail', async () => {
    const res = await post(JPEG, { [SIGNATURE_HEADER]: JPEG_SIGNATURE, 'x-millicast-stream-id': 'acct-1/demo-stream' }, 'image/jpeg');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, type: 'thumbnail', bytes: JPEG.length });
  });

  it('rejects a tampered JPEG thumbnail', async () => {
    const tampered = Buffer.from(JPEG);
    tampered[20] ^= 0xff;
    expect((await post(tampered, { [SIGNATURE_HEADER]: JPEG_SIGNATURE }, 'image/jpeg')).status).toBe(401);
  });

  it('rejects a signature without the sha1= prefix', async () => {
    const bare = sign(BODY)[SIGNATURE_HEADER].slice('sha1='.length);
    expect((await post(BODY, { [SIGNATURE_HEADER]: bare })).status).toBe(401);
  });
});
