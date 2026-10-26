import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/cloudsmith/route';

// The HMAC Signature Key is a free-form string set on the webhook in Cloudsmith
const webhookSecret = 'cloudsmith_test_signature_key';

beforeAll(() => {
  process.env.CLOUDSMITH_WEBHOOK_SECRET = webhookSecret;
});

/**
 * Generate an X-Cloudsmith-Signature value the same way Cloudsmith does:
 * hex(HMAC-SHA1(signature key, rawBody))
 */
function generateCloudsmithSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha1', secret).update(payload).digest('hex');
}

function buildRequest(body: string, signature?: string | null, contentType = 'application/json'): Request {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  const sig = signature === undefined ? generateCloudsmithSignature(body, webhookSecret) : signature;
  if (sig !== null) {
    headers['X-Cloudsmith-Signature'] = sig;
  }
  return new Request('http://localhost:3000/webhooks/cloudsmith', {
    method: 'POST',
    headers,
    body,
  });
}

// Based on the package payload in Cloudsmith's docs
const event = (eventId: string, data: object = {}) =>
  JSON.stringify({
    data: {
      name: 'my-file.deb',
      namespace: 'my-org',
      repository: 'my-repo',
      format: 'raw',
      identifier_perm: 'xKYgfsOsboz6',
      stage_str: 'Fully Synchronised',
      status_str: 'Completed',
      ...data,
    },
    meta: {
      attempt_at: '2020-07-07T17:30:34.342167+00:00',
      event_at: '2020-07-07T17:30:34.296482+00:00',
      event_id: eventId,
      trigger_id: 'c0e2b63e-3d84-4d54-bd62-ae7d0b2764a7',
      webhook_id: 1,
    },
  });

describe('signature verification', () => {
  const body = event('package.synced');
  const valid = generateCloudsmithSignature(body, webhookSecret);

  it('accepts a valid signature', async () => {
    expect((await POST(buildRequest(body))).status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    expect((await POST(buildRequest(body, valid.toUpperCase()))).status).toBe(200);
  });

  it('rejects a signature made with another key', async () => {
    const res = await POST(buildRequest(body, generateCloudsmithSignature(body, 'other')));
    expect(res.status).toBe(401);
  });

  it('rejects a body altered after signing', async () => {
    const res = await POST(buildRequest(body.replace('my-repo', 'other-repo'), valid));
    expect(res.status).toBe(401);
  });

  it('rejects a sha1= prefixed value', async () => {
    expect((await POST(buildRequest(body, `sha1=${valid}`))).status).toBe(401);
  });

  it('rejects an HMAC-SHA256 signature', async () => {
    const sig = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
    expect((await POST(buildRequest(body, sig))).status).toBe(401);
  });

  it('rejects a base64 encoded digest', async () => {
    const sig = crypto.createHmac('sha1', webhookSecret).update(body).digest('base64');
    expect((await POST(buildRequest(body, sig))).status).toBe(401);
  });

  it('rejects malformed values', async () => {
    for (const sig of ['abc', `${valid}00`, `${valid.slice(0, 38)}zz`, '']) {
      expect((await POST(buildRequest(body, sig))).status).toBe(401);
    }
  });

  it('rejects a missing signature header', async () => {
    expect((await POST(buildRequest(body, null))).status).toBe(401);
  });

  it('rejects when the secret is not configured', async () => {
    delete process.env.CLOUDSMITH_WEBHOOK_SECRET;
    try {
      expect((await POST(buildRequest(body))).status).toBe(401);
    } finally {
      process.env.CLOUDSMITH_WEBHOOK_SECRET = webhookSecret;
    }
  });

  it('verifies regardless of Content-Type', async () => {
    expect((await POST(buildRequest(body, undefined, 'text/plain'))).status).toBe(200);
  });
});

describe('event handling', () => {
  it.each([
    'ping',
    'package.created',
    'package.deleted',
    'package.failed',
    'package.quarantined',
    'package.released',
    'package.restored',
    'package.security_scanned',
    'package.synced',
    'package.syncing',
    'package.tags_updated',
  ])('accepts %s', async (eventId) => {
    const res = await POST(buildRequest(event(eventId)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts unknown events with 200', async () => {
    expect((await POST(buildRequest(event('package.something_new')))).status).toBe(200);
  });

  it('accepts the JSON Array payload format', async () => {
    expect((await POST(buildRequest(`[${event('package.created')}]`))).status).toBe(200);
  });

  it('ignores wrong-typed fields instead of failing', async () => {
    expect((await POST(buildRequest(JSON.stringify({ data: 'nope', meta: ['x'] })))).status).toBe(200);
    expect((await POST(buildRequest(JSON.stringify({ data: { name: 5 }, meta: { event_id: 7 } })))).status).toBe(200);
  });

  it('rejects a signed body that is not an object or array', async () => {
    for (const body of ['"text"', '[1]', 'null']) {
      expect((await POST(buildRequest(body))).status).toBe(400);
    }
  });

  it('rejects a signed body that is not JSON', async () => {
    expect((await POST(buildRequest('payload=%7B%7D'))).status).toBe(400);
  });
});
