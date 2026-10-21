// Generated with: dealhub-webhooks skill
// https://github.com/hookdeck/webhook-skills

const request = require('supertest');

const { app, expectedAuthorization, verifyDealhubAuthorization, eventName } = require('../src/index');

// DealHub has no signature: the "real credential" a test can generate is the
// exact Authorization header DealHub sends in Token or Basic mode.
const TOKEN = 'dh_test_token_9f8e7d6c5b4a';
const USERNAME = 'dealhub';
const PASSWORD = 's3cr3t-p@ss';
const BEARER = `Bearer ${TOKEN}`;
const BASIC = `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')}`;

// Trimmed from DealHub's documented draftQuote example, plus event_info.
const DRAFT_QUOTE = {
  event: 'draftQuote',
  status: 'Draft',
  quote_upgrade_required: false,
  newly_created_quote: true,
  external_opportunity_id: '786865656565',
  external_customer_id: '65545425413',
  dealhub_opportunity_id: '2323232565685498',
  dealhub_quote_id: '6563232565685498',
  primary_quote: false,
  executed_by: 'john.smith@mydomain.com',
  execution_date: '2021-10-22 16:39:08',
  sync_flag: true,
  quote_summary: { currency: 'USD', total_list_price: 4600.0, total_net_price: 3000.0 },
  event_info: { webhook_id: 'wh_1', event_id: 'evt_1', api_version: '1.0' },
};

const PRIMARY_QUOTE = { ...DRAFT_QUOTE, event: 'primaryQuote' };

const ORIGINAL_ENV = { ...process.env };

function send(body, authorization) {
  const req = request(app).post('/webhooks/dealhub').set('Content-Type', 'application/json');
  if (authorization !== undefined) req.set('Authorization', authorization);
  return req.send(typeof body === 'string' ? body : JSON.stringify(body));
}

beforeEach(() => {
  delete process.env.DEALHUB_WEBHOOK_TOKEN;
  delete process.env.DEALHUB_WEBHOOK_USERNAME;
  delete process.env.DEALHUB_WEBHOOK_PASSWORD;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.restoreAllMocks();
});

describe('Token mode', () => {
  beforeEach(() => {
    process.env.DEALHUB_WEBHOOK_TOKEN = TOKEN;
  });

  test('accepts the full "Bearer <TOKEN>" header', async () => {
    const res = await send(DRAFT_QUOTE, BEARER);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('handles primaryQuote', async () => {
    const res = await send(PRIMARY_QUOTE, BEARER);
    expect(res.status).toBe(200);
  });

  test('rejects the bare token without the Bearer scheme', async () => {
    const res = await send(DRAFT_QUOTE, TOKEN);
    expect(res.status).toBe(401);
  });

  test('rejects a wrong token', async () => {
    const res = await send(DRAFT_QUOTE, 'Bearer wrong_token');
    expect(res.status).toBe(401);
  });

  test('rejects a different-length value without throwing', async () => {
    const res = await send(DRAFT_QUOTE, `${BEARER}x`);
    expect(res.status).toBe(401);
  });

  test('rejects a missing Authorization header', async () => {
    const res = await send(DRAFT_QUOTE);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Missing/);
  });

  test('rejects Basic credentials when Token mode is configured', async () => {
    const res = await send(DRAFT_QUOTE, BASIC);
    expect(res.status).toBe(401);
  });

  test('returns 400 for invalid JSON after authenticating', async () => {
    const res = await send('{not json', BEARER);
    expect(res.status).toBe(400);
  });
});

describe('Basic mode', () => {
  beforeEach(() => {
    process.env.DEALHUB_WEBHOOK_USERNAME = USERNAME;
    process.env.DEALHUB_WEBHOOK_PASSWORD = PASSWORD;
  });

  test('accepts the full "Basic <CREDENTIALS>" header', async () => {
    const res = await send(DRAFT_QUOTE, BASIC);
    expect(res.status).toBe(200);
  });

  test('rejects a wrong password', async () => {
    const bad = `Basic ${Buffer.from(`${USERNAME}:nope`).toString('base64')}`;
    const res = await send(DRAFT_QUOTE, bad);
    expect(res.status).toBe(401);
  });
});

describe('configuration', () => {
  test('fails closed with 500 when no credential is configured', async () => {
    const res = await send(DRAFT_QUOTE, BEARER);
    expect(res.status).toBe(500);
  });

  test('expectedAuthorization builds the full header values', () => {
    expect(expectedAuthorization({ DEALHUB_WEBHOOK_TOKEN: TOKEN })).toBe(BEARER);
    expect(
      expectedAuthorization({ DEALHUB_WEBHOOK_USERNAME: USERNAME, DEALHUB_WEBHOOK_PASSWORD: PASSWORD })
    ).toBe(BASIC);
    expect(expectedAuthorization({})).toBeNull();
  });

  test('verifyDealhubAuthorization handles missing values', () => {
    expect(verifyDealhubAuthorization(undefined, BEARER)).toBe(false);
    expect(verifyDealhubAuthorization(BEARER, null)).toBe(false);
    expect(verifyDealhubAuthorization(BEARER, BEARER)).toBe(true);
  });
});

describe('event dispatch', () => {
  beforeEach(() => {
    process.env.DEALHUB_WEBHOOK_TOKEN = TOKEN;
  });

  const payloads = [
    ['quoteWon', { event: 'quoteWon', status: 'Won', dealhub_quote_id: 'q1' }],
    ['version', { event: 'version', action: 'activated', status: 'active', version_id: 'v1' }],
    ['user', { event: 'user', action: 'deleted', user_id: 'u1', user_login: 'James_Parker' }],
    ['productsUpload', { event: 'productsUpload', upload_status: 'error', version_id: 'v1', imported_skus: '29', errors: '4' }],
    ['DEALROOM_EVENT', { event: 'DEALROOM_EVENT', dealhub_quote_id: 'q1', action_summary: { DEAL_SIGN: 'John signed DealRoom' } }],
    ['Failure WebHook v1', { error_code: 'E1', error_description: 'Version activation failed' }],
  ];

  test.each(payloads)('accepts %s', async (name, payload) => {
    expect(eventName(payload)).toBe(name);
    const res = await send(payload, BEARER);
    expect(res.status).toBe(200);
  });

  test('accepts unknown events with 200', async () => {
    const res = await send({ event: 'somethingNew' }, BEARER);
    expect(res.status).toBe(200);
  });
});

test('health check', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
});
