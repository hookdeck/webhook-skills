const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'test_signing_secret_abc123';
process.env.RETURNLESS_WEBHOOK_SECRET = SECRET;

const { app, verifyReturnlessWebhook } = require('../src/index');

// Real Returnless signature: lowercase hex HMAC-SHA256 of the raw body
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const body = JSON.stringify({ data: { id: 'return_12vM04vDdaQQJHxWprprL0IX', resource_type: 'return' } });

function post(payload, headers = {}) {
  return request(app)
    .post('/webhooks/returnless')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(payload);
}

describe('Returnless webhook', () => {
  afterEach(() => {
    process.env.RETURNLESS_WEBHOOK_SECRET = SECRET;
  });

  it('accepts a valid signature', async () => {
    const res = await post(body, { 'X-Signature': sign(body), 'X-Event-Name': 'return.created' });
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    const res = await post(body, { 'X-Signature': sign(body).toUpperCase(), 'X-Event-Name': 'return.created' });
    expect(res.status).toBe(200);
  });

  it.each([
    'request.created',
    'request.approved',
    'request.approved_with_manual_shipment',
    'request.approved_without_shipment',
    'request.rejected',
    'return.product.marked_as_received',
    'shipment.delivered',
    'return.notes.added', // not specially handled: logged
  ])('handles %s', async (event) => {
    const res = await post(body, { 'X-Signature': sign(body), 'X-Event-Name': event });
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes for any content type', async () => {
    const res = await request(app)
      .post('/webhooks/returnless')
      .set('Content-Type', 'text/plain')
      .set('X-Signature', sign(body))
      .set('X-Event-Name', 'return.created')
      .send(body);
    expect(res.status).toBe(200);
  });

  it('verifies bodies whose whitespace would change on re-serialization', async () => {
    const spaced = '{ "data" :  { "id": "return_1" } }\n';
    const res = await post(spaced, { 'X-Signature': sign(spaced), 'X-Event-Name': 'return.created' });
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    const res = await post(body, { 'X-Event-Name': 'return.created' });
    expect(res.status).toBe(401);
  });

  it('rejects an empty signature', async () => {
    const res = await post(body, { 'X-Signature': '', 'X-Event-Name': 'return.created' });
    expect(res.status).toBe(401);
  });

  it('rejects a signature signed with the wrong secret', async () => {
    const res = await post(body, { 'X-Signature': sign(body, 'other_secret'), 'X-Event-Name': 'return.created' });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const sig = sign(body);
    const res = await post(body.replace('return_', 'retur_'), { 'X-Signature': sig, 'X-Event-Name': 'return.created' });
    expect(res.status).toBe(401);
  });

  it('rejects a prefixed signature', async () => {
    const res = await post(body, { 'X-Signature': `sha256=${sign(body)}`, 'X-Event-Name': 'return.created' });
    expect(res.status).toBe(401);
  });

  it('rejects malformed signatures (wrong length or non-hex)', async () => {
    for (const bad of [sign(body).slice(0, 62), sign(body) + '00', 'z'.repeat(64)]) {
      const res = await post(body, { 'X-Signature': bad, 'X-Event-Name': 'return.created' });
      expect(res.status).toBe(401);
    }
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const bad = 'not json';
    const res = await post(bad, { 'X-Signature': sign(bad), 'X-Event-Name': 'return.created' });
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.RETURNLESS_WEBHOOK_SECRET;
    const res = await post(body, { 'X-Signature': sign(body), 'X-Event-Name': 'return.created' });
    expect(res.status).toBe(500);
  });

  it('verifyReturnlessWebhook works on raw buffers', () => {
    const buf = Buffer.from(body);
    expect(verifyReturnlessWebhook(buf, sign(body), SECRET)).toBe(true);
    expect(verifyReturnlessWebhook(buf, undefined, SECRET)).toBe(false);
    expect(verifyReturnlessWebhook(buf, sign(body), '')).toBe(false);
  });
});
