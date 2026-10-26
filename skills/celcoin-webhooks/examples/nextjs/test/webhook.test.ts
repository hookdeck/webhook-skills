import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, GET, PATCH, POST, PUT } from '../app/webhooks/celcoin/route';
import { verifyCelcoinAuth } from '../lib/verify-celcoin';

const USERNAME = 'celcoin-hook';
const PASSWORD = 'p@ss:word-with-colon';
const URL = 'http://localhost:3000/webhooks/celcoin';

// Built exactly as Celcoin builds it: Basic base64(login:pwd)
function basic(user: string, pass: string): string {
  return 'Basic ' + Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
}

const GOOD = basic(USERNAME, PASSWORD);

const pixIn = {
  entity: 'pix-payment-in',
  createTimestamp: '2025-05-07T17:30:00.7647117',
  status: 'CONFIRMED',
  body: { id: 'e2726e30-c318-4e1f-b284-e37c14e6c4b2', amount: 10.5 },
};

function req(method: string, headers: Record<string, string> = {}, body?: string): NextRequest {
  return new NextRequest(URL, { method, headers, body });
}

beforeEach(() => {
  process.env.CELCOIN_WEBHOOK_USERNAME = USERNAME;
  process.env.CELCOIN_WEBHOOK_PASSWORD = PASSWORD;
});

describe('verifyCelcoinAuth', () => {
  it('accepts matching credentials, a lowercase scheme and colons in the password', () => {
    expect(verifyCelcoinAuth(GOOD)).toBe(true);
    expect(verifyCelcoinAuth(GOOD.replace('Basic', 'basic'))).toBe(true);
  });

  it('rejects wrong credentials, missing header and other schemes', () => {
    expect(verifyCelcoinAuth(basic(USERNAME, 'nope'))).toBe(false);
    expect(verifyCelcoinAuth(basic('nope', PASSWORD))).toBe(false);
    expect(verifyCelcoinAuth(null)).toBe(false);
    expect(verifyCelcoinAuth('Bearer abc')).toBe(false);
  });

  it('rejects valid credentials followed by junk', () => {
    expect(verifyCelcoinAuth(GOOD + '!!')).toBe(false);
    expect(verifyCelcoinAuth(GOOD + ' extra')).toBe(false);
    expect(verifyCelcoinAuth(GOOD + 'A')).toBe(false);
  });

  it('rejects credentials without a colon and fails closed when unconfigured', () => {
    expect(verifyCelcoinAuth('Basic ' + Buffer.from('nocolon').toString('base64'))).toBe(false);
    expect(verifyCelcoinAuth(GOOD, '', '')).toBe(false);
  });
});

describe('POST /webhooks/celcoin', () => {
  it('accepts an authenticated JSON notification', async () => {
    const res = await POST(req('POST', { authorization: GOOD, 'content-type': 'application/json' }, JSON.stringify(pixIn)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts any content type', async () => {
    const res = await POST(req('POST', { authorization: GOOD, 'content-type': 'application/vnd.api+json' }, JSON.stringify(pixIn)));
    expect(res.status).toBe(200);
  });

  it.each(['pix-payment-out', 'pix-reversal-in', 'internal-transfer-in', 'spb-transfer-out', 'onboarding-proposal', 'kyc', 'unknown-entity'])(
    'handles entity %s (CONFIRMED and ERROR)',
    async (entity) => {
      for (const status of ['CONFIRMED', 'ERROR']) {
        const body = JSON.stringify({ entity, status, createTimestamp: '2025-05-07T17:30:00', body: {} });
        const res = await POST(req('POST', { authorization: GOOD, 'content-type': 'application/json' }, body));
        expect(res.status).toBe(200);
      }
    }
  );

  it('rejects a missing Authorization header and wrong credentials with 401', async () => {
    expect((await POST(req('POST', {}, JSON.stringify(pixIn)))).status).toBe(401);
    expect((await POST(req('POST', { authorization: basic(USERNAME, 'wrong') }, JSON.stringify(pixIn)))).status).toBe(401);
  });

  it('rejects malformed or non-object JSON with 400 after authenticating', async () => {
    expect((await POST(req('POST', { authorization: GOOD }, '{not json'))).status).toBe(400);
    expect((await POST(req('POST', { authorization: GOOD }, '[1,2]'))).status).toBe(400);
  });

  it('acknowledges an empty body', async () => {
    expect((await POST(req('POST', { authorization: GOOD }))).status).toBe(200);
  });

  it('returns 500 when credentials are not configured', async () => {
    delete process.env.CELCOIN_WEBHOOK_USERNAME;
    delete process.env.CELCOIN_WEBHOOK_PASSWORD;
    expect((await POST(req('POST', { authorization: GOOD }))).status).toBe(500);
  });
});

describe('other HTTP methods', () => {
  const handlers = { GET, PUT, PATCH, DELETE, POST };

  it.each(['GET', 'PUT', 'PATCH', 'DELETE'] as const)('accepts authenticated %s with an empty body', async (method) => {
    const res = await handlers[method](req(method, { authorization: GOOD }));
    expect(res.status).toBe(200);
  });

  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const)('checks the credential first for %s', async (method) => {
    const res = await handlers[method](req(method));
    expect(res.status).toBe(401);
  });

  it('accepts a JSON body on PUT', async () => {
    const res = await PUT(req('PUT', { authorization: GOOD, 'content-type': 'application/json' }, JSON.stringify(pixIn)));
    expect(res.status).toBe(200);
  });
});
