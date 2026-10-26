const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing the app
process.env.HUME_WEBHOOK_SECRET = 'test_hume_webhook_signing_key';
delete process.env.HUME_WEBHOOK_TOLERANCE_SECONDS;

const { app, verifyHumeSignature, handleHumeEvent } = require('../src/index');

const SECRET = process.env.HUME_WEBHOOK_SECRET;

/**
 * Compute Hume's digest: HMAC-SHA256(signing key, "<raw body>.<timestamp>"), hex.
 * Built from bytes, like the verifier, so non-UTF-8 bodies sign correctly.
 */
function digest(body, timestamp, secret = SECRET) {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(body), Buffer.from('.'), Buffer.from(timestamp, 'latin1')]))
    .digest('hex');
}

function sign(body, timestamp = nowSeconds(), secret = SECRET) {
  return {
    'x-hume-ai-webhook-signature': digest(body, timestamp, secret),
    'x-hume-ai-webhook-timestamp': timestamp,
  };
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000).toString();
}

// Documented sample payloads (Hume docs, "Webhooks")
const chatStarted = {
  event_name: 'chat_started',
  chat_group_id: '9fc18597-3567-42d5-94d6-935bde84bf2f',
  chat_id: '470a49f6-1dec-4afe-8b61-035d3b2d63b0',
  config_id: '1b60e1a0-cc59-424a-8d2c-189d354db3f3',
  caller_number: null,
  custom_session_id: null,
  start_time: 1716244940648,
  chat_start_type: 'new_chat_group',
};
const chatEnded = {
  event_name: 'chat_ended',
  chat_group_id: '9fc18597-3567-42d5-94d6-935bde84bf2f',
  chat_id: '470a49f6-1dec-4afe-8b61-035d3b2d63b0',
  config_id: '1b60e1a0-cc59-424a-8d2c-189d354db3f3',
  caller_number: null,
  custom_session_id: null,
  end_time: 1716244958546,
  duration_seconds: 180,
  end_reason: 'USER_ENDED',
};
const toolCall = {
  event_name: 'tool_call',
  chat_group_id: '9fc18597-3567-42d5-94d6-935bde84bf2f',
  chat_id: '470a49f6-1dec-4afe-8b61-035d3b2d63b0',
  config_id: '1b60e1a0-cc59-424a-8d2c-189d354db3f3',
  caller_number: null,
  custom_session_id: 'string',
  timestamp: 1716244958546,
  tool_call_message: {
    name: 'get_current_weather',
    parameters: '{"format": "fahrenheit", "location": "San Francisco, CA"}',
    response_required: true,
    tool_call_id: 'd20827af-5d8d-4f66-b6b9-ce2e3e1ea2b2',
    tool_type: 'function',
  },
};

function post(body, headers, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/hume')
    .set('Content-Type', contentType)
    .set(headers)
    .send(body);
}

describe('verifyHumeSignature', () => {
  const body = Buffer.from(JSON.stringify(chatStarted));
  const ts = '1716244940';
  const good = digest(body, ts);

  it('accepts the bare lowercase hex digest', () => {
    expect(verifyHumeSignature(body, good, ts, SECRET, 0)).toBe(true);
  });

  it('accepts an uppercase hex digest (hex is case-insensitive)', () => {
    expect(verifyHumeSignature(body, good.toUpperCase(), ts, SECRET, 0)).toBe(true);
  });

  it('signs body first, then a period, then the timestamp', () => {
    const reversed = crypto
      .createHmac('sha256', SECRET)
      .update(Buffer.concat([Buffer.from(ts), Buffer.from('.'), body]))
      .digest('hex');
    expect(verifyHumeSignature(body, reversed, ts, SECRET, 0)).toBe(false);
  });

  it('rejects missing or empty headers and secret', () => {
    expect(verifyHumeSignature(body, undefined, ts, SECRET, 0)).toBe(false);
    expect(verifyHumeSignature(body, '', ts, SECRET, 0)).toBe(false);
    expect(verifyHumeSignature(body, good, undefined, SECRET, 0)).toBe(false);
    expect(verifyHumeSignature(body, good, '', SECRET, 0)).toBe(false);
    expect(verifyHumeSignature(body, good, ts, undefined, 0)).toBe(false);
  });

  it('rejects a wrong secret, tampered body, or different timestamp', () => {
    expect(verifyHumeSignature(body, good, ts, 'other_secret', 0)).toBe(false);
    expect(verifyHumeSignature(Buffer.from('{}'), good, ts, SECRET, 0)).toBe(false);
    expect(verifyHumeSignature(body, good, '1716244941', SECRET, 0)).toBe(false);
  });

  it('does not trim or reformat the timestamp header', () => {
    expect(verifyHumeSignature(body, good, `${ts} `, SECRET, 0)).toBe(false);
  });

  it('rejects malformed digests without decoding them', () => {
    expect(verifyHumeSignature(body, good.slice(0, 62), ts, SECRET, 0)).toBe(false);
    expect(verifyHumeSignature(body, `${good}00`, ts, SECRET, 0)).toBe(false);
    // 64 characters, but not all hex
    expect(verifyHumeSignature(body, `zz${good.slice(2)}`, ts, SECRET, 0)).toBe(false);
    // A prefix is not part of Hume's format
    expect(verifyHumeSignature(body, `sha256=${good}`, ts, SECRET, 0)).toBe(false);
    expect(verifyHumeSignature(body, `${good}\n`, ts, SECRET, 0)).toBe(false);
  });

  it('verifies the exact bytes, including a non-UTF-8 body', () => {
    const bytes = Buffer.concat([Buffer.from('{"a":"'), Buffer.from([0xff, 0xfe]), Buffer.from('"}')]);
    expect(verifyHumeSignature(bytes, digest(bytes, ts), ts, SECRET, 0)).toBe(true);
  });

  it('does not reject old timestamps by default (tolerance off)', () => {
    expect(verifyHumeSignature(body, good, ts, SECRET)).toBe(true);
  });

  describe('opt-in tolerance', () => {
    it('rejects a stale timestamp when enabled', () => {
      const old = (Math.floor(Date.now() / 1000) - 3600).toString();
      const sig = digest(body, old);
      expect(verifyHumeSignature(body, sig, old, SECRET, 180)).toBe(false);
      expect(verifyHumeSignature(body, sig, old, SECRET, 7200)).toBe(true);
    });

    it('accepts a fresh timestamp and rejects a non-numeric one', () => {
      const now = nowSeconds();
      expect(verifyHumeSignature(body, digest(body, now), now, SECRET, 180)).toBe(true);
      expect(verifyHumeSignature(body, digest(body, 'abc'), 'abc', SECRET, 180)).toBe(false);
    });

    it('is driven by HUME_WEBHOOK_TOLERANCE_SECONDS', () => {
      const old = (Math.floor(Date.now() / 1000) - 3600).toString();
      const sig = digest(body, old);
      process.env.HUME_WEBHOOK_TOLERANCE_SECONDS = '180';
      try {
        expect(verifyHumeSignature(body, sig, old, SECRET)).toBe(false);
      } finally {
        delete process.env.HUME_WEBHOOK_TOLERANCE_SECONDS;
      }
    });
  });
});

describe('handleHumeEvent', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockRestore());

  it('dispatches chat_started, chat_ended and tool_call', () => {
    expect(handleHumeEvent(chatStarted)).toBe('chat_started');
    expect(handleHumeEvent(chatEnded)).toBe('chat_ended');
    expect(handleHumeEvent(toolCall)).toBe('tool_call');
  });

  it('reports an unknown event_name as unhandled', () => {
    expect(handleHumeEvent({ event_name: 'chat_paused' })).toBe('unhandled:chat_paused');
  });
});

describe('POST /webhooks/hume', () => {
  let logSpy;
  let errSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it.each([
    ['chat_started', chatStarted],
    ['chat_ended', chatEnded],
    ['tool_call', toolCall],
  ])('returns 200 for a signed %s event', async (_name, event) => {
    const body = JSON.stringify(event);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('returns 200 for an unhandled event_name', async () => {
    const body = JSON.stringify({ ...chatStarted, event_name: 'chat_paused' });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('verifies the bytes whatever the content type', async () => {
    const body = JSON.stringify(chatStarted);
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects a body that was re-serialized after signing', async () => {
    const original = JSON.stringify(chatStarted);
    const pretty = JSON.stringify(chatStarted, null, 2);
    const res = await post(pretty, sign(original));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the signature header is missing', async () => {
    const body = JSON.stringify(chatStarted);
    const res = await post(body, { 'x-hume-ai-webhook-timestamp': nowSeconds() });
    expect(res.status).toBe(401);
  });

  it('returns 401 when the timestamp header is missing', async () => {
    const body = JSON.stringify(chatStarted);
    const res = await post(body, {
      'x-hume-ai-webhook-signature': sign(body)['x-hume-ai-webhook-signature'],
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a signature made with the wrong secret', async () => {
    const body = JSON.stringify(chatStarted);
    const res = await post(body, sign(body, nowSeconds(), 'wrong_secret'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed signature', async () => {
    const body = JSON.stringify(chatStarted);
    const res = await post(body, {
      'x-hume-ai-webhook-signature': 'not-a-digest',
      'x-hume-ai-webhook-timestamp': nowSeconds(),
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a correctly signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a correctly signed JSON body that is not an object', async () => {
    const body = '[1,2]';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
