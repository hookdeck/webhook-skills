const request = require('supertest');

// Set test environment variables before importing the app
process.env.BREVO_WEBHOOK_USERNAME = 'brevo_user';
process.env.BREVO_WEBHOOK_PASSWORD = 'test_pass:with:colons';
process.env.BREVO_WEBHOOK_TOKEN = 'test_bearer_token_123';

const { app, verifyBrevoAuth } = require('../src/index');

const USER = process.env.BREVO_WEBHOOK_USERNAME;
const PASS = process.env.BREVO_WEBHOOK_PASSWORD;
const TOKEN = process.env.BREVO_WEBHOOK_TOKEN;
const CREDS = { username: USER, password: PASS, token: TOKEN };

// Brevo sends URL-embedded credentials as a standard Basic auth header
function basicAuth(username, password) {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

const deliveredEvent = {
  event: 'delivered',
  email: 'example@domain.com',
  id: 26224,
  date: '2020-10-09 00:00:00',
  ts: 1604933619,
  'message-id': '201798300811.5787683@relay.domain.com',
  ts_event: 1604933654,
  subject: 'My first Transactional',
  tags: ['transac_messages'],
};

describe('verifyBrevoAuth', () => {
  it('accepts valid Basic credentials', () => {
    expect(verifyBrevoAuth(basicAuth(USER, PASS), CREDS)).toBe(true);
  });

  it('accepts a valid Bearer token', () => {
    expect(verifyBrevoAuth(`Bearer ${TOKEN}`, CREDS)).toBe(true);
  });

  it('rejects a wrong password', () => {
    expect(verifyBrevoAuth(basicAuth(USER, 'nope'), CREDS)).toBe(false);
  });

  it('rejects a wrong username', () => {
    expect(verifyBrevoAuth(basicAuth('someone', PASS), CREDS)).toBe(false);
  });

  it('rejects a wrong token', () => {
    expect(verifyBrevoAuth('Bearer wrong', CREDS)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyBrevoAuth(undefined, CREDS)).toBe(false);
  });

  it('rejects Basic when only a token is configured', () => {
    expect(verifyBrevoAuth(basicAuth(USER, PASS), { token: TOKEN })).toBe(false);
  });

  it('rejects Bearer when only Basic is configured', () => {
    expect(verifyBrevoAuth(`Bearer ${TOKEN}`, { username: USER, password: PASS })).toBe(false);
  });

  it('splits Basic credentials on the first colon', () => {
    // PASS is "test_pass:with:colons"
    expect(verifyBrevoAuth(basicAuth(USER, PASS), { username: USER, password: PASS })).toBe(true);
  });
});

describe('POST /webhooks/brevo', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const res = await request(app).post('/webhooks/brevo').send(deliveredEvent);
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid Basic credentials', async () => {
    const res = await request(app)
      .post('/webhooks/brevo')
      .set('Authorization', basicAuth(USER, 'wrong'))
      .send(deliveredEvent);
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid Bearer token', async () => {
    const res = await request(app)
      .post('/webhooks/brevo')
      .set('Authorization', 'Bearer wrong')
      .send(deliveredEvent);
    expect(res.status).toBe(401);
  });

  it('returns 200 for valid Basic credentials', async () => {
    const res = await request(app)
      .post('/webhooks/brevo')
      .set('Authorization', basicAuth(USER, PASS))
      .send(deliveredEvent);
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('returns 200 for a valid Bearer token', async () => {
    const res = await request(app)
      .post('/webhooks/brevo')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(deliveredEvent);
    expect(res.status).toBe(200);
  });

  it('returns 500 when no credentials are configured (fails closed)', async () => {
    const saved = { ...process.env };
    delete process.env.BREVO_WEBHOOK_USERNAME;
    delete process.env.BREVO_WEBHOOK_PASSWORD;
    delete process.env.BREVO_WEBHOOK_TOKEN;
    try {
      const res = await request(app)
        .post('/webhooks/brevo')
        .set('Authorization', basicAuth(USER, PASS))
        .send(deliveredEvent);
      expect(res.status).toBe(500);
    } finally {
      process.env.BREVO_WEBHOOK_USERNAME = saved.BREVO_WEBHOOK_USERNAME;
      process.env.BREVO_WEBHOOK_PASSWORD = saved.BREVO_WEBHOOK_PASSWORD;
      process.env.BREVO_WEBHOOK_TOKEN = saved.BREVO_WEBHOOK_TOKEN;
    }
  });

  it('accepts a batched array of events', async () => {
    const res = await request(app)
      .post('/webhooks/brevo')
      .set('Authorization', basicAuth(USER, PASS))
      .send([deliveredEvent, { ...deliveredEvent, event: 'opened' }]);
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await request(app)
      .post('/webhooks/brevo')
      .set('Authorization', basicAuth(USER, PASS))
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid payload', async () => {
    const res = await request(app)
      .post('/webhooks/brevo')
      .set('Authorization', basicAuth(USER, PASS))
      .send(['not-an-event']);
    expect(res.status).toBe(400);
  });

  it('handles transactional, marketing and contact events', async () => {
    const events = [
      'request', 'delivered', 'opened', 'unique_opened', 'click', 'soft_bounce',
      'hard_bounce', 'spam', 'unsubscribed', 'blocked', 'invalid_email', 'deferred',
      'error', 'proxy_open', 'unique_proxy_open', 'unsubscribe', 'list_addition',
      'contact_updated', 'contact_deleted', 'some_future_event',
    ];
    for (const event of events) {
      const res = await request(app)
        .post('/webhooks/brevo')
        .set('Authorization', basicAuth(USER, PASS))
        .send({ ...deliveredEvent, event });
      expect(res.status).toBe(200);
    }
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
