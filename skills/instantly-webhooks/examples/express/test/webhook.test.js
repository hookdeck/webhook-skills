// Generated with: instantly-webhooks skill
// https://github.com/hookdeck/webhook-skills

const request = require('supertest');
const { app, headerName, verifyInstantlyHeader, idempotencyKey } = require('../src/index');

// Instantly has no signature: the credential a test can generate is the exact
// header value configured on the webhook (here, Basic Auth as in the API docs).
const BASIC = `Basic ${Buffer.from('instantly:s3cr3t-p@ss').toString('base64')}`;
const CUSTOM_SECRET = 'c0ffee5ecret9f8e7d6c5b4a3928170615';

// Shape from Instantly's webhook events guide.
const REPLY = {
  timestamp: '2026-10-20T21:44:23.244Z',
  event_type: 'reply_received',
  workspace: '01a15b45-cbcb-78f8-aacd-5a2b788de0d5',
  campaign_id: '01a15b45-cbcc-7e79-9923-767240005bcf',
  campaign_name: 'Q4 Outbound',
  lead_email: 'jane@example.com',
  email_account: 'sales@yourdomain.com',
  step: 1,
  variant: 1,
  is_first: true,
  reply_subject: 'Re: Quick question',
  reply_text_snippet: 'Sounds interesting, can we talk Tuesday?',
};

const EVENT_TYPES = [
  'email_sent',
  'email_opened',
  'email_link_clicked',
  'link_clicked',
  'reply_received',
  'auto_reply_received',
  'email_bounced',
  'lead_unsubscribed',
  'account_error',
  'campaign_completed',
  'lead_interested',
  'lead_not_interested',
  'lead_neutral',
  'lead_meeting_booked',
  'lead_meeting_completed',
  'lead_no_show',
  'lead_closed',
  'lead_out_of_office',
  'lead_wrong_person',
  'Hot Prospect', // custom label, sent as-is
];

function post(body, headers = {}) {
  const req = request(app).post('/webhooks/instantly').set('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(headers)) req.set(k, v);
  return req.send(typeof body === 'string' ? body : JSON.stringify(body));
}

let logSpy;
let errorSpy;

beforeEach(() => {
  delete process.env.INSTANTLY_WEBHOOK_HEADER;
  process.env.INSTANTLY_WEBHOOK_SECRET = BASIC;
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

describe('verifyInstantlyHeader', () => {
  test('accepts the exact value', () => {
    expect(verifyInstantlyHeader(BASIC, BASIC)).toBe(true);
  });

  test('rejects a different value of the same length', () => {
    const wrong = BASIC.slice(0, -1) + (BASIC.endsWith('A') ? 'B' : 'A');
    expect(verifyInstantlyHeader(wrong, BASIC)).toBe(false);
  });

  test('rejects a different length without throwing', () => {
    expect(verifyInstantlyHeader('Basic short', BASIC)).toBe(false);
  });

  test('rejects the credential without its scheme prefix', () => {
    expect(verifyInstantlyHeader(BASIC.replace('Basic ', ''), BASIC)).toBe(false);
  });

  test('fails closed on missing values', () => {
    expect(verifyInstantlyHeader(undefined, BASIC)).toBe(false);
    expect(verifyInstantlyHeader(BASIC, undefined)).toBe(false);
    expect(verifyInstantlyHeader('', '')).toBe(false);
  });
});

describe('headerName', () => {
  test('defaults to authorization', () => {
    expect(headerName({})).toBe('authorization');
  });

  test('lowercases a configured name', () => {
    expect(headerName({ INSTANTLY_WEBHOOK_HEADER: 'X-Instantly-Secret' })).toBe('x-instantly-secret');
  });
});

describe('idempotencyKey', () => {
  test('is stable for the same event and differs across events', () => {
    expect(idempotencyKey(REPLY)).toBe(idempotencyKey({ ...REPLY }));
    expect(idempotencyKey(REPLY)).not.toBe(idempotencyKey({ ...REPLY, event_type: 'email_opened' }));
  });
});

describe('POST /webhooks/instantly', () => {
  test('200 with a valid Authorization header', async () => {
    const res = await post(REPLY, { Authorization: BASIC });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('200 with a custom secret header', async () => {
    process.env.INSTANTLY_WEBHOOK_HEADER = 'X-Instantly-Secret';
    process.env.INSTANTLY_WEBHOOK_SECRET = CUSTOM_SECRET;
    const res = await post(REPLY, { 'x-instantly-secret': CUSTOM_SECRET });
    expect(res.status).toBe(200);
  });

  test('401 when the custom header is configured but only Authorization is sent', async () => {
    process.env.INSTANTLY_WEBHOOK_HEADER = 'X-Instantly-Secret';
    process.env.INSTANTLY_WEBHOOK_SECRET = CUSTOM_SECRET;
    const res = await post(REPLY, { Authorization: CUSTOM_SECRET });
    expect(res.status).toBe(401);
  });

  test('401 when the header is missing', async () => {
    const res = await post(REPLY);
    expect(res.status).toBe(401);
  });

  test('401 with the wrong credential', async () => {
    const wrong = `Basic ${Buffer.from('instantly:wrong').toString('base64')}`;
    const res = await post(REPLY, { Authorization: wrong });
    expect(res.status).toBe(401);
  });

  test('500 when INSTANTLY_WEBHOOK_SECRET is not set', async () => {
    delete process.env.INSTANTLY_WEBHOOK_SECRET;
    const res = await post(REPLY, { Authorization: BASIC });
    expect(res.status).toBe(500);
  });

  test('400 on invalid JSON after authentication', async () => {
    const res = await post('{not json', { Authorization: BASIC });
    expect(res.status).toBe(400);
  });

  test('authenticates before parsing (bad JSON + bad credential = 401)', async () => {
    const res = await post('{not json', { Authorization: 'Basic nope' });
    expect(res.status).toBe(401);
  });

  test.each(EVENT_TYPES)('handles event_type %s', async (eventType) => {
    const res = await post({ ...REPLY, event_type: eventType }, { Authorization: BASIC });
    expect(res.status).toBe(200);
  });

  test('custom labels fall through to the default branch', async () => {
    await post({ ...REPLY, event_type: 'Hot Prospect' }, { Authorization: BASIC });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Custom label'));
  });
});
