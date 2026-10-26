const request = require('supertest');
const crypto = require('crypto');

// Agentcard endpoint secrets look like whsec_..., but the WHOLE string is the HMAC key (UTF-8).
// It is not base64 and the prefix is not stripped. This one is only for tests.
const SECRET = 'whsec_dGVzdF9hZ2VudGNhcmRfc2VjcmV0';
process.env.AGENTCARD_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

function v1For(body, timestamp, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function sign(body, timestamp = Math.floor(Date.now() / 1000), secret = SECRET) {
  return `t=${timestamp},v1=${v1For(body, timestamp, secret)}`;
}

// Content-Type is deliberately varied: verification must not depend on it
function post(body, signature, contentType = 'application/json', header = 'AgentCard-Signature') {
  const req = request(app).post('/webhooks/agentcard').set('Content-Type', contentType);
  if (signature !== undefined) req.set(header, signature);
  return req.send(body);
}

const envelope = (type, data) =>
  JSON.stringify({ id: 'evt_9f8e7d6c5b4a', type, created: 1757264400, livemode: false, data });

const cardCreated = envelope('card.created', { id: 'card_7h2k', last4: '7318', balance_cents: 1000, status: 'OPEN' });

describe('Agentcard webhook signature verification', () => {
  it('accepts a valid AgentCard-Signature', async () => {
    const res = await post(cardCreated, sign(cardCreated));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies regardless of Content-Type', async () => {
    expect((await post(cardCreated, sign(cardCreated), 'text/plain')).status).toBe(200);
  });

  it('uses the whole whsec_ secret as the key, not a base64-decoded one', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const decoded = Buffer.from(SECRET.slice('whsec_'.length), 'base64');
    const stripped = SECRET.slice('whsec_'.length);
    expect((await post(cardCreated, `t=${ts},v1=${v1For(cardCreated, ts, decoded)}`)).status).toBe(400);
    expect((await post(cardCreated, `t=${ts},v1=${v1For(cardCreated, ts, stripped)}`)).status).toBe(400);
  });

  it('allows a space after the comma in the header', async () => {
    const ts = Math.floor(Date.now() / 1000);
    expect((await post(cardCreated, `t=${ts}, v1=${v1For(cardCreated, ts)}`)).status).toBe(200);
  });

  it('accepts when any v1 matches (defensive parsing)', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const old = v1For(cardCreated, ts, 'whsec_old_secret');
    expect((await post(cardCreated, `t=${ts},v1=${old},v1=${v1For(cardCreated, ts)}`)).status).toBe(200);
    expect((await post(cardCreated, `t=${ts},v1=${v1For(cardCreated, ts)},v1=${old}`)).status).toBe(200);
    expect((await post(cardCreated, `t=${ts},v1=${old},v1=${old.replace(/.$/, '0')}`)).status).toBe(400);
  });

  it('accepts uppercase hex', async () => {
    const ts = Math.floor(Date.now() / 1000);
    expect((await post(cardCreated, `t=${ts},v1=${v1For(cardCreated, ts).toUpperCase()}`)).status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(cardCreated, undefined)).status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    expect((await post(cardCreated.replace('1000', '9000'), sign(cardCreated))).status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    expect((await post(cardCreated, sign(cardCreated, undefined, 'whsec_other'))).status).toBe(400);
  });

  it('rejects a v1 of the wrong length or invalid hex without throwing', async () => {
    const ts = 1700000000;
    expect((await post(cardCreated, `t=${ts},v1=abc`)).status).toBe(400);
    // 64 chars but not hex: Buffer.from(x, 'hex') would silently truncate it
    expect((await post(cardCreated, `t=${ts},v1=${'zz'.repeat(32)}`)).status).toBe(400);
    expect((await post(cardCreated, `t=${ts},v1=${'é'.repeat(64)}`)).status).toBe(400);
  });

  it('rejects headers with no t or no v1', async () => {
    const ts = Math.floor(Date.now() / 1000);
    expect((await post(cardCreated, `v1=${v1For(cardCreated, ts)}`)).status).toBe(400);
    expect((await post(cardCreated, `t=${ts}`)).status).toBe(400);
    expect((await post(cardCreated, 'garbage')).status).toBe(400);
    expect((await post(cardCreated, 't=abc,v1=deadbeef')).status).toBe(400);
  });

  it('rejects when the timestamp was altered after signing', async () => {
    const header = sign(cardCreated, 1700000000).replace('t=1700000000', 't=1700000001');
    expect((await post(cardCreated, header)).status).toBe(400);
  });

  it('ignores the legacy X-AgentCard-Signature header (body-only HMAC)', async () => {
    const legacy = 'sha256=' + crypto.createHmac('sha256', SECRET).update(cardCreated).digest('hex');
    expect((await post(cardCreated, legacy, 'application/json', 'X-AgentCard-Signature')).status).toBe(400);
  });

  it('accepts an old timestamp by default (retries and replays keep the original)', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await post(cardCreated, sign(cardCreated, old))).status).toBe(200);
  });

  it('rejects an old timestamp when AGENTCARD_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
    process.env.AGENTCARD_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      expect((await post(cardCreated, sign(cardCreated, old))).status).toBe(400);
      expect((await post(cardCreated, sign(cardCreated))).status).toBe(200);
    } finally {
      delete process.env.AGENTCARD_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  it('treats a non-numeric AGENTCARD_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', async () => {
    process.env.AGENTCARD_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      expect((await post(cardCreated, sign(cardCreated, old))).status).toBe(200);
    } finally {
      delete process.env.AGENTCARD_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });
});

describe('Agentcard events (dispatch on type)', () => {
  it.each([
    ['card.created', { id: 'card_7h2k', last4: '7318', balance_cents: 1000, status: 'OPEN' }],
    ['card.updated', { id: 'card_7h2k', last4: '7318', balance_cents: 325, status: 'OPEN' }],
    ['card.closed', { id: 'card_7h2k', last4: '7318', balance_cents: 0, status: 'CLOSED' }],
    ['transaction.authorized', { id: 'txn_3f9a', card_id: 'card_7h2k', amount: 675, amount_display: '$6.75', merchant: 'COFFEE SHOP #42' }],
    ['approval.requested', { approval_id: 'appr_4d5e6f', action: 'cross_app:close', expires_at: '2026-09-07T17:15:00Z' }],
    ['checkout_authorization.approved', { authorization_id: 'cauth_2q9d', amount_display: '$23.06', merchant: 'shop.example.com' }],
    ['balance.low', { card_id: 'card_7h2k', last4: '7318', balance_cents: 120 }],
    ['transaction.cleared', { id: 'txn_3f9a' }],
  ])('handles %s', async (type, data) => {
    const body = envelope(type, data);
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      const logged = log.mock.calls.map((c) => c[0]).join('\n');
      if (type === 'transaction.cleared') expect(logged).toContain(`Unhandled event: ${type}`);
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
