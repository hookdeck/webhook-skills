const crypto = require('node:crypto');

// Configure the app's JWKS URL before importing it.
process.env.NEON_AUTH_URL = 'https://auth.example.test';

const request = require('supertest');
const app = require('../src/index');

// One Ed25519 keypair for the whole test file, exposed as a JWKS.
const KID = 'neon-test-key-1';
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'EdDSA' };
const JWKS = { keys: [jwk] };

// Mock the JWKS fetch so no real network call is made.
beforeAll(() => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => JWKS,
  }));
});

afterAll(() => {
  delete global.fetch;
});

/**
 * Build the Neon signature headers for a payload, matching Neon's
 * EdDSA / detached JWS scheme with double base64url encoding.
 */
function signNeonWebhook(rawBody, { timestamp = Date.now(), kid = KID } = {}) {
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'EdDSA', kid }), 'utf8').toString(
    'base64url'
  );
  const payloadB64 = Buffer.from(rawBody, 'utf8').toString('base64url');
  const inner = `${timestamp}.${payloadB64}`;
  const signingInput = `${headerB64}.${Buffer.from(inner, 'utf8').toString('base64url')}`;
  const signatureB64 = crypto
    .sign(null, Buffer.from(signingInput), privateKey)
    .toString('base64url');

  return {
    'X-Neon-Signature': `${headerB64}..${signatureB64}`,
    'X-Neon-Signature-Kid': kid,
    'X-Neon-Timestamp': String(timestamp),
  };
}

describe('POST /webhooks/neon', () => {
  it('returns 400 when signature headers are missing', async () => {
    const res = await request(app)
      .post('/webhooks/neon')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const payload = JSON.stringify({ hello: 'world' });
    const res = await request(app)
      .post('/webhooks/neon')
      .set('Content-Type', 'application/json')
      .set('X-Neon-Signature', 'eyJhbGciOiJFZERTQSJ9..bm90LWEtc2ln')
      .set('X-Neon-Signature-Kid', KID)
      .set('X-Neon-Timestamp', String(Date.now()))
      .set('X-Neon-Event-Type', 'user.created')
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered payload', async () => {
    const original = JSON.stringify({ user: { id: 'u_1' } });
    const headers = signNeonWebhook(original);
    const tampered = JSON.stringify({ user: { id: 'u_admin' } });

    const res = await request(app)
      .post('/webhooks/neon')
      .set('Content-Type', 'application/json')
      .set(headers)
      .set('X-Neon-Event-Type', 'user.created')
      .send(tampered);

    expect(res.status).toBe(400);
  });

  it('returns 400 for a stale timestamp (replay)', async () => {
    const payload = JSON.stringify({ user: { id: 'u_1' } });
    const oldTs = Date.now() - 10 * 60 * 1000; // 10 minutes ago
    const headers = signNeonWebhook(payload, { timestamp: oldTs });

    const res = await request(app)
      .post('/webhooks/neon')
      .set('Content-Type', 'application/json')
      .set(headers)
      .set('X-Neon-Event-Type', 'user.created')
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify({ user: { id: 'u_valid' } });
    const headers = signNeonWebhook(payload);

    const res = await request(app)
      .post('/webhooks/neon')
      .set('Content-Type', 'application/json')
      .set(headers)
      .set('X-Neon-Event-Type', 'user.created')
      .set('X-Neon-Event-Id', 'evt_123')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('answers user.before_create with an allowed decision', async () => {
    const payload = JSON.stringify({ event_type: 'user.before_create' });
    const headers = signNeonWebhook(payload);

    const res = await request(app)
      .post('/webhooks/neon')
      .set('Content-Type', 'application/json')
      .set(headers)
      .set('X-Neon-Event-Type', 'user.before_create')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ allowed: true });
  });

  it('handles all Neon event types', async () => {
    const eventTypes = [
      'send.otp',
      'send.magic_link',
      'user.before_create',
      'user.created',
      'phone_number.verified',
      'organization.invitation.created',
      'organization.invitation.accepted',
      'unknown.event',
    ];

    for (const eventType of eventTypes) {
      const payload = JSON.stringify({ event_type: eventType });
      const headers = signNeonWebhook(payload);

      const res = await request(app)
        .post('/webhooks/neon')
        .set('Content-Type', 'application/json')
        .set(headers)
        .set('X-Neon-Event-Type', eventType)
        .send(payload);

      expect(res.status).toBe(200);
    }
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
