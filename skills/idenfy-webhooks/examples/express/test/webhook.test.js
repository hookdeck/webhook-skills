const crypto = require('crypto');
const request = require('supertest');

// Set test environment variables before importing the app
process.env.IDENFY_WEBHOOK_SECRET = 'test_idenfy_signing_key_0123456789';

const app = require('../src/index');
const { verifyIdenfySignature } = require('../src/index');

const SECRET = process.env.IDENFY_WEBHOOK_SECRET;

function samplePayload(overrides = {}) {
  return { scanRef: 'scan-1', clientId: 'client-1', final: true, status: { overall: 'APPROVED' }, ...overrides };
}

// Idenfy-Signature = lowercase hex HMAC-SHA256 of the raw body, keyed with the signing key
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function post(body = JSON.stringify(samplePayload()), eventType = 'IDENTIFICATION_AUTO_FINISHED', contentType = 'application/json') {
  return request(app)
    .post('/webhooks/idenfy')
    .set('Content-Type', contentType)
    .set('Idenfy-Event-Type', eventType)
    .send(body);
}

describe('iDenfy webhook endpoint', () => {
  it('accepts a valid signature', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await post(body).set('Idenfy-Signature', sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts an uppercase hex signature', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await post(body).set('Idenfy-Signature', sign(body).toUpperCase());
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await post(body, 'IDENTIFICATION_AUTO_FINISHED', 'text/plain').set('Idenfy-Signature', sign(body));
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes received, including odd whitespace', async () => {
    const body = '{ "scanRef" :   "scan-1" }\n';
    const res = await post(body).set('Idenfy-Signature', sign(body));
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await post(body).set('Idenfy-Signature', sign(body, 'wrong_secret'));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await post(JSON.stringify(samplePayload({ scanRef: 'scan-2' }))).set('Idenfy-Signature', sign(body));
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature', async () => {
    const res = await post();
    expect(res.status).toBe(401);
  });

  it('rejects a signature that is not 64 hex characters', async () => {
    const body = JSON.stringify(samplePayload());
    const good = sign(body);
    for (const bad of ['', 'abc', good.slice(0, 62), good + '00', 'z'.repeat(64), `sha256=${good}`]) {
      const res = await post(body).set('Idenfy-Signature', bad);
      expect(res.status).toBe(401);
    }
  });

  it('rejects a signature with trailing junk that hex decoding would truncate', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await post(body).set('Idenfy-Signature', sign(body).slice(0, 62) + 'zz');
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON after verifying the signature', async () => {
    const res = await post('not json').set('Idenfy-Signature', sign('not json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    const res = await post('[1,2]').set('Idenfy-Signature', sign('[1,2]'));
    expect(res.status).toBe(400);
  });

  it.each([
    'IDENTIFICATION_AUTO_FINISHED',
    'IDENTIFICATION_MANUAL_FINISHED',
    'IDENTIFICATION_EXPIRED',
    'IDENTIFICATION_CANCELLED',
    'COMPANY_REVIEW',
    'AML_MONITORING',
    'FACIAL_AUTHENTICATION',
  ])('returns 200 for %s', async (eventType) => {
    const body = JSON.stringify(samplePayload());
    const res = await post(body, eventType).set('Idenfy-Signature', sign(body));
    expect(res.status).toBe(200);
  });

  describe('verifyIdenfySignature', () => {
    const body = Buffer.from(JSON.stringify(samplePayload()));

    it('accepts a matching signature', () => {
      expect(verifyIdenfySignature(body, sign(body), SECRET)).toBe(true);
    });

    it('rejects when no secret is configured', () => {
      expect(verifyIdenfySignature(body, sign(body, ''), '')).toBe(false);
      delete process.env.IDENFY_WEBHOOK_SECRET;
      try {
        expect(verifyIdenfySignature(body, sign(body))).toBe(false);
      } finally {
        process.env.IDENFY_WEBHOOK_SECRET = SECRET;
      }
    });

    it('rejects non-string and non-hex signatures without throwing', () => {
      expect(verifyIdenfySignature(body, undefined, SECRET)).toBe(false);
      expect(verifyIdenfySignature(body, ['a'], SECRET)).toBe(false);
      expect(verifyIdenfySignature(body, 'é'.repeat(64), SECRET)).toBe(false);
    });
  });
});
