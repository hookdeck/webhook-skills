// Generated with: cloudflare-webhooks skill
// https://github.com/hookdeck/webhook-skills

const request = require('supertest');

const { app, verifyCloudflareAuth, eventName } = require('../src/index');

// Cloudflare has no signature: the "real credential" a test can generate is the
// exact secret Cloudflare echoes back in the cf-webhook-auth header.
const SECRET = 'cf_test_secret_3b9d41c8a7e2';

// From Cloudflare's webhook payload schema reference.
const L7_DDOS = {
  account_id: '9035f53656c247e895c5a6939ae8a0e0',
  alert_correlation_id: '000eaa907ed24e78946d3a93adb2ae57',
  alert_event: 'ALERT_STATE_EVENT_START',
  alert_type: 'advanced_ddos_attack_l7_alert',
  data: { target_hostname: 'example.com', attack_id: 'abc', requests_per_second: 1000 },
  name: 'Example Cloudflare Notification',
  policy_id: '749b911ea5d04344a58e45edd099b328',
  policy_name: 'Example Cloudflare Notification',
  text: 'The description of my Cloudflare notification.',
  ts: 1136214245,
};
const HEALTH_CHECK = {
  ...L7_DDOS,
  alert_type: 'health_check_status_notification',
  data: { health_check_name: 'origin', old_status: 'Healthy', new_status: 'Unhealthy' },
};
// The "Save and Test" message has only `text`.
const TEST_MESSAGE = {
  text: 'Hello World! This is a test message sent from https://cloudflare.com. If you can see this, your webhook is configured properly.',
};

const ORIGINAL_ENV = { ...process.env };

function send(body, headerValue) {
  const req = request(app).post('/webhooks/cloudflare').set('Content-Type', 'application/json');
  if (headerValue !== undefined) req.set('cf-webhook-auth', headerValue);
  return req.send(typeof body === 'string' ? body : JSON.stringify(body));
}

beforeEach(() => {
  process.env.CLOUDFLARE_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.restoreAllMocks();
});

describe('cf-webhook-auth verification', () => {
  test('accepts the correct secret', async () => {
    const res = await send(L7_DDOS, SECRET);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('rejects a wrong secret with 401', async () => {
    const res = await send(L7_DDOS, 'not-the-secret');
    expect(res.status).toBe(401);
  });

  test('rejects a secret that differs only in the last character', async () => {
    const res = await send(L7_DDOS, SECRET.slice(0, -1) + 'X');
    expect(res.status).toBe(401);
  });

  test('rejects a prefix of the secret (length mismatch does not throw)', async () => {
    const res = await send(L7_DDOS, SECRET.slice(0, 5));
    expect(res.status).toBe(401);
  });

  test('rejects a missing header with 401', async () => {
    const res = await send(L7_DDOS);
    expect(res.status).toBe(401);
  });

  test('rejects an empty header with 401', async () => {
    const res = await send(L7_DDOS, '');
    expect(res.status).toBe(401);
  });

  test('fails closed with 500 when no secret is configured', async () => {
    delete process.env.CLOUDFLARE_WEBHOOK_SECRET;
    const res = await send(L7_DDOS, SECRET);
    expect(res.status).toBe(500);
  });

  test('authenticates before parsing: bad secret + bad JSON is 401, not 400', async () => {
    const res = await send('{not json', 'wrong');
    expect(res.status).toBe(401);
  });

  test('returns 400 on invalid JSON with a valid secret', async () => {
    const res = await send('{not json', SECRET);
    expect(res.status).toBe(400);
  });
});

describe('event handling', () => {
  test.each([
    ['advanced_ddos_attack_l7_alert', L7_DDOS],
    ['health_check_status_notification', HEALTH_CHECK],
    ['dedicated_ssl_certificate_event_type', { ...L7_DDOS, alert_type: 'dedicated_ssl_certificate_event_type' }],
    ['access_custom_certificate_expiration_type', { ...L7_DDOS, alert_type: 'access_custom_certificate_expiration_type' }],
    ['workers_alert', { ...L7_DDOS, alert_type: 'workers_alert' }],
    ['some_future_alert_type', { ...L7_DDOS, alert_type: 'some_future_alert_type' }],
  ])('accepts %s', async (_name, payload) => {
    const res = await send(payload, SECRET);
    expect(res.status).toBe(200);
  });

  test('accepts the dashboard test message', async () => {
    const res = await send(TEST_MESSAGE, SECRET);
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Test message'));
  });

  test('eventName uses alert_type, falling back to "test"', () => {
    expect(eventName(L7_DDOS)).toBe('advanced_ddos_attack_l7_alert');
    expect(eventName(TEST_MESSAGE)).toBe('test');
    expect(eventName(null)).toBe('test');
  });
});

describe('verifyCloudflareAuth', () => {
  test('matches only the exact value', () => {
    expect(verifyCloudflareAuth(SECRET, SECRET)).toBe(true);
    expect(verifyCloudflareAuth(`Bearer ${SECRET}`, SECRET)).toBe(false);
    expect(verifyCloudflareAuth(undefined, SECRET)).toBe(false);
    expect(verifyCloudflareAuth(SECRET, undefined)).toBe(false);
    expect(verifyCloudflareAuth(SECRET, '')).toBe(false);
  });
});
