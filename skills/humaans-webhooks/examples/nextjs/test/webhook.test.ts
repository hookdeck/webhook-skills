import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/humaans/route';

// Humaans signing secrets are 'whsec_' + base64-encoded key bytes
const WEBHOOK_SECRET = 'whsec_' + Buffer.from('test_humaans_signing_secret_key').toString('base64');
const MSG_ID = 'msg_2lXyZ3AbCdEfGhIjKlMnOpQrSt';

/**
 * Sign a payload exactly as Humaans (Svix / Standard Webhooks) does:
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
  prefix?: string;
  omit?: string;
  sendBody?: string;
  contentType?: string;
}

function buildRequest(body: string, o: Overrides = {}): NextRequest {
  const id = o.id ?? MSG_ID;
  const timestamp = o.timestamp ?? Math.floor(Date.now() / 1000);
  const prefix = o.prefix ?? 'webhook';
  const headers: Record<string, string> = {
    'content-type': o.contentType ?? 'application/json',
    [`${prefix}-id`]: id,
    [`${prefix}-timestamp`]: String(timestamp),
    [`${prefix}-signature`]: o.signature ?? sign(body, id, timestamp, o.secret),
  };
  if (o.omit) delete headers[o.omit];
  return new NextRequest('http://localhost/webhooks/humaans', {
    method: 'POST',
    headers,
    body: o.sendBody ?? body,
  });
}

const base = {
  id: 'qCNHkhApepOJf0eFHuPzQbDg',
  seq: '01J4GSN4XYQ7401FXCYQPWH3V7',
  ts: '2024-08-05T08:14:24.190Z',
  subject: { id: '8Rc7dFxm7OFoiwxVBIFrLRAi', type: 'person' },
  actor: { personId: '8Rc7dFxm7OFoiwxVBIFrLRAi', type: 'person' },
  entity: { id: 'OCPMqZtTcgFOuoc56TiKo9OT', fieldsChanged: ['name'], next: { name: 'jane' }, prev: { name: null }, customFields: [], metadata: {} },
};
const event = (action: string) => JSON.stringify({ ...base, action });

describe('POST /webhooks/humaans', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.HUMAANS_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([
    'person.created',
    'person.updated',
    'person.offboarded',
    'timeAway.created',
    'timeAway.approved',
    'compensation.updated',
    'equipment.deleted',
  ])('accepts a correctly signed %s event', async (action) => {
    const res = await POST(buildRequest(event(action)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts svix-* headers', async () => {
    const res = await POST(buildRequest(event('person.created'), { prefix: 'svix' }));
    expect(res.status).toBe(200);
  });

  it('accepts any content type', async () => {
    const res = await POST(buildRequest(event('person.created'), { contentType: 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('accepts when one of several space-delimited signatures matches', async () => {
    const body = event('person.created');
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = `v1,aW52YWxpZHNpZ25hdHVyZQ== ${sign(body, MSG_ID, timestamp)}`;
    const res = await POST(buildRequest(body, { timestamp, signature }));
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const res = await POST(buildRequest(event('person.created'), { signature: 'v1,aW52YWxpZHNpZ25hdHVyZQ==' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const other = 'whsec_' + Buffer.from('some_other_secret').toString('base64');
    const res = await POST(buildRequest(event('person.created'), { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const res = await POST(buildRequest(event('person.created'), { sendBody: event('person.deleted') }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than 5 minutes (library window)', async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 600;
    const res = await POST(buildRequest(event('person.created'), { timestamp }));
    expect(res.status).toBe(400);
  });

  it.each(['webhook-id', 'webhook-timestamp', 'webhook-signature'])('rejects a request missing %s', async (header) => {
    const res = await POST(buildRequest(event('person.created'), { omit: header }));
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.HUMAANS_WEBHOOK_SECRET;
    const res = await POST(buildRequest(event('person.created')));
    expect(res.status).toBe(500);
  });
});
