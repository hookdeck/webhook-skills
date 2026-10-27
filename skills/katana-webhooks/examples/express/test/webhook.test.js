const crypto = require('crypto');
const request = require('supertest');

// Katana's token looks like hex but is used as its UTF-8 string.
const SECRET = '73f82127d57a2cea';
process.env.KATANA_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');

// Same algorithm as Katana: lowercase hex HMAC-SHA256 of the raw body, keyed with the token.
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const event = (action, extra = {}) =>
  JSON.stringify({
    resource_type: action.split('.')[0],
    action,
    object: { id: 12345, status: 'NOT_STARTED', href: 'https://api.katanamrp.com/v1/sales_orders/12345' },
    ...extra,
  });

function send(method, body, headers = {}) {
  const req = request(app)[method.toLowerCase()]('/webhooks/katana').set(headers);
  return body === undefined ? req : req.set('Content-Type', 'application/json').send(body);
}

describe('Katana webhook', () => {
  it.each(['sales_order.created', 'sales_order.delivered', 'purchase_order.received', 'manufacturing_order.done', 'inventory.product_out_of_stock'])(
    'accepts a signed %s event',
    async (action) => {
      const body = event(action);
      const res = await send('POST', body, { 'x-sha2-signature': sign(body) });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    }
  );

  it('acknowledges unhandled events', async () => {
    const body = event('product.updated');
    const res = await send('POST', body, { 'x-sha2-signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('verifies and accepts %s', async (method) => {
    const body = event('sales_order.created');
    const res = await send(method, body, { 'x-sha2-signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('verifies a GET with no body over zero bytes', async () => {
    const res = await send('GET', undefined, { 'x-sha2-signature': sign('') });
    // Signature is valid and there is no event to handle: acknowledged.
    expect(res.status).toBe(200);
    const bad = await send('GET', undefined, { 'x-sha2-signature': sign('x') });
    expect(bad.status).toBe(401);
  });

  it('verifies whatever the content type is', async () => {
    const body = event('sales_order.created');
    const res = await request(app)
      .post('/webhooks/katana')
      .set('Content-Type', 'text/plain')
      .set('x-sha2-signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('accepts uppercase hex', async () => {
    const body = event('sales_order.created');
    const res = await send('POST', body, { 'x-sha2-signature': sign(body).toUpperCase() });
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes, not re-serialised JSON', async () => {
    const body = '{ "action":"sales_order.created",  "object":{"id":1} }'; // unusual spacing
    const res = await send('POST', body, { 'x-sha2-signature': sign(body) });
    expect(res.status).toBe(200);
    const reformatted = await send('POST', body, { 'x-sha2-signature': sign(JSON.stringify(JSON.parse(body))) });
    expect(reformatted.status).toBe(401);
  });

  it('rejects a missing signature', async () => {
    const res = await send('POST', event('sales_order.created'));
    expect(res.status).toBe(401);
  });

  it('rejects an empty signature', async () => {
    const res = await send('POST', event('sales_order.created'), { 'x-sha2-signature': '' });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    const body = event('sales_order.created');
    const res = await send('POST', body, { 'x-sha2-signature': sign(body, 'someothertoken00') });
    expect(res.status).toBe(401);
  });

  it('rejects a key that was hex-decoded', async () => {
    const body = event('sales_order.created');
    const sig = crypto.createHmac('sha256', Buffer.from(SECRET, 'hex')).update(body).digest('hex');
    const res = await send('POST', body, { 'x-sha2-signature': sig });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = event('sales_order.created');
    const res = await send('POST', body.replace('12345', '99999'), { 'x-sha2-signature': sign(body) });
    expect(res.status).toBe(401);
  });

  it.each([
    ['short', 'abc123'],
    ['non-hex', 'z'.repeat(64)],
    ['prefixed', 'sha256=' + 'a'.repeat(64)],
    ['too long', 'a'.repeat(66)],
  ])('rejects a malformed signature (%s)', async (_name, sig) => {
    const res = await send('POST', event('sales_order.created'), { 'x-sha2-signature': sig });
    expect(res.status).toBe(401);
  });

  it('rejects everything when no secret is configured', async () => {
    delete process.env.KATANA_WEBHOOK_SECRET;
    const body = event('sales_order.created');
    const res = await send('POST', body, { 'x-sha2-signature': sign(body, '') });
    process.env.KATANA_WEBHOOK_SECRET = SECRET;
    expect(res.status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await send('POST', body, { 'x-sha2-signature': sign(body) });
    expect(res.status).toBe(400);
  });

  it('returns 405 for other methods', async () => {
    const res = await request(app).options('/webhooks/katana');
    expect(res.status).toBe(405);
  });
});
