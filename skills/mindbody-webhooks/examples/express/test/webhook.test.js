// Generated with: mindbody-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Synthetic secret
const SECRET = 'c3ludGhldGljLW1pbmRib2R5LXNpZ25hdHVyZS1rZXk=';
process.env.MINDBODY_MESSAGE_SIGNATURE_KEY = SECRET;

const { app, verifyMindbodySignature } = require('../src/index');

const BODY = '{"messageId":"SynthMsg00000000000001","eventId":"classRosterBooking.created","eventSchemaVersion":1,"eventInstanceOriginationDateTime":"2026-11-18T10:15:00Z","eventData":{"siteId":-99,"locationId":1,"classId":201,"classRosterBookingId":11,"classStartDateTime":"2026-11-20T12:00:00Z","classEndDateTime":"2026-11-20T13:00:00Z","clientId":"100000009"}}';
const BODY2 = '{"messageId":"SynthMsg00000000000002","eventId":"client.created","eventSchemaVersion":1,"eventInstanceOriginationDateTime":"2026-11-18T10:20:00Z","eventData":{"siteId":-99,"clientId":"100000010","firstName":"Test","lastName":"Client"}}';

const sign = (body, key = SECRET) => 'sha256=' + crypto.createHmac('sha256', key).update(body).digest('base64');

const post = (body, signature, headers = {}) => {
  const req = request(app).post('/webhooks/mindbody').set('Content-Type', 'application/json').set(headers);
  if (signature !== undefined) req.set('X-Mindbody-Signature', signature);
  return req.send(body);
};

beforeEach(() => {
  process.env.MINDBODY_MESSAGE_SIGNATURE_KEY = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyMindbodySignature', () => {
  it('accepts a signature over the raw body', () => {
    expect(verifyMindbodySignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it('rejects a hex digest: Mindbody sends base64', () => {
    const other = 'sha256=' + crypto.createHmac('sha256', SECRET).update(BODY).digest('hex');
    expect(verifyMindbodySignature(BODY, other, SECRET)).toBe(false);
  });

  it('requires the sha256= prefix', () => {
    expect(verifyMindbodySignature(BODY, sign(BODY).slice('sha256='.length), SECRET)).toBe(false);
  });

  it('uses messageSignatureKey as UTF-8 text, not base64-decoded bytes', () => {
    expect(verifyMindbodySignature(BODY, sign(BODY, Buffer.from(SECRET, 'base64')), SECRET)).toBe(false);
  });
});

describe('/webhooks/mindbody', () => {
  it('answers the HEAD check with 200', async () => {
    const res = await request(app).head('/webhooks/mindbody');
    expect(res.status).toBe(200);
  });

  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event_type: 'classRosterBooking.created', event_id: 'SynthMsg00000000000001' });
  });

  it('handles a second event type', async () => {
    const res = await post(BODY2, sign(BODY2));
    expect(res.status).toBe(200);
    expect(res.body.event_type).toBe('client.created');
  });

  it('rejects a signature made with another secret', async () => {
    expect((await post(BODY, sign(BODY, 'wrong_secret'))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(BODY.replace('"classId":201', '"classId":202'), sign(BODY))).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(BODY)).status).toBe(401);
  });

  it('accepts a secret with a trailing newline', async () => {
    process.env.MINDBODY_MESSAGE_SIGNATURE_KEY = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when MINDBODY_MESSAGE_SIGNATURE_KEY is not set', async () => {
    delete process.env.MINDBODY_MESSAGE_SIGNATURE_KEY;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
