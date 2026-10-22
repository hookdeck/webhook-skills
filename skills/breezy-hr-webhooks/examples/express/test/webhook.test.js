const request = require('supertest');
const crypto = require('crypto');

// Breezy secrets look like Standard Webhooks secrets, but the whole string
// (including whsec_) is used as a UTF-8 HMAC key.
const SECRET = 'whsec_test_secret_key_0123456789abcdef';
process.env.BREEZY_HR_WEBHOOK_SECRET = SECRET;

const { app, verifyBreezySignature } = require('../src/index');

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function candidateAdded() {
  return {
    _id: 'evt_123',
    type: 'candidateAdded',
    object: {
      company: { _id: 'c1', name: 'Acme', friendly_id: 'acme' },
      position: { _id: 'p1', name: 'Engineer', pipeline_id: 'pl1' },
      stage: { id: 's1', name: 'Applied' },
      candidate: { _id: 'cand1', name: 'Ada Lovelace', email_address: 'ada@example.com' },
    },
    creation_date: '2026-01-05T19:26:51.000Z',
  };
}

describe('verifyBreezySignature', () => {
  const body = Buffer.from('{"a":1}');

  it('accepts a valid signature', () => {
    expect(verifyBreezySignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a signature from a different secret', () => {
    expect(verifyBreezySignature(body, sign(body, 'other'), SECRET)).toBe(false);
  });

  it('rejects a key with whsec_ stripped (the whole secret is the key)', () => {
    expect(verifyBreezySignature(body, sign(body, SECRET.slice(6)), SECRET)).toBe(false);
  });

  it('rejects a base64-decoded key (not Standard Webhooks)', () => {
    const decoded = Buffer.from(SECRET.slice(6), 'base64');
    const sig = crypto.createHmac('sha256', decoded).update(body).digest('hex');
    expect(verifyBreezySignature(body, sig, SECRET)).toBe(false);
  });

  it('rejects missing and wrong-length signatures without throwing', () => {
    expect(verifyBreezySignature(body, undefined, SECRET)).toBe(false);
    expect(verifyBreezySignature(body, 'abc', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/breezy-hr', () => {
  let logSpy;
  let errSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('accepts a validly signed event', async () => {
    const body = JSON.stringify(candidateAdded());
    const res = await request(app)
      .post('/webhooks/breezy-hr')
      .set('Content-Type', 'application/json')
      .set('X-Hook-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies the raw bytes, including non-compact JSON', async () => {
    const body = JSON.stringify(candidateAdded(), null, 2);
    const res = await request(app)
      .post('/webhooks/breezy-hr')
      .set('Content-Type', 'application/json')
      .set('X-Hook-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify(candidateAdded());
    const res = await request(app)
      .post('/webhooks/breezy-hr')
      .set('Content-Type', 'text/plain')
      .set('X-Hook-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it.each([
    'candidateAdded',
    'candidateStatusUpdated',
    'candidateDeleted',
    'companyPositionAdded',
    'companyPositionUpdated',
    'companyPositionDeleted',
    'companyPositionStateUpdated',
    'companyNotePosted',
    'companyNoteUpdated',
    'companyNoteDeleted',
  ])('handles %s', async (type) => {
    const body = JSON.stringify({ ...candidateAdded(), type });
    const res = await request(app)
      .post('/webhooks/breezy-hr')
      .set('Content-Type', 'application/json')
      .set('X-Hook-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types', async () => {
    const body = JSON.stringify({ ...candidateAdded(), type: 'somethingNew' });
    const res = await request(app)
      .post('/webhooks/breezy-hr')
      .set('Content-Type', 'application/json')
      .set('X-Hook-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const body = JSON.stringify(candidateAdded());
    const res = await request(app)
      .post('/webhooks/breezy-hr')
      .set('Content-Type', 'application/json')
      .set('X-Hook-Signature', sign(body, 'wrong_secret'))
      .send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(candidateAdded());
    const res = await request(app)
      .post('/webhooks/breezy-hr')
      .set('Content-Type', 'application/json')
      .set('X-Hook-Signature', sign(body))
      .send(body.replace('Ada', 'Eve'));
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await request(app)
      .post('/webhooks/breezy-hr')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(candidateAdded()));
    expect(res.status).toBe(400);
  });

  it('rejects signed invalid JSON', async () => {
    const body = '{not json';
    const res = await request(app)
      .post('/webhooks/breezy-hr')
      .set('Content-Type', 'application/json')
      .set('X-Hook-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(400);
  });
});
