// Generated with: stedi-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/stedi/route';

// Stedi secrets look like "whsec_" + base64(key bytes). The HMAC key is the decoded part.
const SECRET = 'whsec_' + Buffer.from('stedi-test-signing-key-0123456789').toString('base64');

/** Sign like Stedi does (Standard Webhooks): HMAC-SHA256 over `${id}.${timestamp}.${body}`. */
function sign(rawBody: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

interface SignOptions {
  id?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const id = opts.id || `msg_${crypto.randomUUID()}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/stedi', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

const thinEvent = (
  type: string,
  resource: { id: string; type: string },
  relatedResources?: { id: string; type: string }[]
) => ({
  account: '11111111-2222-3333-4444-555555555555',
  created: '2026-03-30T23:19:00.501Z',
  environment: 'PRODUCTION',
  id: `evt_${crypto.randomUUID()}`,
  object: 'v1.event',
  resource,
  ...(relatedResources ? { relatedResources } : {}),
  type,
});

const enrollmentActivated = () =>
  thinEvent('enrollment.activated', { id: '019bb508-dc63-73a1-8ddc-9d4720299072', type: 'enrollment' });

beforeEach(() => {
  process.env.STEDI_WEBHOOK_SECRET = SECRET;
  delete process.env.STEDI_TIMESTAMP_TOLERANCE_SECONDS;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts enrollment.activated', async () => {
    const body = JSON.stringify(enrollmentActivated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('is LIVE'));
  });

  it('accepts transaction.processed', async () => {
    const body = JSON.stringify(
      thinEvent('transaction.processed', { id: '019bb508-dc63-73a1-8ddc-9d4720299072', type: 'transaction' }, [
        { id: '019bb508-dc63-73a1-8ddc-9d4720299072', type: 'transaction.x12.835' },
        { id: '01997873-bebb-7b33-81ef-f408866dfb2c', type: 'execution' },
      ])
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('transaction.x12.835'));
  });

  it('accepts file.failed', async () => {
    const body = JSON.stringify(thinEvent('file.failed', { id: '019bb508-dc63', type: 'execution' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('File failed'));
  });

  it('accepts event.ping', async () => {
    const body = JSON.stringify(thinEvent('event.ping', { id: 'dst_019d51b6-707c', type: 'destination' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts a non-JSON content type (raw body verified for any type)', async () => {
    const body = JSON.stringify(enrollmentActivated());
    const res = await post(body, { ...signedHeaders(body), 'content-type': 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(thinEvent('something.new', { id: 'x', type: 'x' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-separated signatures matches (rotation)', async () => {
    const body = JSON.stringify(enrollmentActivated());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('accepts a retry whose creation timestamp is hours old (no tolerance by default)', async () => {
    const body = JSON.stringify(enrollmentActivated());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 8 * 3600 }));
    expect(res.status).toBe(200);
  });

  it('returns 200 for a retried delivery with the same webhook-id', async () => {
    const body = JSON.stringify(enrollmentActivated());
    const id = `msg_${crypto.randomUUID()}`;
    const first = await post(body, signedHeaders(body, { id }));
    const second = await post(body, signedHeaders(body, { id }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(enrollmentActivated());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(enrollmentActivated());
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it("rejects a signature made with another destination's secret", async () => {
    const other = 'whsec_' + Buffer.from('another-destination-secret-0123').toString('base64');
    const body = JSON.stringify(enrollmentActivated());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(enrollmentActivated());
    const headers = signedHeaders(body);
    const res = await post(body.replace('PRODUCTION', 'TEST'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects the timestamp.body signed payload from the docs prose (no id)', async () => {
    const body = JSON.stringify(enrollmentActivated());
    const ts = String(now());
    const key = Buffer.from(SECRET.slice('whsec_'.length), 'base64');
    const wrong = crypto.createHmac('sha256', key).update(`${ts}.${body}`).digest('base64');
    const res = await post(body, signedHeaders(body, { timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(enrollmentActivated());
    const id = `msg_${crypto.randomUUID()}`;
    const ts = String(now());
    const wrong = crypto
      .createHmac('sha256', SECRET.slice('whsec_'.length))
      .update(`${id}.${ts}.${body}`)
      .digest('base64');
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });

  it('rejects an old timestamp only when a tolerance is configured', async () => {
    process.env.STEDI_TIMESTAMP_TOLERANCE_SECONDS = '300';
    const body = JSON.stringify(enrollmentActivated());
    const stale = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    const fresh = await post(body, signedHeaders(body));
    expect(stale.status).toBe(400);
    expect(fresh.status).toBe(200);
  });
});

describe('fail closed', () => {
  it('returns 500 when STEDI_WEBHOOK_SECRET is not set', async () => {
    delete process.env.STEDI_WEBHOOK_SECRET;
    const body = JSON.stringify(enrollmentActivated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
