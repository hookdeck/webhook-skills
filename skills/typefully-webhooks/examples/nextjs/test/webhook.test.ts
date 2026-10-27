import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import crypto from 'crypto';

const SECRET = 'typefully_test_secret';

let POST: (request: Request) => Promise<Response>;

beforeAll(async () => {
  process.env.TYPEFULLY_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/typefully/route'));
});

afterEach(() => {
  delete process.env.TYPEFULLY_WEBHOOK_TOLERANCE_SECONDS;
});

const payload = (event = 'draft.created') =>
  JSON.stringify({ event, data: { id: 12345, social_set_id: 67890, status: 'draft', draft_title: 'Weekly Newsletter' } });

// Same algorithm as Typefully: HMAC-SHA256 hex of "<timestamp>.<body>", sent as "sha256=<hex>"
function sign(body: string, timestamp: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

const now = () => String(Math.floor(Date.now() / 1000));

function send(body: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return POST(
    new Request('http://localhost/webhooks/typefully', {
      method: 'POST',
      headers: { 'content-type': contentType, ...headers },
      body,
    })
  );
}

describe('Typefully webhook', () => {
  it('accepts a valid sha256= signature', async () => {
    const body = payload();
    const ts = now();
    const res = await send(body, { 'x-typefully-timestamp': ts, 'x-typefully-signature': `sha256=${sign(body, ts)}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts the bare digest and uppercase hex', async () => {
    const body = payload('draft.published');
    const ts = now();
    const hex = sign(body, ts);
    expect((await send(body, { 'x-typefully-timestamp': ts, 'x-typefully-signature': hex })).status).toBe(200);
    expect((await send(body, { 'x-typefully-timestamp': ts, 'x-typefully-signature': `sha256=${hex.toUpperCase()}` })).status).toBe(200);
  });

  it('verifies the exact raw bytes, including whitespace and non-ASCII', async () => {
    const body = '{ "event" : "draft.created",\n "data": {"id": 1, "draft_title": "Café ☕"} }';
    const ts = now();
    const res = await send(body, { 'x-typefully-timestamp': ts, 'x-typefully-signature': `sha256=${sign(body, ts)}` });
    expect(res.status).toBe(200);
  });

  it('works with a non-JSON content type', async () => {
    const body = payload();
    const ts = now();
    const res = await send(body, { 'x-typefully-timestamp': ts, 'x-typefully-signature': `sha256=${sign(body, ts)}` }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it.each(['draft.planned', 'draft.scheduled', 'draft.status_changed', 'draft.tags_changed', 'draft.deleted'])(
    'handles %s',
    async (event) => {
      const body = payload(event);
      const ts = now();
      const res = await send(body, { 'x-typefully-timestamp': ts, 'x-typefully-signature': `sha256=${sign(body, ts)}` });
      expect(res.status).toBe(200);
    }
  );

  it('rejects a missing signature or timestamp', async () => {
    const body = payload();
    const ts = now();
    expect((await send(body, { 'x-typefully-timestamp': ts })).status).toBe(401);
    expect((await send(body, { 'x-typefully-signature': `sha256=${sign(body, ts)}` })).status).toBe(401);
  });

  it('rejects malformed signatures', async () => {
    const body = payload();
    const ts = now();
    const good = sign(body, ts);
    for (const bad of ['sha256=', 'sha256=zz', `sha256=${good.slice(1)}`, `sha256=${good}00`, `sha256=${good.slice(0, 63)}g`, 'sha1=' + good]) {
      const res = await send(body, { 'x-typefully-timestamp': ts, 'x-typefully-signature': bad });
      expect(res.status).toBe(401);
    }
  });

  it('rejects a tampered body, a different timestamp, and a wrong secret', async () => {
    const body = payload();
    const ts = now();
    const sig = `sha256=${sign(body, ts)}`;
    expect((await send(body.replace('12345', '99999'), { 'x-typefully-timestamp': ts, 'x-typefully-signature': sig })).status).toBe(401);
    expect((await send(body, { 'x-typefully-timestamp': String(Number(ts) + 1), 'x-typefully-signature': sig })).status).toBe(401);
    const forged = `sha256=${sign(body, ts, 'other_secret')}`;
    expect((await send(body, { 'x-typefully-timestamp': ts, 'x-typefully-signature': forged })).status).toBe(401);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const ts = now();
    const res = await send(body, { 'x-typefully-timestamp': ts, 'x-typefully-signature': `sha256=${sign(body, ts)}` });
    expect(res.status).toBe(400);
  });

  it('does not reject old timestamps by default', async () => {
    const body = payload();
    const ts = String(Math.floor(Date.now() / 1000) - 86400);
    const res = await send(body, { 'x-typefully-timestamp': ts, 'x-typefully-signature': `sha256=${sign(body, ts)}` });
    expect(res.status).toBe(200);
  });

  it('rejects old timestamps when the tolerance is set, and accepts fresh ones', async () => {
    process.env.TYPEFULLY_WEBHOOK_TOLERANCE_SECONDS = '300';
    const body = payload();
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    expect((await send(body, { 'x-typefully-timestamp': old, 'x-typefully-signature': `sha256=${sign(body, old)}` })).status).toBe(401);
    const ts = now();
    expect((await send(body, { 'x-typefully-timestamp': ts, 'x-typefully-signature': `sha256=${sign(body, ts)}` })).status).toBe(200);
  });
});
