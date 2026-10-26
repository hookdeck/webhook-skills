import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyTaskadeWebhook } from '../lib/verify';

const SECRET = 'test_taskade_secret';

beforeAll(() => {
  process.env.TASKADE_WEBHOOK_SECRET = SECRET;
});

/**
 * Generate a valid Taskade signature for testing (sha256=<hex> of the raw body)
 */
function generateTaskadeSignature(payload: string | Buffer, secret: string): string {
  const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${digest}`;
}

describe('verifyTaskadeWebhook', () => {
  const body = Buffer.from('{"event":"task.due"}');

  it('returns true for a valid signature', () => {
    expect(verifyTaskadeWebhook(body, generateTaskadeSignature(body, SECRET), SECRET)).toBe(true);
  });

  it('accepts the bare digest without the prefix', () => {
    const bare = generateTaskadeSignature(body, SECRET).slice('sha256='.length);
    expect(verifyTaskadeWebhook(body, bare, SECRET)).toBe(true);
  });

  it('accepts an uppercase hex digest', () => {
    const sig = 'sha256=' + generateTaskadeSignature(body, SECRET).slice(7).toUpperCase();
    expect(verifyTaskadeWebhook(body, sig, SECRET)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(verifyTaskadeWebhook(body, 'sha256=invalid', SECRET)).toBe(false);
  });

  it('returns false for right-length non-hex characters', () => {
    expect(verifyTaskadeWebhook(body, 'sha256=' + 'zz'.repeat(32), SECRET)).toBe(false);
  });

  it('returns false for a different secret', () => {
    expect(verifyTaskadeWebhook(body, generateTaskadeSignature(body, 'other'), SECRET)).toBe(false);
  });

  it('returns false for a missing or empty signature', () => {
    expect(verifyTaskadeWebhook(body, null, SECRET)).toBe(false);
    expect(verifyTaskadeWebhook(body, '', SECRET)).toBe(false);
  });

  it('returns false when no secret is configured', () => {
    expect(verifyTaskadeWebhook(body, generateTaskadeSignature(body, SECRET), undefined)).toBe(false);
  });

  it('verifies raw bytes, not re-serialized JSON', () => {
    const raw = Buffer.from('{ "event" : "task.due",  "task": {} }');
    expect(verifyTaskadeWebhook(raw, generateTaskadeSignature(raw, SECRET), SECRET)).toBe(true);
  });
});

describe('POST /webhooks/taskade', () => {
  async function post(body: string, headers: Record<string, string> = {}) {
    const { POST } = await import('../app/webhooks/taskade/route');
    const request = new NextRequest('http://localhost:3000/webhooks/taskade', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    });
    return POST(request);
  }

  it('returns 401 for a missing signature', async () => {
    const response = await post('{"event":"task.due"}');
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const response = await post('{"event":"task.due"}', { 'x-taskade-signature': 'sha256=invalid' });
    expect(response.status).toBe(401);
  });

  it.each(['task.due', 'task.assigned', 'comment.created', 'project.created', 'project.joined'])(
    'returns 200 for a valid %s event',
    async (event) => {
      const body = JSON.stringify({ event });
      const response = await post(body, { 'x-taskade-signature': generateTaskadeSignature(body, SECRET) });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ received: true });
    }
  );

  it('verifies pretty-printed JSON that JSON.stringify would change', async () => {
    const body = JSON.stringify({ event: 'task.assigned', task: { id: 't_1' } }, null, 4);
    const response = await post(body, { 'x-taskade-signature': generateTaskadeSignature(body, SECRET) });
    expect(response.status).toBe(200);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const response = await post(body, { 'x-taskade-signature': generateTaskadeSignature(body, SECRET) });
    expect(response.status).toBe(400);
  });
});
