const request = require('supertest');

// Set test environment variables before importing the app
process.env.DOCUMENSO_WEBHOOK_SECRET = 'test_documenso_secret_0123456789';

const app = require('../src/index');
const { verifyDocumensoSecret } = require('../src/index');

const SECRET = process.env.DOCUMENSO_WEBHOOK_SECRET;

// Shape documented at https://docs.documenso.com/docs/developers/webhooks/events
function samplePayload(event = 'DOCUMENT_COMPLETED') {
  return {
    event,
    payload: {
      id: 10,
      envelopeId: 'envelope_abcdefhiklmnorst',
      title: 'contract.pdf',
      status: 'COMPLETED',
      recipients: [{ id: 52, email: 'signer@example.com', signingStatus: 'SIGNED' }]
    },
    createdAt: '2024-04-22T11:52:18.277Z',
    webhookEndpoint: 'https://example.com/webhooks/documenso'
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app).post('/webhooks/documenso').set('Content-Type', contentType).send(body);
}

describe('Documenso webhook endpoint', () => {
  it('accepts the correct secret header', async () => {
    const res = await post().set('X-Documenso-Secret', SECRET);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('matches the header name case-insensitively', async () => {
    const res = await post().set('x-documenso-secret', SECRET);
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const res = await post(JSON.stringify(samplePayload()), 'text/plain').set('X-Documenso-Secret', SECRET);
    expect(res.status).toBe(200);
  });

  it('rejects a wrong secret of the same length', async () => {
    const res = await post().set('X-Documenso-Secret', 'x'.repeat(SECRET.length));
    expect(res.status).toBe(401);
  });

  it('rejects a secret of a different length without throwing', async () => {
    const res = await post().set('X-Documenso-Secret', 'short');
    expect(res.status).toBe(401);
  });

  it('rejects a missing header', async () => {
    const res = await post();
    expect(res.status).toBe(401);
  });

  it('rejects an empty header (webhook created without a secret)', async () => {
    const res = await post().set('X-Documenso-Secret', '');
    expect(res.status).toBe(401);
  });

  it('does not treat the secret as an HMAC of the body', async () => {
    const crypto = require('crypto');
    const body = JSON.stringify(samplePayload());
    const hmac = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    const res = await post(body).set('X-Documenso-Secret', hmac);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON after authenticating', async () => {
    const res = await post('not json').set('X-Documenso-Secret', SECRET);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    const res = await post('[1,2]').set('X-Documenso-Secret', SECRET);
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
    'SOMETHING_ELSE'
  ])('returns 200 for %s', async (event) => {
    const res = await post(JSON.stringify(samplePayload(event))).set('X-Documenso-Secret', SECRET);
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
      expect(verifyDocumensoSecret(undefined, SECRET)).toBe(false);
    });
  });
});
