import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/twenty/route';

// Twenty webhook secrets are opaque strings used as-is (UTF-8) as the HMAC key
const WEBHOOK_SECRET = 'test_twenty_webhook_secret';

beforeAll(() => {
  process.env.TWENTY_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

afterEach(() => {
  delete process.env.TWENTY_WEBHOOK_TOLERANCE_SECONDS;
});

/**
 * Generate a valid X-Twenty-Webhook-Signature: bare hex HMAC-SHA256 of
 * "<timestamp>:" + raw body. The timestamp is Unix milliseconds.
 */
function generateSignature(payload: string, secret: string, timestamp: number | string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}:`, 'utf8'), Buffer.from(payload)]))
    .digest('hex');
}

function eventPayload(eventName: string, id = 'abc12345'): string {
  return JSON.stringify({
    eventName,
    workspaceId: 'ws_123',
    webhookId: 'wh_123',
    eventDate: '2026-10-26T12:00:00.000Z',
    record: { id, name: 'Acme' },
  });
}

interface Opts {
  signature?: string;
  timestamp?: string | number;
  contentType?: string;
}

function makeRequest(payload: string, { signature, timestamp, contentType = 'application/json' }: Opts = {}): NextRequest {
  const headers: Record<string, string> = {
    'content-type': contentType,
    'x-twenty-webhook-nonce': 'nonce-123',
  };
  if (signature) headers['x-twenty-webhook-signature'] = signature;
  if (timestamp !== undefined) headers['x-twenty-webhook-timestamp'] = String(timestamp);
  return new Request('http://localhost:3000/webhooks/twenty', {
    method: 'POST',
    headers,
    body: payload,
  }) as unknown as NextRequest;
}

function signed(payload: string, secret = WEBHOOK_SECRET, timestamp: number = Date.now()): Opts {
  return { signature: generateSignature(payload, secret, timestamp), timestamp };
}

describe('Twenty Webhook Endpoint', () => {
  it('returns 401 for a missing signature header', async () => {
    const res = await POST(makeRequest(eventPayload('person.created'), { timestamp: Date.now() }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a missing timestamp header', async () => {
    const payload = eventPayload('person.created');
    const res = await POST(makeRequest(payload, { signature: signed(payload).signature }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an empty timestamp header', async () => {
    const payload = eventPayload('person.created');
    const res = await POST(makeRequest(payload, { signature: signed(payload).signature, timestamp: '' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a signature made with the wrong secret', async () => {
    const payload = eventPayload('person.created');
    const res = await POST(makeRequest(payload, signed(payload, 'wrong_secret')));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered body', async () => {
    const payload = eventPayload('person.created');
    const res = await POST(makeRequest(payload.replace('Acme', 'Evil'), signed(payload)));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the timestamp header differs from the signed one', async () => {
    const payload = eventPayload('person.created');
    const { signature, timestamp } = signed(payload);
    const res = await POST(makeRequest(payload, { signature, timestamp: Number(timestamp) + 1 }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a signature that is not 64 hex characters', async () => {
    const payload = eventPayload('person.created');
    const { signature, timestamp } = signed(payload);
    for (const bad of [signature!.slice(0, 62), `${signature}00`, `sha256=${signature}`, `${signature!.slice(0, 63)}z`]) {
      const res = await POST(makeRequest(payload, { signature: bad, timestamp }));
      expect(res.status).toBe(401);
    }
  });

  it.each([
    'person.created',
    'person.deleted',
    'company.updated',
    'opportunity.updated',
    'note.created',
    'workflow.created',
  ])('returns 200 for a valid %s event', async (eventName) => {
    const payload = eventPayload(eventName);
    const res = await POST(makeRequest(payload, signed(payload)));
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    const payload = eventPayload('person.created');
    const { signature, timestamp } = signed(payload);
    const res = await POST(makeRequest(payload, { signature: signature!.toUpperCase(), timestamp }));
    expect(res.status).toBe(200);
  });

  it('verifies the exact raw bytes (whitespace and non-ASCII are not normalised)', async () => {
    const payload = '{\n  "eventName": "person.created",\n  "record": { "id": "1", "name": "Zoë 😀" }\n}';
    const res = await POST(makeRequest(payload, signed(payload)));
    expect(res.status).toBe(200);
  });

  it('verifies any content type', async () => {
    const payload = eventPayload('person.created');
    const res = await POST(makeRequest(payload, { ...signed(payload), contentType: 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('accepts the docs-style `event` field', async () => {
    const payload = JSON.stringify({ event: 'company.updated', data: { id: 'c1' }, timestamp: '2026-10-26T12:00:00Z' });
    const res = await POST(makeRequest(payload, signed(payload)));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const payload = 'not json';
    const res = await POST(makeRequest(payload, { ...signed(payload), contentType: 'text/plain' }));
    expect(res.status).toBe(400);
  });

  it('does not reject old timestamps by default (retries and replays resend them)', async () => {
    const payload = eventPayload('person.created');
    const res = await POST(makeRequest(payload, signed(payload, WEBHOOK_SECRET, Date.now() - 24 * 3600 * 1000)));
    expect(res.status).toBe(200);
  });

  it('rejects old timestamps when TWENTY_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
    process.env.TWENTY_WEBHOOK_TOLERANCE_SECONDS = '300';
    const payload = eventPayload('person.created');
    const old = await POST(makeRequest(payload, signed(payload, WEBHOOK_SECRET, Date.now() - 10 * 60 * 1000)));
    expect(old.status).toBe(401);
    const fresh = await POST(makeRequest(payload, signed(payload, WEBHOOK_SECRET, Date.now())));
    expect(fresh.status).toBe(200);
  });

  it('treats the timestamp as milliseconds when a tolerance is set', async () => {
    process.env.TWENTY_WEBHOOK_TOLERANCE_SECONDS = '300';
    const payload = eventPayload('person.created');
    // Unix seconds (1000x too small) would be decades old in milliseconds
    const res = await POST(makeRequest(payload, signed(payload, WEBHOOK_SECRET, Math.floor(Date.now() / 1000))));
    expect(res.status).toBe(401);
  });
});
