const request = require('supertest');

// Gravity Forms issues no signing secret and signs nothing. The secret is a random
// value you generate (openssl rand -hex 32) and add to the webhook feed as the
// Request Header "X-Webhook-Secret". Tests send that header instead of a signature.
const SECRET = 'f3a1c9e7b5d2804611223344556677889900aabbccddeeff0011223344556677';
process.env.GRAVITY_FORMS_WEBHOOK_SECRET = SECRET;

const { app, verifyGravityFormsSecret, parseEntry, fieldValues, processed } = require('../src/index');

// "All Fields": the entry, keyed by field ID plus entry properties
const ENTRY = {
  id: '101',
  form_id: '3',
  date_created: '2026-10-21 10:15:30',
  source_url: 'https://example.com/contact/',
  ip: '203.0.113.9',
  '1': 'Ada Lovelace',
  '2': 'ada@example.com',
  '3.3': 'Ada',
  '3.6': 'Lovelace',
};

function post(body, { secret = SECRET, contentType = 'application/json' } = {}) {
  const req = request(app).post('/webhooks/gravity-forms').set('Content-Type', contentType);
  if (secret !== null) req.set('X-Webhook-Secret', secret);
  return req.send(typeof body === 'string' ? body : JSON.stringify(body));
}

beforeEach(() => {
  process.env.GRAVITY_FORMS_WEBHOOK_SECRET = SECRET;
  delete process.env.GRAVITY_FORMS_WEBHOOK_HEADER;
  processed.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyGravityFormsSecret', () => {
  it('accepts the exact secret', () => {
    expect(verifyGravityFormsSecret(SECRET, SECRET)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifyGravityFormsSecret('wrong', SECRET)).toBe(false);
  });

  it('rejects a secret that differs in length or case', () => {
    expect(verifyGravityFormsSecret(`${SECRET}0`, SECRET)).toBe(false);
    expect(verifyGravityFormsSecret(SECRET.toUpperCase(), SECRET)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyGravityFormsSecret(undefined, SECRET)).toBe(false);
  });

  it('fails closed when no secret is configured', () => {
    expect(verifyGravityFormsSecret('', '')).toBe(false);
    expect(verifyGravityFormsSecret('undefined', undefined)).toBe(false);
  });
});

describe('parseEntry', () => {
  it('parses a JSON entry', () => {
    expect(parseEntry(Buffer.from(JSON.stringify(ENTRY)), 'application/json')).toEqual(ENTRY);
  });

  it('parses a urlencoded (FORM format) entry', () => {
    const body = new URLSearchParams(ENTRY).toString();
    expect(parseEntry(Buffer.from(body), 'application/x-www-form-urlencoded')).toEqual(ENTRY);
  });

  it('throws on a non-object JSON body', () => {
    expect(() => parseEntry(Buffer.from('[1,2]'), 'application/json')).toThrow();
  });

  it('extracts field values by field ID', () => {
    expect(fieldValues(ENTRY)).toEqual({
      '1': 'Ada Lovelace',
      '2': 'ada@example.com',
      '3.3': 'Ada',
      '3.6': 'Lovelace',
    });
  });
});

describe('POST /webhooks/gravity-forms', () => {
  it('returns 200 for an authenticated JSON entry', async () => {
    const res = await post(ENTRY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('entry 101'),
      expect.objectContaining({ '2': 'ada@example.com' })
    );
  });

  it('returns 200 for an authenticated urlencoded entry', async () => {
    const res = await post(new URLSearchParams(ENTRY).toString(), {
      contentType: 'application/x-www-form-urlencoded',
    });
    expect(res.status).toBe(200);
  });

  it('accepts a Select Fields body with no entry id', async () => {
    const res = await post({ name: 'Grace Hopper', email: 'grace@example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('returns 401 without the secret header', async () => {
    const res = await post(ENTRY, { secret: null });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong secret', async () => {
    const res = await post(ENTRY, { secret: 'not-the-secret' });
    expect(res.status).toBe(401);
  });

  it('authenticates before parsing, so a bad body without the secret is 401', async () => {
    const res = await post('{not json', { secret: null });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await post('{not json');
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-object JSON body', async () => {
    const res = await post('[1,2,3]');
    expect(res.status).toBe(400);
  });

  it('returns 500 when GRAVITY_FORMS_WEBHOOK_SECRET is not set', async () => {
    delete process.env.GRAVITY_FORMS_WEBHOOK_SECRET;
    const res = await post(ENTRY);
    expect(res.status).toBe(500);
  });

  it('honours GRAVITY_FORMS_WEBHOOK_HEADER', async () => {
    process.env.GRAVITY_FORMS_WEBHOOK_HEADER = 'X-Site-Token';
    const bad = await post(ENTRY); // sends X-Webhook-Secret only
    expect(bad.status).toBe(401);
    const good = await request(app)
      .post('/webhooks/gravity-forms')
      .set('Content-Type', 'application/json')
      .set('X-Site-Token', SECRET)
      .send(JSON.stringify(ENTRY));
    expect(good.status).toBe(200);
  });

  it('acknowledges a repeated entry id as a duplicate', async () => {
    expect((await post(ENTRY)).body).toEqual({ received: true });
    const res = await post(ENTRY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: true });
  });
});
