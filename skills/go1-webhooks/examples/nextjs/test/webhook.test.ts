import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyGo1Webhook } from '../lib/go1';

// Go1 secret_key: max 64 chars, used as a raw UTF-8 string (special characters are part of the key)
const SECRET = 'MyS3cretK#y';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.GO1_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/go1/route'));
});

// Go1 `t` is Unix MILLISECONDS
function sign(body: string, secret = SECRET, t = Date.now()): string {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

const event = (type: string) => ({ id: 'ABnJ5giCDEFG', event_type: type });

function makeRequest(body: string, header?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (header) headers['go1-signature'] = header;
  return new NextRequest('http://localhost:3000/webhooks/go1', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyGo1Webhook', () => {
  const body = JSON.stringify(event('enrollment.create'));

  it('accepts a valid signature', () => {
    expect(verifyGo1Webhook(body, sign(body), SECRET)).toBe(true);
  });

  it('uses t verbatim (milliseconds); a seconds-converted t does not match', () => {
    const t = 1706747802205;
    const header = sign(body, SECRET, t);
    expect(verifyGo1Webhook(body, header, SECRET)).toBe(true);
    expect(verifyGo1Webhook(body, header.replace(`t=${t}`, `t=${Math.floor(t / 1000)}`), SECRET)).toBe(false);
  });

  it('rejects wrong secret', () => {
    expect(verifyGo1Webhook(body, sign(body, 'other'), SECRET)).toBe(false);
  });

  it('rejects tampered body', () => {
    expect(verifyGo1Webhook(body + ' ', sign(body), SECRET)).toBe(false);
  });

  it('accepts an old timestamp by default (retries keep the original t)', () => {
    delete process.env.GO1_TIMESTAMP_TOLERANCE_SECONDS;
    const old = Date.now() - 86400 * 1000;
    expect(verifyGo1Webhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
  });

  it('rejects an old timestamp with an explicit tolerance (milliseconds t, seconds tolerance)', () => {
    const old = Date.now() - 600 * 1000;
    expect(verifyGo1Webhook(body, sign(body, SECRET, old), SECRET, 300)).toBe(false);
  });

  it('accepts a fresh timestamp with a tolerance', () => {
    expect(verifyGo1Webhook(body, sign(body), SECRET, 300)).toBe(true);
  });

  it('rejects an old timestamp when GO1_TIMESTAMP_TOLERANCE_SECONDS is set', () => {
    process.env.GO1_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Date.now() - 600 * 1000;
      expect(verifyGo1Webhook(body, sign(body, SECRET, old), SECRET)).toBe(false);
    } finally {
      delete process.env.GO1_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  it('rejects malformed headers', () => {
    expect(verifyGo1Webhook(body, 'garbage', SECRET)).toBe(false);
    expect(verifyGo1Webhook(body, 't=abc,v1=00', SECRET)).toBe(false);
    expect(verifyGo1Webhook(body, `t=${Date.now()}`, SECRET)).toBe(false);
    expect(verifyGo1Webhook(body, null, SECRET)).toBe(false);
  });

  it('accepts when any v1 signature matches', () => {
    expect(verifyGo1Webhook(body, `${sign(body)},v1=deadbeef`, SECRET)).toBe(true);
  });
});

describe('POST /webhooks/go1', () => {
  it.each(['enrollment.create', 'enrollment.update', 'enrollment.delete', 'something.new'])(
    'returns 200 for a valid %s event',
    async (type) => {
      const body = JSON.stringify(event(type));
      const res = await POST(makeRequest(body, sign(body)));
      expect(res.status).toBe(200);
    }
  );

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify(event('enrollment.create'));
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const body = JSON.stringify(event('enrollment.create'));
    const res = await POST(makeRequest(body, sign(body, 'wrong')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a missing header', async () => {
    const res = await POST(makeRequest(JSON.stringify(event('enrollment.create'))));
    expect(res.status).toBe(400);
  });

  it('returns 400 for validly signed invalid JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(400);
  });
});
