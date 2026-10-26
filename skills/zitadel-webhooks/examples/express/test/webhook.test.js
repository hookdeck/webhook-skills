const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'zitadel_test_signing_key';
process.env.ZITADEL_WEBHOOK_SECRET = SECRET;

const { app, verifyZitadel } = require('../src/index');

// Same algorithm as ZITADEL: hex HMAC-SHA256 over "<t>.<raw body>", key = secret as UTF-8 bytes.
function sign(body, { secret = SECRET, t = String(Math.floor(Date.now() / 1000)) } = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const v1 = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.concat([Buffer.from(`${t}.`), buf]))
    .digest('hex');
  return { t, v1, header: `t=${t},v1=${v1}` };
}

const post = (body, header, contentType = 'application/json') => {
  const req = request(app).post('/webhooks/zitadel').set('Content-Type', contentType);
  if (header !== undefined) req.set('ZITADEL-Signature', header);
  return req.send(body);
};

const eventBody = JSON.stringify({
  aggregateID: '336494809936035843',
  aggregateType: 'user',
  instanceID: '336392597046034435',
  event_type: 'user.human.added',
  event_payload: { userName: 'mini@mouse.com', firstName: 'Minnie' },
});

describe('ZITADEL webhook', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.ZITADEL_WEBHOOK_TOLERANCE_SECONDS;
    process.env.ZITADEL_WEBHOOK_SECRET = SECRET;
  });

  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const res = await post(eventBody, sign(eventBody).header);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts any content type, verifying the exact bytes', async () => {
      const res = await post(eventBody, sign(eventBody).header, 'text/plain');
      expect(res.status).toBe(200);
    });

    it('verifies non-JSON-normalised bytes (whitespace and key order preserved)', async () => {
      const body = '{ "event_type" :  "session.added",\n  "aggregateType":"session" }';
      const res = await post(body, sign(body).header);
      expect(res.status).toBe(200);
    });

    it('verifies bodies that are not valid UTF-8 as bytes', () => {
      const body = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
      expect(verifyZitadel(body, sign(body).header, SECRET)).toBe(true);
    });

    it('uses the t value exactly as sent (no number round trip)', async () => {
      const t = '0001700000000';
      const res = await post(eventBody, sign(eventBody, { t }).header);
      expect(res.status).toBe(200);
    });

    it('accepts uppercase hex', async () => {
      const { t, v1 } = sign(eventBody);
      const res = await post(eventBody, `t=${t},v1=${v1.toUpperCase()}`);
      expect(res.status).toBe(200);
    });

    it('accepts when any v1 entry matches (key rotation) and ignores other keys', async () => {
      const { t, v1 } = sign(eventBody);
      const other = 'a'.repeat(64);
      expect((await post(eventBody, `t=${t},v1=${other},v1=${v1}`)).status).toBe(200);
      expect((await post(eventBody, `t=${t},v0=${other},v1=${v1}`)).status).toBe(200);
    });

    it('rejects a header that only has v0', async () => {
      const { t, v1 } = sign(eventBody);
      expect((await post(eventBody, `t=${t},v0=${v1}`)).status).toBe(401);
    });

    it('rejects a missing or empty header', async () => {
      expect((await post(eventBody)).status).toBe(401);
      expect((await post(eventBody, '')).status).toBe(401);
    });

    it('rejects a header with no t value', async () => {
      const { v1 } = sign(eventBody);
      expect((await post(eventBody, `v1=${v1}`)).status).toBe(401);
      expect((await post(eventBody, `t=,v1=${v1}`)).status).toBe(401);
    });

    it('rejects a wrong secret', async () => {
      const res = await post(eventBody, sign(eventBody, { secret: 'other_key' }).header);
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const res = await post(eventBody.replace('Minnie', 'Mallory'), sign(eventBody).header);
      expect(res.status).toBe(401);
    });

    it('rejects a different timestamp than the one signed', async () => {
      const { v1 } = sign(eventBody, { t: '1700000000' });
      expect((await post(eventBody, `t=1700000001,v1=${v1}`)).status).toBe(401);
    });

    it('rejects malformed signatures without throwing', async () => {
      const { t, v1 } = sign(eventBody);
      const bad = [
        v1.slice(0, 62), // too short
        v1 + '00', // too long
        'zz'.repeat(32), // right length, not hex
        `${v1.slice(0, 62)}  `, // padded
        '',
      ];
      for (const sig of bad) {
        expect((await post(eventBody, `t=${t},v1=${sig}`)).status).toBe(401);
      }
    });

    it('returns 500 when the secret is not configured', async () => {
      delete process.env.ZITADEL_WEBHOOK_SECRET;
      const res = await post(eventBody, sign(eventBody).header);
      expect(res.status).toBe(500);
    });
  });

  describe('timestamp tolerance (opt-in)', () => {
    const old = String(Math.floor(Date.now() / 1000) - 3600);

    it('does not reject old timestamps by default', async () => {
      expect((await post(eventBody, sign(eventBody, { t: old }).header)).status).toBe(200);
    });

    it('treats 0 and invalid values as off', async () => {
      for (const v of ['0', 'soon', '-5', '1.5']) {
        process.env.ZITADEL_WEBHOOK_TOLERANCE_SECONDS = v;
        expect((await post(eventBody, sign(eventBody, { t: old }).header)).status).toBe(200);
      }
    });

    it('rejects old timestamps when enabled', async () => {
      process.env.ZITADEL_WEBHOOK_TOLERANCE_SECONDS = '300';
      expect((await post(eventBody, sign(eventBody, { t: old }).header)).status).toBe(401);
    });

    it('accepts fresh timestamps when enabled', async () => {
      process.env.ZITADEL_WEBHOOK_TOLERANCE_SECONDS = '300';
      expect((await post(eventBody, sign(eventBody).header)).status).toBe(200);
    });

    it('rejects a non-numeric t when enabled', async () => {
      process.env.ZITADEL_WEBHOOK_TOLERANCE_SECONDS = '300';
      expect((await post(eventBody, sign(eventBody, { t: 'yesterday' }).header)).status).toBe(401);
    });
  });

  describe('payload handling', () => {
    const send = (obj) => {
      const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
      return post(body, sign(body).header);
    };

    it('handles event executions', async () => {
      expect((await send(eventBody)).status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Human user added (user/336494809936035843): mini@mouse.com');
      await send({ event_type: 'session.added', aggregateType: 'session', aggregateID: 's1' });
      expect(logSpy).toHaveBeenCalledWith('Session added (session/s1)');
    });

    it('decodes a base64 event_payload', async () => {
      const event_payload = Buffer.from(JSON.stringify({ userName: 'b64@example.com' })).toString('base64');
      await send({ event_type: 'user.human.added', aggregateType: 'user', aggregateID: 'u1', event_payload });
      expect(logSpy).toHaveBeenCalledWith('Human user added (user/u1): b64@example.com');
    });

    it('handles request/response and function executions', async () => {
      expect((await send({ fullMethod: '/zitadel.user.v2.UserService/CreateUser' })).status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Request/response execution: /zitadel.user.v2.UserService/CreateUser');
      expect((await send({ function: 'function/preuserinfo' })).status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Function execution: function/preuserinfo');
    });

    it('acknowledges unknown event types', async () => {
      expect((await send({ event_type: 'org.added' })).status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled event: org.added');
    });

    it('returns 400 for a signed body that is not JSON', async () => {
      expect((await send('not json')).status).toBe(400);
    });

    it('returns 400 when the JSON is not an object', async () => {
      expect((await send('[1,2]')).status).toBe(400);
      expect((await send('null')).status).toBe(400);
      expect((await send('"text"')).status).toBe(400);
    });

    it('never 500s on wrong-typed fields', async () => {
      const bodies = [
        { event_type: 5 },
        { event_type: 'user.human.added', event_payload: 7 },
        { event_type: 'user.human.added', event_payload: ['x'] },
        { event_type: 'user.human.added', event_payload: '%%%not-base64-json%%%' },
        { event_type: 'user.human.added', event_payload: { userName: { a: 1 } }, aggregateType: [], aggregateID: {} },
        { fullMethod: ['x'] },
        { function: { a: 1 } },
        {},
      ];
      for (const b of bodies) {
        expect((await send(b)).status).toBe(200);
      }
    });
  });
});
