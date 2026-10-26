import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyDelivereasy } from '../lib/verify-delivereasy';

const SECRET = 'test_api_key_for_delivereasy';

// Same algorithm as Delivereasy: Base64.strict_encode64(HMAC-SHA256(api_key, body))
const sign = (body: string, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(body).digest('base64');

const body = JSON.stringify({
  id: 12345,
  booking_identifier: 'ABC123',
  status: 'example_status',
  driver: { name: 'Sam' },
  pickup: {},
  dropoff: {},
});

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.DELIVEREASY_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/delivereasy/route'));
});

function call(payload: string, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/delivereasy', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: payload,
    })
  );
}

describe('Delivereasy webhook', () => {
  it('accepts a valid signature', async () => {
    expect((await call(body, { 'x-signature': sign(body) })).status).toBe(200);
  });

  it('verifies exact bytes, not re-serialized JSON', async () => {
    const spaced = '{ "id": 1,  "status": "x" }';
    expect((await call(spaced, { 'x-signature': sign(spaced) })).status).toBe(200);
    const reserialized = sign(JSON.stringify(JSON.parse(spaced)));
    expect((await call(spaced, { 'x-signature': reserialized })).status).toBe(401);
  });

  it('rejects a missing signature', async () => {
    expect((await call(body)).status).toBe(401);
  });

  it('rejects an empty signature', async () => {
    expect((await call(body, { 'x-signature': '' })).status).toBe(401);
  });

  it('rejects a signature made with the wrong key', async () => {
    expect((await call(body, { 'x-signature': sign(body, 'other_key') })).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const tampered = body.replace('ABC123', 'XYZ999');
    expect((await call(tampered, { 'x-signature': sign(body) })).status).toBe(401);
  });

  it('rejects malformed signatures without throwing', async () => {
    for (const sig of ['not-base64', sign(body).slice(0, -1), `sha256=${sign(body)}`]) {
      expect((await call(body, { 'x-signature': sig })).status).toBe(401);
    }
  });

  it('rejects a non-canonical base64 value that decodes to the same bytes', () => {
    const good = sign(body);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const idx = alphabet.indexOf(good[42]);
    const forged = good.slice(0, 42) + alphabet[(idx & ~3) | (((idx & 3) + 1) % 4)] + '=';
    expect(Buffer.from(forged, 'base64').equals(Buffer.from(good, 'base64'))).toBe(true);
    expect(verifyDelivereasy(Buffer.from(body), forged, SECRET)).toBe(false);
    expect(verifyDelivereasy(Buffer.from(body), good, SECRET)).toBe(true);
  });

  it('returns 400 for a signed but non-JSON body', async () => {
    expect((await call('not json', { 'x-signature': sign('not json') })).status).toBe(400);
  });
});
