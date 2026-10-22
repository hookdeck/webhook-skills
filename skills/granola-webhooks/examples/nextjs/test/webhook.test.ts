import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/granola/route';

// Granola signing secrets are 'whsec_' + base64-encoded key bytes
const WEBHOOK_SECRET = 'whsec_' + Buffer.from('test_granola_signing_secret_key').toString('base64');

/**
 * Sign a payload exactly as Granola does (Standard Webhooks):
 * base64(HMAC-SHA256(base64decode(secret after whsec_), "{id}.{timestamp}.{body}"))
 */
function sign(body: string, id: string, timestamp: number, secret = WEBHOOK_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `v1,${signature}`;
}

interface Overrides {
  id?: string;
  timestamp?: number;
  signature?: string;
  secret?: string;
  omit?: string;
  sendBody?: string;
  contentType?: string;
}

function buildRequest(body: string, o: Overrides = {}): NextRequest {
  const id = o.id ?? '8f1c2a4e-6b3d-4e8f-9a2b-1c5d7e9f0a3b';
  const timestamp = o.timestamp ?? Math.floor(Date.now() / 1000);
  const headers: Record<string, string> = {
    'content-type': o.contentType ?? 'application/json',
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': o.signature ?? sign(body, id, timestamp, o.secret),
  };
  if (o.omit) delete headers[o.omit];
  return new NextRequest('http://localhost/webhooks/granola', {
    method: 'POST',
    headers,
    body: o.sendBody ?? body,
  });
}

const generated = {
  event_id: '8f1c2a4e-6b3d-4e8f-9a2b-1c5d7e9f0a3b',
  event_type: 'note.generated',
  note_id: 'not_1d3tmYTlCICgjy',
  occurred_at: '2026-01-27T15:30:00Z',
};
const edited = { ...generated, event_type: 'note.edited', data: { changed_fields: ['summary'] } };
const accessGranted = { ...generated, event_type: 'note.access_granted' };

describe('POST /webhooks/granola', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.GRANOLA_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['note.generated', generated],
    ['note.edited', edited],
    ['note.access_granted', accessGranted],
  ])('accepts a correctly signed %s event', async (_name, payload) => {
    const res = await POST(buildRequest(JSON.stringify(payload)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts any content type', async () => {
    const res = await POST(buildRequest(JSON.stringify(generated), { contentType: 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('accepts when one of several space-delimited signatures matches', async () => {
    const body = JSON.stringify(generated);
    const id = '8f1c2a4e-6b3d-4e8f-9a2b-1c5d7e9f0a3b';
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = `v1,aW52YWxpZHNpZ25hdHVyZQ== ${sign(body, id, timestamp)}`;
    const res = await POST(buildRequest(body, { id, timestamp, signature }));
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const res = await POST(buildRequest(JSON.stringify(generated), { signature: 'v1,aW52YWxpZHNpZ25hdHVyZQ==' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const other = 'whsec_' + Buffer.from('some_other_secret').toString('base64');
    const res = await POST(buildRequest(JSON.stringify(generated), { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const tampered = JSON.stringify({ ...generated, note_id: 'not_tampered' });
    const res = await POST(buildRequest(JSON.stringify(generated), { sendBody: tampered }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than 5 minutes', async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 600;
    const res = await POST(buildRequest(JSON.stringify(generated), { timestamp }));
    expect(res.status).toBe(400);
  });

  it.each(['webhook-id', 'webhook-timestamp', 'webhook-signature'])('rejects a request missing %s', async (header) => {
    const res = await POST(buildRequest(JSON.stringify(generated), { omit: header }));
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.GRANOLA_WEBHOOK_SECRET;
    const res = await POST(buildRequest(JSON.stringify(generated)));
    expect(res.status).toBe(500);
  });
});
