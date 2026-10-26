import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/charitystack/route';
import { verifyCharityStackSignature } from '../lib/charitystack-signature';

const SECRET = 'cs_whsec_test_secret_key';

beforeAll(() => {
  process.env.CHARITYSTACK_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.CHARITYSTACK_WEBHOOK_TOLERANCE_SECONDS;
});

// Matches CharityStack's algorithm: HMAC-SHA256 over `${timestamp}.${raw body}`, hex.
function sign(body: string | Buffer, timestamp: string, secret = SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), Buffer.from(body)]))
    .digest('hex');
}

const now = () => String(Math.floor(Date.now() / 1000));

function makeRequest(
  body: string,
  headers: Record<string, string>,
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/charitystack', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('CharityStack webhook route', () => {
  const body = JSON.stringify({ type: 'donation.created', data: { note: 'Spenden für alle' } });

  it('accepts a valid sha256= signature', async () => {
    const ts = now();
    const res = await POST(
      makeRequest(body, {
        'x-webhook-signature': `sha256=${sign(body, ts)}`,
        'x-webhook-timestamp': ts,
        'x-webhook-id': 'del_1',
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a bare hex digest', async () => {
    const ts = now();
    const res = await POST(
      makeRequest(body, { 'x-webhook-signature': sign(body, ts), 'x-webhook-timestamp': ts })
    );
    expect(res.status).toBe(200);
  });

  it('compares hex case-insensitively', async () => {
    const ts = now();
    const res = await POST(
      makeRequest(body, {
        'x-webhook-signature': `sha256=${sign(body, ts).toUpperCase()}`,
        'x-webhook-timestamp': ts,
      })
    );
    expect(res.status).toBe(200);
  });

  it('verifies the raw bytes whatever the content type', async () => {
    const ts = now();
    const res = await POST(
      makeRequest(
        body,
        { 'x-webhook-signature': `sha256=${sign(body, ts)}`, 'x-webhook-timestamp': ts },
        'text/plain'
      )
    );
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(makeRequest(body, { 'x-webhook-timestamp': now() }));
    expect(res.status).toBe(401);
  });

  it('rejects a missing timestamp header', async () => {
    const res = await POST(
      makeRequest(body, { 'x-webhook-signature': `sha256=${sign(body, now())}` })
    );
    expect(res.status).toBe(401);
  });

  it('rejects a malformed signature', async () => {
    const ts = now();
    for (const sig of ['sha256=', 'sha256=zz', `sha256=${'g'.repeat(64)}`, `sha256=${sign(body, ts)}00`]) {
      const res = await POST(
        makeRequest(body, { 'x-webhook-signature': sig, 'x-webhook-timestamp': ts })
      );
      expect(res.status).toBe(401);
    }
  });

  it('rejects a signature made with another secret', async () => {
    const ts = now();
    const res = await POST(
      makeRequest(body, {
        'x-webhook-signature': `sha256=${sign(body, ts, 'other_secret')}`,
        'x-webhook-timestamp': ts,
      })
    );
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const ts = now();
    const res = await POST(
      makeRequest(JSON.stringify({ type: 'donation.updated' }), {
        'x-webhook-signature': `sha256=${sign(body, ts)}`,
        'x-webhook-timestamp': ts,
      })
    );
    expect(res.status).toBe(401);
  });

  it('rejects a re-serialised body', async () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    const ts = now();
    const res = await POST(
      makeRequest(pretty, {
        'x-webhook-signature': `sha256=${sign(body, ts)}`,
        'x-webhook-timestamp': ts,
      })
    );
    expect(res.status).toBe(401);
  });

  it('accepts old timestamps by default (retries and replays)', async () => {
    const ts = String(Math.floor(Date.now() / 1000) - 86400);
    const res = await POST(
      makeRequest(body, { 'x-webhook-signature': `sha256=${sign(body, ts)}`, 'x-webhook-timestamp': ts })
    );
    expect(res.status).toBe(200);
  });

  it('rejects old timestamps when the tolerance is enabled', async () => {
    process.env.CHARITYSTACK_WEBHOOK_TOLERANCE_SECONDS = '300';
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    const stale = await POST(
      makeRequest(body, { 'x-webhook-signature': `sha256=${sign(body, old)}`, 'x-webhook-timestamp': old })
    );
    expect(stale.status).toBe(401);

    const ts = now();
    const fresh = await POST(
      makeRequest(body, { 'x-webhook-signature': `sha256=${sign(body, ts)}`, 'x-webhook-timestamp': ts })
    );
    expect(fresh.status).toBe(200);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const ts = now();
    const res = await POST(
      makeRequest('not json', {
        'x-webhook-signature': `sha256=${sign('not json', ts)}`,
        'x-webhook-timestamp': ts,
      })
    );
    expect(res.status).toBe(400);
  });

  it.each([
    'donation.created',
    'donation.updated',
    'subscription.created',
    'subscription.updated',
    'subscription.cancelled',
    'subscription.payment_method_updated',
    'contact.created',
    'contact.updated',
    'form.created',
    'form.updated',
    'something.new',
  ])('acknowledges %s', async (type) => {
    const payload = JSON.stringify({ type });
    const ts = now();
    const res = await POST(
      makeRequest(payload, {
        'x-webhook-signature': `sha256=${sign(payload, ts)}`,
        'x-webhook-timestamp': ts,
      })
    );
    expect(res.status).toBe(200);
  });
});

describe('verifyCharityStackSignature', () => {
  const raw = Buffer.from('{"type":"contact.created"}');

  it('uses the secret as UTF-8 bytes, not hex or base64', () => {
    const ts = '1700000000';
    const secret = 'deadbeefdeadbeef';
    expect(verifyCharityStackSignature(raw, sign(raw, ts, secret), ts, secret).valid).toBe(true);
  });

  it('applies tolerance relative to the supplied clock', () => {
    const ts = '1700000000';
    const sig = `sha256=${sign(raw, ts)}`;
    expect(verifyCharityStackSignature(raw, sig, ts, SECRET, 300, 1700000100).valid).toBe(true);
    expect(verifyCharityStackSignature(raw, sig, ts, SECRET, 300, 1700000400).valid).toBe(false);
  });

  it('returns an error for an empty signature', () => {
    expect(verifyCharityStackSignature(raw, '', '1700000000', SECRET).valid).toBe(false);
  });
});
