const crypto = require('crypto');
const request = require('supertest');

// Chameleon's Webhook Secret is used as-is, as UTF-8 text.
const SECRET = 'chameleon_test_secret_0123456789';
process.env.CHAMELEON_WEBHOOK_SECRET = SECRET;
delete process.env.CHAMELEON_SENT_AT_TOLERANCE_SECONDS;

const app = require('../src/index');
const { verifyChameleonSignature, sentAtWithinTolerance, seenEventIds } = require('../src/index');

const EVENTS = [
  'ping', 'response.finished', 'alert.triggered',
  'helpbar.answer', 'helpbar.search', 'helpbar.item.action', 'helpbar.item.error',
  'tour.started', 'tour.completed', 'tour.exited', 'tour.snoozed', 'tour.button.clicked',
  'survey.started', 'survey.completed', 'survey.exited', 'survey.snoozed', 'survey.button.clicked',
  'embed.started', 'embed.completed', 'embed.exited', 'embed.snoozed', 'embed.button.clicked',
  'demo.started', 'demo.reveal', 'demo.finished', 'demo.form.submitted',
];

// The signature is the bare lowercase hex HMAC-SHA256 of the raw body.
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Based on the documented ping example.
function samplePayload(kind = 'ping', id = '5fb70dcbc39330000325a817', sentAt = '2029-12-11T00:28:59.650Z') {
  return {
    id,
    kind,
    sent_at: sentAt,
    data: {
      account: { id: '58918bc07de121000432e9c0', domain: 'acme.co', name: 'Acme Corp' },
      profile: { id: '5f885a88e7daf3000e3eb4f6', email: 'jane@example.com', uid: '92340834' },
    },
  };
}

function post(body, headers = {}) {
  return request(app)
    .post('/webhooks/chameleon')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

beforeEach(() => {
  seenEventIds.clear();
  delete process.env.CHAMELEON_SENT_AT_TOLERANCE_SECONDS;
});

describe('verifyChameleonSignature', () => {
  const body = Buffer.from(JSON.stringify(samplePayload()));

  it('accepts a valid bare hex signature', () => {
    expect(verifyChameleonSignature(body, sign(body))).toBe(true);
  });

  it('accepts an uppercase hex signature', () => {
    expect(verifyChameleonSignature(body, sign(body).toUpperCase())).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifyChameleonSignature(body, sign(body, 'other_secret'))).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyChameleonSignature(Buffer.from('{"kind":"x"}'), sign(body))).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['too short', 'abc123'],
    ['too long', sign(body) + '00'],
    ['non-hex', 'z'.repeat(64)],
    ['prefixed', 'sha256=' + sign(body)],
    ['padded with whitespace', ' ' + sign(body)],
  ])('rejects a %s signature', (_name, sig) => {
    expect(verifyChameleonSignature(body, sig)).toBe(false);
  });

  it('rejects when no secret is configured', () => {
    expect(verifyChameleonSignature(body, sign(body), '')).toBe(false);
  });

  it('signs bytes, not re-serialized JSON', () => {
    const spaced = Buffer.from('{ "id": "1",  "kind": "ping" }');
    expect(verifyChameleonSignature(spaced, sign(spaced))).toBe(true);
    expect(verifyChameleonSignature(spaced, sign(Buffer.from(JSON.stringify(JSON.parse(spaced)))))).toBe(false);
  });
});

describe('POST /webhooks/chameleon', () => {
  it.each(EVENTS)('accepts a signed %s event', async (kind) => {
    const body = JSON.stringify(samplePayload(kind));
    const res = await post(body, { 'X-Chameleon-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts any content type', async () => {
    const body = JSON.stringify(samplePayload('tour.completed'));
    const res = await request(app)
      .post('/webhooks/chameleon')
      .set('Content-Type', 'text/plain')
      .set('X-Chameleon-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature with 401', async () => {
    const res = await post(JSON.stringify(samplePayload()));
    expect(res.status).toBe(401);
  });

  it('rejects an invalid signature with 401', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await post(body, { 'X-Chameleon-Signature': sign(body, 'wrong') });
    expect(res.status).toBe(401);
  });

  it('rejects a malformed signature with 401', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await post(body, { 'X-Chameleon-Signature': 'not-hex' });
    expect(res.status).toBe(401);
  });

  it('rejects a body modified after signing', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await post(body.replace('ping', 'tour.completed'), { 'X-Chameleon-Signature': sign(body) });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, { 'X-Chameleon-Signature': sign(body) });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed JSON body without a kind', async () => {
    const body = JSON.stringify({ id: '1' });
    const res = await post(body, { 'X-Chameleon-Signature': sign(body) });
    expect(res.status).toBe(400);
  });

  it('acknowledges an unknown kind', async () => {
    const body = JSON.stringify(samplePayload('future.topic'));
    const res = await post(body, { 'X-Chameleon-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('acknowledges a retried delivery without reprocessing', async () => {
    const body = JSON.stringify(samplePayload('tour.completed', 'evt-dup'));
    const headers = { 'X-Chameleon-Signature': sign(body) };
    expect((await post(body, headers)).body).toEqual({ received: true });
    expect((await post(body, headers)).body).toEqual({ received: true, duplicate: true });
  });
});

describe('optional sent_at check', () => {
  it('is off by default (the documented sample is dated 2029)', async () => {
    const body = JSON.stringify(samplePayload('ping'));
    const res = await post(body, { 'X-Chameleon-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('rejects a stale sent_at with 400 once enabled', async () => {
    process.env.CHAMELEON_SENT_AT_TOLERANCE_SECONDS = '300';
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const body = JSON.stringify(samplePayload('ping', 'evt-old', old));
    const res = await post(body, { 'X-Chameleon-Signature': sign(body) });
    expect(res.status).toBe(400);
  });

  it('accepts a fresh sent_at once enabled', async () => {
    process.env.CHAMELEON_SENT_AT_TOLERANCE_SECONDS = '300';
    const body = JSON.stringify(samplePayload('ping', 'evt-new', new Date().toISOString()));
    const res = await post(body, { 'X-Chameleon-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('sentAtWithinTolerance handles bad input', () => {
    expect(sentAtWithinTolerance('garbage', 300)).toBe(false);
    expect(sentAtWithinTolerance(undefined, 300)).toBe(false);
  });
});
