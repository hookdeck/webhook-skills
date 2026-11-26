// Generated with: clockify-webhooks skill
// https://github.com/hookdeck/webhook-skills

const request = require('supertest');

// Synthetic, JWT-shaped tokens (not real Clockify tokens)
const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJjbG9ja2lmeSIsInN1YiI6InN5bnRoZXRpYyJ9.c3ludGhldGljLXNpZ25hdHVyZS0x';
const TOKEN2 = 'eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJjbG9ja2lmeSIsInN1YiI6InN5bnRoZXRpYzIifQ.c3ludGhldGljLXNpZ25hdHVyZS0y';
process.env.CLOCKIFY_WEBHOOK_SIGNING_SECRET = TOKEN;

const { app, verifyClockifySignature, parseTokens } = require('../src/index');

const ENTRY = '{"id":"6740a1b2c3d4e5f601234567","description":"Synthetic task","userId":"5a0ab5acb07987125438b60f","workspaceId":"64a687e29ae1f428e7ebe303","projectId":"5b641568b07987035750505e","billable":true,"timeInterval":{"start":"2026-11-18T09:00:00Z","end":"2026-11-18T10:00:00Z","duration":"PT1H"}}';
const PROJECT = '{"id":"5b641568b07987035750505e","name":"Synthetic project","workspaceId":"64a687e29ae1f428e7ebe303","clientId":"","archived":false,"billable":true}';

const post = (body, signature, eventType) => {
  const req = request(app).post('/webhooks/clockify').set('Content-Type', 'application/json');
  if (signature !== undefined) req.set('Clockify-Signature', signature);
  if (eventType !== undefined) req.set('clockify-webhook-event-type', eventType);
  return req.send(body);
};

beforeEach(() => {
  process.env.CLOCKIFY_WEBHOOK_SIGNING_SECRET = TOKEN;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyClockifySignature', () => {
  it('accepts the configured token and rejects others', () => {
    expect(verifyClockifySignature(TOKEN, [TOKEN])).toBe(true);
    expect(verifyClockifySignature(TOKEN2, [TOKEN])).toBe(false);
    expect(verifyClockifySignature(TOKEN.slice(0, -1), [TOKEN])).toBe(false);
    expect(verifyClockifySignature('', [TOKEN])).toBe(false);
    expect(verifyClockifySignature(TOKEN, [])).toBe(false);
  });

  it('accepts any token from a comma-separated list', () => {
    expect(verifyClockifySignature(TOKEN2, parseTokens(`${TOKEN}, ${TOKEN2}`))).toBe(true);
  });
});

describe('POST /webhooks/clockify', () => {
  it('accepts the webhook token and reads the event type header', async () => {
    const res = await post(ENTRY, TOKEN, 'NEW_TIME_ENTRY');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event_type: 'NEW_TIME_ENTRY', id: '6740a1b2c3d4e5f601234567' });
  });

  it('works without the event type header', async () => {
    const res = await post(PROJECT, TOKEN);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event_type: null, id: '5b641568b07987035750505e' });
  });

  it('accepts a second webhook token when several are configured', async () => {
    process.env.CLOCKIFY_WEBHOOK_SIGNING_SECRET = `${TOKEN},${TOKEN2}`;
    expect((await post(PROJECT, TOKEN2, 'NEW_PROJECT')).status).toBe(200);
  });

  it('rejects a different token', async () => {
    expect((await post(ENTRY, TOKEN2)).status).toBe(401);
  });

  it('rejects a missing Clockify-Signature header', async () => {
    expect((await post(ENTRY)).status).toBe(401);
  });

  it('rejects an HMAC of the body: the header is the token itself', async () => {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', TOKEN).update(ENTRY).digest('hex');
    expect((await post(ENTRY, hmac)).status).toBe(401);
  });

  it('tolerates a trailing newline in the configured token', async () => {
    process.env.CLOCKIFY_WEBHOOK_SIGNING_SECRET = `${TOKEN}\n`;
    expect((await post(ENTRY, TOKEN)).status).toBe(200);
  });

  it('returns 400 for invalid JSON with a valid token', async () => {
    expect((await post('{"truncated": ', TOKEN)).status).toBe(400);
  });

  it('returns 500 when the token is not set', async () => {
    delete process.env.CLOCKIFY_WEBHOOK_SIGNING_SECRET;
    expect((await post(ENTRY, TOKEN)).status).toBe(500);
  });
});
