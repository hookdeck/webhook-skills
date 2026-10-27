const request = require('supertest');
const crypto = require('crypto');

// BVNK's published test vector (docs: "Validate webhooks"). The secret looks like base64 but is used
// as its UTF-8 string bytes.
const SECRET = "JUL5QkQrpZYwW+Kf03QSrb70CG+ea/j8E/JfslENaXhd0AGBDbAtYYP2MdjkYDqiwjBtrtQXsUIbtAf7IGEGfg==";
const VECTOR_BODY = "{\"event\":\"bvnk:ledger:report:ready\",\"eventId\":\"0198a8bb-7d56-79ef-92b2-2aed247c21b4\",\"timestamp\":\"2025-08-14T13:18:36.374620938Z\",\"data\":{\"id\":\"8d942264-e27e-44d9-a048-5ed66ac5129f\",\"url\":\"https://bvnk-staging-reports.s3.eu-west-1.amazonaws.com/transaction/8d942264-e27e-44d9-a048-5ed66ac5129f_7b2f87b9-1335-4b1e-bbeb-6a59ba1dc6df.csv?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20250814T131836Z&X-Amz-SignedHeaders=host&X-Amz-Credential=AKIAZP6R7NJUFAGFGMNA%2F20250814%2Feu-west-1%2Fs3%2Faws4_request&X-Amz-Expires=604800&X-Amz-Signature=5c861e552b3e253be28f8e02c818b3c5e00269b9b50b6d4957d5281825d31a67\",\"type\":\"TRANSACTION\",\"status\":\"READY\"}}";
const VECTOR_SIGNATURE = 'VWEtiJu/7dLrq0ZtXS0HbGDPy6Re86oZeTnEEc9mlxg=';
process.env.BVNK_WEBHOOK_SECRET = SECRET;

const { app, verifyBvnk } = require('../src/index');

const sign = (body, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(body).digest('base64');

function event(name = 'payment:v2:payin:status-change', extra = {}) {
  return JSON.stringify({
    event: name,
    eventId: '0198a8bb-7d56-79ef-92b2-2aed247c21b4',
    timestamp: '2025-08-14T13:18:36.374620938Z',
    data: { id: '8d942264-e27e-44d9-a048-5ed66ac5129f', status: 'COMPLETE' },
    ...extra,
  });
}

const post = (body, headers = {}) =>
  request(app).post('/webhooks/bvnk').set('Content-Type', 'application/json').set(headers).send(body);

let logSpy;
beforeEach(() => {
  process.env.BVNK_WEBHOOK_SECRET = SECRET;
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('verifyBvnk', () => {
  it('accepts the published test vector', () => {
    expect(verifyBvnk(Buffer.from(VECTOR_BODY, 'utf8'), VECTOR_SIGNATURE, SECRET)).toBe(true);
  });

  it('computes the published signature itself', () => {
    expect(sign(VECTOR_BODY)).toBe(VECTOR_SIGNATURE);
  });

  it('rejects the vector when the secret is base64-decoded', () => {
    const decoded = Buffer.from(SECRET, 'base64');
    const wrong = crypto.createHmac('sha256', decoded).update(VECTOR_BODY).digest('base64');
    expect(wrong).not.toBe(VECTOR_SIGNATURE);
  });

  it('rejects a non-canonical base64 spelling of the same bytes', () => {
    // The last character before "=" carries 2 unused bits: "h" decodes to the same bytes as "g"
    const variant = VECTOR_SIGNATURE.replace('g=', 'h=');
    expect(Buffer.from(variant, 'base64').equals(Buffer.from(VECTOR_SIGNATURE, 'base64'))).toBe(true);
    expect(verifyBvnk(Buffer.from(VECTOR_BODY), variant, SECRET)).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['too short', 'abc='],
    ['unpadded', VECTOR_SIGNATURE.slice(0, 43)],
    ['url-safe alphabet', VECTOR_SIGNATURE.replace('/', '_')],
    ['trailing space', VECTOR_SIGNATURE + ' '],
    ['prefixed', 'sha256=' + VECTOR_SIGNATURE],
  ])('rejects a %s signature', (_name, value) => {
    expect(verifyBvnk(Buffer.from(VECTOR_BODY), value, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/bvnk', () => {
  it('accepts the published test vector', async () => {
    const res = await post(VECTOR_BODY, { 'x-signature': VECTOR_SIGNATURE });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Ledger report 8d942264-e27e-44d9-a048-5ed66ac5129f'));
  });

  it('accepts a freshly signed payload of any content type', async () => {
    const body = event();
    const res = await request(app)
      .post('/webhooks/bvnk')
      .set('Content-Type', 'text/plain')
      .set('x-signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    expect((await post(event())).status).toBe(401);
  });

  it('rejects a malformed signature', async () => {
    expect((await post(event(), { 'x-signature': 'not-a-signature' })).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = event();
    expect((await post(body, { 'x-signature': sign(body, 'another-secret') })).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await post(VECTOR_BODY.replace('READY', 'FAILED'), { 'x-signature': VECTOR_SIGNATURE });
    expect(res.status).toBe(401);
  });

  it('rejects a re-serialized (pretty-printed) body', async () => {
    const res = await post(JSON.stringify(JSON.parse(VECTOR_BODY), null, 2), { 'x-signature': VECTOR_SIGNATURE });
    expect(res.status).toBe(401);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.BVNK_WEBHOOK_SECRET;
    expect((await post(VECTOR_BODY, { 'x-signature': VECTOR_SIGNATURE })).status).toBe(500);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    expect((await post(body, { 'x-signature': sign(body) })).status).toBe(400);
  });

  it.each([
    'payment:v2:payin:status-change',
    'bvnk:payment:channel:created',
    'bvnk:payment:channel:transaction-confirmed',
    'bvnk:payment:channel:transaction-on-hold',
    'bvnk:payment:crypto:transaction-on-hold',
    'platform:accounts:customer:created',
    'platform:accounts:customer:status-change',
    'bvnk:customers:status-change',
  ])('handles %s', async (name) => {
    const body = event(name);
    const res = await post(body, { 'x-signature': sign(body) });
    expect(res.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled event'));
  });

  it('logs unhandled events and still returns 200', async () => {
    const body = event('bvnk:something:else');
    const res = await post(body, { 'x-signature': sign(body) });
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled event: bvnk:something:else');
  });
});
