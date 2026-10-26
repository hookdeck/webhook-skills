import crypto from 'crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyBindbeeSignature } from '../lib/verify';

const SECRET = 'bb_sig_test_secret_Value-123'; // Bindbee secrets have no prefix; used as raw UTF-8 bytes

function sign(id: string, timestamp: string, body: string | Buffer, secret = SECRET): string {
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'utf8');
  const content = Buffer.concat([Buffer.from(`${id}.${timestamp}.`), Buffer.from(body)]);
  return `v1,${crypto.createHmac('sha256', key).update(content).digest('base64')}`;
}

function payload(event: string): string {
  return JSON.stringify({
    id: 'evt_123',
    event,
    version: '2026.10.06',
    sequence: 7,
    occurred_at: '2026-10-06T10:00:00Z',
    webhook: { event },
    connector: { id: 'con_1' },
    data: { id: 'emp_1' },
  });
}

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.BINDBEE_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/bindbee/route'));
});

function makeRequest(body: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  const ts = String(Math.floor(Date.now() / 1000));
  return new NextRequest('http://localhost/webhooks/bindbee', {
    method: 'POST',
    body,
    headers: {
      'content-type': contentType,
      'webhook-id': 'msg_1',
      'webhook-timestamp': ts,
      'webhook-signature': sign('msg_1', ts, body),
      ...headers,
    },
  });
}

describe('Bindbee webhook route', () => {
  const events = [
    'connector.linked',
    'connector.relinked',
    'connector.relink_needed',
    'connector.sync.started',
    'connector.sync.completed',
    'connector.sync.failed',
    'hris.employee.created',
    'hris.employee.updated',
    'hris.location.created',
  ];

  for (const event of events) {
    it(`accepts a valid ${event} delivery`, async () => {
      const res = await POST(makeRequest(payload(event)));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });
  }

  it('rejects a wrong signature', async () => {
    const res = await POST(makeRequest(payload('connector.linked'), { 'webhook-signature': 'v1,AAAA' }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = sign('msg_1', ts, payload('connector.linked'));
    const res = await POST(
      makeRequest(payload('hris.employee.created'), { 'webhook-timestamp': ts, 'webhook-signature': sig })
    );
    expect(res.status).toBe(400);
  });

  it('rejects missing headers', async () => {
    const req = new NextRequest('http://localhost/webhooks/bindbee', {
      method: 'POST',
      body: payload('connector.linked'),
    });
    expect((await POST(req)).status).toBe(400);
  });

  it('accepts any content type', async () => {
    const res = await POST(makeRequest(payload('connector.linked'), {}, 'text/plain'));
    expect(res.status).toBe(200);
  });
});

describe('verifyBindbeeSignature', () => {
  const body = Buffer.from(payload('connector.linked'));
  const ts = String(Math.floor(Date.now() / 1000));
  const hdrs = (signature: string) => ({ id: 'm1', timestamp: ts, signature });
  const good = sign('m1', ts, body);

  it('accepts a valid signature', () => {
    expect(verifyBindbeeSignature(body, hdrs(good), SECRET)).toBe(true);
  });

  it('accepts any matching v1 entry and ignores other versions', () => {
    expect(verifyBindbeeSignature(body, hdrs(`v1a,${good.slice(3)} v1,AAAA ${good}`), SECRET)).toBe(true);
    expect(verifyBindbeeSignature(body, hdrs(`v1a,${good.slice(3)}`), SECRET)).toBe(false);
  });

  it('uses the secret as raw UTF-8 bytes (no base64 decoding)', () => {
    const wrong = crypto
      .createHmac('sha256', Buffer.from(SECRET, 'base64'))
      .update(Buffer.concat([Buffer.from(`m1.${ts}.`), body]))
      .digest('base64');
    expect(verifyBindbeeSignature(body, hdrs(`v1,${wrong}`), SECRET)).toBe(false);
  });

  it('decodes a whsec_ secret like Hookdeck does', () => {
    const whsec = 'whsec_' + Buffer.from('some key bytes').toString('base64');
    expect(verifyBindbeeSignature(body, hdrs(sign('m1', ts, body, whsec)), whsec)).toBe(true);
  });

  it('fails closed on empty or missing secret', () => {
    expect(verifyBindbeeSignature(body, hdrs(good), undefined)).toBe(false);
    expect(verifyBindbeeSignature(body, hdrs(good), '')).toBe(false);
    expect(verifyBindbeeSignature(body, hdrs(good), 'whsec_')).toBe(false);
  });

  it('requires a plain positive integer timestamp', () => {
    for (const bad of ['0', '-5', '1.5', '01', 'abc', '1e3', ' 12']) {
      expect(
        verifyBindbeeSignature(body, { id: 'm1', timestamp: bad, signature: sign('m1', bad, body) }, SECRET)
      ).toBe(false);
    }
  });

  it('has no timestamp window by default, but can opt in', () => {
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    const h = { id: 'm1', timestamp: old, signature: sign('m1', old, body) };
    expect(verifyBindbeeSignature(body, h, SECRET)).toBe(true);
    expect(verifyBindbeeSignature(body, h, SECRET, 300)).toBe(false);
  });

  it('handles signatures of a different length without throwing', () => {
    expect(verifyBindbeeSignature(body, hdrs('v1,short'), SECRET)).toBe(false);
    expect(verifyBindbeeSignature(body, hdrs('garbage'), SECRET)).toBe(false);
  });
});
