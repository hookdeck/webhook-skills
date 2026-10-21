// Generated with: zapier-webhooks skill
// https://github.com/hookdeck/webhook-skills
const request = require('supertest');

// Webhooks by Zapier sends no signature, so there is nothing to sign here.
// Tests send the same credentials a Zap would: the X-Webhook-Secret header
// added in the Headers section, or Basic Auth from the "user|password" field.
const SECRET = 'a3f1c9e07b2d4e6f8a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f';
const USERNAME = 'zapier';
const PASSWORD = 'pa55:w0rd' // ':' is allowed; '|' is not (Zapier's Basic Auth field splits on it);

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

const { app, verifyZapierRequest, verifyBasicAuth, parseBody } = require('../src/index');

const PATH = '/webhooks/zapier';
const basic = (u, p) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;

function setEnv({ secret = '', username = '', password = '' } = {}) {
  process.env.ZAPIER_WEBHOOK_SECRET = secret;
  process.env.ZAPIER_BASIC_AUTH_USERNAME = username;
  process.env.ZAPIER_BASIC_AUTH_PASSWORD = password;
}

beforeEach(() => setEnv({ secret: SECRET }));
afterAll(() => setEnv());

describe('shared-secret header', () => {
  it('accepts a JSON payload with the correct X-Webhook-Secret', async () => {
    const res = await request(app)
      .post(PATH)
      .set('X-Webhook-Secret', SECRET)
      .send({ first_name: 'Bryan', last_name: 'Helmig', age: 27 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event: 'zap action' });
  });

  it('accepts a Form (URL-encoded) payload', async () => {
    const res = await request(app)
      .post(PATH)
      .set('X-Webhook-Secret', SECRET)
      .type('form')
      .send('first_name=Bryan&last_name=Helmig&age=27');
    expect(res.status).toBe(200);
  });

  it('accepts a raw XML body sent with PUT', async () => {
    const res = await request(app)
      .put(PATH)
      .set('X-Webhook-Secret', SECRET)
      .set('Content-Type', 'application/xml')
      .send('<first_name>Bryan</first_name>');
    expect(res.status).toBe(200);
  });

  it('accepts a Custom Request sent with PATCH', async () => {
    const res = await request(app)
      .patch(PATH)
      .set('X-Webhook-Secret', SECRET)
      .send({ id: 42 });
    expect(res.status).toBe(200);
  });

  it('dispatches on a user-defined event field', async () => {
    const res = await request(app)
      .post(PATH)
      .set('X-Webhook-Secret', SECRET)
      .send({ event: 'lead.created', email: 'a@example.com' });
    expect(res.body.event).toBe('lead.created');
  });

  it('rejects a wrong secret with 401', async () => {
    const res = await request(app)
      .post(PATH)
      .set('X-Webhook-Secret', SECRET.slice(0, -1) + '0')
      .send({ a: 1 });
    expect(res.status).toBe(401);
  });

  it('rejects a missing secret with 401', async () => {
    const res = await request(app).post(PATH).send({ a: 1 });
    expect(res.status).toBe(401);
  });

  it('rejects a different-length secret without throwing', async () => {
    const res = await request(app).post(PATH).set('X-Webhook-Secret', 'short').send({});
    expect(res.status).toBe(401);
  });

  it('authenticates before parsing: bad JSON without credentials is 401', async () => {
    const res = await request(app)
      .post(PATH)
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(401);
  });

  it('returns 400 for malformed JSON with valid credentials', async () => {
    const res = await request(app)
      .post(PATH)
      .set('X-Webhook-Secret', SECRET)
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
  });
});

describe('Basic Auth', () => {
  beforeEach(() => setEnv({ username: USERNAME, password: PASSWORD }));

  it('accepts correct credentials (password may contain a colon)', async () => {
    const res = await request(app)
      .post(PATH)
      .set('Authorization', basic(USERNAME, PASSWORD))
      .send({ a: 1 });
    expect(res.status).toBe(200);
  });

  it('rejects a wrong password', async () => {
    const res = await request(app)
      .post(PATH)
      .set('Authorization', basic(USERNAME, 'nope'))
      .send({ a: 1 });
    expect(res.status).toBe(401);
  });

  it('rejects a non-Basic scheme', async () => {
    expect(verifyBasicAuth(`Bearer ${PASSWORD}`, USERNAME, PASSWORD)).toBe(false);
  });

  it('accepts either method when both are configured', async () => {
    setEnv({ secret: SECRET, username: USERNAME, password: PASSWORD });
    const viaHeader = await request(app).post(PATH).set('X-Webhook-Secret', SECRET).send({});
    const viaBasic = await request(app)
      .post(PATH)
      .set('Authorization', basic(USERNAME, PASSWORD))
      .send({});
    expect(viaHeader.status).toBe(200);
    expect(viaBasic.status).toBe(200);
  });
});

describe('fail closed', () => {
  it('returns 500 when nothing is configured', async () => {
    setEnv();
    const res = await request(app).post(PATH).set('X-Webhook-Secret', '').send({});
    expect(res.status).toBe(500);
    expect(verifyZapierRequest({})).toBeNull();
  });

  it('ignores a half-configured Basic Auth pair', () => {
    setEnv({ username: USERNAME });
    expect(verifyZapierRequest({ authorization: basic(USERNAME, '') })).toBeNull();
  });
});

describe('parseBody', () => {
  it('parses form bodies into an object', () => {
    expect(parseBody('a=1&b=two', 'application/x-www-form-urlencoded')).toEqual({ a: '1', b: 'two' });
  });

  it('returns other content types as text', () => {
    expect(parseBody('raw', 'text/plain')).toBe('raw');
  });
});

describe('health', () => {
  it('responds ok', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
