import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';

const secret = 'test_proof_api_key';

// Set test environment variables before the route is used
beforeAll(() => {
  process.env.PROOF_WEBHOOK_SECRET = secret;
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Proof: bare lowercase hex HMAC-SHA256 of the raw body bytes
function sign(body: string, key: string = secret): string {
  return crypto.createHmac('sha256', key).update(body).digest('hex');
}

function makeRequest(body: string, signature?: string, contentType = 'application/json') {
  const headers = new Headers({ 'Content-Type': contentType });
  if (signature !== undefined) headers.set('X-Notarize-Signature', signature);
  return new Request('http://localhost/webhooks/proof', {
    method: 'POST',
    headers,
    body,
  });
}

// Payload shapes as shown in Proof's Webhooks V2 docs
const payloads: Record<string, unknown> = {
  declined: { event: 'transaction.declined', data: { transaction_id: 'ot_XXXXXX', date_occurred: '2025-08-12T17:56:35Z' } },
  heldForReview: { event: 'transaction.held_for_review', data: { transaction_id: 'ot_XXXXXX', date_occurred: '2025-08-12T17:56:35Z' } },
  created: { event: 'transaction.created', data: { transaction_id: 'ot_XXXXXX', date_occurred: '2025-08-12T17:56:35Z' } },
  completed: { event: 'transaction.completed', data: { transaction_id: 'ot_XXXXXX', date_occurred: '2025-08-12T17:56:35Z' } },
  released: { event: 'transaction.released', data: { transaction_id: 'ot_XXXXXX', date_occurred: '2025-08-12T17:56:35Z' } },
  notaryCreated: { event: 'notary.created', data: { notary_id: 'on_XXXXXX', date_occurred: '2025-08-12T17:56:35Z' } },
  importProcessed: {
    event: 'transaction.import.processed',
    data: {
      date_occurred: '2025-08-12T17:56:35Z',
      transaction_id: 'ot_XXXXXX',
      documents: [{ document_id: 'do_XXXXXX', name: 'test.pdf', processing_error: null, processing_state: 'done' }],
      documents_count: 1,
    },
  },
};

const body = JSON.stringify(payloads.created);

async function call(raw: string, signature?: string, contentType?: string) {
  const { POST } = await import('../app/webhooks/proof/route');
  return POST(makeRequest(raw, signature, contentType) as any);
}

describe('Proof Webhook Route', () => {
  it('returns 401 for a missing signature header', async () => {
    expect((await call(body)).status).toBe(401);
  });

  it('returns 401 for an empty signature header', async () => {
    expect((await call(body, '')).status).toBe(401);
  });

  it('returns 401 for a malformed signature', async () => {
    expect((await call(body, 'invalid')).status).toBe(401);
  });

  it('returns 401 for a 64-character value with non-hex characters', async () => {
    expect((await call(body, 'z'.repeat(64))).status).toBe(401);
  });

  it('returns 401 for a signature with a sha256= prefix', async () => {
    expect((await call(body, `sha256=${sign(body)}`)).status).toBe(401);
  });

  it('returns 401 when signed with the wrong key', async () => {
    expect((await call(body, sign(body, 'other_key'))).status).toBe(401);
  });

  it('returns 401 when the body was altered after signing', async () => {
    expect((await call(JSON.stringify(payloads.completed), sign(body))).status).toBe(401);
  });

  it('returns 401 when the body was re-serialized (whitespace changed)', async () => {
    const pretty = JSON.stringify(payloads.created, null, 2);
    expect((await call(pretty, sign(body))).status).toBe(401);
  });

  it('returns 401 when the secret is not configured', async () => {
    delete process.env.PROOF_WEBHOOK_SECRET;
    try {
      expect((await call(body, sign(body))).status).toBe(401);
    } finally {
      process.env.PROOF_WEBHOOK_SECRET = secret;
    }
  });

  it('accepts a valid signature', async () => {
    const res = await call(body, sign(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts an uppercase hex signature', async () => {
    expect((await call(body, sign(body).toUpperCase())).status).toBe(200);
  });

  it('verifies the raw body for any content type', async () => {
    expect((await call(body, sign(body), 'text/plain')).status).toBe(200);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const bad = 'not json';
    expect((await call(bad, sign(bad))).status).toBe(400);
  });

  it.each(Object.entries(payloads))('handles the %s payload', async (_name, payload) => {
    const raw = JSON.stringify(payload);
    expect((await call(raw, sign(raw))).status).toBe(200);
  });

  it('logs unhandled events and still returns 200', async () => {
    const raw = JSON.stringify({ event: 'transaction.meeting.created', data: { transaction_id: 'ot_XXXXXX' } });
    expect((await call(raw, sign(raw))).status).toBe(200);
    expect(console.log).toHaveBeenCalledWith('Unhandled event: transaction.meeting.created');
  });
});
