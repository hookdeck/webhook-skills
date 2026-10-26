import crypto from 'crypto';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/formspree/route';
import { seenDeliveries, verifyFormspreeSignature } from '../lib/formspree-signature';

const SECRET = 'formspree_test_signing_secret';
const nowSeconds = () => Math.floor(Date.now() / 1000);

// Sign exactly like Formspree: HMAC-SHA256(secret, `${t}.` + raw body bytes), hex.
function sign(body: string | Buffer, t = String(nowSeconds()), secret = SECRET) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return crypto.createHmac('sha256', secret).update(`${t}.`).update(bytes).digest('hex');
}
const header = (body: string | Buffer, t = String(nowSeconds()), secret = SECRET) =>
  `t=${t},v1=${sign(body, t, secret)}`;

const submission = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    form: 'xyzabcde',
    keys: ['name', 'email', 'message'],
    submission: {
      _date: '2026-10-26T10:00:00',
      name: 'Ada',
      email: 'ada@example.com',
      message: 'Hello',
      ...extra,
    },
  });

function post(body: string | Buffer, sigHeader?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (sigHeader !== undefined) headers['formspree-signature'] = sigHeader;
  return POST(
    new NextRequest('http://localhost/webhooks/formspree', {
      method: 'POST',
      headers,
      body: body.length ? new Uint8Array(Buffer.from(body)) : undefined,
    })
  );
}

beforeEach(() => {
  seenDeliveries.clear();
  delete process.env.FORMSPREE_WEBHOOK_TOLERANCE_SECONDS;
  process.env.FORMSPREE_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('verifyFormspreeSignature', () => {
  const body = Buffer.from(submission());

  test('accepts a valid signature', () => {
    expect(verifyFormspreeSignature(body, header(body), SECRET).valid).toBe(true);
  });

  test('accepts uppercase hex', () => {
    const t = String(nowSeconds());
    expect(verifyFormspreeSignature(body, `t=${t},v1=${sign(body, t).toUpperCase()}`, SECRET).valid).toBe(true);
  });

  test('signs t exactly as it appears in the header (leading zeros kept)', () => {
    expect(verifyFormspreeSignature(body, header(body, '0001700000000'), SECRET).valid).toBe(true);
  });

  test('accepts when any v1 matches and ignores other keys', () => {
    const t = String(nowSeconds());
    const wrong = 'a'.repeat(64);
    const h = `t=${t},v0=${wrong},v1=${wrong},v1=${sign(body, t)}`;
    expect(verifyFormspreeSignature(body, h, SECRET).valid).toBe(true);
  });

  test('a v0 entry alone is not enough', () => {
    const t = String(nowSeconds());
    expect(verifyFormspreeSignature(body, `t=${t},v0=${sign(body, t)}`, SECRET).valid).toBe(false);
  });

  test('rejects a body-only signature (missing the t. prefix)', () => {
    const bodyOnly = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifyFormspreeSignature(body, `t=${nowSeconds()},v1=${bodyOnly}`, SECRET).valid).toBe(false);
  });

  test('rejects a tampered body, wrong secret and changed timestamp', () => {
    const h = header(body);
    expect(verifyFormspreeSignature(Buffer.from(submission({ name: 'Eve' })), h, SECRET).valid).toBe(false);
    expect(verifyFormspreeSignature(body, header(body, undefined, 'other'), SECRET).valid).toBe(false);
    expect(verifyFormspreeSignature(body, h.replace(/t=\d+/, 't=1'), SECRET).valid).toBe(false);
  });

  test.each([
    ['missing header', undefined],
    ['empty header', ''],
    ['no t', `v1=${'a'.repeat(64)}`],
    ['empty t', `t=,v1=${'a'.repeat(64)}`],
    ['no v1', 't=1700000000'],
    ['duplicate t', `t=1,t=2,v1=${'a'.repeat(64)}`],
    ['short v1', 't=1700000000,v1=abc123'],
    ['long v1', `t=1700000000,v1=${'a'.repeat(65)}`],
    ['non-hex v1', `t=1700000000,v1=${'z'.repeat(64)}`],
    ['garbage', 'not-a-signature'],
  ])('rejects %s', (_name, h) => {
    expect(verifyFormspreeSignature(body, h, SECRET).valid).toBe(false);
  });

  test('verifies raw bytes that are not valid UTF-8', () => {
    const bytes = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
    expect(verifyFormspreeSignature(bytes, header(bytes), SECRET).valid).toBe(true);
  });

  test('has no timestamp window by default', () => {
    expect(verifyFormspreeSignature(body, header(body, '1000000000'), SECRET, 0).valid).toBe(true);
  });

  test('opt-in tolerance rejects old and non-numeric timestamps, accepts fresh ones', () => {
    expect(verifyFormspreeSignature(body, header(body, '1000000000'), SECRET, 300).valid).toBe(false);
    expect(verifyFormspreeSignature(body, header(body, 'abc'), SECRET, 300).valid).toBe(false);
    expect(verifyFormspreeSignature(body, header(body), SECRET, 300).valid).toBe(true);
  });
});

describe('POST /webhooks/formspree', () => {
  test('accepts a signed submission', async () => {
    const body = submission();
    const res = await post(body, header(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  test('verifies any content type against the raw bytes', async () => {
    const body = submission();
    expect((await post(body, header(body), 'text/plain')).status).toBe(200);
  });

  test('does not verify re-serialised JSON', async () => {
    const body = submission();
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    expect((await post(pretty, header(body))).status).toBe(401);
  });

  test('401 for a missing, malformed or wrong signature', async () => {
    const body = submission();
    expect((await post(body)).status).toBe(401);
    expect((await post(body, 'garbage')).status).toBe(401);
    expect((await post(body, header(body, undefined, 'other'))).status).toBe(401);
  });

  test('500 when the secret is not configured', async () => {
    delete process.env.FORMSPREE_WEBHOOK_SECRET;
    const body = submission();
    expect((await post(body, header(body))).status).toBe(500);
  });

  test('accepts a signed Build Hook with an empty body', async () => {
    expect((await post(Buffer.alloc(0), header(Buffer.alloc(0)))).status).toBe(200);
  });

  test('400 for signed non-JSON and non-object bodies', async () => {
    for (const bad of ['not json', '[1,2]', 'null']) {
      expect((await post(bad, header(bad))).status).toBe(400);
    }
  });

  test('wrong-typed fields are ignored, never a 500', async () => {
    const bodies = [
      JSON.stringify({ form: 123, keys: 'name', submission: 'oops' }),
      JSON.stringify({ form: {}, keys: { a: 1 }, submission: [] }),
      JSON.stringify({ keys: [1, null, 'x'], submission: { x: { nested: true }, _date: 5 } }),
      '{}',
    ];
    for (const body of bodies) {
      expect((await post(body, header(body))).status).toBe(200);
    }
  });

  test('a retried delivery is reported as a duplicate', async () => {
    const body = submission();
    const first = await post(body, header(body));
    const retry = await post(body, header(body));
    expect(await first.json()).toEqual({ received: true });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ received: true, duplicate: true });
  });

  test('tolerance env var is opt-in', async () => {
    const body = submission();
    const old = header(body, '1000000000');
    expect((await post(body, old)).status).toBe(200);

    seenDeliveries.clear();
    process.env.FORMSPREE_WEBHOOK_TOLERANCE_SECONDS = '300';
    expect((await post(body, old)).status).toBe(401);
    expect((await post(body, header(body))).status).toBe(200);
  });
});
