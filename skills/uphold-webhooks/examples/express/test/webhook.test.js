// Generated with: uphold-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'node:crypto';
import request from 'supertest';
import { jest } from '@jest/globals';

// Uphold's endpoint secret comes from the Svix-hosted Webhooks Portal:
// "whsec_" + base64(key bytes). The HMAC key is the base64-DECODED part.
const SECRET = 'whsec_' + Buffer.from('uphold-test-signing-key-01234567').toString('base64');

process.env.UPHOLD_WEBHOOK_SECRET = SECRET;

// Dynamic import so the env var is set before the module loads.
const { app } = await import('../src/index.js');

/** Sign exactly like Uphold/Svix. */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

// Uphold sends Title-Case header names (Webhook-Id, ...); HTTP headers are
// case-insensitive, so this also checks the handler doesn't depend on case.
function signedHeaders(rawBody, { id, timestamp, secret, signature } = {}) {
  const msgId = id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(timestamp ?? now());
  return {
    'Content-Type': 'application/json',
    'Webhook-Id': msgId,
    'Webhook-Timestamp': ts,
    'Webhook-Signature': signature ?? sign(rawBody, msgId, ts, secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/uphold').set(headers).send(rawBody);
}

function event(type, data) {
  return { id: crypto.randomUUID(), type, createdAt: '2025-02-20T21:21:09.943Z', data };
}

const transactionStatusChanged = (status = 'completed', statusDetails) =>
  event('core.transaction.status-changed', {
    transaction: {
      id: '623000c8-9bdf-4a2b-aa3d-6a6b44a7f6a0',
      origin: {
        amount: '100.00',
        asset: 'GBP',
        rate: '47619.04761904762',
        node: {
          type: 'account',
          id: 'b98e4f0d-a67d-4126-a99d-666f7e0315d9',
          ownerId: 'e4ce04dc-67b7-4e9f-af91-482cb6f9fc4a',
        },
      },
      destination: {
        amount: '0.0021',
        asset: 'BTC',
        rate: '0.000021',
        node: {
          type: 'account',
          id: '555a99a1-620d-4431-a0ac-b43e1aad2bdc',
          ownerId: 'e4ce04dc-67b7-4e9f-af91-482cb6f9fc4a',
        },
      },
      denomination: { amount: '100.00', asset: 'GBP', target: 'origin', rate: '1' },
      fees: [],
      status,
      ...(statusDetails ? { statusDetails } : {}),
      quotedAt: '2024-07-24T15:02:39.000Z',
      createdAt: '2024-07-24T15:22:39.000Z',
      updatedAt: '2024-07-24T15:32:39.000Z',
    },
  });

const userCreated = () =>
  event('core.user.created', {
    user: {
      id: 'cd21b26d-35d2-408a-9201-b8fdbef7a604',
      type: 'individual',
      email: 'john.doe@uphold.com',
      primaryCitizenship: 'GB',
      address: { country: 'GB', subdivision: 'GB-MAN' },
      createdAt: '2024-03-13T20:20:39.000Z',
      updatedAt: '2024-03-13T20:20:39.000Z',
    },
  });

beforeEach(() => {
  process.env.UPHOLD_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts core.user.created', async () => {
    const body = JSON.stringify(userCreated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('User created'));
  });

  it('accepts core.transaction.status-changed (completed)', async () => {
    const body = JSON.stringify(transactionStatusChanged('completed'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('completed: 0.0021 BTC'));
  });

  it('accepts core.transaction.status-changed (failed, with reason)', async () => {
    const body = JSON.stringify(
      transactionStatusChanged('failed', { reason: 'bank-account-holder-name-mismatch' })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('reason=bank-account-holder-name-mismatch')
    );
  });

  it('accepts core.account.balance-changed', async () => {
    const body = JSON.stringify(
      event('core.account.balance-changed', {
        account: {
          id: '555a99a1-620d-4431-a0ac-b43e1aad2bdc',
          ownerId: '1e32fca3-23f7-40ed-bc1b-de10c790182d',
          label: 'My BTC account',
          asset: 'BTC',
          balance: { total: '0.5', available: '0.3' },
          createdAt: '2024-06-01T00:00:00.000Z',
          updatedAt: '2024-07-15T00:00:00.000Z',
        },
      })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts KYC status events ({ status, userId })', async () => {
    const body = JSON.stringify(
      event('core.kyc.identity.status-changed', {
        status: 'ok',
        userId: '123e4567-e89b-12d3-a456-426614174000',
      })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('core.kyc.identity.status-changed')
    );
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(event('core.something.new', {}));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-separated signatures matches', async () => {
    const body = JSON.stringify(userCreated());
    const headers = signedHeaders(body);
    headers['Webhook-Signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['Webhook-Signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for duplicate deliveries of the same event id', async () => {
    const body = JSON.stringify(userCreated());
    const first = await post(body, signedHeaders(body));
    const second = await post(body, signedHeaders(body));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(userCreated());
    const res = await post(body, { 'Content-Type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects svix-* headers (Uphold sends webhook-*)', async () => {
    const body = JSON.stringify(userCreated());
    const h = signedHeaders(body);
    const res = await post(body, {
      'Content-Type': 'application/json',
      'svix-id': h['Webhook-Id'],
      'svix-timestamp': h['Webhook-Timestamp'],
      'svix-signature': h['Webhook-Signature'],
    });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(userCreated());
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const other = 'whsec_' + Buffer.from('some-other-secret-key-0123456789').toString('base64');
    const body = JSON.stringify(userCreated());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(transactionStatusChanged('failed'));
    const headers = signedHeaders(body);
    const res = await post(body.replace('"failed"', '"completed"'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute tolerance', async () => {
    const body = JSON.stringify(userCreated());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(userCreated());
    const id = 'msg_undecoded';
    const ts = String(now());
    const wrong = crypto
      .createHmac('sha256', SECRET.slice('whsec_'.length))
      .update(`${id}.${ts}.${body}`)
      .digest('base64');
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when UPHOLD_WEBHOOK_SECRET is not set', async () => {
    delete process.env.UPHOLD_WEBHOOK_SECRET;
    const body = JSON.stringify(userCreated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
