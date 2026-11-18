// Generated with: millicast-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/millicast/route';
import { verifyMillicastWebhook } from '../lib/verify-millicast';

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

/** Sign like Millicast: sha1= + hex HMAC-SHA1 of the raw body, keyed with the decoded secret. */
function sign(body: string | Buffer, { key = KEY }: { key?: Buffer } = {}): Record<string, string> {
  return { 'x-millicast-signature': `sha1=${crypto.createHmac('sha1', key).update(body).digest('hex')}` };
}

const post = (body: string | Buffer, headers: Record<string, string> = {}, contentType = 'application/json') =>
  POST(
    new Request('http://localhost/webhooks/millicast', {
      method: 'POST',
      headers: { 'content-type': contentType, ...headers },
      body: typeof body === 'string' ? body : new Uint8Array(body),
    })
  );

const without = (headers: Record<string, string>, name: string) =>
  Object.fromEntries(Object.entries(headers).filter(([key]) => key !== name));

beforeEach(() => {
  process.env.MILLICAST_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
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
    expect(await res.json()).toEqual({ received: true, type: 'feeds', event: 'started' });
  });

  it('rejects a signature keyed with the secret as UTF-8 text instead of its decoded bytes', async () => {
    expect((await post(BODY, sign(BODY, { key: Buffer.from(SECRET, 'utf8') }))).status).toBe(401);
  });

  it('rejects another secret, a tampered body and a missing signature header', async () => {
    expect((await post(BODY, sign(BODY, { key: OTHER_KEY }))).status).toBe(401);
    expect((await post(BODY.replace(TAMPER_FROM, TAMPER_TO), sign(BODY))).status).toBe(401);
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

  it('returns 500 when the secret is missing or not valid base64', async () => {
    delete process.env.MILLICAST_WEBHOOK_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
    process.env.MILLICAST_WEBHOOK_SECRET = BAD_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });

  it('accepts a signed JPEG thumbnail and rejects a tampered one', async () => {
    const res = await post(JPEG, { [SIGNATURE_HEADER]: JPEG_SIGNATURE }, 'image/jpeg');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type: 'thumbnail', bytes: JPEG.length });
    const tampered = Buffer.from(JPEG);
    tampered[20] ^= 0xff;
    expect((await post(tampered, { [SIGNATURE_HEADER]: JPEG_SIGNATURE }, 'image/jpeg')).status).toBe(401);
  });

  it('rejects a signature without the sha1= prefix', async () => {
    const bare = sign(BODY)[SIGNATURE_HEADER].slice('sha1='.length);
    expect((await post(BODY, { [SIGNATURE_HEADER]: bare })).status).toBe(401);
  });
});
