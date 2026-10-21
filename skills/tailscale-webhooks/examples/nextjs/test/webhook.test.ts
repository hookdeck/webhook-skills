import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyTailscaleWebhook } from '../lib/tailscale';

// Tailscale secrets look like tskey-webhook-xxxxx and are used as a raw string
const SECRET = 'tskey-webhook-test123';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.TAILSCALE_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/tailscale/route'));
});

function sign(body: string, secret = SECRET, t = Math.floor(Date.now() / 1000)): string {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

const event = (type: string, data: Record<string, string> | null = null) => ({
  timestamp: '2022-09-21T13:59:02.949217-04:00',
  version: 1,
  type,
  tailnet: 'example.com',
  message: `${type} happened`,
  data,
});

function makeRequest(body: string, header?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (header) headers['tailscale-webhook-signature'] = header;
  return new NextRequest('http://localhost:3000/webhooks/tailscale', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyTailscaleWebhook', () => {
  const body = JSON.stringify([event('test')]);

  it('accepts a valid signature', () => {
    expect(verifyTailscaleWebhook(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects wrong secret', () => {
    expect(verifyTailscaleWebhook(body, sign(body, 'tskey-webhook-other'), SECRET)).toBe(false);
  });

  it('rejects tampered body', () => {
    expect(verifyTailscaleWebhook(body + ' ', sign(body), SECRET)).toBe(false);
  });

  it('accepts an old timestamp by default (retries keep the original t)', () => {
    delete process.env.TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS;
    const old = Math.floor(Date.now() / 1000) - 86400;
    expect(verifyTailscaleWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
  });

  it('rejects an old timestamp with an explicit tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyTailscaleWebhook(body, sign(body, SECRET, old), SECRET, 300)).toBe(false);
  });

  it('rejects an old timestamp when TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS is set', () => {
    process.env.TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyTailscaleWebhook(body, sign(body, SECRET, old), SECRET)).toBe(false);
    } finally {
      delete process.env.TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  it('treats a non-numeric TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', () => {
    process.env.TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyTailscaleWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
    } finally {
      delete process.env.TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });

  it('rejects malformed headers', () => {
    expect(verifyTailscaleWebhook(body, 'garbage', SECRET)).toBe(false);
    expect(verifyTailscaleWebhook(body, 't=abc,v1=00', SECRET)).toBe(false);
    expect(verifyTailscaleWebhook(body, null, SECRET)).toBe(false);
  });

  it('accepts when any v1 signature matches', () => {
    expect(verifyTailscaleWebhook(body, `${sign(body)},v1=deadbeef`, SECRET)).toBe(true);
  });
});

describe('POST /webhooks/tailscale', () => {
  it('returns 200 for a valid batch of events', async () => {
    const body = JSON.stringify([
      event('test'),
      event('nodeCreated', { nodeID: 'nFJw3SRKTM59', deviceName: 'alice-ws1.ts.net' }),
      event('nodeNeedsApproval', { deviceName: 'alice-ws1.ts.net' }),
      event('nodeApproved', { deviceName: 'alice-ws1.ts.net' }),
      event('nodeKeyExpiringInOneDay', { deviceName: 'alice-ws1.ts.net' }),
      event('nodeDeleted', { deviceName: 'alice-ws1.ts.net' }),
      event('policyUpdate', { actor: 'admin@example.com' }),
      event('userCreated', { user: 'bob@example.com' }),
      event('somethingNew'),
    ]);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const body = JSON.stringify([event('test')]);
    const res = await POST(makeRequest(body, sign(body, 'tskey-webhook-wrong')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a missing header', async () => {
    const res = await POST(makeRequest(JSON.stringify([event('test')])));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a validly signed non-array body', async () => {
    const body = JSON.stringify({ type: 'test' });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(400);
  });

  it('returns 400 for validly signed invalid JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(400);
  });
});
