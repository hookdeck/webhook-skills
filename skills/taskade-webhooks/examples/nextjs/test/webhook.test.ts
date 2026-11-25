import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyTaskadeWebhook, taskadeEventType } from '../lib/verify';

const SECRET = 'test_taskade_secret';

beforeAll(() => {
  process.env.TASKADE_WEBHOOK_SECRET = SECRET;
});

/**
 * Generate a valid X-Taskade-Signature-V2 value: sha256=<hex> of "<timestamp>.<raw body>"
 */
function generateTaskadeSignature(payload: string | Buffer, timestamp: string, secret: string): string {
  const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(payload).digest('hex');
  return `sha256=${digest}`;
}

function now(): string {
  return String(Math.floor(Date.now() / 1000));
}

// Test bodies use field names from Taskade's Delivery payload table with placeholder values
const bodies: Record<string, Record<string, unknown>> = {
  'task.due': { projectId: 'p_test', id: 'n_test', text: 'test', taskEndDate: 'test' },
  'task.assigned': { projectId: 'p_test', assignedNodes: [], nodes: [] },
  'comment.created': { projectId: 'p_test', nodeId: 'n_test', commentBody: 'test' },
  'project.created': { projectId: 'p_test', creatorName: 'test' },
  'project.assigned': { projectId: 'p_test', assigneeId: 'u_test' },
  'project.joined': { projectId: 'p_test', joinerUserId: 'u_test' },
};

describe('verifyTaskadeWebhook', () => {
  const body = Buffer.from('{"projectId":"p_test"}');

  it('returns true for a valid signature', () => {
    const ts = now();
    expect(verifyTaskadeWebhook(body, generateTaskadeSignature(body, ts, SECRET), ts, SECRET)).toBe(true);
  });

  it('accepts the bare digest without the prefix', () => {
    const ts = now();
    const bare = generateTaskadeSignature(body, ts, SECRET).slice('sha256='.length);
    expect(verifyTaskadeWebhook(body, bare, ts, SECRET)).toBe(true);
  });

  it('returns false for a timestamp more than 5 minutes old', () => {
    const ts = String(Math.floor(Date.now() / 1000) - 301);
    expect(verifyTaskadeWebhook(body, generateTaskadeSignature(body, ts, SECRET), ts, SECRET)).toBe(false);
  });

  it('returns false for a body-only signature', () => {
    const ts = now();
    const bodyOnly = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifyTaskadeWebhook(body, bodyOnly, ts, SECRET)).toBe(false);
  });

  it('returns false for invalid or non-hex signatures', () => {
    const ts = now();
    expect(verifyTaskadeWebhook(body, 'sha256=invalid', ts, SECRET)).toBe(false);
    expect(verifyTaskadeWebhook(body, 'sha256=' + 'zz'.repeat(32), ts, SECRET)).toBe(false);
  });

  it('returns false for a different secret', () => {
    const ts = now();
    expect(verifyTaskadeWebhook(body, generateTaskadeSignature(body, ts, 'other'), ts, SECRET)).toBe(false);
  });

  it('returns false for missing headers or secret', () => {
    const ts = now();
    const sig = generateTaskadeSignature(body, ts, SECRET);
    expect(verifyTaskadeWebhook(body, null, ts, SECRET)).toBe(false);
    expect(verifyTaskadeWebhook(body, sig, null, SECRET)).toBe(false);
    expect(verifyTaskadeWebhook(body, sig, ts, undefined)).toBe(false);
  });
});

describe('taskadeEventType', () => {
  it.each(Object.entries(bodies))('identifies %s from its fields', (event, body) => {
    expect(taskadeEventType(body)).toBe(event);
  });

  it('returns undefined for an unrecognised body', () => {
    expect(taskadeEventType({ projectId: 'p_test' })).toBeUndefined();
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

  function signed(body: string, ts = now()) {
    return { 'x-taskade-timestamp': ts, 'x-taskade-signature-v2': generateTaskadeSignature(body, ts, SECRET) };
  }

  it('returns 401 for a missing signature', async () => {
    const response = await post(JSON.stringify(bodies['task.due']));
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const response = await post(JSON.stringify(bodies['task.due']), {
      'x-taskade-timestamp': now(),
      'x-taskade-signature-v2': 'sha256=invalid',
    });
    expect(response.status).toBe(401);
  });

  it.each(Object.keys(bodies))('returns 200 for a valid %s delivery', async (event) => {
    const body = JSON.stringify(bodies[event]);
    const response = await post(body, signed(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('verifies pretty-printed JSON that JSON.stringify would change', async () => {
    const body = JSON.stringify(bodies['task.assigned'], null, 4);
    const response = await post(body, signed(body));
    expect(response.status).toBe(200);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const response = await post(body, signed(body));
    expect(response.status).toBe(400);
  });
});
