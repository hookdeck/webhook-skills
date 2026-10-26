// Generated with: mailtrap-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

const SECRET = '0123456789abcdef0123456789abcdef'; // 32 hex chars, used as plain text
// Must be set before src/index.js reads it.
process.env.MAILTRAP_WEBHOOK_SECRET = SECRET;

const { app, server, verifySignature, parseEvents } = require('../src/index');

afterAll(() => new Promise((resolve) => server.close(() => resolve())));

/** hex(HMAC_SHA256(secret_as_utf8, raw_body)), no timestamp, no prefix. */
function sign(rawBody, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

const deliveryEvent = {
  event: 'delivery',
  timestamp: 1728669700,
  sending_stream: 'transactional',
  message_id: '1df37d17-0286-4d8b-8edf-bc4ec5be86e6',
  email: 'receiver@example.com',
  event_id: 'bede7236-2284-43d6-a953-1fdcafd0fdbc',
  sending_domain_name: 'examplesender.com',
};
const jsonBody = JSON.stringify({ events: [deliveryEvent] });
const jsonlBody =
  JSON.stringify(deliveryEvent) + '\n' + JSON.stringify({ ...deliveryEvent, event: 'open', event_id: 'e2' }) + '\n';

function post(body, sig, contentType = 'application/json') {
  const r = request(app).post('/webhooks/mailtrap').set('Content-Type', contentType);
  if (sig !== undefined) r.set('Mailtrap-Signature', sig);
  return r.send(body);
}

describe('verifySignature', () => {
  it('accepts a valid signature', () => {
    expect(verifySignature(jsonBody, sign(jsonBody), SECRET)).toBe(true);
  });

  it('accepts uppercase hex', () => {
    expect(verifySignature(jsonBody, sign(jsonBody).toUpperCase(), SECRET)).toBe(true);
  });

  it('uses the secret as plain text, not hex-decoded', () => {
    const decoded = crypto.createHmac('sha256', Buffer.from(SECRET, 'hex')).update(jsonBody).digest('hex');
    expect(verifySignature(jsonBody, decoded, SECRET)).toBe(false);
  });

  it('rejects a wrong secret, tampered body, and re-serialised body', () => {
    expect(verifySignature(jsonBody, sign(jsonBody, 'f'.repeat(32)), SECRET)).toBe(false);
    expect(verifySignature(jsonBody + ' ', sign(jsonBody), SECRET)).toBe(false);
    const pretty = JSON.stringify(JSON.parse(jsonBody), null, 2);
    expect(verifySignature(pretty, sign(jsonBody), SECRET)).toBe(false);
  });

  it('rejects malformed signatures without throwing', () => {
    for (const bad of ['', 'abc', 'zz'.repeat(32), sign(jsonBody) + 'ab', 'é'.repeat(64)]) {
      expect(verifySignature(jsonBody, bad, SECRET)).toBe(false);
    }
  });
});

describe('parseEvents', () => {
  it('parses a JSON events array', () => {
    expect(parseEvents(jsonBody)).toEqual([deliveryEvent]);
  });
  it('parses JSON Lines', () => {
    expect(parseEvents(jsonlBody)).toHaveLength(2);
  });
  it('parses a single-line JSON Lines body', () => {
    expect(parseEvents(JSON.stringify(deliveryEvent))).toEqual([deliveryEvent]);
  });
  it('throws on garbage', () => {
    expect(() => parseEvents('not json')).toThrow();
  });
});

describe('POST /webhooks/mailtrap', () => {
  it('returns 200 for a valid JSON delivery', async () => {
    const res = await post(jsonBody, sign(jsonBody));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('returns 200 for a valid JSON Lines delivery (application/jsonl)', async () => {
    const res = await post(jsonlBody, sign(jsonlBody), 'application/jsonl');
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const res = await post(jsonBody, sign(jsonBody), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('handles every sending event, "soft bounce" and audit log events', async () => {
    const names = ['delivery', 'open', 'click', 'unsubscribe', 'spam', 'soft bounce', 'bounce', 'suspension', 'reject'];
    const events = names.map((event, i) => ({ ...deliveryEvent, event, event_id: `x${i}` }));
    events.push({ event: 'activity_log.user.login', description: 'logged in', actor: { id: 1 }, timestamp: 1 });
    const body = JSON.stringify({ events });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('returns 401 for an invalid signature', async () => {
    const res = await post(jsonBody, sign(jsonBody, 'f'.repeat(32)));
    expect(res.status).toBe(401);
  });

  it('returns 401 for malformed and non-ASCII signature headers', async () => {
    expect((await post(jsonBody, 'abc')).status).toBe(401);
    expect((await post(jsonBody, 'zz'.repeat(32))).status).toBe(401);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await post(jsonBody);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a validly signed but malformed payload', async () => {
    const body = 'not json at all';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });
});
