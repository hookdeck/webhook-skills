import crypto from 'crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/doubleword/route';

const KEY = Buffer.from('doubleword_test_signing_key_32by'); // 32 raw bytes
const SECRET = `whsec_${KEY.toString('base64')}`; // whsec_ + base64, as shown in the profile

const completed = {
  type: 'batch.completed',
  timestamp: '2026-01-15T12:00:00Z',
  data: {
    batch_id: 'batch_29cd13af-5ce9-487e-98ff-4eb6730c12b4',
    status: 'completed',
    request_counts: { total: 100, completed: 98, failed: 2, cancelled: 0 },
    output_file_id: 'file_b4213e44-3c85-4689-9cae-e6d986785143',
    error_file_id: 'file_49fdc045-77a8-409b-bb3e-d661df05f9fb',
    created_at: '2026-01-15T10:00:00Z',
    finished_at: '2026-01-15T12:00:00Z',
  },
};
const failed = { ...completed, type: 'batch.failed', data: { ...completed.data, status: 'failed' } };

interface Signed { id: string; ts: string; sig: string }

function sign(
  body: string,
  { id = 'msg_test_1', ts = Math.floor(Date.now() / 1000), key = KEY }: { id?: string; ts?: number; key?: Buffer } = {},
): Signed {
  const sig = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  return { id, ts: String(ts), sig: `v1,${sig}` };
}

function whHeaders(s: Signed, prefix = 'webhook'): Record<string, string> {
  return { [`${prefix}-id`]: s.id, [`${prefix}-timestamp`]: s.ts, [`${prefix}-signature`]: s.sig };
}

function post(body: string, headers: Record<string, string>, contentType = 'application/json') {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/doubleword', {
      method: 'POST',
      headers: { 'content-type': contentType, ...headers },
      body,
    }),
  );
}

describe('Doubleword webhook route', () => {
  beforeEach(() => {
    process.env.DOUBLEWORD_WEBHOOK_SECRET = SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('accepts a signed batch.completed event', async () => {
    const body = JSON.stringify(completed);
    const res = await post(body, whHeaders(sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a signed batch.failed event', async () => {
    const body = JSON.stringify(failed);
    const res = await post(body, whHeaders(sign(body)));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types after verification', async () => {
    const body = JSON.stringify({ ...completed, type: 'batch.cancelled' });
    const res = await post(body, whHeaders(sign(body)));
    expect(res.status).toBe(200);
  });

  it('accepts a delivery sent with svix-* headers', async () => {
    const body = JSON.stringify(completed);
    const res = await post(body, whHeaders(sign(body), 'svix'));
    expect(res.status).toBe(200);
  });

  it('accepts when one of several space-separated signatures matches', async () => {
    const body = JSON.stringify(completed);
    const s = sign(body);
    const other = sign(body, { key: Buffer.from('some_other_key_bytes_000000000000') });
    const res = await post(body, whHeaders({ ...s, sig: `${other.sig} ${s.sig}` }));
    expect(res.status).toBe(200);
  });

  it('accepts a non-whsec secret used as raw UTF-8 bytes', async () => {
    process.env.DOUBLEWORD_WEBHOOK_SECRET = 'plain_raw_secret';
    const body = JSON.stringify(completed);
    const res = await post(body, whHeaders(sign(body, { key: Buffer.from('plain_raw_secret') })));
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes, not re-serialized JSON', async () => {
    const body = JSON.stringify(completed, null, 2);
    const res = await post(body, whHeaders(sign(body)));
    expect(res.status).toBe(200);
  });

  it('verifies any content type', async () => {
    const body = JSON.stringify(completed);
    const res = await post(body, whHeaders(sign(body)), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const body = JSON.stringify(completed);
    const res = await post(body, whHeaders({ ...sign(body), sig: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(completed);
    const res = await post(body.replace('98', '99'), whHeaders(sign(body)));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with another key', async () => {
    const body = JSON.stringify(completed);
    const res = await post(body, whHeaders(sign(body, { key: Buffer.from('wrong_key_wrong_key_wrong_key_12') })));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute window', async () => {
    const body = JSON.stringify(completed);
    const res = await post(body, whHeaders(sign(body, { ts: Math.floor(Date.now() / 1000) - 600 })));
    expect(res.status).toBe(400);
  });

  it('rejects missing headers', async () => {
    const res = await post(JSON.stringify(completed), {});
    expect(res.status).toBe(400);
  });

  it('rejects a v1a-only signature', async () => {
    const body = JSON.stringify(completed);
    const s = sign(body);
    const res = await post(body, whHeaders({ ...s, sig: s.sig.replace('v1,', 'v1a,') }));
    expect(res.status).toBe(400);
  });

  it('fails closed when the secret is not configured', async () => {
    delete process.env.DOUBLEWORD_WEBHOOK_SECRET;
    const body = JSON.stringify(completed);
    const res = await post(body, whHeaders(sign(body)));
    expect(res.status).toBe(500);
  });

  it('rejects a verified body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, whHeaders(sign(body)));
    expect(res.status).toBe(400);
  });
});
