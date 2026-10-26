const request = require('supertest');
const crypto = require('crypto');

const secret = 'test_proof_api_key';
process.env.PROOF_WEBHOOK_SECRET = secret;
const app = require('../src/index');
const { verifyProofSignature } = require('../src/index');

// Proof: bare lowercase hex HMAC-SHA256 of the raw body bytes
function sign(body, key = secret) {
  return crypto.createHmac('sha256', key).update(body).digest('hex');
}

// Payload shapes as shown in Proof's Webhooks V2 docs
const payloads = {
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

function post(rawBody, headers = {}) {
  return request(app)
    .post('/webhooks/proof')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(rawBody);
}

describe('Proof webhook endpoint', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns 401 when the signature header is missing', async () => {
    const res = await post(body);
    expect(res.status).toBe(401);
  });

  it('returns 401 for an empty signature header', async () => {
    const res = await post(body, { 'X-Notarize-Signature': '' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed signature', async () => {
    const res = await post(body, { 'X-Notarize-Signature': 'invalid' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a 64-character value with non-hex characters', async () => {
    const res = await post(body, { 'X-Notarize-Signature': 'z'.repeat(64) });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a signature with a sha256= prefix', async () => {
    const res = await post(body, { 'X-Notarize-Signature': `sha256=${sign(body)}` });
    expect(res.status).toBe(401);
  });

  it('returns 401 when signed with the wrong key', async () => {
    const res = await post(body, { 'X-Notarize-Signature': sign(body, 'other_key') });
    expect(res.status).toBe(401);
  });

  it('returns 401 when the body was altered after signing', async () => {
    const res = await post(JSON.stringify(payloads.completed), { 'X-Notarize-Signature': sign(body) });
    expect(res.status).toBe(401);
  });

  it('returns 401 when the body was re-serialized (whitespace changed)', async () => {
    const pretty = JSON.stringify(payloads.created, null, 2);
    const res = await post(pretty, { 'X-Notarize-Signature': sign(body) });
    expect(res.status).toBe(401);
  });

  it('returns 401 when the secret is not configured', async () => {
    delete process.env.PROOF_WEBHOOK_SECRET;
    try {
      const res = await post(body, { 'X-Notarize-Signature': sign(body) });
      expect(res.status).toBe(401);
    } finally {
      process.env.PROOF_WEBHOOK_SECRET = secret;
    }
  });

  it('accepts a valid signature', async () => {
    const res = await post(body, { 'X-Notarize-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts an uppercase hex signature', async () => {
    const res = await post(body, { 'X-Notarize-Signature': sign(body).toUpperCase() });
    expect(res.status).toBe(200);
  });

  it('verifies the raw body for any content type', async () => {
    const res = await request(app)
      .post('/webhooks/proof')
      .set('Content-Type', 'text/plain')
      .set('X-Notarize-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const bad = 'not json';
    const res = await post(bad, { 'X-Notarize-Signature': sign(bad) });
    expect(res.status).toBe(400);
  });

  it.each(Object.entries(payloads))('handles the %s payload', async (_name, payload) => {
    const raw = JSON.stringify(payload);
    const res = await post(raw, { 'X-Notarize-Signature': sign(raw) });
    expect(res.status).toBe(200);
  });

  it('logs unhandled events and still returns 200', async () => {
    const raw = JSON.stringify({ event: 'transaction.meeting.created', data: { transaction_id: 'ot_XXXXXX' } });
    const res = await post(raw, { 'X-Notarize-Signature': sign(raw) });
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith('Unhandled event: transaction.meeting.created');
  });
});

describe('verifyProofSignature', () => {
  const raw = Buffer.from(body);

  it('accepts a correct digest', () => {
    expect(verifyProofSignature(raw, sign(body), secret)).toBe(true);
  });

  it('rejects wrong-length and missing values', () => {
    expect(verifyProofSignature(raw, sign(body).slice(2), secret)).toBe(false);
    expect(verifyProofSignature(raw, undefined, secret)).toBe(false);
    expect(verifyProofSignature(raw, sign(body), '')).toBe(false);
  });
});
