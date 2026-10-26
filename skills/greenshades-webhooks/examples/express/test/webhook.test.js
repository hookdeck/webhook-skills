const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'my-secret-hmac-key';
process.env.GREENSHADES_WEBHOOK_SECRET = SECRET;

const { app, buildSignedContent } = require('../src/index');

// Independent signer: HMAC-SHA256 over timestamp + LF + body, lowercase hex
function sign(body, timestamp, secret = SECRET) {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from([0x0a]), body]))
    .digest('hex');
}

const TS = '2026-10-26T12:00:00Z';
const body = Buffer.from(JSON.stringify({ eventName: 'employee.updated', employeeId: 42 }));

function send(method, buf, headers = {}) {
  const req = request(app)[method]('/webhooks/greenshades');
  for (const [k, v] of Object.entries({ 'Content-Type': 'application/json', ...headers })) {
    if (v !== undefined) req.set(k, v);
  }
  // Identity serializer so superagent sends the Buffer bytes untouched (it would JSON-encode a Buffer)
  return buf === undefined ? req : req.serialize((b) => b).send(buf);
}

const signed = (buf, ts = TS) => ({ 'X-GS-TIMESTAMP': ts, 'X-GS-SIGNATURE': sign(buf, ts) });

describe('Greenshades webhook', () => {
  beforeEach(() => {
    delete process.env.GREENSHADES_WEBHOOK_TOLERANCE_SECONDS;
    process.env.GREENSHADES_WEBHOOK_SECRET = SECRET;
  });

  describe('signed content', () => {
    it('joins timestamp and body with a real 0x0A byte, not backslash-n', () => {
      const content = buildSignedContent(TS, body);
      expect(content.includes(0x0a)).toBe(true);
      expect(content.includes(Buffer.from('\\n'))).toBe(false);
      expect(content.subarray(0, TS.length + 1).toString('latin1')).toBe(`${TS}\n`);
      expect(content.subarray(TS.length + 1).equals(body)).toBe(true);
    });
  });

  describe('valid signatures', () => {
    it.each(['post', 'put', 'patch'])('accepts a signed %s', async (method) => {
      const res = await send(method, body, signed(body));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it.each(['get', 'delete'])('accepts a signed %s with an empty body', async (method) => {
      const empty = Buffer.alloc(0);
      const res = await send(method, undefined, signed(empty));
      expect(res.status).toBe(200);
    });

    it('accepts any content type (raw bytes are verified)', async () => {
      const text = Buffer.from('{"eventName":"payRun.completed"}');
      const res = await send('post', text, { ...signed(text), 'Content-Type': 'text/plain' });
      expect(res.status).toBe(200);
    });

    it('accepts uppercase hex', async () => {
      const h = signed(body);
      h['X-GS-SIGNATURE'] = h['X-GS-SIGNATURE'].toUpperCase();
      expect((await send('post', body, h)).status).toBe(200);
    });

    it('signs the UTF-8 body bytes for a non-ASCII body', async () => {
      const utf8 = Buffer.from(JSON.stringify({ eventName: 'employee.added', name: 'Zoë Müller' }), 'utf8');
      expect((await send('post', utf8, signed(utf8))).status).toBe(200);
    });

    it('accepts an event name it has no handler for', async () => {
      const b = Buffer.from(JSON.stringify({ eventName: 'something.else' }));
      expect((await send('post', b, signed(b))).status).toBe(200);
    });
  });

  describe('invalid signatures', () => {
    it('rejects a missing signature', async () => {
      expect((await send('post', body, { 'X-GS-TIMESTAMP': TS })).status).toBe(401);
    });

    it('rejects a missing timestamp', async () => {
      const res = await send('post', body, { 'X-GS-SIGNATURE': sign(body, TS) });
      expect(res.status).toBe(401);
    });

    it('rejects an empty signature', async () => {
      expect((await send('post', body, { 'X-GS-TIMESTAMP': TS, 'X-GS-SIGNATURE': '' })).status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const res = await send('post', Buffer.from('{"eventName":"employee.added"}'), signed(body));
      expect(res.status).toBe(401);
    });

    it('rejects a different timestamp', async () => {
      const res = await send('post', body, { ...signed(body), 'X-GS-TIMESTAMP': '2026-10-26T12:00:01Z' });
      expect(res.status).toBe(401);
    });

    it('rejects a signature made with a literal backslash-n separator', async () => {
      const bad = crypto
        .createHmac('sha256', SECRET)
        .update(Buffer.concat([Buffer.from(`${TS}\\n`), body]))
        .digest('hex');
      const res = await send('post', body, { 'X-GS-TIMESTAMP': TS, 'X-GS-SIGNATURE': bad });
      expect(res.status).toBe(401);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const res = await send('post', body, { 'X-GS-TIMESTAMP': TS, 'X-GS-SIGNATURE': sign(body, TS, 'other') });
      expect(res.status).toBe(401);
    });

    it.each([
      ['too short', 'ab'.repeat(31)],
      ['too long', 'ab'.repeat(33)],
      ['non-hex', 'zz'.repeat(32)],
      ['prefixed', `sha256=${'ab'.repeat(32)}`],
      ['padded', ` ${'ab'.repeat(32)}`]
    ])('rejects a malformed signature (%s)', async (_label, sig) => {
      const res = await send('post', body, { 'X-GS-TIMESTAMP': TS, 'X-GS-SIGNATURE': sig });
      expect(res.status).toBe(401);
    });

    it('does not verify the body of an unsigned empty GET', async () => {
      expect((await send('get', undefined, {})).status).toBe(401);
    });
  });

  describe('timestamp tolerance (opt-in)', () => {
    const oldTs = String(Math.floor(Date.now() / 1000) - 3600);

    it('is off by default: an old timestamp is accepted', async () => {
      expect((await send('post', body, signed(body, oldTs))).status).toBe(200);
    });

    it('rejects an old timestamp when enabled', async () => {
      process.env.GREENSHADES_WEBHOOK_TOLERANCE_SECONDS = '300';
      expect((await send('post', body, signed(body, oldTs))).status).toBe(401);
    });

    it('accepts a fresh timestamp when enabled', async () => {
      process.env.GREENSHADES_WEBHOOK_TOLERANCE_SECONDS = '300';
      const fresh = String(Math.floor(Date.now() / 1000));
      expect((await send('post', body, signed(body, fresh))).status).toBe(200);
    });

    it('treats 0 as off', async () => {
      process.env.GREENSHADES_WEBHOOK_TOLERANCE_SECONDS = '0';
      expect((await send('post', body, signed(body, oldTs))).status).toBe(200);
    });
  });

  describe('other behavior', () => {
    it('returns 400 for a validly signed body that is not JSON', async () => {
      const b = Buffer.from('not json');
      expect((await send('post', b, signed(b))).status).toBe(400);
    });

    it('returns 500 when the secret is not configured', async () => {
      delete process.env.GREENSHADES_WEBHOOK_SECRET;
      expect((await send('post', body, signed(body))).status).toBe(500);
    });
  });
});
