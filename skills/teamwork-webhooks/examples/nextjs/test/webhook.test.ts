import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/teamwork/route';

// Teamwork tokens are free-form strings you choose when creating the Version 2 webhook
const token = 'tw_test_token_0123456789';

beforeAll(() => {
  process.env.TEAMWORK_WEBHOOK_TOKEN = token;
});

/**
 * Generate an X-Projects-Signature value the same way Teamwork does:
 * hex(HMAC-SHA256(token, rawBody))
 */
function generateTeamworkSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function buildRequest(
  body: string,
  { event = 'TASK.CREATED', signature, contentType = 'application/json' }: {
    event?: string | null;
    signature?: string | null;
    contentType?: string;
  } = {}
): Request {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  const sig = signature === undefined ? generateTeamworkSignature(body, token) : signature;
  if (sig !== null) headers['X-Projects-Signature'] = sig;
  if (event) headers['X-Projects-Event'] = event;
  return new Request('http://localhost:3000/webhooks/teamwork', { method: 'POST', headers, body });
}

// verifyTeamworkWebhook is private to route.ts (Next.js route files may only export
// handlers and route config), so signature cases are exercised through POST.
describe('X-Projects-Signature verification', () => {
  const body = '{"eventCreator":{"id":1},"task":{"id":42}}';

  async function statusFor(signature: string | null, payload = body): Promise<number> {
    return (await POST(buildRequest(payload, { signature }))).status;
  }

  it('accepts a valid signature', async () => {
    expect(await statusFor(generateTeamworkSignature(body, token))).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    expect(await statusFor(generateTeamworkSignature(body, token).toUpperCase())).toBe(200);
  });

  it('rejects a signature made with another token', async () => {
    expect(await statusFor(generateTeamworkSignature(body, 'other'))).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const sig = generateTeamworkSignature(body, token);
    expect(await statusFor(sig, body + ' ')).toBe(401);
  });

  it('rejects a missing signature', async () => {
    expect(await statusFor(null)).toBe(401);
  });

  it('rejects wrong-length and non-hex signatures', async () => {
    expect(await statusFor('abc123')).toBe(401);
    expect(await statusFor('z'.repeat(64))).toBe(401);
    // Valid digest followed by junk must not pass via hex truncation
    expect(await statusFor(generateTeamworkSignature(body, token) + 'zz')).toBe(401);
  });
});

describe('POST /webhooks/teamwork', () => {
  it.each([
    'TASK.CREATED',
    'TASK.UPDATED',
    'TASK.COMPLETED',
    'TASK.DELETED',
    'PROJECT.CREATED',
    'COMMENT.CREATED',
    'MILESTONE.COMPLETED',
    'TIME.CREATED',
    'FILE.DOWNLOADED',
  ])('accepts %s', async (event) => {
    const body = JSON.stringify({ eventCreator: { id: 1 }, id: 7, projectId: 3 });
    const res = await POST(buildRequest(body, { event }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies any content type (raw body)', async () => {
    const body = JSON.stringify({ eventCreator: { id: 1 }, project: { id: 9 } });
    const res = await POST(buildRequest(body, { event: 'PROJECT.CREATED', contentType: 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const res = await POST(buildRequest('not json'));
    expect(res.status).toBe(400);
  });
});
