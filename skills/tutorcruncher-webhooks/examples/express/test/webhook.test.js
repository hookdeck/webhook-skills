const crypto = require('crypto');
const request = require('supertest');

// TutorCruncher signs with the integration's private API key (used as UTF-8 bytes, as-is).
const SECRET = 'test_tutorcruncher_private_api_key_0123456789';
process.env.TUTORCRUNCHER_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifyTutorCruncherSignature } = require('../src/index');

// Based on the documented CREATED_A_CONTRACTOR sample.
function samplePayload(action = 'CREATED_A_CONTRACTOR') {
  return {
    events: [
      {
        action,
        verb: 'Created a Tutor',
        timestamp: '2025-03-05T15:26:20.558919Z',
        branch: 590,
        actor: { name: 'Jane Smith', id: 1621, user_id: 1611, url: '' },
        extra_msg: 'Created via the API.',
        subject: {
          model: 'Tutor',
          url: 'https://app.tutorcruncher.com/api/contractors/1623/',
          id: 1623,
          status: 'approved',
          last_name: 'Gallagher',
          email: 'liam@example.com',
        },
      },
    ],
  };
}

// Bare lowercase hex HMAC-SHA256 of the raw body bytes: no prefix, id or timestamp.
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function post(body, headers = {}, method = 'post') {
  return request(app)[method]('/webhooks/tutorcruncher').set(headers).send(body);
}

describe('TutorCruncher webhook', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await post(body, { 'Content-Type': 'application/json', 'Webhook-Signature': sign(body) });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts an uppercase hex digest (hex is case-insensitive)', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await post(body, {
        'Content-Type': 'application/json',
        'Webhook-Signature': sign(body).toUpperCase(),
      });
      expect(res.status).toBe(200);
    });

    it('verifies the exact bytes, whatever the content type', async () => {
      const body = '{ "events" : [ ] }\n';
      const res = await post(body, { 'Content-Type': 'text/plain', 'Webhook-Signature': sign(body) });
      expect(res.status).toBe(200);
    });

    it('rejects a missing signature', async () => {
      const res = await post(JSON.stringify(samplePayload()), { 'Content-Type': 'application/json' });
      expect(res.status).toBe(401);
    });

    it('rejects an empty signature', async () => {
      const res = await post(JSON.stringify(samplePayload()), {
        'Content-Type': 'application/json',
        'Webhook-Signature': '',
      });
      expect(res.status).toBe(401);
    });

    it('rejects a signature made with the wrong key', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await post(body, {
        'Content-Type': 'application/json',
        'Webhook-Signature': sign(body, 'another_key'),
      });
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const body = JSON.stringify(samplePayload());
      const res = await post(body.replace('1623', '9999'), {
        'Content-Type': 'application/json',
        'Webhook-Signature': sign(body),
      });
      expect(res.status).toBe(401);
    });

    it('rejects a digest with the wrong length, a prefix or non-hex characters', async () => {
      const body = JSON.stringify(samplePayload());
      const good = sign(body);
      for (const bad of [good.slice(0, 63), `${good}0`, `sha256=${good}`, `v1,${good}`, 'z'.repeat(64)]) {
        const res = await post(body, { 'Content-Type': 'application/json', 'Webhook-Signature': bad });
        expect(res.status).toBe(401);
      }
    });

    it('does not accept an unconfigured secret', () => {
      const body = Buffer.from('{}');
      expect(verifyTutorCruncherSignature(body, sign(body, ''), '')).toBe(false);
      expect(verifyTutorCruncherSignature(body, undefined, SECRET)).toBe(false);
    });
  });

  describe('HTTP methods', () => {
    it.each(['put', 'patch', 'delete'])('verifies and accepts %s with a body', async (method) => {
      const body = JSON.stringify(samplePayload());
      const res = await post(body, { 'Content-Type': 'application/json', 'Webhook-Signature': sign(body) }, method);
      expect(res.status).toBe(200);
    });

    it.each(['get', 'delete', 'post'])('acknowledges a verified %s with no body (signed over zero bytes)', async (method) => {
      const res = await request(app)[method]('/webhooks/tutorcruncher').set('Webhook-Signature', sign(''));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('rejects an unsigned GET', async () => {
      const res = await request(app).get('/webhooks/tutorcruncher');
      expect(res.status).toBe(401);
    });

    it('rejects methods outside the five', async () => {
      const res = await request(app).options('/webhooks/tutorcruncher');
      expect(res.status).toBe(405);
    });
  });

  describe('events', () => {
    it.each([
      ['CREATED_A_CONTRACTOR', 'Tutor created'],
      ['CHANGED_CONTRACTOR_STATUS', 'Tutor status changed'],
      ['CLIENT_ENQUIRY', 'Client enquiry'],
      ['CREATED_AN_APPOINTMENT', 'Lesson created'],
      ['RAISED_INVOICE', 'Invoice raised'],
    ])('handles %s', async (action, message) => {
      const body = JSON.stringify(samplePayload(action));
      const res = await post(body, { 'Content-Type': 'application/json', 'Webhook-Signature': sign(body) });
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(message));
    });

    it('handles every element of events', async () => {
      const payload = { events: [samplePayload('CREATED_A_CONTRACTOR').events[0], samplePayload('RAISED_INVOICE').events[0]] };
      const body = JSON.stringify(payload);
      const res = await post(body, { 'Content-Type': 'application/json', 'Webhook-Signature': sign(body) });
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Tutor created'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Invoice raised'));
    });

    it('acknowledges an unknown action', async () => {
      const body = JSON.stringify(samplePayload('LOGIN'));
      const res = await post(body, { 'Content-Type': 'application/json', 'Webhook-Signature': sign(body) });
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled action: LOGIN');
    });
  });

  describe('untrusted payload shapes (after a valid signature)', () => {
    const send = (body) =>
      post(body, { 'Content-Type': 'application/json', 'Webhook-Signature': sign(body) });

    it('returns 400 for invalid JSON', async () => {
      expect((await send('not json')).status).toBe(400);
    });

    it.each(['[]', '"text"', '42', 'null', '{}', '{"events":"x"}', '{"events":{"action":"LOGIN"}}'])(
      'returns 400 for body %s',
      async (body) => {
        expect((await send(body)).status).toBe(400);
      }
    );

    it('ignores wrong-typed elements and fields instead of failing', async () => {
      const body = JSON.stringify({
        events: [null, 7, 'x', [], { action: 5 }, { action: 'CREATED_A_CONTRACTOR', subject: 'oops' }, { action: 'RAISED_INVOICE', subject: null }],
      });
      const res = await send(body);
      expect(res.status).toBe(200);
    });
  });
});
