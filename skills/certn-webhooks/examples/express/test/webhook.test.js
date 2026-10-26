const request = require('supertest');
const crypto = require('crypto');

// Certn's signing secret is used as-is, as UTF-8; this one is only for tests
const SECRET = 'test_certn_signing_secret_3b7d';
process.env.CERTN_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

function v1For(body, timestamp, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

// Certn puts a space after each comma: t=<ts>, v1=<hex>
function sign(body, timestamp = Math.floor(Date.now() / 1000), secret = SECRET) {
  return `t=${timestamp}, v1=${v1For(body, timestamp, secret)}`;
}

// Content-Type is deliberately varied: verification must not depend on it
function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/certn').set('Content-Type', contentType);
  if (signature !== undefined) req.set('Certn-Signature', signature);
  return req.send(body);
}

const complete = JSON.stringify({
  id: '1ba124f1-d473-44c0-a066-d623b2cb6253',
  applicant_type: 'Standard',
  report_status: 'COMPLETE',
  result: 'CLEARED',
  result_label: 'Cleared',
  check_executions: [{ id: 'check_exec_SYS5AS3GLcZZpo0i1GfNXQ', check_name: 'criminal_record_check', status: 'COMPLETE' }],
});
const inProgress = JSON.stringify({ id: 'a1', report_status: 'IN_PROGRESS', result: 'NONE' });

describe('Certn webhook signature verification', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.CERTN_TIMESTAMP_TOLERANCE_SECONDS;
    jest.restoreAllMocks();
  });

  it('accepts a valid Certn-Signature', async () => {
    const res = await post(complete, sign(complete));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts the header without a space after the comma', async () => {
    const t = Math.floor(Date.now() / 1000);
    expect((await post(complete, `t=${t},v1=${v1For(complete, t)}`)).status).toBe(200);
  });

  it('verifies regardless of Content-Type', async () => {
    expect((await post(complete, sign(complete), 'text/plain')).status).toBe(200);
  });

  it('accepts when any v1 matches (secret roll)', async () => {
    const t = Math.floor(Date.now() / 1000);
    const header = `t=${t}, v1=${v1For(complete, t, 'old_secret')}, v1=${v1For(complete, t)}`;
    expect((await post(complete, header)).status).toBe(200);
  });

  it('ignores schemes other than v1', async () => {
    const t = Math.floor(Date.now() / 1000);
    const header = `t=${t}, v0=${v1For(complete, t)}`;
    expect((await post(complete, header)).status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(complete)).status).toBe(400);
  });

  it('rejects a header with no t or no v1', async () => {
    const t = Math.floor(Date.now() / 1000);
    expect((await post(complete, `v1=${v1For(complete, t)}`)).status).toBe(400);
    expect((await post(complete, `t=${t}`)).status).toBe(400);
  });

  it('rejects a signature made with another secret', async () => {
    expect((await post(complete, sign(complete, undefined, 'wrong_secret'))).status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    expect((await post(complete.replace('CLEARED', 'NONE'), sign(complete))).status).toBe(400);
  });

  it('rejects non-hex or wrong-length v1 values without throwing', async () => {
    const t = Math.floor(Date.now() / 1000);
    expect((await post(complete, `t=${t}, v1=${'zz'.repeat(32)}`)).status).toBe(400);
    expect((await post(complete, `t=${t}, v1=abcd`)).status).toBe(400);
    expect((await post(complete, `t=${t}, v1=${v1For(complete, t)}00`)).status).toBe(400);
  });

  it('accepts an uppercase hex v1', async () => {
    const t = Math.floor(Date.now() / 1000);
    expect((await post(complete, `t=${t}, v1=${v1For(complete, t).toUpperCase()}`)).status).toBe(200);
  });

  it('accepts an old timestamp by default (retries and replays keep it)', async () => {
    const old = Math.floor(Date.now() / 1000) - 86400;
    expect((await post(complete, sign(complete, old))).status).toBe(200);
  });

  it('rejects an old timestamp when the window is opted in', async () => {
    process.env.CERTN_TIMESTAMP_TOLERANCE_SECONDS = '300';
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await post(complete, sign(complete, old))).status).toBe(400);
    expect((await post(complete, sign(complete))).status).toBe(200);
  });

  it('treats an invalid tolerance value as off', async () => {
    process.env.CERTN_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await post(complete, sign(complete, old))).status).toBe(200);
  });

  it('returns 400 for invalid JSON with a valid signature', async () => {
    const body = 'not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });
});

describe('Certn dispatch on report_status', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('handles COMPLETE', async () => {
    await post(complete, sign(complete));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('report complete: result CLEARED'));
  });

  it('handles IN_PROGRESS', async () => {
    await post(inProgress, sign(inProgress));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('report in progress'));
  });

  it('logs unknown statuses and still acknowledges', async () => {
    const body = JSON.stringify({ id: 'x', report_status: 'SOMETHING_NEW' });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unhandled report_status: SOMETHING_NEW'));
  });
});
