// Generated with: codat-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/codat/route';

// Codat (Standard Webhooks) secrets look like "whsec_" + base64(key bytes), for example
// "whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD". The HMAC key is the decoded part.
const SECRET = 'whsec_' + Buffer.from('codat-test-signing-key-0123456789ab').toString('base64');

/** Sign exactly like Svix/Standard Webhooks does for Codat deliveries. */
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
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
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
    new Request('http://localhost:3000/webhooks/codat', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

const event = (eventType: string, payload: Record<string, unknown>) => ({
  id: 'evt_1',
  eventType,
  generatedDate: '2026-10-21T09:30:00.123Z',
  payload,
});

const companyCreated = () =>
  event('company.created', {
    referenceCompany: { id: '8a210b68-6988-11ed-a1eb-0242ac120002', name: 'Acme Ltd' },
  });

beforeEach(() => {
  process.env.CODAT_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('valid signatures', () => {
  it('accepts company.created', async () => {
    const body = JSON.stringify(companyCreated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Company created'));
  });

  it.each(['connection.created', 'connection.connected', 'read.completed', 'write.successful'])(
    'accepts %s',
    async (type) => {
      const body = JSON.stringify(event(type, { connection: { id: 'conn-1' }, dataType: 'invoices' }));
      const res = await post(body, signedHeaders(body));
      expect(res.status).toBe(200);
    }
  );

  it('verifies a body sent with a non-JSON content type (raw body read)', async () => {
    const body = JSON.stringify(companyCreated());
    const res = await post(body, { ...signedHeaders(body), 'content-type': 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(event('some.new.event', {}));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-separated signatures matches (rotation)', async () => {
    const body = JSON.stringify(companyCreated());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for a retried delivery with the same webhook-id', async () => {
    const body = JSON.stringify(companyCreated());
    const id = `msg_retry_${Date.now()}`;
    const first = await post(body, signedHeaders(body, { id }));
    const second = await post(body, signedHeaders(body, { id }));
    expect(first.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(companyCreated());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(companyCreated());
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it("rejects a signature made with another endpoint's secret", async () => {
    const other = 'whsec_' + Buffer.from('another-endpoint-secret-01234567').toString('base64');
    const body = JSON.stringify(companyCreated());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(companyCreated());
    const headers = signedHeaders(body);
    const res = await post(body.replace('Acme', 'Evil'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute tolerance', async () => {
    const body = JSON.stringify(companyCreated());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when CODAT_WEBHOOK_SECRET is not set', async () => {
    delete process.env.CODAT_WEBHOOK_SECRET;
    const body = JSON.stringify(companyCreated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
