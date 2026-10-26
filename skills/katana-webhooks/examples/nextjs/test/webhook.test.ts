import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { describe, it, expect, beforeEach } from 'vitest';

// Katana's token looks like hex but is used as its UTF-8 string.
const SECRET = '73f82127d57a2cea';

import * as route from '../app/webhooks/katana/route';

const URL_ = 'http://localhost:3000/webhooks/katana';

// Same algorithm as Katana: lowercase hex HMAC-SHA256 of the raw body, keyed with the token.
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const event = (action: string) =>
  JSON.stringify({
    resource_type: action.split('.')[0],
    action,
    object: { id: 12345, status: 'NOT_STARTED', href: 'https://api.katanamrp.com/v1/sales_orders/12345' },
  });

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function call(method: Method, body?: string, headers: Record<string, string> = {}) {
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = body;
  return route[method](new NextRequest(URL_, init));
}

describe('Katana webhook', () => {
  beforeEach(() => {
    process.env.KATANA_WEBHOOK_SECRET = SECRET;
  });

  it.each([
    'sales_order.created',
    'sales_order.delivered',
    'purchase_order.received',
    'manufacturing_order.done',
    'inventory.product_out_of_stock',
  ])('accepts a signed %s event', async (action) => {
    const body = event(action);
    const res = await call('POST', body, { 'x-sha2-signature': sign(body) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('acknowledges unhandled events', async () => {
    const body = event('product.updated');
    const res = await call('POST', body, { 'x-sha2-signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as Method[])('verifies and accepts %s', async (method) => {
    const body = event('sales_order.created');
    const res = await call(method, body, { 'x-sha2-signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('verifies a GET with no body over zero bytes', async () => {
    // Valid signature of zero bytes and no event to handle: acknowledged.
    const ok = await call('GET', undefined, { 'x-sha2-signature': sign('') });
    expect(ok.status).toBe(200);
    const bad = await call('GET', undefined, { 'x-sha2-signature': sign('x') });
    expect(bad.status).toBe(401);
  });

  it('verifies whatever the content type is', async () => {
    const body = event('sales_order.created');
    const res = await call('POST', body, { 'content-type': 'text/plain', 'x-sha2-signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('accepts uppercase hex', async () => {
    const body = event('sales_order.created');
    const res = await call('POST', body, { 'x-sha2-signature': sign(body).toUpperCase() });
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes, not re-serialised JSON', async () => {
    const body = '{ "action":"sales_order.created",  "object":{"id":1} }';
    expect((await call('POST', body, { 'x-sha2-signature': sign(body) })).status).toBe(200);
    const reformatted = sign(JSON.stringify(JSON.parse(body)));
    expect((await call('POST', body, { 'x-sha2-signature': reformatted })).status).toBe(401);
  });

  it('rejects a missing signature', async () => {
    expect((await call('POST', event('sales_order.created'))).status).toBe(401);
  });

  it('rejects an empty signature', async () => {
    expect((await call('POST', event('sales_order.created'), { 'x-sha2-signature': '' })).status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    const body = event('sales_order.created');
    const res = await call('POST', body, { 'x-sha2-signature': sign(body, 'someothertoken00') });
    expect(res.status).toBe(401);
  });

  it('rejects a key that was hex-decoded', async () => {
    const body = event('sales_order.created');
    const sig = crypto.createHmac('sha256', Buffer.from(SECRET, 'hex')).update(body).digest('hex');
    expect((await call('POST', body, { 'x-sha2-signature': sig })).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = event('sales_order.created');
    const res = await call('POST', body.replace('12345', '99999'), { 'x-sha2-signature': sign(body) });
    expect(res.status).toBe(401);
  });

  it.each([
    ['short', 'abc123'],
    ['non-hex', 'z'.repeat(64)],
    ['prefixed', 'sha256=' + 'a'.repeat(64)],
    ['too long', 'a'.repeat(66)],
  ])('rejects a malformed signature (%s)', async (_name, sig) => {
    const res = await call('POST', event('sales_order.created'), { 'x-sha2-signature': sig });
    expect(res.status).toBe(401);
  });

  it('rejects everything when no secret is configured', async () => {
    delete process.env.KATANA_WEBHOOK_SECRET;
    const body = event('sales_order.created');
    const res = await call('POST', body, { 'x-sha2-signature': sign(body, '') });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await call('POST', body, { 'x-sha2-signature': sign(body) });
    expect(res.status).toBe(400);
  });
});
