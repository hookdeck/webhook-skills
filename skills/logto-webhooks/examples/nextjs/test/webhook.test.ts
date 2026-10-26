import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'test_logto_signing_key';

// Logto: lowercase hex HMAC-SHA256 of the raw body, no prefix
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Payload shaped like the documented Grant.LimitExceeded sample
const grantLimit = JSON.stringify({
  hookId: 'hook_abc',
  event: 'Grant.LimitExceeded',
  createdAt: '2024-01-01T00:00:00.000Z',
  ip: '192.168.0.1',
  userAgent: 'Mozilla/5.0',
  userId: 'u_001',
  applicationId: 'app_xyz',
  application: { id: 'app_xyz', type: 'SPA', name: 'My app', description: 'My app description' },
  maxAllowedGrants: 2,
  preRevocationActiveGrantCount: 3,
  revokedGrantIds: ['grant_001'],
});

const signIn = JSON.stringify({
  hookId: 'hook_abc',
  event: 'PostSignIn',
  createdAt: '2024-01-01T00:00:00.000Z',
  interactionEvent: 'SignIn',
  userIp: '192.168.0.1',
  userId: 'u_001',
  user: { id: 'u_001', primaryEmail: 'jane@example.com' },
  applicationId: 'app_xyz',
  application: { id: 'app_xyz', type: 'SPA', name: 'My app' },
});

const userCreated = JSON.stringify({
  hookId: 'hook_abc',
  event: 'User.Created',
  createdAt: '2024-01-01T00:00:00.000Z',
  ip: '192.168.0.1',
  path: '/users',
  method: 'POST',
  status: 200,
  data: { id: 'u_002', primaryEmail: 'new@example.com' },
});

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.LOGTO_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/logto/route'));
});

function makeRequest(payload: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/logto', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: payload,
  });
}

const SIG = 'logto-signature-sha-256';

describe('Logto webhook', () => {
  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const res = await POST(makeRequest(grantLimit, { [SIG]: sign(grantLimit) }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('verifies the exact bytes, not re-serialized JSON', async () => {
      const pretty = JSON.stringify(JSON.parse(signIn), null, 2);
      const res = await POST(makeRequest(pretty, { [SIG]: sign(pretty) }));
      expect(res.status).toBe(200);
    });

    it('verifies regardless of content type', async () => {
      const res = await POST(makeRequest(signIn, { 'content-type': 'text/plain', [SIG]: sign(signIn) }));
      expect(res.status).toBe(200);
    });

    it('accepts an uppercase hex digest', async () => {
      const res = await POST(makeRequest(signIn, { [SIG]: sign(signIn).toUpperCase() }));
      expect(res.status).toBe(200);
    });

    it('rejects a missing signature header', async () => {
      const res = await POST(makeRequest(signIn));
      expect(res.status).toBe(401);
    });

    it('rejects an empty signature header', async () => {
      const res = await POST(makeRequest(signIn, { [SIG]: '' }));
      expect(res.status).toBe(401);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const res = await POST(makeRequest(signIn, { [SIG]: sign(signIn, 'other_key') }));
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const res = await POST(makeRequest(signIn.replace('u_001', 'u_999'), { [SIG]: sign(signIn) }));
      expect(res.status).toBe(401);
    });

    it('rejects a sha256= prefixed value', async () => {
      const res = await POST(makeRequest(signIn, { [SIG]: `sha256=${sign(signIn)}` }));
      expect(res.status).toBe(401);
    });

    it('rejects a digest of the wrong length', async () => {
      const res = await POST(makeRequest(signIn, { [SIG]: sign(signIn).slice(0, 62) }));
      expect(res.status).toBe(401);
    });

    it('rejects 64 characters that are not hex', async () => {
      const res = await POST(makeRequest(signIn, { [SIG]: 'z'.repeat(64) }));
      expect(res.status).toBe(401);
    });

    it('returns 500 when the secret is not configured', async () => {
      delete process.env.LOGTO_WEBHOOK_SECRET;
      try {
        const res = await POST(makeRequest(signIn, { [SIG]: sign(signIn) }));
        expect(res.status).toBe(500);
      } finally {
        process.env.LOGTO_WEBHOOK_SECRET = SECRET;
      }
    });
  });

  describe('event handling', () => {
    it('handles PostSignIn', async () => {
      const res = await POST(makeRequest(signIn, { [SIG]: sign(signIn) }));
      expect(res.status).toBe(200);
    });

    it('handles User.Created', async () => {
      const res = await POST(makeRequest(userCreated, { [SIG]: sign(userCreated) }));
      expect(res.status).toBe(200);
    });

    it('acknowledges events it does not handle', async () => {
      const body = JSON.stringify({ hookId: 'hook_abc', event: 'Organization.Created', createdAt: '2024-01-01T00:00:00.000Z', data: { id: 'org_1' } });
      const res = await POST(makeRequest(body, { [SIG]: sign(body) }));
      expect(res.status).toBe(200);
    });

    it('does not classify by interactionEvent', async () => {
      const body = JSON.stringify({ hookId: 'hook_abc', event: 'User.Data.Updated', interactionEvent: 'Register', data: { id: 'u_1' } });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest(body, { [SIG]: sign(body) }));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('User updated: u_1');
      logSpy.mockRestore();
    });

    it('ignores wrong-typed nested fields instead of failing', async () => {
      const bodies = [
        JSON.stringify({ event: 'PostSignIn', userId: 42, user: 'not-an-object', application: ['nope'], data: 7 }),
        JSON.stringify({ event: 'Grant.LimitExceeded', revokedGrantIds: 'x', user: null }),
        JSON.stringify({ event: 'User.Created', data: ['x'] }),
      ];
      for (const body of bodies) {
        const res = await POST(makeRequest(body, { [SIG]: sign(body) }));
        expect(res.status).toBe(200);
      }
    });
  });

  describe('payload validation (after a valid signature)', () => {
    it('rejects invalid JSON', async () => {
      const body = 'not json';
      const res = await POST(makeRequest(body, { [SIG]: sign(body) }));
      expect(res.status).toBe(400);
    });

    it('rejects a body that is not an object', async () => {
      for (const body of ['[]', 'null', '"x"', '5']) {
        const res = await POST(makeRequest(body, { [SIG]: sign(body) }));
        expect(res.status).toBe(400);
      }
    });

    it('rejects a missing or non-string event', async () => {
      for (const body of [JSON.stringify({ hookId: 'h' }), JSON.stringify({ event: 5 })]) {
        const res = await POST(makeRequest(body, { [SIG]: sign(body) }));
        expect(res.status).toBe(400);
      }
    });
  });
});
