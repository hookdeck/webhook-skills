import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyTodoistWebhook, seenDeliveries } from '../lib/todoist';

const secret = 'test_client_secret';
let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.TODOIST_CLIENT_SECRET = secret;
  ({ POST } = await import('../app/webhooks/todoist/route'));
});

beforeEach(() => seenDeliveries.clear());

// Todoist: base64(HMAC-SHA256(client_secret, raw body))
function sign(payload: string, key: string): string {
  return crypto.createHmac('sha256', key).update(payload, 'utf8').digest('base64');
}

function event(name: string): string {
  return JSON.stringify({
    event_name: name,
    user_id: '2671355',
    event_data: { id: '6XR4GqQQCW6Gv9h4', content: 'Buy Milk' },
    initiator: { id: '2671355', email: 'alice@example.com', full_name: 'Alice' },
    triggered_at: '2025-02-10T10:39:38.000000Z',
    version: '10',
  });
}

function makeRequest(body: string, headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/todoist', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyTodoistWebhook', () => {
  it('accepts a valid signature', () => {
    const body = event('item:added');
    expect(verifyTodoistWebhook(body, sign(body, secret), secret)).toBe(true);
  });

  it('rejects invalid, mismatched-secret, tampered and missing signatures', () => {
    const body = event('item:added');
    expect(verifyTodoistWebhook(body, 'bad', secret)).toBe(false);
    expect(verifyTodoistWebhook(body, sign(body, 'other'), secret)).toBe(false);
    expect(verifyTodoistWebhook(event('item:deleted'), sign(body, secret), secret)).toBe(false);
    expect(verifyTodoistWebhook(body, null, secret)).toBe(false);
  });
});

describe('POST /webhooks/todoist', () => {
  it.each(['item:added', 'item:completed', 'note:added', 'project:added'])(
    'returns 200 for a signed %s event',
    async (name) => {
      const body = event(name);
      const res = await POST(
        makeRequest(body, {
          'content-type': 'application/json',
          'x-todoist-hmac-sha256': sign(body, secret),
          'x-todoist-delivery-id': `d-${name}`,
        })
      );
      expect(res.status).toBe(200);
    }
  );

  it('returns 400 for a missing signature', async () => {
    const res = await POST(makeRequest(event('item:added'), { 'content-type': 'application/json' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(
      makeRequest(event('item:added'), {
        'content-type': 'application/json',
        'x-todoist-hmac-sha256': 'invalid',
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-todoist-hmac-sha256': sign(body, secret) }));
    expect(res.status).toBe(400);
  });

  it('flags a retried delivery as a duplicate', async () => {
    const body = event('item:added');
    const headers = {
      'content-type': 'application/json',
      'x-todoist-hmac-sha256': sign(body, secret),
      'x-todoist-delivery-id': 'dup-1',
    };
    await POST(makeRequest(body, headers));
    const second = await POST(makeRequest(body, headers));
    expect(second.status).toBe(200);
    expect((await second.json()).duplicate).toBe(true);
  });

  it('returns 200 for unhandled events', async () => {
    const body = event('label:added');
    const res = await POST(
      makeRequest(body, { 'x-todoist-hmac-sha256': sign(body, secret) })
    );
    expect(res.status).toBe(200);
  });
});
