// Generated with: gusto-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

const TOKEN = 'gusto_synthetic_verification_token_9d3f'; // synthetic
process.env.GUSTO_VERIFICATION_TOKEN = TOKEN;

const { app, verifyGustoSignature } = require('../src/index');

const BODY = '{"uuid":"f7397a24-57ad-4fae-b011-d258e8232900","event_type":"payroll.paid","resource_type":"Company","resource_uuid":"5df911a0-e8e9-412d-8aaf-a46ad193dd96","entity_type":"Payroll","entity_uuid":"b50e611d-8f3d-4f24-b001-46675f7b5777","timestamp":1795436100}';
const TOKEN_BODY = '{"verification_token":"gusto_synthetic_token_from_handshake"}';

const sign = (body, key = TOKEN) => crypto.createHmac('sha256', key).update(body).digest('hex');

const post = (body, signature) => {
  const req = request(app).post('/webhooks/gusto').set('Content-Type', 'application/json');
  if (signature !== undefined) req.set('X-Gusto-Signature', signature);
  return req.send(body);
};

let logSpy;
beforeEach(() => {
  process.env.GUSTO_VERIFICATION_TOKEN = TOKEN;
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

const logged = () => logSpy.mock.calls.flat().join('\n');

describe('verifyGustoSignature', () => {
  it('accepts a bare hex digest keyed with the verification_token', () => {
    expect(verifyGustoSignature(BODY, sign(BODY), TOKEN)).toBe(true);
  });

  it('rejects base64 and sha256=-prefixed forms of the same HMAC', () => {
    const digest = crypto.createHmac('sha256', TOKEN).update(BODY).digest();
    expect(verifyGustoSignature(BODY, digest.toString('base64'), TOKEN)).toBe(false);
    expect(verifyGustoSignature(BODY, `sha256=${digest.toString('hex')}`, TOKEN)).toBe(false);
  });
});

describe('POST /webhooks/gusto', () => {
  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event_type: 'payroll.paid', uuid: 'f7397a24-57ad-4fae-b011-d258e8232900' });
  });

  it('acknowledges the verification_token handshake before a token is configured, and shows the token', async () => {
    delete process.env.GUSTO_VERIFICATION_TOKEN;
    const res = await post(TOKEN_BODY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, verification_token_received: true });
    expect(logged()).toContain('gusto_synthetic_token_from_handshake');
  });

  it('acknowledges a re-sent token once configured, without logging it', async () => {
    const res = await post(TOKEN_BODY);
    expect(res.status).toBe(200);
    expect(logged()).not.toContain('gusto_synthetic_token_from_handshake');
  });

  it('treats a body with an event_type as an event even if it has a verification_token', async () => {
    const body = '{"event_type":"payroll.paid","verification_token":"x"}';
    expect((await post(body)).status).toBe(401);
  });

  it('rejects a signature made with another token', async () => {
    expect((await post(BODY, sign(BODY, 'another_token'))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(BODY.replace('payroll.paid', 'payroll.reversed'), sign(BODY))).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(BODY)).status).toBe(401);
  });

  it('accepts a token with a trailing newline', async () => {
    process.env.GUSTO_VERIFICATION_TOKEN = `${TOKEN}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 for events when GUSTO_VERIFICATION_TOKEN is not set', async () => {
    delete process.env.GUSTO_VERIFICATION_TOKEN;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
