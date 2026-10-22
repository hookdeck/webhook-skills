import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyWahaSignature } from '../lib/waha';

const SECRET = 'my-secret-key';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.WAHA_WEBHOOK_HMAC_KEY = SECRET;
  ({ POST } = await import('../app/webhooks/waha/route'));
});

// Generate a real WAHA signature: hex HMAC-SHA512 of the raw body
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/waha', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

const message = JSON.stringify({
  id: 'evt_01hxyz',
  timestamp: 1741249702485,
  event: 'message',
  session: 'default',
  engine: 'WEBJS',
  payload: { id: 'true_11111111111@c.us_AAAA', from: '11111111111@c.us', body: 'Hi there!' },
});

describe('verifyWahaSignature', () => {
  const docBody = '{"event":"message","session":"default","engine":"WEBJS"}';
  const docSig =
    '208f8a55dde9e05519e898b10b89bf0d0b3b0fdf11fdbf09b6b90476301b98d8097c462b2b17a6ce93b6b47a136cf2e78a33a63f6752c2c1631777076153fa89';

  it('matches the test vector from the WAHA docs', () => {
    expect(verifyWahaSignature(docBody, docSig, 'my-secret-key', 'sha512')).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifyWahaSignature(docBody + ' ', docSig, 'my-secret-key')).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    expect(verifyWahaSignature(docBody, null, 'my-secret-key')).toBe(false);
    expect(verifyWahaSignature(docBody, docSig, undefined)).toBe(false);
  });

  it('rejects a signature of the wrong length', () => {
    expect(verifyWahaSignature(docBody, 'abc', 'my-secret-key')).toBe(false);
  });

  it('rejects an unsupported algorithm', () => {
    expect(verifyWahaSignature(docBody, docSig, 'my-secret-key', 'sha256')).toBe(false);
  });
});

describe('POST /webhooks/waha', () => {
  it('accepts a validly signed message event', async () => {
    const res = await POST(
      makeRequest(message, { 'x-webhook-hmac': sign(message), 'x-webhook-hmac-algorithm': 'sha512' })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it.each([
    'message',
    'message.any',
    'message.ack',
    'message.reaction',
    'session.status',
    'group.v2.join',
    'presence.update',
    'some.future.event',
  ])('accepts signed %s events', async (name) => {
    const body = JSON.stringify({ event: name, session: 'default', engine: 'WEBJS', payload: {} });
    const res = await POST(makeRequest(body, { 'x-webhook-hmac': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const res = await POST(
      makeRequest(message, { 'content-type': 'text/plain', 'x-webhook-hmac': sign(message) })
    );
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(makeRequest(message));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid signature', async () => {
    const res = await POST(makeRequest(message, { 'x-webhook-hmac': sign(message, 'wrong-key') }));
    expect(res.status).toBe(400);
  });

  it('rejects a body modified after signing', async () => {
    const res = await POST(
      makeRequest(message.replace('Hi there!', 'Hacked'), { 'x-webhook-hmac': sign(message) })
    );
    expect(res.status).toBe(400);
  });

  it('rejects a non-sha512 algorithm header', async () => {
    const res = await POST(
      makeRequest(message, { 'x-webhook-hmac': sign(message), 'x-webhook-hmac-algorithm': 'sha256' })
    );
    expect(res.status).toBe(400);
  });

  it('rejects signed but invalid JSON', async () => {
    const bad = '{not json';
    const res = await POST(makeRequest(bad, { 'x-webhook-hmac': sign(bad) }));
    expect(res.status).toBe(400);
  });
});
