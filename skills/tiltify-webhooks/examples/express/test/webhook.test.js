const request = require('supertest');
const crypto = require('crypto');

// Tiltify's published worked example (developers.tiltify.com, Verifying Signature).
const VECTOR = {
  secret: '13c3b68914487acd1c68d85857ee1cfc308f15510f2d8e71273ee0f8a42d9d00',
  timestamp: '2023-04-18T16:49:00.617031Z',
  signature: '4OSwlhTt0EcrlSQFlqgE18FOtT+EKX4qTJdJeC8oV/o=',
  body:
    '{"data":{"amount":{"currency":"USD","value":"82.95"},"campaign_id":"a4fd5207-bd9f-4712-920a-85f8d92cf4e6","completed_at":"2023-04-18T16:48:26.510702Z","created_at":"2023-04-18T03:36:36.510717Z","donor_comment":"Rerum quo necessitatibus voluptas provident ad molestiae ipsam.","donor_name":"Jirachi","fundraising_event_id":null,"id":"dfa25dcc-2026-4320-a5b7-5da076efeb05","legacy_id":0,"poll_id":null,"poll_option_id":null,"reward_id":null,"sustained":false,"target_id":null,"team_event_id":null},"meta":{"attempted_at":"2023-04-18T16:49:00.617031Z","event_type":"public:direct:donation_updated","generated_at":"2023-04-18T16:48:59.510758Z","id":"d8768e26-1092-4f4c-a829-a2698cd19664","subscription_source_id":"00000000-0000-0000-0000-000000000000","subscription_source_type":"test"}}',
};

const SECRET = VECTOR.secret;

process.env.TILTIFY_WEBHOOK_SECRET = SECRET;
delete process.env.TILTIFY_WEBHOOK_TOLERANCE_SECONDS;

const app = require('../src/index');
const { verifyTiltifySignature } = require('../src/index');

// Matches Tiltify's algorithm: base64 HMAC-SHA256 over `${timestamp}.${raw body}`.
function sign(body, timestamp, secret = SECRET) {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), Buffer.from(body)]))
    .digest('base64');
}

const nowIso = () => new Date().toISOString().replace(/\.(\d{3})Z$/, '.$1123Z');

function post(body, headers, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/tiltify')
    .set('Content-Type', contentType)
    .set(headers)
    .send(body);
}

describe('published test vector', () => {
  test('sign() reproduces the documented signature', () => {
    expect(sign(VECTOR.body, VECTOR.timestamp)).toBe(VECTOR.signature);
  });

  test('verifier accepts the documented request', () => {
    const result = verifyTiltifySignature(
      Buffer.from(VECTOR.body, 'utf8'),
      VECTOR.signature,
      VECTOR.timestamp,
      VECTOR.secret
    );
    expect(result).toEqual({ valid: true });
  });

  test('endpoint accepts the documented request', async () => {
    const res = await post(VECTOR.body, {
      'X-Tiltify-Signature': VECTOR.signature,
      'X-Tiltify-Timestamp': VECTOR.timestamp,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('the secret is used as UTF-8 text, not hex-decoded', () => {
    const hexDecoded = Buffer.from(VECTOR.secret, 'hex');
    const wrong = crypto
      .createHmac('sha256', hexDecoded)
      .update(`${VECTOR.timestamp}.${VECTOR.body}`)
      .digest('base64');
    expect(wrong).not.toBe(VECTOR.signature);
  });
});

describe('Tiltify webhook endpoint', () => {
  afterEach(() => {
    delete process.env.TILTIFY_WEBHOOK_TOLERANCE_SECONDS;
  });

  const body = JSON.stringify({
    data: { id: 'f1', donor_name: 'Zoë', amount: { currency: 'USD', value: '5.00' } },
    meta: { event_type: 'public:direct:donation_updated', id: 'evt_1' },
  });

  test('accepts a valid signature', async () => {
    const ts = nowIso();
    const res = await post(body, {
      'X-Tiltify-Signature': sign(body, ts),
      'X-Tiltify-Timestamp': ts,
    });
    expect(res.status).toBe(200);
  });

  test('verifies the raw bytes whatever the content type', async () => {
    const ts = nowIso();
    const res = await post(
      body,
      { 'X-Tiltify-Signature': sign(body, ts), 'X-Tiltify-Timestamp': ts },
      'text/plain'
    );
    expect(res.status).toBe(200);
  });

  test('rejects a missing signature header', async () => {
    const res = await post(body, { 'X-Tiltify-Timestamp': nowIso() });
    expect(res.status).toBe(401);
  });

  test('rejects a missing timestamp header', async () => {
    const res = await post(body, { 'X-Tiltify-Signature': sign(body, nowIso()) });
    expect(res.status).toBe(401);
  });

  test('rejects malformed signatures', async () => {
    const ts = nowIso();
    const good = sign(body, ts);
    const bad = [
      good.slice(0, -1), // wrong length
      good.slice(0, -1) + '!', // bad alphabet
      good.slice(0, -1).replace(/=?$/, '') + 'AA', // no padding, wrong length
      `sha256=${good}`, // prefix is not part of the format
      `${good},${good}`, // list
    ];
    for (const sig of bad) {
      const res = await post(body, { 'X-Tiltify-Signature': sig, 'X-Tiltify-Timestamp': ts });
      expect(res.status).toBe(401);
    }
  });

  test('compares base64 case-sensitively', async () => {
    const ts = nowIso();
    const res = await post(body, {
      'X-Tiltify-Signature': sign(body, ts).toLowerCase(),
      'X-Tiltify-Timestamp': ts,
    });
    expect(res.status).toBe(401);
  });

  test('rejects a non-canonical base64 encoding of the right digest', async () => {
    const ts = nowIso();
    const sig = sign(body, ts);
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    // A stray low bit in the last character decodes to the same bytes, but is not the signature sent
    const res = await post(body, {
      'X-Tiltify-Signature': sig.slice(0, 42) + A[A.indexOf(sig[42]) | 1] + '=',
      'X-Tiltify-Timestamp': ts,
    });
    expect(res.status).toBe(401);
  });

  test('rejects a signature made with another secret', async () => {
    const ts = nowIso();
    const res = await post(body, {
      'X-Tiltify-Signature': sign(body, ts, 'other_secret'),
      'X-Tiltify-Timestamp': ts,
    });
    expect(res.status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const ts = nowIso();
    const res = await post(JSON.stringify({ meta: { event_type: 'x' } }), {
      'X-Tiltify-Signature': sign(body, ts),
      'X-Tiltify-Timestamp': ts,
    });
    expect(res.status).toBe(401);
  });

  test('rejects a re-serialised body', async () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    const ts = nowIso();
    const res = await post(pretty, {
      'X-Tiltify-Signature': sign(body, ts),
      'X-Tiltify-Timestamp': ts,
    });
    expect(res.status).toBe(401);
  });

  test('rejects a timestamp that was not the one signed', async () => {
    const ts = '2023-04-18T16:49:00.617031Z';
    const res = await post(body, {
      'X-Tiltify-Signature': sign(body, ts),
      'X-Tiltify-Timestamp': '2023-04-18T16:49:00.617032Z',
    });
    expect(res.status).toBe(401);
  });

  test('accepts old timestamps by default (retries and replays)', async () => {
    const ts = '2023-04-18T16:49:00.617031Z';
    const res = await post(body, {
      'X-Tiltify-Signature': sign(body, ts),
      'X-Tiltify-Timestamp': ts,
    });
    expect(res.status).toBe(200);
  });

  test('rejects old timestamps when the tolerance is enabled', async () => {
    process.env.TILTIFY_WEBHOOK_TOLERANCE_SECONDS = '300';
    const old = '2023-04-18T16:49:00.617031Z';
    const stale = await post(body, {
      'X-Tiltify-Signature': sign(body, old),
      'X-Tiltify-Timestamp': old,
    });
    expect(stale.status).toBe(401);

    const ts = nowIso();
    const fresh = await post(body, {
      'X-Tiltify-Signature': sign(body, ts),
      'X-Tiltify-Timestamp': ts,
    });
    expect(fresh.status).toBe(200);
  });

  test('returns 400 for a validly signed non-JSON body', async () => {
    const ts = nowIso();
    const res = await post('not json', {
      'X-Tiltify-Signature': sign('not json', ts),
      'X-Tiltify-Timestamp': ts,
    });
    expect(res.status).toBe(400);
  });

  test.each([
    'public:direct:donation_updated',
    'public:direct:fact_updated',
    'private:direct:donation_updated',
    'private:direct:fact_updated',
    'public:indirect:donation_updated',
    'public:indirect:fact_updated',
    'private:indirect:donation_updated',
    'private:indirect:fact_updated',
    'something:new:event',
  ])('acknowledges %s', async (type) => {
    const payload = JSON.stringify({ data: { id: 'x' }, meta: { event_type: type, id: 'e' } });
    const ts = nowIso();
    const res = await post(payload, {
      'X-Tiltify-Signature': sign(payload, ts),
      'X-Tiltify-Timestamp': ts,
    });
    expect(res.status).toBe(200);
  });
});

describe('verifyTiltifySignature', () => {
  const raw = Buffer.from('{"meta":{"event_type":"public:direct:fact_updated"}}');
  const ts = '2023-04-18T16:49:00.617031Z';

  test('applies tolerance relative to the supplied clock', () => {
    const sig = sign(raw, ts);
    const sent = Date.parse('2023-04-18T16:49:00.617Z');
    expect(verifyTiltifySignature(raw, sig, ts, SECRET, 300, sent + 100_000).valid).toBe(true);
    expect(verifyTiltifySignature(raw, sig, ts, SECRET, 300, sent + 400_000).valid).toBe(false);
  });

  test('rejects a non-ISO timestamp when the tolerance is on', () => {
    const bad = '1700000000';
    expect(verifyTiltifySignature(raw, sign(raw, bad), bad, SECRET, 300).valid).toBe(false);
  });

  test('rejects whitespace around the signature (never trimmed)', () => {
    const sig = sign(raw, ts);
    expect(verifyTiltifySignature(raw, `${sig} `, ts, SECRET).valid).toBe(false);
    expect(verifyTiltifySignature(raw, ` ${sig}`, ts, SECRET).valid).toBe(false);
  });

  test('returns an error for an empty signature', () => {
    expect(verifyTiltifySignature(raw, '', ts, SECRET).valid).toBe(false);
  });
});
