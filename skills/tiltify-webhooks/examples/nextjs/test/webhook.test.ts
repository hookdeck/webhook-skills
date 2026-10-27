import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/tiltify/route';
import { verifyTiltifySignature } from '../lib/tiltify-signature';

// Tiltify's published worked example (developers.tiltify.com, Verifying Signature).
const VECTOR = {
  secret: '13c3b68914487acd1c68d85857ee1cfc308f15510f2d8e71273ee0f8a42d9d00',
  timestamp: '2023-04-18T16:49:00.617031Z',
  signature: '4OSwlhTt0EcrlSQFlqgE18FOtT+EKX4qTJdJeC8oV/o=',
  body:
    '{"data":{"amount":{"currency":"USD","value":"82.95"},"campaign_id":"a4fd5207-bd9f-4712-920a-85f8d92cf4e6","completed_at":"2023-04-18T16:48:26.510702Z","created_at":"2023-04-18T03:36:36.510717Z","donor_comment":"Rerum quo necessitatibus voluptas provident ad molestiae ipsam.","donor_name":"Jirachi","fundraising_event_id":null,"id":"dfa25dcc-2026-4320-a5b7-5da076efeb05","legacy_id":0,"poll_id":null,"poll_option_id":null,"reward_id":null,"sustained":false,"target_id":null,"team_event_id":null},"meta":{"attempted_at":"2023-04-18T16:49:00.617031Z","event_type":"public:direct:donation_updated","generated_at":"2023-04-18T16:48:59.510758Z","id":"d8768e26-1092-4f4c-a829-a2698cd19664","subscription_source_id":"00000000-0000-0000-0000-000000000000","subscription_source_type":"test"}}',
};

const SECRET = VECTOR.secret;
const OLD_TS = '2023-04-18T16:49:00.617031Z';

beforeAll(() => {
  process.env.TILTIFY_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.TILTIFY_WEBHOOK_TOLERANCE_SECONDS;
});

// Matches Tiltify's algorithm: base64 HMAC-SHA256 over `${timestamp}.${raw body}`.
function sign(body: string | Buffer, timestamp: string, secret = SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), Buffer.from(body)]))
    .digest('base64');
}

const nowIso = () => new Date().toISOString().replace(/\.(\d{3})Z$/, '.$1123Z');

function makeRequest(body: string, headers: Record<string, string>, contentType = 'application/json') {
  return new NextRequest('http://localhost:3000/webhooks/tiltify', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

const BODY = JSON.stringify({
  data: { id: 'f1', donor_name: 'Zoë', amount: { currency: 'USD', value: '5.00' } },
  meta: { event_type: 'public:direct:donation_updated', id: 'evt_1' },
});

describe('published test vector', () => {
  it('sign() reproduces the documented signature', () => {
    expect(sign(VECTOR.body, VECTOR.timestamp)).toBe(VECTOR.signature);
  });

  it('verifier accepts the documented request', () => {
    const result = verifyTiltifySignature(
      Buffer.from(VECTOR.body, 'utf8'),
      VECTOR.signature,
      VECTOR.timestamp,
      VECTOR.secret
    );
    expect(result).toEqual({ valid: true });
  });

  it('route accepts the documented request', async () => {
    const res = await POST(
      makeRequest(VECTOR.body, {
        'X-Tiltify-Signature': VECTOR.signature,
        'X-Tiltify-Timestamp': VECTOR.timestamp,
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('the secret is used as UTF-8 text, not hex-decoded', () => {
    const wrong = crypto
      .createHmac('sha256', Buffer.from(VECTOR.secret, 'hex'))
      .update(`${VECTOR.timestamp}.${VECTOR.body}`)
      .digest('base64');
    expect(wrong).not.toBe(VECTOR.signature);
  });
});

describe('Tiltify webhook route', () => {
  it('accepts a valid signature', async () => {
    const ts = nowIso();
    const res = await POST(makeRequest(BODY, { 'X-Tiltify-Signature': sign(BODY, ts), 'X-Tiltify-Timestamp': ts }));
    expect(res.status).toBe(200);
  });

  it('verifies the raw bytes whatever the content type', async () => {
    const ts = nowIso();
    const res = await POST(
      makeRequest(BODY, { 'X-Tiltify-Signature': sign(BODY, ts), 'X-Tiltify-Timestamp': ts }, 'text/plain')
    );
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(makeRequest(BODY, { 'X-Tiltify-Timestamp': nowIso() }));
    expect(res.status).toBe(401);
  });

  it('rejects a missing timestamp header', async () => {
    const res = await POST(makeRequest(BODY, { 'X-Tiltify-Signature': sign(BODY, nowIso()) }));
    expect(res.status).toBe(401);
  });

  it('rejects malformed signatures', async () => {
    const ts = nowIso();
    const good = sign(BODY, ts);
    const bad = [
      good.slice(0, -1),
      good.slice(0, -1) + '!',
      good.slice(0, -1) + 'AA',
      `sha256=${good}`,
      `${good},${good}`,
    ];
    for (const sig of bad) {
      const res = await POST(makeRequest(BODY, { 'X-Tiltify-Signature': sig, 'X-Tiltify-Timestamp': ts }));
      expect(res.status).toBe(401);
    }
  });

  it('compares base64 case-sensitively', async () => {
    const ts = nowIso();
    const res = await POST(
      makeRequest(BODY, { 'X-Tiltify-Signature': sign(BODY, ts).toLowerCase(), 'X-Tiltify-Timestamp': ts })
    );
    expect(res.status).toBe(401);
  });

  it('rejects a non-canonical base64 encoding of the right digest', async () => {
    const ts = nowIso();
    const sig = sign(BODY, ts);
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    // A stray low bit in the last character decodes to the same bytes, but is not the signature sent
    const bad = sig.slice(0, 42) + A[A.indexOf(sig[42]) | 1] + '=';
    const res = await POST(makeRequest(BODY, { 'X-Tiltify-Signature': bad, 'X-Tiltify-Timestamp': ts }));
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with another secret', async () => {
    const ts = nowIso();
    const res = await POST(
      makeRequest(BODY, { 'X-Tiltify-Signature': sign(BODY, ts, 'other_secret'), 'X-Tiltify-Timestamp': ts })
    );
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const ts = nowIso();
    const res = await POST(
      makeRequest(JSON.stringify({ meta: { event_type: 'x' } }), {
        'X-Tiltify-Signature': sign(BODY, ts),
        'X-Tiltify-Timestamp': ts,
      })
    );
    expect(res.status).toBe(401);
  });

  it('rejects a re-serialised body', async () => {
    const pretty = JSON.stringify(JSON.parse(BODY), null, 2);
    const ts = nowIso();
    const res = await POST(makeRequest(pretty, { 'X-Tiltify-Signature': sign(BODY, ts), 'X-Tiltify-Timestamp': ts }));
    expect(res.status).toBe(401);
  });

  it('rejects a timestamp that was not the one signed', async () => {
    const res = await POST(
      makeRequest(BODY, {
        'X-Tiltify-Signature': sign(BODY, OLD_TS),
        'X-Tiltify-Timestamp': '2023-04-18T16:49:00.617032Z',
      })
    );
    expect(res.status).toBe(401);
  });

  it('accepts old timestamps by default (retries and replays)', async () => {
    const res = await POST(
      makeRequest(BODY, { 'X-Tiltify-Signature': sign(BODY, OLD_TS), 'X-Tiltify-Timestamp': OLD_TS })
    );
    expect(res.status).toBe(200);
  });

  it('rejects old timestamps when the tolerance is enabled', async () => {
    process.env.TILTIFY_WEBHOOK_TOLERANCE_SECONDS = '300';
    const stale = await POST(
      makeRequest(BODY, { 'X-Tiltify-Signature': sign(BODY, OLD_TS), 'X-Tiltify-Timestamp': OLD_TS })
    );
    expect(stale.status).toBe(401);

    const ts = nowIso();
    const fresh = await POST(makeRequest(BODY, { 'X-Tiltify-Signature': sign(BODY, ts), 'X-Tiltify-Timestamp': ts }));
    expect(fresh.status).toBe(200);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const ts = nowIso();
    const res = await POST(
      makeRequest('not json', { 'X-Tiltify-Signature': sign('not json', ts), 'X-Tiltify-Timestamp': ts })
    );
    expect(res.status).toBe(400);
  });

  it.each([
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
    const res = await POST(
      makeRequest(payload, { 'X-Tiltify-Signature': sign(payload, ts), 'X-Tiltify-Timestamp': ts })
    );
    expect(res.status).toBe(200);
  });
});

describe('verifyTiltifySignature', () => {
  const raw = Buffer.from('{"meta":{"event_type":"public:direct:fact_updated"}}');
  const ts = OLD_TS;

  it('applies tolerance relative to the supplied clock', () => {
    const sig = sign(raw, ts);
    const sent = Date.parse('2023-04-18T16:49:00.617Z');
    expect(verifyTiltifySignature(raw, sig, ts, SECRET, 300, sent + 100_000).valid).toBe(true);
    expect(verifyTiltifySignature(raw, sig, ts, SECRET, 300, sent + 400_000).valid).toBe(false);
  });

  it('rejects a non-ISO timestamp when the tolerance is on', () => {
    expect(verifyTiltifySignature(raw, sign(raw, '1700000000'), '1700000000', SECRET, 300).valid).toBe(false);
  });

  it('rejects whitespace around the signature (never trimmed)', () => {
    const sig = sign(raw, ts);
    expect(verifyTiltifySignature(raw, `${sig} `, ts, SECRET).valid).toBe(false);
    expect(verifyTiltifySignature(raw, ` ${sig}`, ts, SECRET).valid).toBe(false);
  });

  it('returns an error for an empty signature', () => {
    expect(verifyTiltifySignature(raw, '', ts, SECRET).valid).toBe(false);
  });
});
