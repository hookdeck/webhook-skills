const request = require('supertest');
const crypto = require('crypto');

// LINE channel secrets are 32-char hex strings, used verbatim as the HMAC key.
// This one is the sample secret from LINE's "Verify webhook signature" docs.
const TEST_SECRET = '8c570fa6dd201bb328f1c1eac23a96d8';
process.env.LINE_CHANNEL_SECRET = TEST_SECRET;

const { app, verifyLineSignature } = require('../src/index');

/** Sign a body exactly the way the LINE Platform does: base64(HMAC-SHA256(secret, raw body)). */
function sign(rawBody, secret = TEST_SECRET) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
}

function post(rawBody, headers = {}) {
  let req = request(app)
    .post('/webhooks/line')
    .set('Content-Type', 'application/json; charset=utf-8');
  for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
  return req.send(rawBody);
}

const DESTINATION = 'U8e742f61d673b39c7fff3cecb7536ef0';

function baseEvent(type, extra = {}) {
  return {
    type,
    mode: 'active',
    timestamp: 1692251666727,
    webhookEventId: '01H810YECXQQZ37VAXPF6H9E6T',
    deliveryContext: { isRedelivery: false },
    source: { type: 'user', userId: 'U4af4980629...' },
    ...extra,
  };
}

const MESSAGE_BODY = JSON.stringify({
  destination: DESTINATION,
  events: [
    baseEvent('message', {
      replyToken: '38ef843bde154d9b91c21320ffd17a0f',
      message: { type: 'text', id: '468789577898262530', quoteToken: 'q3Plxr4AgKd...', text: 'Chicken, please.' },
    }),
  ],
});

describe('verifyLineSignature', () => {
  it('matches the official LINE docs test vector', () => {
    // From https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/
    const body = Buffer.from('{"destination":"U8e742f61d673b39c7fff3cecb7536ef0","events":[]}');
    expect(verifyLineSignature(body, 'GhRKmvmHys4Pi8DxkF4+EayaH0OqtJtaZxgTD9fMDLs=', TEST_SECRET)).toBe(true);
  });

  it('accepts a freshly generated signature', () => {
    const body = Buffer.from(MESSAGE_BODY);
    expect(verifyLineSignature(body, sign(body), TEST_SECRET)).toBe(true);
  });

  it('rejects a signature made with a different channel secret', () => {
    const body = Buffer.from(MESSAGE_BODY);
    expect(verifyLineSignature(body, sign(body, 'another_channel_secret'), TEST_SECRET)).toBe(false);
  });

  it('rejects a re-serialized (pretty-printed) body', () => {
    const body = Buffer.from(MESSAGE_BODY);
    const reformatted = Buffer.from(JSON.stringify(JSON.parse(MESSAGE_BODY), null, 2));
    expect(verifyLineSignature(reformatted, sign(body), TEST_SECRET)).toBe(false);
  });

  it('rejects garbage, empty, and missing signatures without throwing', () => {
    const body = Buffer.from(MESSAGE_BODY);
    expect(verifyLineSignature(body, 'not-a-signature', TEST_SECRET)).toBe(false);
    expect(verifyLineSignature(body, '', TEST_SECRET)).toBe(false);
    expect(verifyLineSignature(body, undefined, TEST_SECRET)).toBe(false);
  });

  it('rejects when the channel secret is not configured', () => {
    const body = Buffer.from(MESSAGE_BODY);
    expect(verifyLineSignature(body, sign(body), undefined)).toBe(false);
  });
});

describe('POST /webhooks/line', () => {
  it('returns 200 for the console "Verify" request (empty events array)', async () => {
    const body = '{"destination":"U8e742f61d673b39c7fff3cecb7536ef0","events":[]}';
    const res = await post(body, { 'x-line-signature': 'GhRKmvmHys4Pi8DxkF4+EayaH0OqtJtaZxgTD9fMDLs=' });
    expect(res.status).toBe(200);
  });

  it('returns 200 for a signed message event', async () => {
    const res = await post(MESSAGE_BODY, { 'x-line-signature': sign(MESSAGE_BODY) });
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('returns 400 when x-line-signature is missing', async () => {
    const res = await post(MESSAGE_BODY);
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post(MESSAGE_BODY, { 'x-line-signature': sign('{"tampered":true}') });
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 400 when the body was modified after signing', async () => {
    const signature = sign(MESSAGE_BODY);
    const tampered = MESSAGE_BODY.replace('Chicken', 'Beef');
    const res = await post(tampered, { 'x-line-signature': signature });
    expect(res.status).toBe(400);
  });

  it('verifies bodies containing escapes, newlines, and emoji byte-for-byte', async () => {
    const body = '{"destination":"' + DESTINATION + '","events":[{"type":"message","message":{"type":"text","id":"1","text":"hello\\n test1 \\u3042 🍣"},"mode":"active","timestamp":1,"webhookEventId":"01H","deliveryContext":{"isRedelivery":false}}]}';
    const res = await post(body, { 'x-line-signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('handles every documented event type in one batched request', async () => {
    const events = [
      baseEvent('message', { replyToken: 'r', message: { type: 'sticker', id: '1', packageId: '446', stickerId: '1988' } }),
      baseEvent('messageEdited', { source: { type: 'group', groupId: 'Ca56f94637c...', userId: 'U1' }, message: { type: 'text', id: '2', text: 'edited' } }),
      baseEvent('unsend', { unsend: { messageId: '325708' } }),
      baseEvent('follow', { replyToken: 'r', follow: { isUnblocked: false } }),
      baseEvent('unfollow'),
      baseEvent('join', { replyToken: 'r', source: { type: 'group', groupId: 'C4af4980629...' } }),
      baseEvent('leave', { source: { type: 'group', groupId: 'C4af4980629...' } }),
      baseEvent('memberJoined', { replyToken: 'r', source: { type: 'group', groupId: 'C1' }, joined: { members: [{ type: 'user', userId: 'U4af4980629...' }] } }),
      baseEvent('memberLeft', { source: { type: 'group', groupId: 'C1' }, left: { members: [{ type: 'user', userId: 'U4af4980629...' }] } }),
      baseEvent('postback', { replyToken: 'r', postback: { data: 'action=buy&itemid=111', params: {} } }),
      baseEvent('videoPlayComplete', { replyToken: 'r', videoPlayComplete: { trackingId: 'track-id' } }),
      baseEvent('beacon', { replyToken: 'r', beacon: { hwid: 'd41d8cd98f', type: 'enter' } }),
      baseEvent('accountLink', { replyToken: 'r', link: { result: 'ok', nonce: 'xxxxxxxxxxxxxxx' } }),
      baseEvent('membership', { replyToken: 'r', membership: { type: 'joined', membershipId: 3189 } }),
      baseEvent('botSuspended'),
    ];
    const body = JSON.stringify({ destination: DESTINATION, events });
    const res = await post(body, { 'x-line-signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('acknowledges redelivered events', async () => {
    const body = JSON.stringify({
      destination: DESTINATION,
      events: [baseEvent('follow', { deliveryContext: { isRedelivery: true }, follow: { isUnblocked: true } })],
    });
    const res = await post(body, { 'x-line-signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('returns 400 for a correctly signed but non-JSON body', async () => {
    const body = 'not json';
    const res = await post(body, { 'x-line-signature': sign(body) });
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
