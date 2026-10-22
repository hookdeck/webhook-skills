const request = require('supertest');
const crypto = require('crypto');

// Mercury's secretKey is an opaque string used as-is; this one is only for tests
const SECRET = 'test_mercury_secret_key_8f3a1c';
process.env.MERCURY_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

function sign(body, timestamp = Math.floor(Date.now() / 1000), secret = SECRET) {
  const v1 = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

// Content-Type is deliberately varied: verification must not depend on it
function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/mercury').set('Content-Type', contentType);
  if (signature !== undefined) req.set('Mercury-Signature', signature);
  return req.send(body);
}

const txUpdate = JSON.stringify({
  id: 'bfa85eaa-afab-11f0-8fea-17d650f2306e',
  resourceType: 'transaction',
  resourceId: '1d3042b6-af63-11f0-89d2-3503f2fcfef7',
  operationType: 'update',
  resourceVersion: 2,
  occurredAt: '2025-01-01T00:00:00.000000Z',
  changedPaths: ['status', 'postedAt'],
  mergePatch: { postedAt: '2025-01-01T00:00:00.000000+00:00', status: 'sent' },
  previousValues: { postedAt: null, status: 'pending' },
});

describe('Mercury webhook signature verification', () => {
  it('accepts a valid Mercury-Signature', async () => {
    const res = await post(txUpdate, sign(txUpdate));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies regardless of Content-Type', async () => {
    const res = await post(txUpdate, sign(txUpdate), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(txUpdate, undefined);
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const res = await post(txUpdate.replace('sent', 'failed'), sign(txUpdate));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await post(txUpdate, sign(txUpdate, undefined, 'other_secret'));
    expect(res.status).toBe(400);
  });

  it('rejects a signature of a different length without throwing', async () => {
    const res = await post(txUpdate, 't=1700000000,v1=abc');
    expect(res.status).toBe(400);
  });

  it('rejects a malformed header', async () => {
    expect((await post(txUpdate, 'garbage')).status).toBe(400);
    expect((await post(txUpdate, 't=abc,v1=deadbeef')).status).toBe(400);
  });

  it('rejects when the timestamp was altered after signing', async () => {
    const header = sign(txUpdate, 1700000000).replace('t=1700000000', 't=1700000001');
    expect((await post(txUpdate, header)).status).toBe(400);
  });

  it('accepts an old timestamp by default (retries and replays keep the original)', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    const res = await post(txUpdate, sign(txUpdate, old));
    expect(res.status).toBe(200);
  });

  it('rejects an old timestamp when MERCURY_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
    process.env.MERCURY_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      expect((await post(txUpdate, sign(txUpdate, old))).status).toBe(400);
      expect((await post(txUpdate, sign(txUpdate))).status).toBe(200);
    } finally {
      delete process.env.MERCURY_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  it('treats a non-numeric MERCURY_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', async () => {
    process.env.MERCURY_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      expect((await post(txUpdate, sign(txUpdate, old))).status).toBe(200);
    } finally {
      delete process.env.MERCURY_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });
});

describe('Mercury events (dispatch on resourceType.operationType)', () => {
  it.each([
    ['transaction', 'create'],
    ['transaction', 'update'],
    ['checkingAccount', 'update'],
    ['savingsAccount', 'update'],
    ['treasuryAccount', 'update'],
    ['creditAccount', 'update'],
    ['investmentAccount', 'update'],
    ['transaction', 'delete'],
  ])('handles %s.%s', async (resourceType, operationType) => {
    const body = JSON.stringify({
      id: 'e1', resourceType, resourceId: 'r1', operationType,
      changedPaths: ['status'], mergePatch: { status: 'pending' },
    });
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      const logged = log.mock.calls.map((c) => c[0]).join('\n');
      if (operationType === 'delete') expect(logged).toContain(`Unhandled event: ${resourceType}.delete`);
      else expect(logged).not.toContain('Unhandled');
    } finally {
      log.mockRestore();
    }
  });

  it('rejects verified but invalid JSON', async () => {
    const body = '{not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });
});
