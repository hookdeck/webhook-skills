import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Box signature keys are opaque strings from the Developer Console; this one is only for tests
const SECRET = 'test_box_primary_key_Zk3v9QpL2mWx';

type Handler = (request: NextRequest) => Promise<Response>;
let handlers: Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', Handler>;

beforeAll(async () => {
  process.env.BOX_WEBHOOK_SECRET = SECRET;
  handlers = await import('../app/webhooks/box/route');
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  delete process.env.BOX_WEBHOOK_TOLERANCE_SECONDS;
  process.env.BOX_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Box's RFC 3339 timestamp format
const stamp = (date = new Date()) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

// Body first, then the timestamp header, no separator
function sign(body: string, timestamp: string, secret = SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(body), Buffer.from(timestamp, 'latin1')]))
    .digest('base64');
}

// Shaped like Box's documented FILE.UPLOADED sample
function event(trigger: string, source: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'webhook_event',
    id: 'eb0c4e06-751f-442c-86f8-fd5bb404dbec',
    created_at: '2016-07-11T10:10:32-07:00',
    trigger,
    webhook: { id: '53', type: 'webhook' },
    created_by: { type: 'user', id: '226067247', name: 'John Q. Developer', login: 'johnq@dev.name' },
    source: { id: '73835521473', type: 'file', name: 'Test-Image-3.png', ...source },
    additional_info: [],
  });
}

interface Options {
  method?: keyof typeof handlers;
  timestamp?: string | null;
  signature?: string | null;
  headers?: Record<string, string>;
  type?: string;
}

function deliver(body: string | null, { method = 'POST', timestamp = stamp(), signature, headers = {}, type = 'application/json' }: Options = {}) {
  const h: Record<string, string> = { 'content-type': type, ...headers };
  const sig = signature === undefined ? sign(body ?? '', timestamp ?? '') : signature;
  if (sig !== null) h['box-signature-primary'] = sig;
  if (timestamp !== null) h['box-delivery-timestamp'] = timestamp;
  const request = new NextRequest('http://localhost:3000/webhooks/box', {
    method,
    headers: h,
    body: body === null || method === 'GET' ? undefined : body,
  });
  return handlers[method](request);
}

describe('Box webhook verification', () => {
  it('accepts a valid signature over body + timestamp', async () => {
    const res = await deliver(event('FILE.UPLOADED'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies the exact bytes, not re-serialised JSON', async () => {
    const body = '{ "type" : "webhook_event",\n  "trigger":"FILE.DOWNLOADED", "id":"x", "source":{"id":"1"} }';
    expect((await deliver(body)).status).toBe(200);
  });

  it('accepts any content type', async () => {
    expect((await deliver(event('FILE.UPLOADED'), { type: 'text/plain' })).status).toBe(200);
  });

  it('rejects a signature that omits the timestamp', async () => {
    const body = event('FILE.UPLOADED');
    const bodyOnly = crypto.createHmac('sha256', SECRET).update(body).digest('base64');
    expect((await deliver(body, { signature: bodyOnly })).status).toBe(401);
  });

  it('rejects the timestamp placed before the body', async () => {
    const body = event('FILE.UPLOADED');
    const ts = stamp();
    const swapped = crypto.createHmac('sha256', SECRET).update(ts + body).digest('base64');
    expect((await deliver(body, { timestamp: ts, signature: swapped })).status).toBe(401);
  });

  it('rejects a signature made with another key', async () => {
    const body = event('FILE.UPLOADED');
    const ts = stamp();
    expect((await deliver(body, { timestamp: ts, signature: sign(body, ts, 'other_key') })).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = event('FILE.UPLOADED');
    const ts = stamp();
    const res = await deliver(body.replace('Test-Image-3', 'Evil'), { timestamp: ts, signature: sign(body, ts) });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered timestamp header', async () => {
    const body = event('FILE.UPLOADED');
    const res = await deliver(body, { timestamp: stamp(), signature: sign(body, '2016-07-11T10:10:32-07:00') });
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await deliver(event('FILE.UPLOADED'), { signature: null })).status).toBe(401);
  });

  it('rejects a missing timestamp header', async () => {
    const body = event('FILE.UPLOADED');
    expect((await deliver(body, { timestamp: null, signature: sign(body, '') })).status).toBe(401);
  });

  it('rejects an empty signature', async () => {
    expect((await deliver(event('FILE.UPLOADED'), { signature: '' })).status).toBe(401);
  });

  it('rejects malformed signatures before comparing', async () => {
    const body = event('FILE.UPLOADED');
    const ts = stamp();
    const good = sign(body, ts);
    for (const bad of [
      good.slice(0, -1), // too short
      `${good}A`, // too long
      `${good.slice(0, 42)}==`, // pad in the wrong place
      good.replace(/^./, '*'), // outside the alphabet
      `-${good.slice(1)}`, // url-safe alphabet
      `_${good.slice(1)}`,
      `sha256=${good}`, // prefix
      `${good}, ${good}`, // list
    ]) {
      expect((await deliver(body, { timestamp: ts, signature: bad })).status).toBe(401);
    }
  });

  it('compares base64 case-sensitively', async () => {
    const body = event('FILE.UPLOADED');
    const ts = stamp();
    const good = sign(body, ts);
    const flipped = good.replace(/[A-Za-z]/, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()));
    expect((await deliver(body, { timestamp: ts, signature: flipped })).status).toBe(401);
  });

  it('ignores BOX-SIGNATURE-SECONDARY: only the primary is verified', async () => {
    const body = event('FILE.UPLOADED');
    const ts = stamp();
    const res = await deliver(body, {
      timestamp: ts,
      signature: null,
      headers: { 'box-signature-secondary': sign(body, ts) },
    });
    expect(res.status).toBe(401);
  });

  it('returns 500 when no secret is configured', async () => {
    delete process.env.BOX_WEBHOOK_SECRET;
    expect((await deliver(event('FILE.UPLOADED'))).status).toBe(500);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    expect((await deliver('not json')).status).toBe(400);
  });
});

describe('HTTP methods', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)('verifies and accepts %s with a body', async (method) => {
    expect((await deliver(event('FILE.UPLOADED'), { method })).status).toBe(200);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'GET'] as const)('rejects an unsigned %s', async (method) => {
    expect((await deliver(null, { method, signature: null, timestamp: null })).status).toBe(401);
  });

  it('treats a GET without a body as empty bytes (signature over just the timestamp)', async () => {
    // Signature is valid; an empty body is acknowledged without parsing
    expect((await deliver(null, { method: 'GET' })).status).toBe(200);
  });
});

describe('Timestamp tolerance (opt-in)', () => {
  const old = () => stamp(new Date(Date.now() - 60 * 60 * 1000));

  it('does not reject old timestamps by default', async () => {
    expect((await deliver(event('FILE.UPLOADED'), { timestamp: old() })).status).toBe(200);
  });

  it('does not reject old timestamps when set to 0', async () => {
    process.env.BOX_WEBHOOK_TOLERANCE_SECONDS = '0';
    expect((await deliver(event('FILE.UPLOADED'), { timestamp: old() })).status).toBe(200);
  });

  it('rejects old timestamps when a tolerance is set', async () => {
    process.env.BOX_WEBHOOK_TOLERANCE_SECONDS = '600';
    expect((await deliver(event('FILE.UPLOADED'), { timestamp: old() })).status).toBe(401);
  });

  it('accepts recent timestamps when a tolerance is set', async () => {
    process.env.BOX_WEBHOOK_TOLERANCE_SECONDS = '600';
    expect((await deliver(event('FILE.UPLOADED'))).status).toBe(200);
  });

  it('rejects an unparseable timestamp when a tolerance is set', async () => {
    process.env.BOX_WEBHOOK_TOLERANCE_SECONDS = '600';
    expect((await deliver(event('FILE.UPLOADED'), { timestamp: 'yesterday' })).status).toBe(401);
  });
});

describe('Event handling', () => {
  it.each([
    ['FILE.UPLOADED', 'file'],
    ['FILE.DOWNLOADED', 'file'],
    ['FILE.TRASHED', 'file'],
    ['FOLDER.CREATED', 'folder'],
    ['COMMENT.CREATED', 'comment'],
    ['COLLABORATION.CREATED', 'collaboration'],
    ['SIGN_REQUEST.COMPLETED', 'sign_request'],
    ['FILE.PREVIEWED', 'file'],
  ])('handles %s', async (trigger, type) => {
    expect((await deliver(event(trigger, { type }))).status).toBe(200);
  });
});
