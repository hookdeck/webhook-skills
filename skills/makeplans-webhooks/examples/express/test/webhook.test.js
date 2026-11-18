// Generated with: makeplans-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Synthetic secret
const SECRET = 'mp_synthetic_account_secret_9d2c';
process.env.MAKEPLANS_ACCOUNT_SECRET = SECRET;

const { app, verifyMakePlansSignature } = require('../src/index');

const BODY = '{"event":"booking.created","idempotency_id":"b7c1e2d3-0000-4000-8000-000000000001","generated_at":"2026-11-18T10:15:00+01:00","performed_by":{"name":"Synthetic Staff"},"data":{"object":"booking","id":4401,"booking":{"id":4401,"state":"confirmed","booked_from":"2026-11-20T09:00:00+01:00","booked_to":"2026-11-20T10:00:00+01:00","service_id":12,"resource_id":34,"person_id":56}},"object":"booking","id":4401}';
const BODY2 = '{"event":"person.updated","idempotency_id":"b7c1e2d3-0000-4000-8000-000000000002","generated_at":"2026-11-18T10:20:00+01:00","performed_by":{"name":"Synthetic Staff"},"data":{"object":"person","id":56,"person":{"id":56,"name":"Test Person"}},"object":"person","id":56}';

const sign = (body, key = SECRET) => 'sha256=' + crypto.createHmac('sha256', key).update(body).digest('hex');

const post = (body, signature, headers = {}) => {
  const req = request(app).post('/webhooks/makeplans').set('Content-Type', 'application/json').set(headers);
  if (signature !== undefined) req.set('X-MakePlans-Signature', signature);
  return req.send(body);
};

beforeEach(() => {
  process.env.MAKEPLANS_ACCOUNT_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyMakePlansSignature', () => {
  it('accepts a signature over the raw body', () => {
    expect(verifyMakePlansSignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it('rejects a base64 digest: MakePlans sends hex', () => {
    const other = 'sha256=' + crypto.createHmac('sha256', SECRET).update(BODY).digest('base64');
    expect(verifyMakePlansSignature(BODY, other, SECRET)).toBe(false);
  });

  it('requires the sha256= prefix', () => {
    expect(verifyMakePlansSignature(BODY, sign(BODY).slice('sha256='.length), SECRET)).toBe(false);
  });

  it('accepts uppercase hex after the prefix', () => {
    const value = sign(BODY);
    expect(verifyMakePlansSignature(BODY, 'sha256=' + value.slice(7).toUpperCase(), SECRET)).toBe(true);
  });
});

describe('/webhooks/makeplans', () => {

  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event_type: 'booking.created', event_id: 'b7c1e2d3-0000-4000-8000-000000000001' });
  });

  it('handles a second event type', async () => {
    const res = await post(BODY2, sign(BODY2));
    expect(res.status).toBe(200);
    expect(res.body.event_type).toBe('person.updated');
  });

  it('rejects a signature made with another secret', async () => {
    expect((await post(BODY, sign(BODY, 'wrong_secret'))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(BODY.replace('"state":"confirmed"', '"state":"cancelled"'), sign(BODY))).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(BODY)).status).toBe(401);
  });

  it('accepts a secret with a trailing newline', async () => {
    process.env.MAKEPLANS_ACCOUNT_SECRET = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when MAKEPLANS_ACCOUNT_SECRET is not set', async () => {
    delete process.env.MAKEPLANS_ACCOUNT_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
