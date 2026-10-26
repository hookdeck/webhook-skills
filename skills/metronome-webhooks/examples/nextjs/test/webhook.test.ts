import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/metronome/route';
import {
  buildSignedBytes,
  computeMetronomeSignature,
  isDateWithinTolerance,
  seenEventIds,
  verifyMetronomeSignature,
} from '../lib/metronome';

const SECRET = 'correct-horse-battery-staple';
const DATE = 'Mon, 02 Jan 2006 22:04:05 GMT';

// Published test vector from Metronome's docs (setup-webhooks#verify-signatures).
// The body is pretty-printed exactly as the docs show it, with no trailing newline.
const VECTOR_BODY =
  '{\n  "id": "b2c9e307-624e-4e7d-a5a4-1b74107d78c4",\n  "type": "widget_created",\n  "properties": {\n    "customer_id": "5f794d50-085a-4db6-8d15-286e518b7225",\n    "widget_id": "0891458d-b6f0-4fdd-a41e-380aae1a1e38"\n  }\n}';
const VECTOR_SIGNATURE = 'b82652fa2246cf1d8a27e591f155c865f68b46c19b9213fd9c052f2419b4742b';

// Sign like Metronome: HMAC-SHA256(secret, X-Metronome-Date + "\n" + body), hex
function sign(payload: string, date = DATE, key = SECRET): string {
  return crypto
    .createHmac('sha256', key)
    .update(Buffer.concat([Buffer.from(date, 'latin1'), Buffer.from([0x0a]), Buffer.from(payload)]))
    .digest('hex');
}

// Payload based on the docs' alerts.spend_threshold_reached example
const spendAlert = (id = 'a1b2c3d4-0000-4000-8000-000000000001') =>
  JSON.stringify({
    id,
    properties: {
      customer_id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
      alert_id: '7f8a9b2c-3d4e-4f5a-8b9c-0d1e2f3a4b5c',
      timestamp: '2024-10-07T16:30:15.123Z',
      threshold: 10000,
      alert_name: 'Spend threshold exceeded',
      current_spend: 12500,
      triggered_by: 'usage',
    },
    type: 'alerts.spend_threshold_reached',
  });

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/metronome', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

const signedHeaders = (payload: string) => ({
  'x-metronome-date': DATE,
  'metronome-webhook-signature': sign(payload),
});

beforeEach(() => {
  process.env.METRONOME_WEBHOOK_SECRET = SECRET;
  delete process.env.METRONOME_WEBHOOK_TOLERANCE_SECONDS;
  seenEventIds.clear();
});

describe('published test vector', () => {
  it('computes the documented signature', () => {
    expect(computeMetronomeSignature(Buffer.from(VECTOR_BODY), DATE, SECRET)).toBe(VECTOR_SIGNATURE);
  });

  it('accepts the documented headers and secret', () => {
    expect(verifyMetronomeSignature(Buffer.from(VECTOR_BODY), VECTOR_SIGNATURE, DATE, SECRET)).toBe(true);
  });

  it('accepts the vector through the route', async () => {
    const res = await POST(makeRequest(VECTOR_BODY, {
      'x-metronome-date': DATE,
      'metronome-webhook-signature': VECTOR_SIGNATURE,
    }));
    expect(res.status).toBe(200);
  });
});

describe('signed bytes', () => {
  it('separates the date and the body with a real LF, not backslash-n', () => {
    const bytes = buildSignedBytes(Buffer.from('{}'), DATE);
    expect(bytes.includes(0x0a)).toBe(true);
    expect(bytes.includes(Buffer.from('\\n'))).toBe(false);
    expect(bytes.toString('latin1')).toBe(`${DATE}\n{}`);
  });

  it('keeps the body bytes untouched (non-UTF-8 bytes survive)', () => {
    const body = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
    const bytes = buildSignedBytes(body, DATE);
    expect(bytes.subarray(bytes.length - 4).equals(body)).toBe(true);
  });
});

describe('verifyMetronomeSignature', () => {
  const body = Buffer.from(spendAlert());

  it('accepts a valid signature, including uppercase hex', () => {
    expect(verifyMetronomeSignature(body, sign(body.toString()), DATE, SECRET)).toBe(true);
    expect(verifyMetronomeSignature(body, sign(body.toString()).toUpperCase(), DATE, SECRET)).toBe(true);
  });

  it('rejects missing or empty inputs', () => {
    const good = sign(body.toString());
    expect(verifyMetronomeSignature(body, null, DATE, SECRET)).toBe(false);
    expect(verifyMetronomeSignature(body, '', DATE, SECRET)).toBe(false);
    expect(verifyMetronomeSignature(body, good, null, SECRET)).toBe(false);
    expect(verifyMetronomeSignature(body, good, '', SECRET)).toBe(false);
    expect(verifyMetronomeSignature(body, good, DATE, undefined)).toBe(false);
  });

  it('rejects malformed signatures (length, alphabet, prefix, list)', () => {
    const good = sign(body.toString());
    expect(verifyMetronomeSignature(body, good.slice(0, 62), DATE, SECRET)).toBe(false);
    expect(verifyMetronomeSignature(body, good + '00', DATE, SECRET)).toBe(false);
    expect(verifyMetronomeSignature(body, 'g'.repeat(64), DATE, SECRET)).toBe(false);
    expect(verifyMetronomeSignature(body, `sha256=${good}`, DATE, SECRET)).toBe(false);
    expect(verifyMetronomeSignature(body, `${good}, ${good}`, DATE, SECRET)).toBe(false);
  });

  it('rejects a tampered body, different date or different secret', () => {
    const good = sign(body.toString());
    expect(verifyMetronomeSignature(Buffer.from(spendAlert('other')), good, DATE, SECRET)).toBe(false);
    expect(verifyMetronomeSignature(body, good, 'Tue, 03 Jan 2006 22:04:05 GMT', SECRET)).toBe(false);
    expect(verifyMetronomeSignature(body, sign(body.toString(), DATE, 'wrong'), DATE, SECRET)).toBe(false);
  });
});

describe('isDateWithinTolerance', () => {
  const now = Date.parse(DATE);

  it('is off by default', () => {
    expect(isDateWithinTolerance(DATE, 0, now + 10 * 24 * 3600 * 1000)).toBe(true);
  });

  it('enforces the window when set', () => {
    expect(isDateWithinTolerance(DATE, 300, now + 60 * 1000)).toBe(true);
    expect(isDateWithinTolerance(DATE, 300, now + 600 * 1000)).toBe(false);
    expect(isDateWithinTolerance('not a date', 300, now)).toBe(false);
  });
});

describe('POST /webhooks/metronome', () => {
  it('accepts a valid webhook', async () => {
    const payload = spendAlert();
    const res = await POST(makeRequest(payload, signedHeaders(payload)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies any content type against the exact bytes', async () => {
    const payload = spendAlert('a1b2c3d4-0000-4000-8000-000000000002');
    const res = await POST(makeRequest(payload, { ...signedHeaders(payload), 'content-type': 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('returns 401 for a missing signature header', async () => {
    const res = await POST(makeRequest(spendAlert(), { 'x-metronome-date': DATE }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a missing X-Metronome-Date header', async () => {
    const payload = spendAlert();
    const res = await POST(makeRequest(payload, { 'metronome-webhook-signature': sign(payload) }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a signature made over the standard Date header value', async () => {
    const payload = spendAlert();
    const other = 'Tue, 03 Jan 2006 22:04:05 GMT';
    const res = await POST(makeRequest(payload, {
      'x-metronome-date': DATE,
      date: other,
      'metronome-webhook-signature': sign(payload, other),
    }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a bad signature', async () => {
    const res = await POST(makeRequest(spendAlert(), {
      'x-metronome-date': DATE,
      'metronome-webhook-signature': 'a'.repeat(64),
    }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const payload = 'not json';
    const res = await POST(makeRequest(payload, signedHeaders(payload)));
    expect(res.status).toBe(400);
  });

  it('acknowledges but does not reprocess a duplicate id', async () => {
    const payload = spendAlert('a1b2c3d4-0000-4000-8000-000000000003');
    expect(await (await POST(makeRequest(payload, signedHeaders(payload)))).json()).toEqual({ received: true });
    expect(await (await POST(makeRequest(payload, signedHeaders(payload)))).json()).toEqual({
      received: true,
      duplicate: true,
    });
  });

  it('accepts an old X-Metronome-Date when no tolerance is set (retries)', async () => {
    const payload = spendAlert();
    const res = await POST(makeRequest(payload, signedHeaders(payload)));
    expect(res.status).toBe(200);
  });

  it('rejects an old X-Metronome-Date when tolerance is set', async () => {
    process.env.METRONOME_WEBHOOK_TOLERANCE_SECONDS = '300';
    const payload = spendAlert();
    const res = await POST(makeRequest(payload, signedHeaders(payload)));
    expect(res.status).toBe(401);
  });

  it('handles flat contract events and unknown types', async () => {
    for (const event of [
      { id: 'c-1', type: 'contract.create', contract_id: 'k1', customer_id: 'u1' },
      { id: 'c-2', type: 'some.future_event' },
    ]) {
      const payload = JSON.stringify(event);
      const res = await POST(makeRequest(payload, signedHeaders(payload)));
      expect(res.status).toBe(200);
    }
  });
});
