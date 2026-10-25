const request = require('supertest');
const crypto = require('crypto');

// FullEnrich signs with your API key (no separate webhook secret)
const API_KEY = 'test_fullenrich_api_key';
process.env.FULLENRICH_API_KEY = API_KEY;

const { app, verifyFullEnrichSignature } = require('../src/index');

/**
 * Sign like FullEnrich: lowercase hex(HMAC-SHA1(apiKey, rawBody))
 */
function sign(body, key = API_KEY) {
  return crypto.createHmac('sha1', key).update(body, 'utf8').digest('hex');
}

const batchPayload = JSON.stringify({
  id: 'enr_123',
  name: 'My Enrichment',
  status: 'FINISHED',
  cost: { credits: 10 },
  data: [{ custom: { user_id: '12584' }, contact_info: { most_probable_work_email: { email: 'a@example.com', status: 'DELIVERABLE' } } }],
});

const contactPayload = JSON.stringify({
  id: 'enr_123',
  name: 'My Enrichment',
  status: 'IN_PROGRESS',
  cost: { credits: 5 },
  data: [{ custom: {}, contact_info: {} }],
});

function post(body, headers = {}) {
  return request(app)
    .post('/webhooks/fullenrich')
    .set('Content-Type', headers['Content-Type'] || 'application/json')
    .set(headers)
    .send(body);
}

describe('verifyFullEnrichSignature', () => {
  it('accepts a valid signature', () => {
    expect(verifyFullEnrichSignature(Buffer.from(batchPayload), sign(batchPayload), API_KEY)).toBe(true);
  });

  it('accepts an uppercase hex signature', () => {
    expect(verifyFullEnrichSignature(Buffer.from(batchPayload), sign(batchPayload).toUpperCase(), API_KEY)).toBe(true);
  });

  it('rejects a wrong key', () => {
    expect(verifyFullEnrichSignature(Buffer.from(batchPayload), sign(batchPayload, 'other'), API_KEY)).toBe(false);
  });

  it('rejects a modified body', () => {
    expect(verifyFullEnrichSignature(Buffer.from(batchPayload + ' '), sign(batchPayload), API_KEY)).toBe(false);
  });

  it('rejects non-hex, short and non-ASCII signatures', () => {
    const body = Buffer.from(batchPayload);
    expect(verifyFullEnrichSignature(body, 'z'.repeat(40), API_KEY)).toBe(false);
    expect(verifyFullEnrichSignature(body, sign(batchPayload).slice(0, 20), API_KEY)).toBe(false);
    expect(verifyFullEnrichSignature(body, 'é'.repeat(40), API_KEY)).toBe(false);
  });

  it('rejects a SHA-256 signature', () => {
    const sha256 = crypto.createHmac('sha256', API_KEY).update(batchPayload).digest('hex');
    expect(verifyFullEnrichSignature(Buffer.from(batchPayload), sha256, API_KEY)).toBe(false);
  });
});

describe('POST /webhooks/fullenrich', () => {
  it('accepts a signed batch result', async () => {
    const res = await post(batchPayload, { 'X-Signature-SHA1': sign(batchPayload) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a signed contact_finished result', async () => {
    const res = await post(contactPayload, { 'X-Signature-SHA1': sign(contactPayload) });
    expect(res.status).toBe(200);
  });

  it('verifies any content type', async () => {
    const res = await post(batchPayload, {
      'Content-Type': 'text/plain',
      'X-Signature-SHA1': sign(batchPayload),
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await post(batchPayload);
    expect(res.status).toBe(400);
  });

  it('returns 401 for an invalid signature', async () => {
    const res = await post(batchPayload, { 'X-Signature-SHA1': sign(batchPayload, 'wrong') });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a non-ASCII signature header', async () => {
    const res = await post(batchPayload, { 'X-Signature-SHA1': Buffer.from('é'.repeat(40), 'utf8').toString('latin1') });
    expect(res.status).toBe(401);
  });

  it('returns 400 for signed invalid JSON', async () => {
    const bad = '{not json';
    const res = await post(bad, { 'X-Signature-SHA1': sign(bad) });
    expect(res.status).toBe(400);
  });
});
