const request = require('supertest');
const crypto = require('crypto');

// Nooks signing keys look like nooks-webhook-signing-key-...; used as-is. This one is only for tests
const SECRET = 'nooks-webhook-signing-key-test8f3a1c';
process.env.NOOKS_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

// t is Unix milliseconds; s is base64 HMAC-SHA256 of "<t>.<raw body>"
function sign(body, timestamp = Date.now(), secret = SECRET) {
  const s = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('base64');
  return `t=${timestamp},s=${s}`;
}

// Content-Type is deliberately varied: verification must not depend on it
function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/nooks').set('Content-Type', contentType);
  if (signature !== undefined) req.set('x-webhook-signature', signature);
  return req.send(body);
}

const callLogged = JSON.stringify({
  event: 'call.logged',
  eventId: 'ed573041-57e9-4ef6-9976-bb759761c2a7-#-22216d73-1351-4e4b-ae0c-64d7fc46b8c1',
  occurredAt: '2025-12-09T04:06:36.145Z',
  callData: {
    callId: 'ed573041-57e9-4ef6-9976-bb759761c2a7',
    workspaceId: 'cUvwa9fcNtE1G7vy',
    status: 'completed',
    userData: { userId: 'test-user-id', email: 'test-user-email', name: 'test-user-name' },
    prospectData: { prospectId: '0056s00000D1gRtAAJ', name: 'Jane Smith', phoneNumber: '+14155551234', email: 'jane.smith@acme.com', linkedInUrl: null },
    accountData: { accountId: 'test-account-id', name: 'test-account-name' },
    callDirection: 'inbound',
    disposition: { id: 'test-disposition-id', name: 'Connected' },
    startedAt: '2025-12-09T02:54:29.170Z',
    durationSeconds: 100,
    recordingUrl: null,
    notes: null,
    transcriptUrl: null,
    sequenceData: null,
  },
});

describe('Nooks webhook signature verification', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.NOOKS_TIMESTAMP_TOLERANCE_SECONDS;
    jest.restoreAllMocks();
  });

  it('accepts a valid x-webhook-signature and handles call.logged', async () => {
    const res = await post(callLogged, sign(callLogged));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Call ed573041-57e9-4ef6-9976-bb759761c2a7 logged: completed'));
  });

  it('verifies regardless of Content-Type', async () => {
    const res = await post(callLogged, sign(callLogged), 'text/plain');
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('logged'));
  });

  it('accepts a signature that ends in "=" padding (split on the first "=" only)', async () => {
    // Find a body whose base64 signature ends in '=' to prove the parser keeps the padding
    let body, header;
    for (let i = 0; ; i++) {
      body = JSON.stringify({ event: 'call.logged', n: i });
      header = sign(body);
      if (header.endsWith('=')) break;
    }
    const res = await post(body, header);
    expect(res.status).toBe(200);
  });

  it('rejects an unsigned request by default', async () => {
    const res = await post(callLogged, undefined);
    expect(res.status).toBe(401);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Call '));
  });

  it('acknowledges an unsigned activation ping without processing it when NOOKS_ACCEPT_UNSIGNED_PING=true', async () => {
    process.env.NOOKS_ACCEPT_UNSIGNED_PING = 'true';
    delete process.env.NOOKS_WEBHOOK_SECRET; // no signing key exists before activation
    try {
      const res = await post(callLogged, undefined);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Call '));
      const empty = await request(app).post('/webhooks/nooks');
      expect(empty.status).toBe(200);
    } finally {
      delete process.env.NOOKS_ACCEPT_UNSIGNED_PING;
      process.env.NOOKS_WEBHOOK_SECRET = SECRET;
    }
  });

  it('still verifies signed requests when NOOKS_ACCEPT_UNSIGNED_PING=true', async () => {
    process.env.NOOKS_ACCEPT_UNSIGNED_PING = 'true';
    try {
      const res = await post(callLogged, sign(callLogged, undefined, 'other_key'));
      expect(res.status).toBe(401);
    } finally {
      delete process.env.NOOKS_ACCEPT_UNSIGNED_PING;
    }
  });

  it('rejects a tampered body', async () => {
    const res = await post(callLogged.replace('completed', 'failed'), sign(callLogged));
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the wrong key', async () => {
    const res = await post(callLogged, sign(callLogged, undefined, 'other_key'));
    expect(res.status).toBe(401);
  });

  it('rejects a timestamp that does not match the signed one', async () => {
    const header = sign(callLogged, 1700000000000);
    const res = await post(callLogged, header.replace('t=1700000000000', 't=1700000000001'));
    expect(res.status).toBe(401);
  });

  it('rejects malformed headers', async () => {
    for (const header of ['garbage', 't=123', 's=abc', 't=abc,s=abc', 't=,s=', ',,,', 't=1e3,s=abc']) {
      const res = await post(callLogged, header);
      expect(res.status).toBe(401);
    }
  });

  it('rejects a signature with the wrong length without throwing', async () => {
    const res = await post(callLogged, `t=${Date.now()},s=AAAA`);
    expect(res.status).toBe(401);
  });

  it('does not leniently decode the header (extra base64 text is a mismatch)', async () => {
    const header = sign(callLogged);
    const res = await post(callLogged, `${header}AAAA`);
    expect(res.status).toBe(401);
  });

  it('rejects a non-ASCII signature with 401', async () => {
    const res = await post(callLogged, `t=${Date.now()},s=ñandú`);
    expect(res.status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });

  it('handles a validly signed JSON null body without a 500', async () => {
    const res = await post('null', sign('null'));
    expect(res.status).toBe(200);
  });

  it('logs unhandled event names', async () => {
    const body = JSON.stringify({ event: 'something.else' });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled event: something.else');
  });
});

describe('Timestamp window (opt-in)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.NOOKS_TIMESTAMP_TOLERANCE_SECONDS;
    jest.restoreAllMocks();
  });

  const hourAgo = () => Date.now() - 60 * 60 * 1000;

  it('is off by default: an hour-old (retried) timestamp still verifies', async () => {
    const res = await post(callLogged, sign(callLogged, hourAgo()));
    expect(res.status).toBe(200);
  });

  it('rejects an old timestamp once a tolerance is set', async () => {
    process.env.NOOKS_TIMESTAMP_TOLERANCE_SECONDS = '300';
    const res = await post(callLogged, sign(callLogged, hourAgo()));
    expect(res.status).toBe(401);
  });

  it('treats t as milliseconds: a fresh ms timestamp passes a 300 s window', async () => {
    process.env.NOOKS_TIMESTAMP_TOLERANCE_SECONDS = '300';
    const res = await post(callLogged, sign(callLogged, Date.now() - 60 * 1000));
    expect(res.status).toBe(200);
  });

  it('a widened window accepts the hour-old timestamp', async () => {
    process.env.NOOKS_TIMESTAMP_TOLERANCE_SECONDS = '86400';
    const res = await post(callLogged, sign(callLogged, hourAgo()));
    expect(res.status).toBe(200);
  });

  it('treats an invalid tolerance as off', async () => {
    process.env.NOOKS_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const res = await post(callLogged, sign(callLogged, hourAgo()));
    expect(res.status).toBe(200);
  });
});

describe('Configuration', () => {
  it('returns 500 when the signing key is not configured', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.NOOKS_WEBHOOK_SECRET;
    const res = await post(callLogged, sign(callLogged));
    process.env.NOOKS_WEBHOOK_SECRET = SECRET;
    jest.restoreAllMocks();
    expect(res.status).toBe(500);
  });
});
