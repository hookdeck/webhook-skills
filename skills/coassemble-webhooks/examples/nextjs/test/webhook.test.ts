import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Coassemble webhook secrets are opaque strings; this one is only for tests
const SECRET = 'test_coassemble_secret_5f0c1a7e';

let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.COASSEMBLE_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/coassemble/route'));
});

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  delete process.env.COASSEMBLE_WEBHOOK_TOLERANCE_SECONDS;
  process.env.COASSEMBLE_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const now = () => Math.floor(Date.now() / 1000);

// Matches Coassemble's scheme: "sha256=" + hex HMAC-SHA256 of "<timestamp>.<raw body>"
function sign(body: string, { timestamp = now(), secret = SECRET }: { timestamp?: number; secret?: string } = {}) {
  const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return { 'x-coassemble-signature': `sha256=${sig}`, 'x-coassemble-timestamp': String(timestamp) } as Record<string, string>;
}


function event(type: string, data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: '17fd9df8-c77a-4b7d-a281-267b74f8cbf3',
    type,
    occurredAt: '2026-02-22T10:15:30.000Z',
    workspaceId: 1234,
    testMode: false,
    data: {
      course: { id: 4321, title: 'Security Basics', key: 'security-basics', clientIdentifier: 'course_abc' },
      tracking: { id: 8888, identifier: 'user_123', email: 'user@example.com', commenced: '2026-02-22T10:01:00.000Z', completed: '2026-02-22T10:15:30.000Z', totalTime: 870 },
      ...data,
    },
    ...extra,
  });
}

function post(body: string, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/coassemble', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    })
  );
}

describe('Coassemble webhook', () => {
  describe('signature verification', () => {
    it('accepts a valid sha256= signature', async () => {
      const body = event('course.completed');
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts the bare digest without the sha256= prefix', async () => {
      const body = event('course.commenced');
      const h = sign(body);
      h['x-coassemble-signature'] = h['x-coassemble-signature'].slice('sha256='.length);
      expect((await post(body, h)).status).toBe(200);
    });

    it('accepts an uppercase hex digest', async () => {
      const body = event('course.completed');
      const h = sign(body);
      h['x-coassemble-signature'] = 'sha256=' + h['x-coassemble-signature'].slice(7).toUpperCase();
      expect((await post(body, h)).status).toBe(200);
    });

    it('verifies the exact raw bytes, not a re-serialized body', async () => {
      const body = '{ "type" : "course.completed",\n  "data" : {} }';
      expect((await post(body, sign(body))).status).toBe(200);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const body = event('course.completed');
      expect((await post(body, sign(body, { secret: 'wrong_secret' }))).status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const body = event('course.completed');
      expect((await post(event('course.commenced'), sign(body))).status).toBe(401);
    });

    it('rejects a tampered timestamp', async () => {
      const body = event('course.completed');
      const h = sign(body);
      h['x-coassemble-timestamp'] = String(now() + 1);
      expect((await post(body, h)).status).toBe(401);
    });

    it('rejects a missing or empty signature', async () => {
      const body = event('course.completed');
      const h = sign(body);
      expect((await post(body, { 'x-coassemble-timestamp': h['x-coassemble-timestamp'] })).status).toBe(401);
      expect((await post(body, { ...h, 'x-coassemble-signature': '' })).status).toBe(401);
    });

    it('rejects a missing or empty timestamp header', async () => {
      const body = event('course.completed');
      const h = sign(body);
      expect((await post(body, { 'x-coassemble-signature': h['x-coassemble-signature'] })).status).toBe(401);
      expect((await post(body, { ...h, 'x-coassemble-timestamp': '' })).status).toBe(401);
    });

    it('rejects malformed signatures', async () => {
      const body = event('course.completed');
      const h = sign(body);
      const good = h['x-coassemble-signature'].slice(7);
      for (const bad of [
        'sha256=abc123',
        'sha256=' + 'zz'.repeat(32),
        'sha256=' + good + '00',
        'sha1=' + good,
        'not-a-signature',
      ]) {
        const res = await post(body, { 'x-coassemble-signature': bad, 'x-coassemble-timestamp': h['x-coassemble-timestamp'] });
        expect(res.status).toBe(401);
      }
    });

    it('returns 500 when the secret is not configured', async () => {
      delete process.env.COASSEMBLE_WEBHOOK_SECRET;
      const body = event('course.completed');
      expect((await post(body, sign(body))).status).toBe(500);
    });
  });

  describe('timestamp tolerance (opt-in)', () => {
    const old = now() - 3600;

    it('does not reject old timestamps by default', async () => {
      const body = event('course.completed');
      expect((await post(body, sign(body, { timestamp: old }))).status).toBe(200);
    });

    it('rejects old timestamps when COASSEMBLE_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
      process.env.COASSEMBLE_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = event('course.completed');
      expect((await post(body, sign(body, { timestamp: old }))).status).toBe(401);
      expect((await post(body, sign(body))).status).toBe(200);
    });

    it('treats 0 as off', async () => {
      process.env.COASSEMBLE_WEBHOOK_TOLERANCE_SECONDS = '0';
      const body = event('course.completed');
      expect((await post(body, sign(body, { timestamp: old }))).status).toBe(200);
    });
  });

  describe('event handling', () => {
    const events = [
      'course.created',
      'course.commenced',
      'course.completed',
      'quiz.completed',
      'quiz.failed',
      'migration.progress',
      'migration.completed',
    ];

    it.each(events)('handles %s', async (name) => {
      const body = event(name);
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled event'));
    });

    it('acknowledges testMode events without taking action', async () => {
      const body = event('course.completed', {}, { testMode: true });
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Test event course.completed acknowledged (no action taken)');
    });

    it('logs unknown events and still returns 200', async () => {
      const body = event('course.something.else');
      expect((await post(body, sign(body))).status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled event: course.something.else');
    });

    it('returns 400 for a validly signed non-JSON body', async () => {
      const body = 'not json';
      expect((await post(body, sign(body))).status).toBe(400);
    });
  });
});
