const request = require('supertest');
const crypto = require('crypto');

// Moneybird's webhook secret is an opaque string used as-is; this one is only for tests
const SECRET = 'test_moneybird_secret_8f3a1c';
process.env.MONEYBIRD_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

function digest(body, timestamp, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function sign(body, timestamp = Math.floor(Date.now() / 1000), secret = SECRET) {
  return `t=${timestamp},v1=${digest(body, timestamp, secret)}`;
}

// Content-Type is deliberately varied: verification must not depend on it
function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/moneybird').set('Content-Type', contentType);
  if (signature !== undefined) req.set('Moneybird-Signature', signature);
  return req.send(body);
}

const invoicePaid = JSON.stringify({
  administration_id: '116015326147118082',
  webhook_id: '116010948233266179',
  webhook_token: 'hPCNhskk1PwGC1pyJZMZmKNT',
  entity_type: 'SalesInvoice',
  entity_id: '116015245643744263',
  state: 'paid',
  action: 'sales_invoice_state_changed_to_paid',
  entity: { id: '116015245643744263', state: 'paid', currency: 'EUR' },
});

describe('Moneybird webhook signature verification', () => {
  it('accepts a valid Moneybird-Signature', async () => {
    const res = await post(invoicePaid, sign(invoicePaid));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies regardless of Content-Type', async () => {
    const res = await post(invoicePaid, sign(invoicePaid), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('accepts a space after the comma', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const res = await post(invoicePaid, `t=${ts}, v1=${digest(invoicePaid, ts)}`);
    expect(res.status).toBe(200);
  });

  it('accepts uppercase hex', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const res = await post(invoicePaid, `t=${ts},v1=${digest(invoicePaid, ts).toUpperCase()}`);
    expect(res.status).toBe(200);
  });

  it('accepts when any v1 matches (secret rotation), in either position', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const good = digest(invoicePaid, ts);
    const old = digest(invoicePaid, ts, 'previous_secret');
    expect((await post(invoicePaid, `t=${ts},v1=${old},v1=${good}`)).status).toBe(200);
    expect((await post(invoicePaid, `t=${ts},v1=${good},v1=${old}`)).status).toBe(200);
  });

  it('ignores signature schemes it does not recognise', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const res = await post(invoicePaid, `t=${ts},v2=${'a'.repeat(64)},v1=${digest(invoicePaid, ts)}`);
    expect(res.status).toBe(200);
    // ...and an unknown scheme alone is not enough
    expect((await post(invoicePaid, `t=${ts},v2=${digest(invoicePaid, ts)}`)).status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(invoicePaid, undefined)).status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const res = await post(invoicePaid.replace('paid', 'late'), sign(invoicePaid));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await post(invoicePaid, sign(invoicePaid, undefined, 'other_secret'));
    expect(res.status).toBe(400);
  });

  it('rejects when every v1 is wrong', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const res = await post(invoicePaid, `t=${ts},v1=${digest(invoicePaid, ts, 'a')},v1=${digest(invoicePaid, ts, 'b')}`);
    expect(res.status).toBe(400);
  });

  it('rejects a v1 of the wrong length or with invalid hex without throwing', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const good = digest(invoicePaid, ts);
    expect((await post(invoicePaid, `t=${ts},v1=abc`)).status).toBe(400);
    expect((await post(invoicePaid, `t=${ts},v1=${good}00`)).status).toBe(400);
    // 64 chars but not hex: must not be decoded leniently
    expect((await post(invoicePaid, `t=${ts},v1=${'zz' + good.slice(2)}`)).status).toBe(400);
    expect((await post(invoicePaid, `t=${ts},v1=`)).status).toBe(400);
  });

  it('rejects a malformed header', async () => {
    const ts = Math.floor(Date.now() / 1000);
    expect((await post(invoicePaid, 'garbage')).status).toBe(400);
    expect((await post(invoicePaid, 't=abc,v1=deadbeef')).status).toBe(400);
    expect((await post(invoicePaid, `v1=${digest(invoicePaid, ts)}`)).status).toBe(400); // no t
    expect((await post(invoicePaid, `t=${ts}`)).status).toBe(400); // no v1
  });

  it('rejects when the timestamp was altered after signing', async () => {
    const header = sign(invoicePaid, 1700000000).replace('t=1700000000', 't=1700000001');
    expect((await post(invoicePaid, header)).status).toBe(400);
  });

  it('accepts an old timestamp by default (retries and replays keep the original)', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await post(invoicePaid, sign(invoicePaid, old))).status).toBe(200);
  });

  it('rejects an old timestamp when MONEYBIRD_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
    process.env.MONEYBIRD_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      expect((await post(invoicePaid, sign(invoicePaid, old))).status).toBe(400);
      expect((await post(invoicePaid, sign(invoicePaid))).status).toBe(200);
    } finally {
      delete process.env.MONEYBIRD_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  it('treats a non-numeric MONEYBIRD_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', async () => {
    process.env.MONEYBIRD_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      expect((await post(invoicePaid, sign(invoicePaid, old))).status).toBe(200);
    } finally {
      delete process.env.MONEYBIRD_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });
});

describe('Moneybird events (dispatch on action)', () => {
  it.each([
    'sales_invoice_created',
    'sales_invoice_state_changed_to_paid',
    'sales_invoice_state_changed_to_late',
    'contact_created',
    'contact_changed',
    'payment_registered',
    'estimate_created',
  ])('handles %s', async (action) => {
    const body = JSON.stringify({
      administration_id: '1', webhook_id: '2', entity_type: 'X', entity_id: '3',
      state: 'open', action, entity: { id: '3', company_name: 'Foobar Holding B.V.' },
    });
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      const logged = log.mock.calls.map((c) => c[0]).join('\n');
      if (action === 'estimate_created') expect(logged).toContain('Unhandled action: estimate_created');
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
