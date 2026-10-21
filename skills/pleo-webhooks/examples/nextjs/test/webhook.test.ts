// Generated with: pleo-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/pleo/route';

// Pleo subscription secrets look like "whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD":
// "whsec_" + base64. The HMAC key is the base64-DECODED part after "whsec_".
const SECRET = 'whsec_' + Buffer.from('pleo-test-signing-key-0123456789').toString('base64');

/** Sign like Svix / Standard Webhooks (the scheme Pleo delivers with). */
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
    new Request('http://localhost:3000/webhooks/pleo', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

// Payloads match the examples in Pleo's Webhook Events reference.
const exportJobCreated = () => ({
  data: {
    companyId: 'b5fdaec1-1b43-4b62-996a-b0471c3bb336',
    createdAt: '2025-05-23T15:21:32Z',
    createdBy: 'e3118b03-691c-4bd4-944e-1a9c1f1031b7',
    expiresIn: 3600,
    id: 'b4c4d068-ebbe-45b7-b562-2f16f0deb8b9',
    numberOfItems: 1,
    status: 'pending',
  },
  eventId: crypto.randomUUID(),
  eventType: 'v1.export-job.created',
});

const vendorCreated = () => ({
  data: {
    id: 'c27ed4d6-3d3d-458e-8f3f-735fdf32a3bc',
    companyId: '12abc3d4-e567-890e-1234-abc56e78fabc',
    name: 'Greenfield Logistics',
    country: 'GB',
    registrationNumber: '',
    taxRegistrationNumber: 'GB987654321',
    code: null,
    state: 'DRAFT',
    defaultCurrency: 'GBP',
    createdBy: '22aff90a-a53d-4f0c-851f-dd4cc85ac947',
    createdAt: '2026-07-08T10:05:43.530450712Z',
    updatedAt: '2026-07-08T10:05:43.530450712Z',
    deletedAt: null,
  },
  eventType: 'v1.vendor.created',
  eventId: crypto.randomUUID(),
});

beforeEach(() => {
  process.env.PLEO_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts v1.export-job.created', async () => {
    const body = JSON.stringify(exportJobCreated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Export job b4c4d068-ebbe-45b7-b562-2f16f0deb8b9 created')
    );
  });

  it('accepts v1.vendor.created', async () => {
    const body = JSON.stringify(vendorCreated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Greenfield Logistics'));
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify({ data: {}, eventId: crypto.randomUUID(), eventType: 'v1.something.new' });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-delimited signatures matches', async () => {
    const body = JSON.stringify(exportJobCreated());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for a retried delivery with the same webhook-id', async () => {
    const body = JSON.stringify(exportJobCreated());
    const first = await post(body, signedHeaders(body, { id: 'msg_retry_test' }));
    const second = await post(body, signedHeaders(body, { id: 'msg_retry_test' }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(exportJobCreated());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(exportJobCreated());
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const other = 'whsec_' + Buffer.from('some-other-secret-key-0123456789').toString('base64');
    const body = JSON.stringify(exportJobCreated());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(exportJobCreated());
    const headers = signedHeaders(body);
    const res = await post(body.replace('pending', 'completed'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute tolerance', async () => {
    const body = JSON.stringify(exportJobCreated());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(exportJobCreated());
    const id = 'msg_undecoded';
    const ts = String(now());
    const wrong = crypto
      .createHmac('sha256', SECRET.slice('whsec_'.length))
      .update(`${id}.${ts}.${body}`)
      .digest('base64');
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when PLEO_WEBHOOK_SECRET is not set', async () => {
    delete process.env.PLEO_WEBHOOK_SECRET;
    const body = JSON.stringify(exportJobCreated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
