import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyDopplerWebhook } from '../lib/verify';

const SECRET = 'test_doppler_secret';

beforeAll(() => {
  process.env.DOPPLER_WEBHOOK_SECRET = SECRET;
});

/**
 * Generate a valid Doppler signature for testing (sha256=<hex> of the raw body)
 */
function generateDopplerSignature(payload: string, secret: string): string {
  const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${digest}`;
}

const defaultPayload = {
  type: 'config.secrets.update',
  config: { name: 'dev', root: true, environment: 'dev', project: 'backend' },
  project: { id: 'backend', slug: 'backend', name: 'backend' },
  workplace: { id: '9f0c0c0d5d4e240ce26e', name: 'My Workplace' },
  diff: { added: ['FOO'], removed: ['BAR'], updated: ['BAZ'] },
};

describe('verifyDopplerWebhook', () => {
  it('returns true for a valid signature', () => {
    const body = '{"type":"config.secrets.update"}';
    expect(verifyDopplerWebhook(body, generateDopplerSignature(body, SECRET), SECRET)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(verifyDopplerWebhook('{}', 'sha256=invalid', SECRET)).toBe(false);
  });

  it('returns false for a missing signature', () => {
    expect(verifyDopplerWebhook('{}', null, SECRET)).toBe(false);
  });

  it('returns false when no secret is configured', () => {
    const body = '{}';
    expect(verifyDopplerWebhook(body, generateDopplerSignature(body, SECRET), undefined)).toBe(false);
  });

  it('verifies raw bytes rather than re-serialized JSON', () => {
    const body = '{ "type" : "config.secrets.update",  "diff": {} }';
    expect(verifyDopplerWebhook(body, generateDopplerSignature(body, SECRET), SECRET)).toBe(true);
  });
});

describe('POST /webhooks/doppler', () => {
  async function post(body: string, headers: Record<string, string>) {
    const { POST } = await import('../app/webhooks/doppler/route');
    const request = new NextRequest('http://localhost:3000/webhooks/doppler', {
      method: 'POST',
      headers,
      body,
    });
    return POST(request);
  }

  it('returns 401 for a missing signature', async () => {
    const res = await post(JSON.stringify(defaultPayload), { 'content-type': 'application/json' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const res = await post(JSON.stringify(defaultPayload), {
      'content-type': 'application/json',
      'x-doppler-signature': 'sha256=invalid',
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 for a valid config.secrets.update', async () => {
    const body = JSON.stringify(defaultPayload);
    const res = await post(body, {
      'content-type': 'application/json',
      'x-doppler-signature': generateDopplerSignature(body, SECRET),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies a custom payload sent with another content type', async () => {
    const body = '{"text": "secrets changed"}';
    const res = await post(body, {
      'content-type': 'text/plain',
      'x-doppler-signature': generateDopplerSignature(body, SECRET),
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await post(body, {
      'content-type': 'text/plain',
      'x-doppler-signature': generateDopplerSignature(body, SECRET),
    });
    expect(res.status).toBe(400);
  });
});
