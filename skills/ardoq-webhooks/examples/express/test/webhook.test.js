const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing the app
process.env.ARDOQ_WEBHOOK_SECRET = 'test_ardoq_signing_secret';
delete process.env.ARDOQ_WEBHOOK_TOLERANCE_SECONDS;

const { app, verifyArdoqSignature, handleArdoqEvent } = require('../src/index');

const SECRET = process.env.ARDOQ_WEBHOOK_SECRET;

/**
 * Compute Ardoq's digest: HMAC-SHA256(secret, "<timestamp>.<raw body>"), hex.
 * Built from bytes, like the verifier, so non-UTF-8 bodies sign correctly.
 */
function digest(body, timestamp, secret = SECRET) {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), Buffer.from(body)]))
    .digest('hex');
}

function sign(body, timestamp = nowSeconds(), secret = SECRET) {
  return {
    'x-ardoq-signature-256': `sha256=${digest(body, timestamp, secret)}`,
    'x-ardoq-timestamp': timestamp,
  };
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000).toString();
}

// Documented sample payload (Ardoq help article, "Request Format")
const tagEvent = {
  'resource-type': 'tag',
  'resource-id': 'cf73fa1e257fdb6a576540e9',
  'event-type': 'create',
  organization: 'a8574eb78e6293348cae2d0f',
  'organization-label': 'usertesting',
  data: {
    description: '',
    _id: 'cf73fa1e257fdb6a576540e9',
    name: 'Test-tag',
    components: ['e0a1be808bc264be4ed3fd2c'],
    references: [],
    _version: 1,
    ardoq: { 'entity-type': 'tag' },
  },
};

// Component and reference payloads share the envelope; their `data` is trimmed
const componentEvent = {
  ...tagEvent,
  'resource-type': 'component',
  'resource-id': 'e0a1be808bc264be4ed3fd2c',
  data: { _id: 'e0a1be808bc264be4ed3fd2c', name: 'Billing API', ardoq: { 'entity-type': 'component' } },
};
const referenceEvent = {
  ...tagEvent,
  'resource-type': 'reference',
  'resource-id': 'a1b2c3d4e5f60718293a4b5c',
  data: { _id: 'a1b2c3d4e5f60718293a4b5c', ardoq: { 'entity-type': 'reference' } },
};

function post(body, headers, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/ardoq')
    .set('Content-Type', contentType)
    .set(headers)
    .send(body);
}

describe('verifyArdoqSignature', () => {
  const body = Buffer.from(JSON.stringify(tagEvent));
  const ts = '1729162486';
  const good = digest(body, ts);

  it('accepts the sha256= prefixed digest', () => {
    expect(verifyArdoqSignature(body, `sha256=${good}`, ts, SECRET, 0)).toBe(true);
  });

  it('accepts the bare digest without the prefix', () => {
    expect(verifyArdoqSignature(body, good, ts, SECRET, 0)).toBe(true);
  });

  it('accepts an uppercase hex digest (hex is case-insensitive)', () => {
    expect(verifyArdoqSignature(body, `sha256=${good.toUpperCase()}`, ts, SECRET, 0)).toBe(true);
  });

  it('rejects missing or empty headers and secret', () => {
    expect(verifyArdoqSignature(body, undefined, ts, SECRET, 0)).toBe(false);
    expect(verifyArdoqSignature(body, '', ts, SECRET, 0)).toBe(false);
    expect(verifyArdoqSignature(body, `sha256=${good}`, undefined, SECRET, 0)).toBe(false);
    expect(verifyArdoqSignature(body, `sha256=${good}`, '', SECRET, 0)).toBe(false);
    expect(verifyArdoqSignature(body, `sha256=${good}`, ts, undefined, 0)).toBe(false);
  });

  it('rejects a wrong secret, tampered body, or different timestamp', () => {
    expect(verifyArdoqSignature(body, `sha256=${good}`, ts, 'other_secret', 0)).toBe(false);
    expect(verifyArdoqSignature(Buffer.from('{}'), `sha256=${good}`, ts, SECRET, 0)).toBe(false);
    expect(verifyArdoqSignature(body, `sha256=${good}`, '1729162487', SECRET, 0)).toBe(false);
  });

  it('does not trim or reformat the timestamp header', () => {
    expect(verifyArdoqSignature(body, `sha256=${good}`, `${ts} `, SECRET, 0)).toBe(false);
  });

  it('rejects malformed digests without decoding them', () => {
    expect(verifyArdoqSignature(body, `sha256=${good.slice(0, 62)}`, ts, SECRET, 0)).toBe(false);
    expect(verifyArdoqSignature(body, `sha256=${good}00`, ts, SECRET, 0)).toBe(false);
    // 64 characters, but not all hex
    expect(verifyArdoqSignature(body, `sha256=${'zz'}${good.slice(2)}`, ts, SECRET, 0)).toBe(false);
    expect(verifyArdoqSignature(body, `sha1=${good}`, ts, SECRET, 0)).toBe(false);
    expect(verifyArdoqSignature(body, 'sha256=', ts, SECRET, 0)).toBe(false);
  });

  it('verifies the exact bytes, including a non-UTF-8 body', () => {
    const bytes = Buffer.concat([Buffer.from('{"a":"'), Buffer.from([0xff, 0xfe]), Buffer.from('"}')]);
    expect(verifyArdoqSignature(bytes, `sha256=${digest(bytes, ts)}`, ts, SECRET, 0)).toBe(true);
  });

  it('does not reject old timestamps by default (tolerance off)', () => {
    expect(verifyArdoqSignature(body, `sha256=${good}`, ts, SECRET)).toBe(true);
  });

  describe('opt-in tolerance', () => {
    it('rejects a stale timestamp when enabled', () => {
      const old = (Math.floor(Date.now() / 1000) - 3600).toString();
      const sig = `sha256=${digest(body, old)}`;
      expect(verifyArdoqSignature(body, sig, old, SECRET, 300)).toBe(false);
      expect(verifyArdoqSignature(body, sig, old, SECRET, 7200)).toBe(true);
    });

    it('accepts a fresh timestamp and rejects a non-numeric one', () => {
      const now = nowSeconds();
      expect(verifyArdoqSignature(body, `sha256=${digest(body, now)}`, now, SECRET, 300)).toBe(true);
      expect(verifyArdoqSignature(body, `sha256=${digest(body, 'abc')}`, 'abc', SECRET, 300)).toBe(false);
    });

    it('is driven by ARDOQ_WEBHOOK_TOLERANCE_SECONDS', () => {
      const old = (Math.floor(Date.now() / 1000) - 3600).toString();
      const sig = `sha256=${digest(body, old)}`;
      process.env.ARDOQ_WEBHOOK_TOLERANCE_SECONDS = '300';
      try {
        expect(verifyArdoqSignature(body, sig, old, SECRET)).toBe(false);
      } finally {
        delete process.env.ARDOQ_WEBHOOK_TOLERANCE_SECONDS;
      }
    });
  });
});

describe('handleArdoqEvent', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockRestore());

  it('dispatches component, reference and tag events', () => {
    expect(handleArdoqEvent(componentEvent)).toBe('component:create');
    expect(handleArdoqEvent(referenceEvent)).toBe('reference:create');
    expect(handleArdoqEvent(tagEvent)).toBe('tag:create');
  });

  it('reports an unknown resource-type as unhandled', () => {
    expect(handleArdoqEvent({ 'resource-type': 'dashboard', 'event-type': 'update' })).toBe(
      'unhandled:dashboard'
    );
  });
});

describe('POST /webhooks/ardoq', () => {
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
    ['tag', tagEvent],
    ['component', componentEvent],
    ['reference', referenceEvent],
  ])('returns 200 for a signed %s event', async (_name, event) => {
    const body = JSON.stringify(event);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('returns 200 for an unhandled resource-type', async () => {
    const body = JSON.stringify({ ...tagEvent, 'resource-type': 'dashboard' });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('verifies the bytes whatever the content type', async () => {
    const body = JSON.stringify(tagEvent);
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects a body that was re-serialized after signing', async () => {
    const original = JSON.stringify(tagEvent);
    const pretty = JSON.stringify(tagEvent, null, 2);
    const res = await post(pretty, sign(original));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the signature header is missing', async () => {
    const body = JSON.stringify(tagEvent);
    const res = await post(body, { 'x-ardoq-timestamp': nowSeconds() });
    expect(res.status).toBe(401);
  });

  it('returns 401 when the timestamp header is missing', async () => {
    const body = JSON.stringify(tagEvent);
    const res = await post(body, { 'x-ardoq-signature-256': sign(body)['x-ardoq-signature-256'] });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a signature made with the wrong secret', async () => {
    const body = JSON.stringify(tagEvent);
    const res = await post(body, sign(body, nowSeconds(), 'wrong_secret'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed signature', async () => {
    const body = JSON.stringify(tagEvent);
    const res = await post(body, {
      'x-ardoq-signature-256': 'sha256=not-a-digest',
      'x-ardoq-timestamp': nowSeconds(),
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
