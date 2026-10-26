const request = require('supertest');

const USERNAME = 'celcoin-hook';
const PASSWORD = 'p@ss:word-with-colon';

process.env.CELCOIN_WEBHOOK_USERNAME = USERNAME;
process.env.CELCOIN_WEBHOOK_PASSWORD = PASSWORD;

const app = require('../src/index');
const { verifyCelcoinAuth } = app;

// Built exactly as Celcoin builds it: Basic base64(login:pwd)
function basic(user, pass) {
  return 'Basic ' + Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
}

const GOOD = basic(USERNAME, PASSWORD);

const pixIn = {
  entity: 'pix-payment-in',
  createTimestamp: '2025-05-07T17:30:00.7647117',
  status: 'CONFIRMED',
  body: { id: 'e2726e30-c318-4e1f-b284-e37c14e6c4b2', amount: 10.5 },
};

describe('verifyCelcoinAuth', () => {
  it('accepts matching credentials', () => {
    expect(verifyCelcoinAuth(GOOD)).toBe(true);
  });

  it('accepts a lowercase scheme and a password containing colons', () => {
    expect(verifyCelcoinAuth(GOOD.replace('Basic', 'basic'))).toBe(true);
  });

  it('rejects a wrong password, wrong username, missing header and other schemes', () => {
    expect(verifyCelcoinAuth(basic(USERNAME, 'nope'))).toBe(false);
    expect(verifyCelcoinAuth(basic('nope', PASSWORD))).toBe(false);
    expect(verifyCelcoinAuth(undefined)).toBe(false);
    expect(verifyCelcoinAuth('Bearer abc')).toBe(false);
  });

  it('rejects valid credentials followed by junk', () => {
    expect(verifyCelcoinAuth(GOOD + '!!')).toBe(false);
    expect(verifyCelcoinAuth(GOOD + ' extra')).toBe(false);
    expect(verifyCelcoinAuth(GOOD + 'A')).toBe(false);
  });

  it('rejects credentials without a colon', () => {
    expect(verifyCelcoinAuth('Basic ' + Buffer.from('nocolon').toString('base64'))).toBe(false);
  });

  it('fails closed when unconfigured', () => {
    expect(verifyCelcoinAuth(GOOD, '', '')).toBe(false);
  });
});

describe('POST /webhooks/celcoin', () => {
  it('accepts an authenticated JSON notification', async () => {
    const res = await request(app)
      .post('/webhooks/celcoin')
      .set('Authorization', GOOD)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(pixIn));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts any content type, including +json', async () => {
    const res = await request(app)
      .post('/webhooks/celcoin')
      .set('Authorization', GOOD)
      .set('Content-Type', 'application/vnd.api+json')
      .send(JSON.stringify(pixIn));
    expect(res.status).toBe(200);
  });

  it.each(['pix-payment-out', 'pix-reversal-in', 'internal-transfer-in', 'spb-transfer-out', 'onboarding-proposal', 'kyc', 'unknown-entity'])(
    'handles entity %s (CONFIRMED and ERROR)',
    async (entity) => {
      for (const status of ['CONFIRMED', 'ERROR']) {
        const res = await request(app)
          .post('/webhooks/celcoin')
          .set('Authorization', GOOD)
          .set('Content-Type', 'application/json')
          .send(JSON.stringify({ entity, status, createTimestamp: '2025-05-07T17:30:00', body: {} }));
        expect(res.status).toBe(200);
      }
    }
  );

  it('rejects a missing Authorization header with 401', async () => {
    const res = await request(app)
      .post('/webhooks/celcoin')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(pixIn));
    expect(res.status).toBe(401);
  });

  it('rejects wrong credentials with 401', async () => {
    const res = await request(app)
      .post('/webhooks/celcoin')
      .set('Authorization', basic(USERNAME, 'wrong'))
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(pixIn));
    expect(res.status).toBe(401);
  });

  it('rejects malformed JSON with 400 after authenticating', async () => {
    const res = await request(app)
      .post('/webhooks/celcoin')
      .set('Authorization', GOOD)
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
  });

  it('rejects a non-object JSON body with 400', async () => {
    const res = await request(app)
      .post('/webhooks/celcoin')
      .set('Authorization', GOOD)
      .set('Content-Type', 'application/json')
      .send('[1,2]');
    expect(res.status).toBe(400);
  });

  it('acknowledges an empty body', async () => {
    const res = await request(app).post('/webhooks/celcoin').set('Authorization', GOOD);
    expect(res.status).toBe(200);
  });
});

describe('other HTTP methods', () => {
  it.each(['get', 'put', 'patch', 'delete'])('accepts authenticated %s with an empty body', async (method) => {
    const res = await request(app)[method]('/webhooks/celcoin').set('Authorization', GOOD);
    expect(res.status).toBe(200);
  });

  it.each(['get', 'post', 'put', 'patch', 'delete'])('checks the credential first for %s', async (method) => {
    const res = await request(app)[method]('/webhooks/celcoin');
    expect(res.status).toBe(401);
  });

  it('accepts a JSON body on PUT', async () => {
    const res = await request(app)
      .put('/webhooks/celcoin')
      .set('Authorization', GOOD)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(pixIn));
    expect(res.status).toBe(200);
  });
});

describe('configuration', () => {
  it('returns 500 when credentials are not configured', async () => {
    delete process.env.CELCOIN_WEBHOOK_USERNAME;
    delete process.env.CELCOIN_WEBHOOK_PASSWORD;
    try {
      const res = await request(app).post('/webhooks/celcoin').set('Authorization', GOOD);
      expect(res.status).toBe(500);
    } finally {
      process.env.CELCOIN_WEBHOOK_USERNAME = USERNAME;
      process.env.CELCOIN_WEBHOOK_PASSWORD = PASSWORD;
    }
  });
});
