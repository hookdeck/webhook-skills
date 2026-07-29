const request = require('supertest');

// Set the account API secret before importing the app (the SDK reads it at config time)
process.env.CLOUDINARY_API_SECRET = 'test_api_secret_abcd1234';
process.env.CLOUDINARY_SIGNATURE_ALGORITHM = 'sha1';

const cloudinary = require('cloudinary').v2;
const { app, verifyCloudinarySignature, KNOWN_EVENT_TYPES } = require('../src/index');

const API_SECRET = process.env.CLOUDINARY_API_SECRET;

// A representative Cloudinary notification body.
function payload(overrides = {}) {
  return JSON.stringify({
    notification_type: 'upload',
    public_id: 'sample',
    version: 1690000000,
    resource_type: 'image',
    ...overrides,
  });
}

// Sign a raw body exactly like Cloudinary does, using the SDK's own signing
// helper: hex digest of <algorithm>(rawBody + timestamp + api_secret). Never
// hand-copy a digest — generate it with the same algorithm the provider uses.
function sign(rawBody, timestamp, algorithm = 'sha1') {
  return cloudinary.utils.webhook_signature(rawBody, timestamp, {
    api_secret: API_SECRET,
    signature_algorithm: algorithm,
  });
}

function now() {
  return Math.floor(Date.now() / 1000);
}

describe('verifyCloudinarySignature', () => {
  it('returns true for a valid sha1 signature', () => {
    const ts = now();
    const body = payload();
    expect(verifyCloudinarySignature(body, ts, sign(body, ts, 'sha1'))).toBe(true);
  });

  it('returns false for a wrong signature', () => {
    const ts = now();
    expect(verifyCloudinarySignature(payload(), ts, 'deadbeef')).toBe(false);
  });

  it('returns false when the signature is missing', () => {
    expect(verifyCloudinarySignature(payload(), now(), undefined)).toBe(false);
  });

  it('returns false when the body was tampered with after signing', () => {
    const ts = now();
    const signature = sign(payload(), ts, 'sha1');
    const tampered = payload({ public_id: 'attacker-controlled' });
    expect(verifyCloudinarySignature(tampered, ts, signature)).toBe(false);
  });
});

describe('POST /webhooks/cloudinary', () => {
  it('returns 400 when signature headers are missing', async () => {
    const res = await request(app)
      .post('/webhooks/cloudinary')
      .set('Content-Type', 'application/json')
      .send(payload());
    expect(res.status).toBe(400);
  });

  it('returns 401 for a wrong signature', async () => {
    const ts = now();
    const body = payload();
    const res = await request(app)
      .post('/webhooks/cloudinary')
      .set('Content-Type', 'application/json')
      .set('x-cld-timestamp', String(ts))
      .set('x-cld-signature', 'deadbeef')
      .send(body);
    expect(res.status).toBe(401);
  });

  it('returns 401 when signed with the wrong secret', async () => {
    const ts = now();
    const body = payload();
    const wrongSig = cloudinary.utils.webhook_signature(body, ts, {
      api_secret: 'the_wrong_secret',
      signature_algorithm: 'sha1',
    });
    const res = await request(app)
      .post('/webhooks/cloudinary')
      .set('Content-Type', 'application/json')
      .set('x-cld-timestamp', String(ts))
      .set('x-cld-signature', wrongSig)
      .send(body);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the body is tampered with after signing', async () => {
    const ts = now();
    const signature = sign(payload(), ts, 'sha1');
    const res = await request(app)
      .post('/webhooks/cloudinary')
      .set('Content-Type', 'application/json')
      .set('x-cld-timestamp', String(ts))
      .set('x-cld-signature', signature)
      .send(payload({ public_id: 'attacker-controlled' }));
    expect(res.status).toBe(401);
  });

  it('returns 200 for a valid sha1 signature', async () => {
    const ts = now();
    const body = payload();
    const res = await request(app)
      .post('/webhooks/cloudinary')
      .set('Content-Type', 'application/json')
      .set('x-cld-timestamp', String(ts))
      .set('x-cld-signature', sign(body, ts, 'sha1'))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('returns 200 for a valid sha256 signature (opt-in account setting)', async () => {
    // Cloudinary uses ONE algorithm per account. Switch the SDK to sha256 to
    // model an account with sha256 signatures enabled, then restore sha1.
    cloudinary.config({ signature_algorithm: 'sha256' });
    try {
      const ts = now();
      const body = payload();
      const res = await request(app)
        .post('/webhooks/cloudinary')
        .set('Content-Type', 'application/json')
        .set('x-cld-timestamp', String(ts))
        .set('x-cld-signature', sign(body, ts, 'sha256'))
        .send(body);
      expect(res.status).toBe(200);
    } finally {
      cloudinary.config({ signature_algorithm: 'sha1' });
    }
  });

  it('dispatches every known notification_type with a 200', async () => {
    for (const notification_type of KNOWN_EVENT_TYPES) {
      const ts = now();
      const body = payload({ notification_type });
      const res = await request(app)
        .post('/webhooks/cloudinary')
        .set('Content-Type', 'application/json')
        .set('x-cld-timestamp', String(ts))
        .set('x-cld-signature', sign(body, ts, 'sha1'))
        .send(body);
      expect(res.status).toBe(200);
    }
  });

  it('acknowledges an unknown type with 200 (no retry storm)', async () => {
    const ts = now();
    const body = payload({ notification_type: 'some_future_event' });
    const res = await request(app)
      .post('/webhooks/cloudinary')
      .set('Content-Type', 'application/json')
      .set('x-cld-timestamp', String(ts))
      .set('x-cld-signature', sign(body, ts, 'sha1'))
      .send(body);
    expect(res.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
