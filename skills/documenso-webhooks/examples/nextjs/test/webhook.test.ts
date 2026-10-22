import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/documenso/route';
import { verifyDocumensoSecret } from '../lib/verify-documenso';

const SECRET = 'test_documenso_secret_0123456789';

beforeAll(() => {
  process.env.DOCUMENSO_WEBHOOK_SECRET = SECRET;
});

// Shape documented at https://docs.documenso.com/docs/developers/webhooks/events
function samplePayload(event = 'DOCUMENT_COMPLETED') {
  return {
    event,
    payload: {
      id: 10,
      envelopeId: 'envelope_abcdefhiklmnorst',
      title: 'contract.pdf',
      status: 'COMPLETED',
      recipients: [{ id: 52, email: 'signer@example.com', signingStatus: 'SIGNED' }],
    },
    createdAt: '2024-04-22T11:52:18.277Z',
    webhookEndpoint: 'https://example.com/webhooks/documenso',
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/documenso', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/documenso', () => {
  it('accepts the correct secret header', async () => {
    const res = await POST(makeRequest({ 'X-Documenso-Secret': SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('matches the header name case-insensitively', async () => {
    const res = await POST(makeRequest({ 'x-documenso-secret': SECRET }));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const res = await POST(
      makeRequest({ 'X-Documenso-Secret': SECRET, 'content-type': 'text/plain' })
    );
    expect(res.status).toBe(200);
  });

  it('rejects a wrong secret of the same length', async () => {
    const res = await POST(makeRequest({ 'X-Documenso-Secret': 'x'.repeat(SECRET.length) }));
    expect(res.status).toBe(401);
  });

  it('rejects a secret of a different length without throwing', async () => {
    const res = await POST(makeRequest({ 'X-Documenso-Secret': 'short' }));
    expect(res.status).toBe(401);
  });

  it('rejects a missing header', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('rejects an empty header (webhook created without a secret)', async () => {
    const res = await POST(makeRequest({ 'X-Documenso-Secret': '' }));
    expect(res.status).toBe(401);
  });

  it('does not treat the secret as an HMAC of the body', async () => {
    const body = JSON.stringify(samplePayload());
    const hmac = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    const res = await POST(makeRequest({ 'X-Documenso-Secret': hmac }, body));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON after authenticating', async () => {
    const res = await POST(makeRequest({ 'X-Documenso-Secret': SECRET }, 'not json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    const res = await POST(makeRequest({ 'X-Documenso-Secret': SECRET }, '[1,2]'));
    expect(res.status).toBe(400);
  });

  it.each([
    'DOCUMENT_CREATED',
    'DOCUMENT_SENT',
    'DOCUMENT_OPENED',
    'DOCUMENT_SIGNED',
    'DOCUMENT_RECIPIENT_COMPLETED',
    'DOCUMENT_COMPLETED',
    'DOCUMENT_REJECTED',
    'DOCUMENT_CANCELLED',
    'DOCUMENT_REMINDER_SENT',
    'RECIPIENT_EXPIRED',
    'TEMPLATE_CREATED',
    'TEMPLATE_UPDATED',
    'TEMPLATE_DELETED',
    'TEMPLATE_USED',
    'SOMETHING_ELSE',
  ])('returns 200 for %s', async (event) => {
    const res = await POST(
      makeRequest(
        { 'X-Documenso-Secret': SECRET },
        JSON.stringify(samplePayload(event))
      )
    );
    expect(res.status).toBe(200);
  });

  describe('verifyDocumensoSecret', () => {
    it('accepts a matching secret', () => {
      expect(verifyDocumensoSecret(SECRET, SECRET)).toBe(true);
    });

    it('rejects when no secret is configured, even for an empty header', () => {
      expect(verifyDocumensoSecret('', '')).toBe(false);
      expect(verifyDocumensoSecret(undefined, undefined)).toBe(false);
      expect(verifyDocumensoSecret('anything', '')).toBe(false);
    });

    it('rejects an empty or missing header', () => {
      expect(verifyDocumensoSecret('', SECRET)).toBe(false);
      expect(verifyDocumensoSecret(null, SECRET)).toBe(false);
    });
  });
});
