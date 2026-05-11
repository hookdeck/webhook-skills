import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createHmac, randomBytes } from 'crypto';
import { POST, GET } from '../app/webhooks/mailgun/route';

const SIGNING_KEY = 'test-signing-key';
const PARENT_KEY = 'parent-account-signing-key';

beforeAll(() => {
  vi.stubEnv('MAILGUN_WEBHOOK_SIGNING_KEY', SIGNING_KEY);
});

function buildSignature(options: {
  timestamp?: string;
  token?: string;
  signingKey?: string;
} = {}) {
  const timestamp = options.timestamp || Math.floor(Date.now() / 1000).toString();
  const token = options.token || randomBytes(25).toString('hex');
  const signingKey = options.signingKey || SIGNING_KEY;
  const signature = createHmac('sha256', signingKey)
    .update(timestamp + token)
    .digest('hex');
  return { timestamp, token, signature };
}

function buildPayload(event: string, extra: Record<string, unknown> = {}) {
  return {
    signature: buildSignature(),
    'event-data': {
      event,
      id: 'CPgfbmQMTCKtHW6uIWtuVe',
      timestamp: Date.now() / 1000,
      recipient: 'alice@example.com',
      ...extra,
    },
  };
}

function createRequest(body: unknown) {
  return new Request('http://localhost:3000/webhooks/mailgun', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('Mailgun Webhook Handler', () => {
  describe('POST /webhooks/mailgun', () => {
    it('returns 400 when signature object is missing', async () => {
      const res = await POST(createRequest({ 'event-data': { event: 'delivered' } }) as never);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/Missing signature/);
    });

    it('returns 400 for an invalid signature', async () => {
      const payload = {
        signature: {
          timestamp: '1700000000',
          token: 'abcdef0123456789abcdef0123456789abcdef0123456789ab',
          signature: 'deadbeef'.repeat(8),
        },
        'event-data': { event: 'delivered', recipient: 'alice@example.com' },
      };
      const res = await POST(createRequest(payload) as never);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Invalid signature');
    });

    it('returns 400 if signature was generated with a different key', async () => {
      const sig = buildSignature({ signingKey: 'WRONG-KEY' });
      const payload = {
        signature: sig,
        'event-data': { event: 'delivered', recipient: 'alice@example.com' },
      };
      const res = await POST(createRequest(payload) as never);
      expect(res.status).toBe(400);
    });

    it('returns 400 if timestamp/token fields are missing', async () => {
      const payload = {
        signature: { signature: 'abc' },
        'event-data': { event: 'delivered' },
      };
      const res = await POST(createRequest(payload) as never);
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await POST(createRequest('not-json') as never);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Invalid JSON payload');
    });

    it('returns 200 for a valid signature', async () => {
      const payload = buildPayload('delivered');
      const res = await POST(createRequest(payload) as never);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ received: true });
    });

    it('returns 400 when event-data is missing', async () => {
      const payload = { signature: buildSignature() };
      const res = await POST(createRequest(payload) as never);
      expect(res.status).toBe(400);
    });

    it('handles all common event types', async () => {
      const events: [string, Record<string, unknown>][] = [
        ['accepted', {}],
        ['rejected', { reject: { reason: 'Suppressed' } }],
        ['delivered', {}],
        ['failed', { severity: 'permanent', 'delivery-status': { code: 550 } }],
        ['failed', { severity: 'temporary', 'delivery-status': { code: 421 } }],
        ['opened', { ip: '1.2.3.4' }],
        ['clicked', { url: 'https://example.com', ip: '1.2.3.4' }],
        ['unsubscribed', {}],
        ['complained', {}],
        ['stored', { storage: { url: 'https://...', key: 'abc' } }],
        ['list_member_uploaded', { 'mailing-list': { address: 'list@x.com' } }],
        ['unknown.event', {}],
      ];

      for (const [event, extra] of events) {
        const payload = buildPayload(event, extra);
        const res = await POST(createRequest(payload) as never);
        expect(res.status).toBe(200);
      }
    });

    it('verifies parent-signature when configured', async () => {
      process.env.MAILGUN_PARENT_WEBHOOK_SIGNING_KEY = PARENT_KEY;

      const sig = buildSignature();
      const parentSignature = createHmac('sha256', PARENT_KEY)
        .update(sig.timestamp + sig.token)
        .digest('hex');

      const payload = {
        signature: { ...sig, 'parent-signature': parentSignature },
        'event-data': { event: 'delivered', recipient: 'alice@example.com' },
      };

      try {
        const res = await POST(createRequest(payload) as never);
        expect(res.status).toBe(200);
      } finally {
        delete process.env.MAILGUN_PARENT_WEBHOOK_SIGNING_KEY;
      }
    });

    it('rejects an invalid parent-signature when parent key is configured', async () => {
      process.env.MAILGUN_PARENT_WEBHOOK_SIGNING_KEY = PARENT_KEY;

      const sig = buildSignature();
      const payload = {
        signature: { ...sig, 'parent-signature': 'a'.repeat(64) },
        'event-data': { event: 'delivered', recipient: 'alice@example.com' },
      };

      try {
        const res = await POST(createRequest(payload) as never);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toMatch(/parent-signature/);
      } finally {
        delete process.env.MAILGUN_PARENT_WEBHOOK_SIGNING_KEY;
      }
    });
  });

  describe('GET /webhooks/mailgun', () => {
    it('returns health status', async () => {
      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');
    });
  });
});
