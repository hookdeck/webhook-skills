import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Chatim webhook secrets are opaque strings; this one is only for tests
const SECRET = 'test_chatim_secret_5f0c1a7e';

let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.CHATIM_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/chatim/route'));
});

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  delete process.env.CHATIM_WEBHOOK_TOLERANCE_SECONDS;
  process.env.CHATIM_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const now = () => Math.floor(Date.now() / 1000);

// Matches Chatim's scheme: "sha256=" + hex HMAC-SHA256 of "<timestamp>.<raw body>"
function sign(body: string, { timestamp = now(), secret = SECRET }: { timestamp?: number; secret?: string } = {}) {
  const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return { 'x-chatim-signature': `sha256=${sig}`, 'x-chatim-timestamp': String(timestamp) } as Record<string, string>;
}

function event(name: string, data: Record<string, unknown> = {}) {
  return JSON.stringify({
    event: name,
    eventId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    timestamp: '2025-01-15T10:30:00.000Z',
    projectUuid: 'project-uuid',
    chatUuid: 'chat-uuid',
    data: { visitor: { uuid: 'visitor-uuid', name: 'John Doe' }, ...data },
  });
}

function post(body: string, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/chatim', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    })
  );
}

describe('Chatim webhook', () => {
  describe('signature verification', () => {
    it('accepts a valid sha256= signature', async () => {
      const body = event('chat.started', { page: { url: 'https://example.com' } });
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts the bare digest without the sha256= prefix', async () => {
      const body = event('chat.closed', { closedBy: 'agent', duration: 5 });
      const h = sign(body);
      h['x-chatim-signature'] = h['x-chatim-signature'].slice('sha256='.length);
      expect((await post(body, h)).status).toBe(200);
    });

    it('accepts an uppercase hex digest', async () => {
      const body = event('chat.started');
      const h = sign(body);
      h['x-chatim-signature'] = 'sha256=' + h['x-chatim-signature'].slice(7).toUpperCase();
      expect((await post(body, h)).status).toBe(200);
    });

    it('verifies the exact raw bytes, not a re-serialized body', async () => {
      const body = '{ "event" : "chat.started",\n  "data" : {} }';
      expect((await post(body, sign(body))).status).toBe(200);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const body = event('chat.started');
      expect((await post(body, sign(body, { secret: 'wrong_secret' }))).status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const body = event('chat.started');
      expect((await post(event('chat.closed'), sign(body))).status).toBe(401);
    });

    it('rejects a tampered timestamp', async () => {
      const body = event('chat.started');
      const h = sign(body);
      h['x-chatim-timestamp'] = String(now() + 1);
      expect((await post(body, h)).status).toBe(401);
    });

    it('rejects a missing or empty signature', async () => {
      const body = event('chat.started');
      const h = sign(body);
      expect((await post(body, { 'x-chatim-timestamp': h['x-chatim-timestamp'] })).status).toBe(401);
      expect((await post(body, { ...h, 'x-chatim-signature': '' })).status).toBe(401);
    });

    it('rejects a missing or empty timestamp header', async () => {
      const body = event('chat.started');
      const h = sign(body);
      expect((await post(body, { 'x-chatim-signature': h['x-chatim-signature'] })).status).toBe(401);
      expect((await post(body, { ...h, 'x-chatim-timestamp': '' })).status).toBe(401);
    });

    it('rejects malformed signatures', async () => {
      const body = event('chat.started');
      const h = sign(body);
      const good = h['x-chatim-signature'].slice(7);
      for (const bad of [
        'sha256=abc123',
        'sha256=' + 'zz'.repeat(32),
        'sha256=' + good + '00',
        'sha1=' + good,
        'not-a-signature',
      ]) {
        const res = await post(body, { 'x-chatim-signature': bad, 'x-chatim-timestamp': h['x-chatim-timestamp'] });
        expect(res.status).toBe(401);
      }
    });

    it('returns 500 when the secret is not configured', async () => {
      delete process.env.CHATIM_WEBHOOK_SECRET;
      const body = event('chat.started');
      expect((await post(body, sign(body))).status).toBe(500);
    });
  });

  describe('timestamp tolerance (opt-in)', () => {
    const old = now() - 3600;

    it('does not reject old timestamps by default', async () => {
      const body = event('chat.started');
      expect((await post(body, sign(body, { timestamp: old }))).status).toBe(200);
    });

    it('rejects old timestamps when CHATIM_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
      process.env.CHATIM_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = event('chat.started');
      expect((await post(body, sign(body, { timestamp: old }))).status).toBe(401);
      expect((await post(body, sign(body))).status).toBe(200);
    });

    it('treats 0 as off', async () => {
      process.env.CHATIM_WEBHOOK_TOLERANCE_SECONDS = '0';
      const body = event('chat.started');
      expect((await post(body, sign(body, { timestamp: old }))).status).toBe(200);
    });
  });

  describe('event handling', () => {
    const events = [
      'chat.started',
      'chat.message.received',
      'chat.form.submitted',
      'chat.closed',
      'chat.assigned',
      'chat.handoff',
    ];

    it.each(events)('handles %s', async (name) => {
      const body = event(name);
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled event'));
    });

    it('logs unknown events and still returns 200', async () => {
      const body = event('chat.something.else');
      expect((await post(body, sign(body))).status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled event: chat.something.else');
    });

    it('returns 400 for a validly signed non-JSON body', async () => {
      const body = 'not json';
      expect((await post(body, sign(body))).status).toBe(400);
    });
  });
});
