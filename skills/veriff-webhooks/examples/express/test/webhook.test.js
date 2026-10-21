const request = require('supertest');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Veriff's docs mock shared secret key (webhooks-guide, "Mock payload and shared secret key")
const DOCS_SECRET = 'abcdef12-abcd-abcd-abcd-abcdef012345';
process.env.VERIFF_SHARED_SECRET = DOCS_SECRET;

const { app, verifyVeriffSignature } = require('../src/index');

// Compact JSON of the decision webhook mock payload from Veriff's docs
const DOCS_PAYLOAD = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'docs-mock-payload.json'),
  'utf8'
);
// Signature published in the docs' curl example for that payload
const DOCS_SIGNATURE = '01fa3ded011bfce75672c99877a6cc1cf7aeaeda0ccb6b43fc21b60f595063c2';

// Same algorithm as Veriff: hex HMAC-SHA256 of the raw body
function sign(body, secret = DOCS_SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function post(body, headers = {}) {
  return request(app)
    .post('/webhooks/veriff')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

const decision = (status) =>
  JSON.stringify({
    status: 'success',
    verification: {
      id: '12df6045-3846-3e45-946a-14fa6136d78b',
      attemptId: '00bca969-b53a-4fad-b065-874d41a7b2b8',
      vendorData: '12345678',
      status,
      code: 9001,
      reason: null,
    },
    technicalData: { ip: '186.153.67.122' },
  });

const event = (action, code) =>
  JSON.stringify({
    id: 'f04bdb47-d3be-4b28-b028-a652feb060b5',
    attemptId: 'e30122d1-740b-4764-853f-470374a7abf4',
    feature: 'selfid',
    code,
    action,
    vendorData: '12345678',
    endUserId: 'a1b2c35d-e8f7-6d5e-3cd2-a1b2c35db3d4',
  });

describe('verifyVeriffSignature', () => {
  it('matches the test vector published in Veriff docs', () => {
    expect(sign(DOCS_PAYLOAD)).toBe(DOCS_SIGNATURE);
    expect(verifyVeriffSignature(Buffer.from(DOCS_PAYLOAD), DOCS_SIGNATURE, DOCS_SECRET)).toBe(true);
  });

  it('accepts an uppercase hex signature', () => {
    const body = Buffer.from(decision('approved'));
    expect(verifyVeriffSignature(body, sign(body).toUpperCase(), DOCS_SECRET)).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    const body = Buffer.from(decision('approved'));
    expect(verifyVeriffSignature(body, sign(body, 'other-secret'), DOCS_SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const signature = sign(decision('approved'));
    expect(verifyVeriffSignature(Buffer.from(decision('declined')), signature, DOCS_SECRET)).toBe(false);
  });

  it('rejects missing or malformed signatures', () => {
    const body = Buffer.from(decision('approved'));
    expect(verifyVeriffSignature(body, undefined, DOCS_SECRET)).toBe(false);
    expect(verifyVeriffSignature(body, 'short', DOCS_SECRET)).toBe(false);
  });
});

describe('POST /webhooks/veriff', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts the docs mock payload with the docs signature', async () => {
    const res = await post(DOCS_PAYLOAD, { 'X-HMAC-SIGNATURE': DOCS_SIGNATURE });
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Verification approved'));
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await post(decision('approved'));
    expect(res.status).toBe(400);
    expect(res.text).toBe('Missing X-HMAC-SIGNATURE header');
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post(decision('approved'), { 'X-HMAC-SIGNATURE': 'f'.repeat(64) });
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('does not accept X-AUTH-CLIENT as proof of authenticity', async () => {
    const res = await post(decision('approved'), {
      'X-AUTH-CLIENT': '8e4f7cd8-7a19-4d7d-971f-a076407ee03c',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON with a valid signature', async () => {
    const body = 'not json';
    const res = await post(body, { 'X-HMAC-SIGNATURE': sign(body) });
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid JSON');
  });

  it.each(['approved', 'declined', 'resubmission_requested', 'review', 'expired', 'abandoned'])(
    'handles decision status %s',
    async (status) => {
      const body = decision(status);
      const res = await post(body, { 'X-HMAC-SIGNATURE': sign(body) });
      expect(res.status).toBe(200);
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
    }
  );

  it.each([
    ['started', 7001],
    ['submitted', 7002],
    ['waiting_complete', 7007],
    ['waiting_continued', 7008],
    ['flow_finished', 7009],
    ['flow_cancelled', 7010],
    ['document_type_other_selected', 7011],
  ])('handles event action %s', async (action, code) => {
    const body = event(action, code);
    const res = await post(body, { 'X-HMAC-SIGNATURE': sign(body) });
    expect(res.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
  });

  it('acknowledges unknown event actions', async () => {
    const body = event('something_new', 7999);
    const res = await post(body, { 'X-HMAC-SIGNATURE': sign(body) });
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled event action'));
  });
});
