const request = require('supertest');
const crypto = require('crypto');

// A signing key for tests only
const SECRET = 'test_certn_signing_key_3b7d';
process.env.CERTN_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Content-Type is deliberately varied: verification must not depend on it
function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/certn').set('Content-Type', contentType);
  if (signature !== undefined) req.set('X-Signature', signature);
  return req.send(body);
}

// Certn's documented CASE_STATUS_CHANGED example
const caseStatusChanged = JSON.stringify({
  created: '2024-06-27T12:00:00Z',
  event_id: '1712aea0-77a4-425c-9649-7f544a3de477',
  event_type: 'CASE_STATUS_CHANGED',
  object_id: '2f64d134-1c54-4028-8e8b-9cfa7bd8011c',
  object_type: 'CASE',
  case_status: 'CLIENT_ACTION_REQUIRED',
});

const checkStatusChanged = JSON.stringify({
  created: '2024-06-27T12:00:00Z',
  event_id: 'e50b8c4f-9a95-40a0-886a-37aa21ea078e',
  event_type: 'CHECK_STATUS_CHANGED',
  object_id: '2f64d134-1c54-4028-8e8b-9cfa7bd8011c',
  object_type: 'CASE',
  case_status: 'CLIENT_ACTION_REQUIRED',
  triggered_check: {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    type: 'UK_MANUAL_IDENTITY_VERIFICATION_1',
    status: 'CLIENT_ACTION_REQUIRED',
    action_required_resolution: { summary: 'Complete UK Manual Identity Verification', step_count: 0, steps: [] },
  },
});

function eventOf(type, extra = {}) {
  return JSON.stringify({
    created: '2024-06-27T12:00:00Z',
    event_id: '3c2f1a9d-7b54-4e21-9f0c-5d6a8b3e21fa',
    event_type: type,
    object_id: '2f64d134-1c54-4028-8e8b-9cfa7bd8011c',
    object_type: 'CASE',
    ...extra,
  });
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('Certn endpoint verification (GET challenge)', () => {
  it('echoes the challenge as a plain-text body', async () => {
    const res = await request(app).get('/webhooks/certn').query({ challenge: 'abc123' });
    expect(res.status).toBe(200);
    expect(res.text).toBe('abc123');
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('needs no signature', async () => {
    const res = await request(app).get('/webhooks/certn?challenge=xyz');
    expect(res.status).toBe(200);
    expect(res.text).toBe('xyz');
  });

  it('rejects a GET without a challenge', async () => {
    expect((await request(app).get('/webhooks/certn')).status).toBe(400);
  });
});

describe('Certn X-Signature verification', () => {
  it('accepts a valid signature', async () => {
    const res = await post(caseStatusChanged, sign(caseStatusChanged));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies regardless of Content-Type', async () => {
    expect((await post(caseStatusChanged, sign(caseStatusChanged), 'text/plain')).status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    expect((await post(caseStatusChanged, sign(caseStatusChanged).toUpperCase())).status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    expect((await post(caseStatusChanged)).status).toBe(403);
  });

  it('rejects a signature made with another key', async () => {
    expect((await post(caseStatusChanged, sign(caseStatusChanged, 'wrong_key'))).status).toBe(403);
  });

  it('rejects a tampered body', async () => {
    const tampered = caseStatusChanged.replace('CLIENT_ACTION_REQUIRED', 'COMPLETE');
    expect((await post(tampered, sign(caseStatusChanged))).status).toBe(403);
  });

  it('rejects non-hex or wrong-length signatures without throwing', async () => {
    expect((await post(caseStatusChanged, 'zz'.repeat(32))).status).toBe(403);
    expect((await post(caseStatusChanged, 'abcd')).status).toBe(403);
    expect((await post(caseStatusChanged, `${sign(caseStatusChanged)}00`)).status).toBe(403);
    expect((await post(caseStatusChanged, `sha256=${sign(caseStatusChanged)}`)).status).toBe(403);
  });

  it('returns 400 for invalid JSON with a valid signature', async () => {
    const body = 'not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });
});

describe('Certn dispatch on event_type', () => {
  it('handles CASE_STATUS_CHANGED', async () => {
    await post(caseStatusChanged, sign(caseStatusChanged));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('status: CLIENT_ACTION_REQUIRED'));
  });

  it('handles CHECK_STATUS_CHANGED with a client action', async () => {
    await post(checkStatusChanged, sign(checkStatusChanged));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('check UK_MANUAL_IDENTITY_VERIFICATION_1 status: CLIENT_ACTION_REQUIRED')
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Client action required'));
  });

  it('handles CASE_REPORT_READY', async () => {
    const body = eventOf('CASE_REPORT_READY', { case_status: 'COMPLETE' });
    await post(body, sign(body));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('report ready'));
  });

  it('handles CASE_INPUT_CLAIMS_AUTOMATICALLY_GENERATED', async () => {
    const body = eventOf('CASE_INPUT_CLAIMS_AUTOMATICALLY_GENERATED', { case_status: 'IN_PROGRESS' });
    await post(body, sign(body));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('new input claims'));
  });

  it('logs unknown event types and still acknowledges', async () => {
    const body = eventOf('SOMETHING_NEW');
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unhandled event type: SOMETHING_NEW'));
  });
});
