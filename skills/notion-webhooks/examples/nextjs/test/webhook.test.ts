import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

beforeAll(() => {
  process.env.NOTION_VERIFICATION_TOKEN = 'secret_test_verification_token';
});

/**
 * Generate a valid Notion signature for testing.
 *
 * Mirrors the provider format: sha256=<hex(HMAC-SHA256(token, body))>.
 */
function generateNotionSignature(rawBody: string, token: string): string {
  const hex = crypto.createHmac('sha256', token).update(rawBody).digest('hex');
  return `sha256=${hex}`;
}

/**
 * Re-implementation of the route's verifier so the test can exercise the
 * pure crypto logic without spinning up Next.js.
 */
function verifyNotionSignature(
  rawBody: string,
  signatureHeader: string | null,
  verificationToken: string | undefined
): boolean {
  if (!signatureHeader || !verificationToken) return false;

  const expected = `sha256=${crypto
    .createHmac('sha256', verificationToken)
    .update(rawBody)
    .digest('hex')}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signatureHeader)
    );
  } catch {
    return false;
  }
}

describe('verifyNotionSignature', () => {
  const TOKEN = 'secret_test_verification_token';

  it('accepts a valid signature', () => {
    const body = JSON.stringify({
      id: 'evt_1',
      type: 'page.content_updated',
      entity: { id: 'page_1' },
    });
    const sig = generateNotionSignature(body, TOKEN);
    expect(verifyNotionSignature(body, sig, TOKEN)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const body = JSON.stringify({ type: 'page.content_updated' });
    expect(verifyNotionSignature(body, 'sha256=deadbeef', TOKEN)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const original = JSON.stringify({ type: 'page.content_updated', id: 1 });
    const sig = generateNotionSignature(original, TOKEN);
    const tampered = JSON.stringify({ type: 'page.content_updated', id: 999 });
    expect(verifyNotionSignature(tampered, sig, TOKEN)).toBe(false);
  });

  it('rejects when signature header missing', () => {
    const body = JSON.stringify({ type: 'page.content_updated' });
    expect(verifyNotionSignature(body, null, TOKEN)).toBe(false);
  });

  it('rejects when token missing', () => {
    const body = JSON.stringify({ type: 'page.content_updated' });
    const sig = generateNotionSignature(body, TOKEN);
    expect(verifyNotionSignature(body, sig, undefined)).toBe(false);
  });

  it('rejects when wrong token used', () => {
    const body = JSON.stringify({ type: 'page.content_updated' });
    const sig = generateNotionSignature(body, TOKEN);
    expect(verifyNotionSignature(body, sig, 'secret_other')).toBe(false);
  });

  it('handles malformed signature header without throwing', () => {
    const body = JSON.stringify({ type: 'page.content_updated' });
    expect(verifyNotionSignature(body, 'not-a-signature', TOKEN)).toBe(false);
  });
});

describe('generateNotionSignature', () => {
  it('produces sha256=<hex> with 64 hex chars', () => {
    const sig = generateNotionSignature('{}', 'secret_test');
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    const a = generateNotionSignature('{"id":1}', 'secret_test');
    const b = generateNotionSignature('{"id":1}', 'secret_test');
    expect(a).toBe(b);
  });

  it('differs for different bodies', () => {
    const a = generateNotionSignature('{"id":1}', 'secret_test');
    const b = generateNotionSignature('{"id":2}', 'secret_test');
    expect(a).not.toBe(b);
  });
});

describe('Route handler (POST /webhooks/notion)', () => {
  // Import dynamically so beforeAll's env var is set first
  let POST: (req: Request) => Promise<Response>;
  beforeAll(async () => {
    POST = (await import('../app/webhooks/notion/route')).POST as unknown as (
      req: Request
    ) => Promise<Response>;
  });

  const TOKEN = 'secret_test_verification_token';
  const url = 'http://localhost/webhooks/notion';

  it('returns 200 for the verification handshake', async () => {
    const body = JSON.stringify({ verification_token: 'secret_handshake_xyz' });
    const req = new Request(url, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 400 with no signature and no verification_token', async () => {
    const req = new Request(url, {
      method: 'POST',
      body: '{"hello":"world"}',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 401 for an invalid signature', async () => {
    const body = JSON.stringify({
      id: 'evt_1',
      type: 'page.content_updated',
      entity: { id: 'page_1' },
    });
    const req = new Request(url, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'x-notion-signature': 'sha256=00',
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 for a valid signature', async () => {
    const body = JSON.stringify({
      id: 'evt_valid',
      type: 'page.content_updated',
      entity: { id: 'page_valid' },
    });
    const sig = generateNotionSignature(body, TOKEN);
    const req = new Request(url, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'x-notion-signature': sig,
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('handles a variety of event types with valid signatures', async () => {
    const types = [
      'page.content_updated',
      'page.properties_updated',
      'page.created',
      'page.deleted',
      'page.locked',
      'page.moved',
      'comment.created',
      'data_source.schema_updated',
      'unknown.event.type',
    ];

    for (const type of types) {
      const body = JSON.stringify({
        id: `evt_${type.replace(/\./g, '_')}`,
        type,
        entity: { id: 'entity_1' },
      });
      const sig = generateNotionSignature(body, TOKEN);
      const req = new Request(url, {
        method: 'POST',
        body,
        headers: {
          'content-type': 'application/json',
          'x-notion-signature': sig,
        },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    }
  });
});
