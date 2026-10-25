// Generated with: envoy-webhooks skill
// https://github.com/hookdeck/webhook-skills

const request = require('supertest');
const crypto = require('crypto');

// Envoy signs with your app's client secret.
const SECRET = 'test_envoy_client_secret';
process.env.ENVOY_CLIENT_SECRET = SECRET;

const { app, verifyEnvoySignature } = require('../src/index');

// Same algorithm as Envoy: base64(HMAC-SHA256(client secret, raw body)).
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

function makePayload(event, type = 'entries', attributes = { 'full-name': 'John Doe' }) {
  return {
    event,
    meta: {
      location: { id: '94082', type: 'locations', attributes: { name: 'HQ' } },
      company: { id: '75254', type: 'companies', attributes: { name: 'Envoy' } },
    },
    payload: { id: '80078985', type, attributes },
  };
}

function post(body, headers = {}) {
  return request(app).post('/webhooks/envoy').set(headers).send(body);
}

describe('Envoy webhook handler', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.ENVOY_CLIENT_SECRET = SECRET;
  });
  afterEach(() => jest.restoreAllMocks());

  test('accepts a valid signature for entry_sign_in', async () => {
    const body = JSON.stringify(makePayload('entry_sign_in'));
    const res = await post(body, { 'Content-Type': 'application/json', 'X-Envoy-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('entry_sign_in'));
  });

  test('verifies regardless of content type (raw body)', async () => {
    const body = JSON.stringify(makePayload('invite_created', 'invites'));
    const res = await post(body, { 'Content-Type': 'text/plain', 'X-Envoy-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  test('rejects an invalid signature', async () => {
    const body = JSON.stringify(makePayload('entry_sign_in'));
    const res = await post(body, { 'Content-Type': 'application/json', 'X-Envoy-Signature': sign(body, 'wrong') });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a body modified after signing', async () => {
    const body = JSON.stringify(makePayload('entry_sign_in'));
    const sig = sign(body);
    const res = await post(body.replace('John Doe', 'Eve'), { 'Content-Type': 'application/json', 'X-Envoy-Signature': sig });
    expect(res.status).toBe(400);
  });

  test('rejects a missing signature header', async () => {
    const body = JSON.stringify(makePayload('entry_sign_in'));
    const res = await post(body, { 'Content-Type': 'application/json' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing/);
  });

  test('rejects a hex-encoded signature (must be base64)', async () => {
    const body = JSON.stringify(makePayload('entry_sign_in'));
    const hex = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    const res = await post(body, { 'Content-Type': 'application/json', 'X-Envoy-Signature': hex });
    expect(res.status).toBe(400);
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.ENVOY_CLIENT_SECRET;
    const body = JSON.stringify(makePayload('entry_sign_in'));
    const res = await post(body, { 'Content-Type': 'application/json', 'X-Envoy-Signature': sign(body) });
    expect(res.status).toBe(500);
  });

  test('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await post(body, { 'Content-Type': 'text/plain', 'X-Envoy-Signature': sign(body) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  test.each([
    'entry_sign_in',
    'entry_sign_out',
    'entry_blacklist_review',
    'entry_blacklist_deny',
    'entry_manually_updated',
    'invite_created',
    'invite_updated',
    'invite_removed',
    'upcoming_visit',
    'qr_code_sent',
    'employee_invite_created',
    'employee_invite_updated',
    'employee_upcoming_visit',
    'employee_entry_sign_in',
    'employee_entry_sign_out',
    'employee_entry_blacklist_review',
    'employee_entry_blacklist_deny',
    'location_capacity_updated',
    'desk_sign_in',
    'ticket_created',
  ])('handles %s', async (event) => {
    const body = JSON.stringify(makePayload(event));
    const res = await post(body, { 'Content-Type': 'application/json', 'X-Envoy-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
  });

  test('acknowledges unknown events', async () => {
    const body = JSON.stringify(makePayload('something_new'));
    const res = await post(body, { 'Content-Type': 'application/json', 'X-Envoy-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled Envoy event: something_new'));
  });

  test('verifyEnvoySignature handles length mismatch and empty inputs', () => {
    const body = Buffer.from('{}');
    expect(verifyEnvoySignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyEnvoySignature(body, 'short', SECRET)).toBe(false);
    expect(verifyEnvoySignature(body, '', SECRET)).toBe(false);
    expect(verifyEnvoySignature(body, sign(body), '')).toBe(false);
  });
});
