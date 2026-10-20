import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/clickup/route';

// ClickUp secrets are 64-char uppercase alphanumeric strings (webhook.secret from the API)
const webhookSecret = 'O94IM25S7PXBPYTMNXLLET230SRP0S89COR7B1YOJ2ZIE8WQNK5UUKEF26W0Z5GA';
const webhookId = '7fa3ec74-69a8-4530-a251-8a13730bd204';

beforeAll(() => {
  process.env.CLICKUP_WEBHOOK_SECRET = webhookSecret;
});

/**
 * Generate an X-Signature value the same way ClickUp does:
 * hex(HMAC-SHA256(secret, rawBody))
 */
function generateClickUpSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function buildRequest(body: string, signature?: string | null): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const sig = signature === undefined ? generateClickUpSignature(body, webhookSecret) : signature;
  if (sig !== null) {
    headers['X-Signature'] = sig;
  }
  return new Request('http://localhost:3000/webhooks/clickup', {
    method: 'POST',
    headers,
    body,
  });
}

// verifyClickUpWebhook is private to route.ts (Next.js route files may only export
// handlers and route config), so signature cases are exercised through POST.
describe('X-Signature verification', () => {
  const body = '{"webhook_id":"7689a169-a000-4985-8676-6902b96d6627","event":"taskCreated","task_id":"c0j"}';

  async function statusFor(signature: string, payload = body): Promise<number> {
    return (await POST(buildRequest(payload, signature))).status;
  }

  it('accepts a valid signature', async () => {
    expect(await statusFor(generateClickUpSignature(body, webhookSecret))).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    expect(await statusFor(generateClickUpSignature(body, webhookSecret).toUpperCase())).toBe(200);
  });

  it('rejects a malformed signature', async () => {
    expect(await statusFor('invalid')).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    expect(await statusFor(generateClickUpSignature(body, 'wrong_secret'))).toBe(400);
  });

  it('rejects a tampered payload', async () => {
    const signature = generateClickUpSignature(body, webhookSecret);
    expect(await statusFor(signature, body.replace('c0j', 'xyz'))).toBe(400);
  });

  it('rejects a sha256= prefixed signature (ClickUp sends bare hex)', async () => {
    expect(await statusFor(`sha256=${generateClickUpSignature(body, webhookSecret)}`)).toBe(400);
  });

  it('rejects every request when the secret is not configured', async () => {
    delete process.env.CLICKUP_WEBHOOK_SECRET;
    try {
      expect(await statusFor(generateClickUpSignature(body, webhookSecret))).toBe(400);
    } finally {
      process.env.CLICKUP_WEBHOOK_SECRET = webhookSecret;
    }
  });
});

describe('POST /webhooks/clickup', () => {
  it('returns 400 when X-Signature is missing', async () => {
    const body = JSON.stringify({ event: 'taskCreated', task_id: 'abc', webhook_id: webhookId });
    const response = await POST(buildRequest(body, null));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Missing X-Signature header' });
  });

  it('returns 400 (never 401) for an invalid signature', async () => {
    const body = JSON.stringify({ event: 'taskCreated', task_id: 'abc', webhook_id: webhookId });
    const response = await POST(buildRequest(body, 'a'.repeat(64)));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid signature' });
  });

  it('verifies against the raw body, not re-serialized JSON', async () => {
    const body = `{ "event": "taskCreated",  "task_id": "abc", "webhook_id": "${webhookId}" }`;
    const response = await POST(buildRequest(body));

    expect(response.status).toBe(200);
  });

  it('returns 400 for a signed body that is not valid JSON', async () => {
    const response = await POST(buildRequest('not json'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid JSON' });
  });

  it('handles taskCreated', async () => {
    const body = JSON.stringify({
      event: 'taskCreated',
      history_items: [{ id: '2800763136700363640', field: 'task_creation' }],
      task_id: '1vj37mc',
      webhook_id: webhookId,
    });
    const response = await POST(buildRequest(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('handles taskUpdated', async () => {
    const body = JSON.stringify({ event: 'taskUpdated', task_id: '1vj37mc', webhook_id: webhookId });
    const response = await POST(buildRequest(body));

    expect(response.status).toBe(200);
  });

  it('handles taskStatusUpdated', async () => {
    const body = JSON.stringify({
      event: 'taskStatusUpdated',
      history_items: [{
        id: '2800763136717140857',
        field: 'status',
        before: { status: 'to do' },
        after: { status: 'in progress' },
      }],
      task_id: '1vj37mc',
      webhook_id: webhookId,
    });
    const response = await POST(buildRequest(body));

    expect(response.status).toBe(200);
  });

  it('handles goal events without history_items', async () => {
    const body = JSON.stringify({
      event: 'goalCreated',
      goal_id: 'a23e5a3d-74b5-44c2-ab53-917ebe85045a',
      webhook_id: 'd5eddb2d-db2b-49e9-87d4-bc6cfbe2313b',
    });
    const response = await POST(buildRequest(body));

    expect(response.status).toBe(200);
  });

  it('acknowledges unknown events', async () => {
    const body = JSON.stringify({ event: 'somethingNew', webhook_id: webhookId });
    const response = await POST(buildRequest(body));

    expect(response.status).toBe(200);
  });
});
