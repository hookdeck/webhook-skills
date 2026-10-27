const crypto = require('crypto');
const request = require('supertest');

// The secret_key entered in Wistia is used as-is (UTF-8 bytes)
const SECRET = 'wistia_test_secret_key';
process.env.WISTIA_WEBHOOK_SECRET = SECRET;

const { app, verifyWistiaSignature } = require('../src/index');

// Wistia's real algorithm: lowercase hex HMAC-SHA256 of the raw POST body
function sign(rawBody, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

let counter = 0;
function delivery(events) {
  return {
    hook: { uuid: 'a4ab9eb6-ab82-4dae-86f2-29f744f7d031' },
    events: events.map((e) => ({
      uuid: `evt-${Date.now()}-${counter++}`,
      metadata: { account_id: '0sxav1wj8o' },
      generated_at: '2024-03-31T21:56:45Z',
      ...e,
    })),
  };
}

const media = {
  duration: 40.207,
  id: 'vpe2p82q64',
  name: 'Lenny Delivers Video!',
  thumbnail: { url: 'https://embed-ssl.wistia.com/deliveries/e96ea382701bc172657d90bf269211beddbf6f7f.jpg?image_crop_resized=200x120' },
  url: 'https://harper.wistia.com/medias/vpe2p82q64',
};

function post(payloadString, headers = {}) {
  return request(app)
    .post('/webhooks/wistia')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(payloadString);
}

describe('Wistia webhook', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts a media.ready delivery with a valid signature', async () => {
    const body = JSON.stringify(delivery([{ type: 'media.ready', payload: { media } }]));
    const res = await post(body, { 'X-Wistia-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith('Media ready:', 'vpe2p82q64');
  });

  it('accepts an uppercase hex signature', async () => {
    const body = JSON.stringify(delivery([{ type: 'media.created', payload: { media } }]));
    const res = await post(body, { 'X-Wistia-Signature': sign(body).toUpperCase() });
    expect(res.status).toBe(200);
  });

  it('handles every event in a batched delivery', async () => {
    const body = JSON.stringify(delivery([
      { type: 'media.created', payload: { media } },
      { type: 'viewing_session.play', payload: { visitor: { id: 'v1' }, viewing_session: { id: 's1' }, media } },
      { type: 'viewing_session.percent_watched', payload: { percent_watched: 25, viewing_session: { id: 's1' }, media } },
    ]));
    const res = await post(body, { 'X-Wistia-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Media created:', 'vpe2p82q64');
    expect(logSpy).toHaveBeenCalledWith('Play:', 's1', 'vpe2p82q64');
    expect(logSpy).toHaveBeenCalledWith('Percent watched:', 25, 'vpe2p82q64');
  });

  it('handles live_event.registration', async () => {
    const body = JSON.stringify(delivery([
      { type: 'live_event.registration', payload: { live_event: { id: 'abc123xyz' }, registration: { fields: { email: 'lenny@wistia.com' } } } },
    ]));
    const res = await post(body, { 'X-Wistia-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Live event registration:', 'abc123xyz');
  });

  it('ignores a redelivered event uuid', async () => {
    const body = JSON.stringify({
      hook: { uuid: 'h' },
      events: [{ uuid: 'dup-1', type: 'media.deleted', payload: { media: { id: 'f5diqltruh' } }, generated_at: '2024-03-30T15:57:05Z' }],
    });
    const headers = { 'X-Wistia-Signature': sign(body) };
    expect((await post(body, headers)).status).toBe(200);
    expect((await post(body, headers)).status).toBe(200);
    expect(logSpy.mock.calls.filter((c) => c[0] === 'Media deleted:')).toHaveLength(1);
  });

  it('accepts unknown event types without failing', async () => {
    const body = JSON.stringify(delivery([{ type: 'media.something_new', payload: {} }]));
    const res = await post(body, { 'X-Wistia-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('verifies the body for any content type', async () => {
    const body = JSON.stringify(delivery([{ type: 'media.ready', payload: { media } }]));
    const res = await request(app)
      .post('/webhooks/wistia')
      .set('Content-Type', 'text/plain')
      .set('X-Wistia-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header with 401', async () => {
    const body = JSON.stringify(delivery([{ type: 'media.ready', payload: { media } }]));
    expect((await post(body)).status).toBe(401);
  });

  it('rejects an empty signature header with 401', async () => {
    const body = JSON.stringify(delivery([{ type: 'media.ready', payload: { media } }]));
    expect((await post(body, { 'X-Wistia-Signature': '' })).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify(delivery([{ type: 'media.ready', payload: { media } }]));
    expect((await post(body, { 'X-Wistia-Signature': sign(body, 'other_secret') })).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(delivery([{ type: 'media.ready', payload: { media } }]));
    const signature = sign(body);
    const tampered = body.replace('vpe2p82q64', 'zzzzzzzzzz');
    expect((await post(tampered, { 'X-Wistia-Signature': signature })).status).toBe(401);
  });

  it('rejects malformed signatures (prefix, wrong length, non-hex)', async () => {
    const body = JSON.stringify(delivery([{ type: 'media.ready', payload: { media } }]));
    const good = sign(body);
    for (const bad of [`sha256=${good}`, good.slice(0, 62), `${good}00`, 'z'.repeat(64), ` ${good}x`]) {
      expect((await post(body, { 'X-Wistia-Signature': bad })).status).toBe(401);
    }
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const body = 'not json';
    expect((await post(body, { 'X-Wistia-Signature': sign(body) })).status).toBe(400);
  });

  it('returns 400 for a validly signed body without an events array', async () => {
    const body = JSON.stringify({ hook: { uuid: 'h' } });
    expect((await post(body, { 'X-Wistia-Signature': sign(body) })).status).toBe(400);
  });
});

describe('verifyWistiaSignature', () => {
  it('compares raw bytes, not a decoded string', () => {
    const raw = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]); // invalid UTF-8
    expect(verifyWistiaSignature(raw, sign(raw), SECRET)).toBe(true);
  });

  it('fails when no secret is configured', () => {
    expect(verifyWistiaSignature(Buffer.from('{}'), sign('{}'), '')).toBe(false);
  });
});
