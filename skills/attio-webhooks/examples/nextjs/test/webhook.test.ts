import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/attio/route';
import { verifyAttioSignature } from '../lib/verify-attio-signature';

// Attio webhook secrets are 64-char hex strings, used as-is (UTF-8) as the HMAC key
const secret = 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb';

/** Sign a payload exactly like Attio: hex HMAC-SHA256 of the raw body. */
function signAttio(payload: string, key = secret): string {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function attioPayload(eventType: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    webhook_id: '23e42eaf-323a-41da-b5bb-fd67eebda553',
    events: [
      {
        event_type: eventType,
        id: {
          workspace_id: '14beef7a-99f7-4534-a87e-70b564330a4c',
          object_id: '97052eb9-e65e-443f-a297-f2d9a4a7f795',
          record_id: 'bf071e1f-6035-429d-b874-d83ea64ea13b',
        },
        actor: { type: 'workspace-member', id: '50cf242c-7fa3-4cad-87d0-75b1af71c57b' },
        ...extra,
      },
    ],
  });
}

let keyCounter = 0;
const newKey = () => `idem-${Date.now()}-${keyCounter++}`;

function makeRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/webhooks/attio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

beforeAll(() => {
  process.env.ATTIO_WEBHOOK_SECRET = secret;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('verifyAttioSignature', () => {
  const body = attioPayload('record.created');

  it('accepts a valid signature', () => {
    expect(verifyAttioSignature(body, signAttio(body), secret)).toBe(true);
  });

  it('accepts an uppercase hex signature', () => {
    expect(verifyAttioSignature(body, signAttio(body).toUpperCase(), secret)).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifyAttioSignature(body, signAttio(body, 'wrong_secret'), secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyAttioSignature(attioPayload('record.deleted'), signAttio(body), secret)).toBe(false);
  });

  it('rejects malformed signatures without throwing', () => {
    expect(verifyAttioSignature(body, 'invalid', secret)).toBe(false);
    expect(verifyAttioSignature(body, `sha256=${signAttio(body)}`, secret)).toBe(false);
    expect(verifyAttioSignature(body, signAttio(body).slice(0, 40), secret)).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    expect(verifyAttioSignature(body, null, secret)).toBe(false);
    expect(verifyAttioSignature(body, signAttio(body), undefined)).toBe(false);
  });
});

describe('POST /webhooks/attio', () => {
  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(makeRequest(attioPayload('record.created')));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing signature header' });
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(
      makeRequest(attioPayload('record.created'), { 'Attio-Signature': 'a'.repeat(64) })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
  });

  it('returns 400 when the body was modified after signing', async () => {
    const sig = signAttio(attioPayload('record.created'));
    const res = await POST(makeRequest(attioPayload('record.deleted'), { 'Attio-Signature': sig }));
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid Attio-Signature', async () => {
    const payload = attioPayload('record.created');
    const res = await POST(
      makeRequest(payload, { 'Attio-Signature': signAttio(payload), 'Idempotency-Key': newKey() })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts the legacy X-Attio-Signature header', async () => {
    const payload = attioPayload('list-entry.updated', {
      id: {
        workspace_id: '14beef7a-99f7-4534-a87e-70b564330a4c',
        list_id: '33ebdbe9-e529-47c9-b894-0ba25e9c15c0',
        entry_id: '2e6e29ea-c4e0-4f44-842d-78a891f8c156',
        attribute_id: '41252299-f8c7-4b5e-99c9-4ff8321d2f96',
      },
    });
    const res = await POST(makeRequest(payload, { 'X-Attio-Signature': signAttio(payload) }));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed but non-JSON body', async () => {
    const payload = 'not json';
    const res = await POST(makeRequest(payload, { 'Attio-Signature': signAttio(payload) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
  });

  it('returns 500 when the secret is not configured', async () => {
    const saved = process.env.ATTIO_WEBHOOK_SECRET;
    delete process.env.ATTIO_WEBHOOK_SECRET;
    try {
      const payload = attioPayload('record.created');
      const res = await POST(makeRequest(payload, { 'Attio-Signature': signAttio(payload) }));
      expect(res.status).toBe(500);
    } finally {
      process.env.ATTIO_WEBHOOK_SECRET = saved;
    }
  });

  it.each([
    'record.created',
    'record.updated',
    'record.deleted',
    'record.merged',
    'list-entry.created',
    'list-entry.updated',
    'list-entry.deleted',
    'note.created',
    'task.created',
    'comment.created',
    'workspace-member.created',
  ])('handles %s', async (eventType) => {
    const payload = attioPayload(eventType);
    const res = await POST(
      makeRequest(payload, { 'Attio-Signature': signAttio(payload), 'Idempotency-Key': newKey() })
    );
    expect(res.status).toBe(200);
  });

  it('skips duplicate deliveries with the same Idempotency-Key', async () => {
    const payload = attioPayload('record.created');
    const headers = { 'Attio-Signature': signAttio(payload), 'Idempotency-Key': newKey() };

    const first = await POST(makeRequest(payload, headers));
    expect(await first.json()).toEqual({ received: true });

    const retry = await POST(makeRequest(payload, headers));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ received: true, duplicate: true });
  });
});
