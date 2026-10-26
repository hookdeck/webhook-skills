import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { computeSignature, verifyConfigCatWebhook } from '../lib/verify';

const SECRET = 'configcat_whsk_VN3juirnVh5pNvCKd81RYRYchxUX4j3NykbZG2fAy88=';
const URL = 'http://localhost:3000/webhooks/configcat';

// Published vector from ConfigCat's docs (also verified against Hookdeck's CONFIGCAT source)
const VECTOR = {
  body: 'examplebody',
  id: 'b616ca659d154a5fb907dd8475792eeb',
  timestamp: '1669629035',
  signature: 'Ks3cYsu9Lslfo+hVxNC3oQWnsF9e5d73TI5t94D9DRA=',
};

let route: typeof import('../app/webhooks/configcat/route');

beforeAll(async () => {
  process.env.CONFIGCAT_WEBHOOK_SECRET = SECRET;
  route = await import('../app/webhooks/configcat/route');
});

afterEach(() => {
  delete process.env.CONFIGCAT_WEBHOOK_TOLERANCE_SECONDS;
});

function sign(body: Buffer, id = 'wh-1', timestamp = String(Math.floor(Date.now() / 1000))) {
  return {
    'x-configcat-webhook-id': id,
    'x-configcat-webhook-timestamp': timestamp,
    'x-configcat-webhook-signature-v1': computeSignature(SECRET, id, timestamp, body),
  };
}

function req(method: string, headers: Record<string, string>, body?: Buffer | string) {
  return new NextRequest(URL, {
    method,
    headers: { 'content-type': 'application/octet-stream', ...headers },
    body: method === 'GET' || body === undefined ? undefined : new Uint8Array(Buffer.from(body)),
  });
}

describe('published test vector', () => {
  it('computes the documented signature', () => {
    expect(computeSignature(SECRET, VECTOR.id, VECTOR.timestamp, Buffer.from(VECTOR.body))).toBe(VECTOR.signature);
  });

  it('accepts the documented headers', () => {
    expect(
      verifyConfigCatWebhook({
        rawBody: Buffer.from(VECTOR.body),
        webhookId: VECTOR.id,
        timestamp: VECTOR.timestamp,
        signature: VECTOR.signature,
        secret: SECRET,
      }).valid,
    ).toBe(true);
  });

  it('is accepted by the route', async () => {
    const res = await route.POST(
      req('POST', {
        'x-configcat-webhook-id': VECTOR.id,
        'x-configcat-webhook-timestamp': VECTOR.timestamp,
        'x-configcat-webhook-signature-v1': VECTOR.signature,
      }, VECTOR.body),
    );
    expect(res.status).toBe(200);
  });
});

describe('ConfigCat webhook route', () => {
  it('accepts a signed JSON body', async () => {
    const body = Buffer.from(JSON.stringify({ config: 'Main', environment: 'Production' }));
    const res = await route.POST(req('POST', sign(body), body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a signed non-JSON body', async () => {
    const body = Buffer.from('Main changed in Production');
    expect((await route.POST(req('POST', sign(body), body))).status).toBe(200);
  });

  it('verifies exact bytes, including non-UTF-8 bodies', async () => {
    const body = Buffer.from([0xff, 0xfe, 0x00, 0x7b, 0x80]);
    expect((await route.POST(req('POST', sign(body), body))).status).toBe(200);
  });

  it('accepts a signed GET with no body (id + timestamp only)', async () => {
    expect((await route.GET(req('GET', sign(Buffer.alloc(0))))).status).toBe(200);
  });

  it('accepts signed PUT, PATCH and DELETE', async () => {
    const empty = Buffer.alloc(0);
    expect((await route.PUT(req('PUT', sign(empty), empty))).status).toBe(200);
    expect((await route.PATCH(req('PATCH', sign(empty), empty))).status).toBe(200);
    expect((await route.DELETE(req('DELETE', sign(empty)))).status).toBe(200);
  });

  it('rejects an unsigned request', async () => {
    expect((await route.POST(req('POST', {}, '{}'))).status).toBe(401);
  });

  it('rejects a body changed after signing', async () => {
    const res = await route.POST(req('POST', sign(Buffer.from('{"a":1}')), '{"a":2}'));
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with another key', async () => {
    const body = Buffer.from('{}');
    const headers = sign(body);
    headers['x-configcat-webhook-signature-v1'] = computeSignature(
      'configcat_whsk_other', 'wh-1', headers['x-configcat-webhook-timestamp'], body,
    );
    expect((await route.POST(req('POST', headers, body))).status).toBe(401);
  });

  it('rejects two comma-separated signatures (single key only)', async () => {
    const body = Buffer.from('{}');
    const headers = sign(body);
    headers['x-configcat-webhook-signature-v1'] += `,${VECTOR.signature}`;
    expect((await route.POST(req('POST', headers, body))).status).toBe(401);
  });

  it('rejects malformed signatures', async () => {
    const body = Buffer.from('{}');
    for (const bad of ['abc', VECTOR.signature.slice(0, -1), VECTOR.signature.replace('=', 'A') + 'A', `v1=${VECTOR.signature}`]) {
      const headers = { ...sign(body), 'x-configcat-webhook-signature-v1': bad };
      expect((await route.POST(req('POST', headers, body))).status).toBe(401);
    }
  });

  it('compares base64 case-sensitively', () => {
    expect(
      verifyConfigCatWebhook({
        rawBody: Buffer.from(VECTOR.body),
        webhookId: VECTOR.id,
        timestamp: VECTOR.timestamp,
        signature: VECTOR.signature.replace('Ks3c', 'kS3C'),
        secret: SECRET,
      }).valid,
    ).toBe(false);
  });

  it('ignores old timestamps by default, rejects them when the tolerance is set', async () => {
    const body = Buffer.from('{}');
    expect((await route.POST(req('POST', sign(body, 'wh-old', '1669629035'), body))).status).toBe(200);

    process.env.CONFIGCAT_WEBHOOK_TOLERANCE_SECONDS = '300';
    expect((await route.POST(req('POST', sign(body, 'wh-old', '1669629035'), body))).status).toBe(401);
    expect((await route.POST(req('POST', sign(body), body))).status).toBe(200);
  });
});
