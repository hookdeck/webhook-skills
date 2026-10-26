const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'lodgix_test_secret';
process.env.LODGIX_WEBHOOK_SECRET = SECRET;
delete process.env.LODGIX_WEBHOOK_TOLERANCE_SECONDS;

const { app, verifyLodgixSignature } = require('../src/index');

// Illustrative payload: Lodgix does not document the body shape
const body = JSON.stringify({ message: { id: 'msg_123', text: 'Is early check-in possible?' } });

function sign(rawBody, timestamp, secret = SECRET) {
  const message = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), Buffer.from(rawBody)]);
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

const now = () => String(Math.floor(Date.now() / 1000));

function send({ rawBody = body, timestamp = now(), signature, event = 'message.received', contentType = 'application/json' } = {}) {
  const req = request(app).post('/webhooks/lodgix').set('Content-Type', contentType);
  if (timestamp !== null) req.set('X-Lodgix-Timestamp', timestamp);
  if (signature !== null) req.set('X-Lodgix-Signature', signature ?? `sha256=${sign(rawBody, timestamp)}`);
  req.set('X-Lodgix-Event', event).set('X-Lodgix-Delivery', 'dlv_1');
  return req.send(rawBody);
}

describe('Lodgix webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts a valid sha256= signature', async () => {
    const res = await send();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts the bare digest without prefix', async () => {
    const timestamp = now();
    expect((await send({ timestamp, signature: sign(body, timestamp) })).status).toBe(200);
  });

  it('accepts uppercase hex', async () => {
    const timestamp = now();
    expect((await send({ timestamp, signature: `sha256=${sign(body, timestamp).toUpperCase()}` })).status).toBe(200);
  });

  it('accepts any content type', async () => {
    expect((await send({ contentType: 'text/plain' })).status).toBe(200);
  });

  it('handles unknown events with 200', async () => {
    expect((await send({ event: 'reservation.created' })).status).toBe(200);
  });

  it('rejects a wrong secret', async () => {
    const timestamp = now();
    const res = await send({ timestamp, signature: `sha256=${sign(body, timestamp, 'other')}` });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const timestamp = now();
    const signature = `sha256=${sign(body, timestamp)}`;
    expect((await send({ rawBody: body + ' ', timestamp, signature })).status).toBe(401);
  });

  it('rejects a changed timestamp header', async () => {
    const signature = `sha256=${sign(body, '1700000000')}`;
    expect((await send({ timestamp: '1700000001', signature })).status).toBe(401);
  });

  it('rejects a missing signature', async () => {
    expect((await send({ signature: null })).status).toBe(401);
  });

  it('rejects a missing timestamp', async () => {
    expect((await send({ timestamp: null, signature: `sha256=${sign(body, '1')}` })).status).toBe(401);
  });

  it('rejects an empty signature', async () => {
    expect((await send({ signature: '' })).status).toBe(401);
  });

  it.each(['sha256=zz', `sha256=${'g'.repeat(64)}`, `sha256=${'a'.repeat(63)}`, `sha256=${'a'.repeat(65)}`])(
    'rejects malformed signature %s',
    async (signature) => {
      expect((await send({ signature })).status).toBe(401);
    }
  );

  it('returns 400 for invalid JSON with a valid signature', async () => {
    expect((await send({ rawBody: 'not json' })).status).toBe(400);
  });

  it('does not reject old timestamps by default', async () => {
    const timestamp = '1700000000';
    expect((await send({ timestamp })).status).toBe(200);
  });

  describe('opt-in tolerance', () => {
    afterEach(() => delete process.env.LODGIX_WEBHOOK_TOLERANCE_SECONDS);

    it('rejects an old timestamp when enabled', async () => {
      process.env.LODGIX_WEBHOOK_TOLERANCE_SECONDS = '300';
      expect((await send({ timestamp: '1700000000' })).status).toBe(401);
    });

    it('accepts a fresh timestamp when enabled', async () => {
      process.env.LODGIX_WEBHOOK_TOLERANCE_SECONDS = '300';
      expect((await send()).status).toBe(200);
    });
  });

  it('verifies non-UTF-8 body bytes exactly', () => {
    const raw = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
    const timestamp = '1700000000';
    const sig = `sha256=${sign(raw, timestamp)}`;
    expect(verifyLodgixSignature(raw, timestamp, sig, SECRET).valid).toBe(true);
  });
});
