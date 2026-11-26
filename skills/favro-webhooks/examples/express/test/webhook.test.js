process.env.FAVRO_WEBHOOK_SECRET = 'test_favro_webhook_secret';
process.env.FAVRO_WEBHOOK_URL = 'https://example.com/webhooks/favro';

const crypto = require('crypto');
const request = require('supertest');
const { app, verifyFavroWebhook, eventKey } = require('../src/index');

const SECRET = process.env.FAVRO_WEBHOOK_SECRET;
const URL = process.env.FAVRO_WEBHOOK_URL;

/**
 * Compute a valid X-Favro-Webhook signature for a payloadId + URL.
 * Mirrors what Favro does: base64(HMAC-SHA1(secret, payloadId + webhookUrl)).
 */
function sign(payloadId, url = URL, secret = SECRET) {
  return crypto
    .createHmac('sha1', secret)
    .update(payloadId + url, 'utf8')
    .digest('base64');
}

const cardPayload = {
  payloadId: 'AbCdEf012345==',
  action: 'created',
  hookId: '5c1a0000',
  card: { cardId: 'card-1', name: 'Implement webhook receiver' },
};

const pingPayload = {
  payloadId: 'PiNg000000==',
  action: 'ping',
  hookId: '5c1a0000',
  hook: { url: URL },
};

describe('verifyFavroWebhook', () => {
  test('returns true for a valid signature', () => {
    const sig = sign(cardPayload.payloadId);
    expect(verifyFavroWebhook(cardPayload.payloadId, URL, SECRET, sig)).toBe(true);
  });

  test('returns false for a tampered payloadId', () => {
    const sig = sign(cardPayload.payloadId);
    expect(verifyFavroWebhook('different-id', URL, SECRET, sig)).toBe(false);
  });

  test('returns false when the URL differs from the registered one', () => {
    const sig = sign(cardPayload.payloadId);
    expect(
      verifyFavroWebhook(cardPayload.payloadId, 'https://evil.example/x', SECRET, sig)
    ).toBe(false);
  });

  test('returns false for the wrong secret', () => {
    const sig = sign(cardPayload.payloadId);
    expect(verifyFavroWebhook(cardPayload.payloadId, URL, 'wrong_secret', sig)).toBe(false);
  });

  test('returns false when the signature is missing', () => {
    expect(verifyFavroWebhook(cardPayload.payloadId, URL, SECRET, '')).toBe(false);
  });
});

describe('eventKey', () => {
  test('maps a ping', () => {
    expect(eventKey(pingPayload)).toBe('ping');
  });
  test('maps a card action', () => {
    expect(eventKey({ action: 'moved', card: {} })).toBe('card.moved');
  });
  test('maps a comment action', () => {
    expect(eventKey({ action: 'created', comment: {} })).toBe('comment.created');
  });
  test('maps a comment action when the card is included too', () => {
    expect(eventKey({ action: 'updated', card: {}, comment: {} })).toBe('comment.updated');
  });
});

describe('POST /webhooks/favro', () => {
  function post(payload, signature) {
    const raw = JSON.stringify(payload);
    return request(app)
      .post('/webhooks/favro')
      .set('Content-Type', 'application/json')
      .set('X-Favro-Webhook', signature ?? sign(payload.payloadId))
      .send(raw);
  }

  test('returns 200 for a valid card event', async () => {
    const res = await post(cardPayload);
    expect(res.status).toBe(200);
  });

  test('returns 200 for the setup ping', async () => {
    const res = await post(pingPayload);
    expect(res.status).toBe(200);
  });

  test('returns 401 for an invalid signature', async () => {
    const res = await post(cardPayload, 'not-a-valid-signature');
    expect(res.status).toBe(401);
  });

  test('returns 401 when the signature header is missing', async () => {
    const raw = JSON.stringify(cardPayload);
    const res = await request(app)
      .post('/webhooks/favro')
      .set('Content-Type', 'application/json')
      .send(raw);
    expect(res.status).toBe(401);
  });

  test('returns 401 for a tampered payload (payloadId changed)', async () => {
    // Sign the original id, then change it in the body — signature no longer matches.
    const sig = sign(cardPayload.payloadId);
    const tampered = { ...cardPayload, payloadId: 'tampered==' };
    const res = await post(tampered, sig);
    expect(res.status).toBe(401);
  });

  test('handles each card and comment action with 200', async () => {
    const events = [
      { action: 'created', card: {} },
      { action: 'committed', card: {} },
      { action: 'moved', card: {} },
      { action: 'updated', card: {} },
      { action: 'deleted', card: {} },
      { action: 'created', comment: {} },
      { action: 'updated', comment: {} },
      { action: 'deleted', comment: {} },
    ];
    for (let i = 0; i < events.length; i++) {
      const payload = { payloadId: `id-${i}==`, hookId: 'h', ...events[i] };
      const res = await post(payload);
      expect(res.status).toBe(200);
    }
  });
});

describe('GET /health', () => {
  test('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
