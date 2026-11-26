const request = require('supertest');
const crypto = require('crypto');

// CDP subscription secrets are plain strings used as UTF-8 bytes: no prefix, no base64.
process.env.COINBASE_WEBHOOK_SECRET = 'test_cdp_subscription_secret';

const { app, verifyCoinbaseSignature, normalizeOnchainActivity, processedEvents } = require('../src/index');

const SECRET = process.env.COINBASE_WEBHOOK_SECRET;
const H = 'content-type x-event-id x-event-type';

const hmacHex = (content, key = SECRET) => crypto.createHmac('sha256', key).update(content).digest('hex');

/**
 * Build a signature header the way CDP does: v0 over `{t}.{body}`, v1 over
 * `{t}.{h}.{headerValues}.{body}` with header values joined by ".".
 */
function signHeader(body, headers, { t = Math.floor(Date.now() / 1000), key = SECRET, h = H, order } = {}) {
  const values = h.split(' ').map((n) => headers[n] ?? '').join('.');
  const parts = {
    t: `t=${t}`,
    v0: `v0=${hmacHex(`${t}.${body}`, key)}`,
    h: `h=${h}`,
    v1: `v1=${hmacHex(`${t}.${h}.${values}.${body}`, key)}`,
  };
  return (order || ['t', 'v0', 'h', 'v1']).map((k) => parts[k]).join(',');
}

let counter = 0;
function deliver(bodyObj, { eventType, eventId, signature, sigHeaderName = 'X-Webhook-Signature', signOpts, mutate } = {}) {
  const body = typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj);
  const headers = {
    'content-type': 'application/json',
    'x-event-id': eventId ?? `3a3dd092-55ce-4832-97d9-0e1ab928c79${counter++}`,
  };
  if (eventType) headers['x-event-type'] = eventType;
  const sig = signature === undefined ? signHeader(body, headers, signOpts) : signature;
  if (mutate) mutate(headers);

  const req = request(app).post('/webhooks/coinbase');
  for (const [k, v] of Object.entries(headers)) req.set(k, v);
  if (sig !== null) req.set(sigHeaderName, sig);
  return req.send(body);
}

const flatOnchain = {
  block_number: 38218578,
  contract_address: '0x125E6687d4313864e53df431d5425969c15Eb2F',
  event_name: 'Transfer',
  event_signature: 'Transfer(address,address,uint256)',
  log_index: 755,
  network: 'base-mainnet',
  parameters: { from: '0xfrom', to: '0xto', value: '637064239' },
  timestamp: '2025-11-15T17:08:24Z',
  transaction_from: '0xfrom',
  transaction_hash: '0xabc',
  transaction_to: '0xto',
};

const envelopedOnchain = {
  id: 'evt_1a2b3c4d5e6f',
  type: 'onchain.activity.detected',
  createdAt: '2025-10-08T14:32:15.123Z',
  data: {
    subscriptionId: 'sub_123',
    networkId: 'base-mainnet',
    blockNumber: 12345678,
    transactionHash: '0xdef',
    logIndex: 3,
    contractAddress: '0x8335...2913',
    eventName: 'Transfer',
    from: '0xfrom',
    to: '0xto',
    value: '1000000',
  },
};

beforeEach(() => processedEvents.clear());

describe('signature verification', () => {
  it('accepts a valid v1 signature', async () => {
    const res = await deliver(flatOnchain, { eventType: 'onchain.activity.detected' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, type: 'onchain.activity.detected' });
  });

  it('accepts parts in any order', async () => {
    const res = await deliver(flatOnchain, { eventType: 'onchain.activity.detected', signOpts: { order: ['h', 'v1', 't', 'v0'] } });
    expect(res.status).toBe(200);
  });

  it('falls back to v0 when the header has no v1/h', async () => {
    const body = JSON.stringify(flatOnchain);
    const t = Math.floor(Date.now() / 1000);
    const res = await deliver(body, { eventType: 'onchain.activity.detected', signature: `t=${t},v0=${hmacHex(`${t}.${body}`)}` });
    expect(res.status).toBe(200);
  });

  it('accepts the deprecated X-Hook0-Signature header', async () => {
    const res = await deliver(flatOnchain, { eventType: 'onchain.activity.detected', sigHeaderName: 'X-Hook0-Signature' });
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    const res = await deliver(flatOnchain, { eventType: 'onchain.activity.detected', signature: null });
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await deliver(flatOnchain, { eventType: 'onchain.activity.detected', signOpts: { key: 'wrong' } });
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(flatOnchain);
    const headers = { 'content-type': 'application/json', 'x-event-id': 'e1', 'x-event-type': 'onchain.activity.detected' };
    const sig = signHeader(body, headers);
    const res = await request(app).post('/webhooks/coinbase').set(headers).set('X-Webhook-Signature', sig)
      .send(body.replace('637064239', '999999999'));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered header bound by v1', async () => {
    const res = await deliver(flatOnchain, {
      eventType: 'onchain.activity.detected',
      mutate: (h) => { h['x-event-type'] = 'payments.transfers.completed'; },
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 (not 500) for malformed / odd-length hex', async () => {
    const t = Math.floor(Date.now() / 1000);
    for (const bad of ['abc', 'zz'.repeat(32), `${'a'.repeat(63)}`]) {
      const res = await deliver(flatOnchain, { eventType: 'onchain.activity.detected', signature: `t=${t},h=${H},v1=${bad}` });
      expect(res.status).toBe(400);
    }
  });

  it('rejects a stale timestamp', async () => {
    const t = Math.floor(Date.now() / 1000) - 10 * 60;
    const res = await deliver(flatOnchain, { eventType: 'onchain.activity.detected', signOpts: { t } });
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric timestamp', async () => {
    const res = await deliver(flatOnchain, { eventType: 'onchain.activity.detected', signOpts: { t: 'abc' } });
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    const saved = process.env.COINBASE_WEBHOOK_SECRET;
    delete process.env.COINBASE_WEBHOOK_SECRET;
    try {
      const res = await deliver(flatOnchain, { eventType: 'onchain.activity.detected' });
      expect(res.status).toBe(500);
    } finally {
      process.env.COINBASE_WEBHOOK_SECRET = saved;
    }
  });

  it('returns 400 for invalid JSON with a valid signature', async () => {
    const res = await deliver('not json', { eventType: 'onchain.activity.detected' });
    expect(res.status).toBe(400);
  });

  it('verifyCoinbaseSignature: scheme v0 ignores v1', () => {
    const body = Buffer.from('{"a":1}');
    const t = Math.floor(Date.now() / 1000);
    const header = `t=${t},v0=${hmacHex(`${t}.{"a":1}`)},h=${H},v1=${'0'.repeat(64)}`;
    const get = () => undefined;
    expect(verifyCoinbaseSignature(body, header, get, SECRET).valid).toBe(false);
    expect(verifyCoinbaseSignature(body, header, get, SECRET, { scheme: 'v0' }).valid).toBe(true);
  });
});

describe('event handling', () => {
  it('deduplicates on X-Event-Id', async () => {
    const first = await deliver(flatOnchain, { eventType: 'onchain.activity.detected', eventId: 'dup-1' });
    const second = await deliver(flatOnchain, { eventType: 'onchain.activity.detected', eventId: 'dup-1' });
    expect(first.body.duplicate).toBeUndefined();
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });

  it('accepts both documented onchain.activity.detected bodies', async () => {
    expect((await deliver(flatOnchain, { eventType: 'onchain.activity.detected' })).status).toBe(200);
    expect((await deliver(envelopedOnchain, { eventType: 'onchain.activity.detected' })).status).toBe(200);
    expect(normalizeOnchainActivity(flatOnchain)).toMatchObject({ transactionHash: '0xabc', logIndex: 755, network: 'base-mainnet' });
    expect(normalizeOnchainActivity(envelopedOnchain)).toMatchObject({ transactionHash: '0xdef', logIndex: 3, network: 'base-mainnet' });
  });

  it('routes transfers via the body eventType when X-Event-Type is absent', async () => {
    const res = await deliver({
      eventID: '0f8c2a52-9d1e-4b8e-8a5e-3b7f0c2d1e4a',
      eventType: 'payments.transfers.completed',
      timestamp: '2025-01-01T00:00:00Z',
      data: { transferId: 'transfer_1', status: 'completed', targetAmount: '100.00', targetAsset: 'usdc' },
    });
    expect(res.body).toEqual({ received: true, type: 'payments.transfers.completed' });
  });

  it('handles payments.transfers.expired (data.status stays "quoted")', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const res = await deliver({
        eventID: '7b1e9c3a-2f4d-4e8a-9c6b-1d2e3f4a5b6c',
        eventType: 'payments.transfers.expired',
        timestamp: '2025-01-01T00:15:00Z',
        data: { transferId: 'transfer_2', status: 'quoted', expiresAt: '2025-01-01T00:15:00Z' },
      });
      expect(res.body).toEqual({ received: true, type: 'payments.transfers.expired' });
      const lines = spy.mock.calls.map((c) => String(c[0]));
      expect(lines.some((l) => l.includes('transfer_2 quote expired'))).toBe(true);
      expect(lines.some((l) => l.includes('Unhandled'))).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('handles Solana wallet events (transaction_signature)', async () => {
    const res = await deliver(
      { transaction_signature: '5Kd...', address: 'So1...', network: 'solana-devnet', confirmed_at: '2026-01-01T00:00:00Z' },
      { eventType: 'wallet.transaction.confirmed' },
    );
    expect(res.status).toBe(200);
  });

  it('handles onramp events', async () => {
    const res = await deliver({
      eventType: 'onramp.transaction.updated',
      orderId: 'order_1',
      status: 'ONRAMP_ORDER_STATUS_COMPLETED',
      paymentTotal: '100.00',
    });
    expect(res.body.type).toBe('onramp.transaction.updated');
  });

  it('returns 200 for unknown event types', async () => {
    const res = await deliver({ foo: 'bar' }, { eventType: 'something.new' });
    expect(res.status).toBe(200);
  });
});
