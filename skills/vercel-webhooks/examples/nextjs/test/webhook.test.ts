import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';

// Test webhook secret
const TEST_SECRET = 'test_webhook_secret_12345';

// Helper to generate valid Vercel signature
function generateVercelSignature(body: string | Buffer, secret: string): string {
  return crypto
    .createHmac('sha1', secret)
    .update(body)
    .digest('hex');
}

// Helper to create test event payload
function createTestEvent(type: string, payload: any = {}): any {
  return {
    id: 'event_test123',
    type: type,
    createdAt: Date.now(),
    payload: payload,
    region: 'sfo1'
  };
}

// Mock Next.js request
class MockNextRequest {
  private body: string;
  headers: Map<string, string>;

  constructor(body: any, headers: Record<string, string> = {}) {
    this.body = typeof body === 'string' ? body : JSON.stringify(body);
    this.headers = new Map(Object.entries(headers));
  }

  async text(): Promise<string> {
    return this.body;
  }
}

// Import the route handler
let POST: any;

describe('Vercel Webhook Handler', () => {
  // Store original env
  const originalEnv = process.env.VERCEL_WEBHOOK_SECRET;

  beforeAll(async () => {
    process.env.VERCEL_WEBHOOK_SECRET = TEST_SECRET;
    // Dynamically import to get fresh env values
    const route = await import('../app/webhooks/vercel/route');
    POST = route.POST;
  });

  afterAll(() => {
    process.env.VERCEL_WEBHOOK_SECRET = originalEnv;
  });

  describe('POST /webhooks/vercel', () => {
    it('should accept valid webhook with correct signature', async () => {
      const event = createTestEvent('deployment.created', {
        deployment: {
          id: 'dpl_test123',
          name: 'test-app',
          url: 'https://test-app.vercel.app',
          meta: {
            githubCommitRef: 'main',
            githubCommitMessage: 'Test commit'
          }
        },
        project: {
          id: 'prj_test123',
          name: 'test-app'
        },
        team: {
          id: 'team_test123',
          name: 'test-team'
        }
      });

      const body = JSON.stringify(event);
      const signature = generateVercelSignature(body, TEST_SECRET);

      const request = new MockNextRequest(body, {
        'x-vercel-signature': signature,
        'content-type': 'application/json'
      });

      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ received: true });
    });

    it('should reject webhook with missing signature', async () => {
      const event = createTestEvent('deployment.created');

      const request = new MockNextRequest(event, {
        'content-type': 'application/json'
      });

      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing x-vercel-signature header');
    });

    it('should reject webhook with invalid signature', async () => {
      const event = createTestEvent('deployment.created');
      const body = JSON.stringify(event);

      const request = new MockNextRequest(body, {
        'x-vercel-signature': 'invalid_signature_12345',
        'content-type': 'application/json'
      });

      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid signature');
    });

    it('should reject webhook with wrong secret', async () => {
      const event = createTestEvent('deployment.created');
      const body = JSON.stringify(event);
      const signature = generateVercelSignature(body, 'wrong_secret');

      const request = new MockNextRequest(body, {
        'x-vercel-signature': signature,
        'content-type': 'application/json'
      });

      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid signature');
    });

    it('should handle deployment.succeeded event', async () => {
      const event = createTestEvent('deployment.succeeded', {
        deployment: {
          id: 'dpl_success123',
          name: 'test-app',
          url: 'https://test-app.vercel.app',
          duration: 45000
        }
      });

      const body = JSON.stringify(event);
      const signature = generateVercelSignature(body, TEST_SECRET);

      const request = new MockNextRequest(body, {
        'x-vercel-signature': signature,
        'content-type': 'application/json'
      });

      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ received: true });
    });

    it('should handle deployment.error event', async () => {
      const event = createTestEvent('deployment.error', {
        deployment: {
          id: 'dpl_error123',
          name: 'test-app',
          error: 'Build failed'
        }
      });

      const body = JSON.stringify(event);
      const signature = generateVercelSignature(body, TEST_SECRET);

      const request = new MockNextRequest(body, {
        'x-vercel-signature': signature,
        'content-type': 'application/json'
      });

      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ received: true });
    });

    it('should handle project.created event', async () => {
      const event = createTestEvent('project.created', {
        project: {
          id: 'prj_new123',
          name: 'new-project',
          framework: 'nextjs'
        }
      });

      const body = JSON.stringify(event);
      const signature = generateVercelSignature(body, TEST_SECRET);

      const request = new MockNextRequest(body, {
        'x-vercel-signature': signature,
        'content-type': 'application/json'
      });

      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ received: true });
    });

    it('should handle attack.detected event', async () => {
      const event = createTestEvent('attack.detected', {
        attack: {
          type: 'ddos',
          action: 'blocked',
          ip: '192.0.2.1'
        }
      });

      const body = JSON.stringify(event);
      const signature = generateVercelSignature(body, TEST_SECRET);

      const request = new MockNextRequest(body, {
        'x-vercel-signature': signature,
        'content-type': 'application/json'
      });

      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ received: true });
    });

    it('should handle unknown event types gracefully', async () => {
      const event = createTestEvent('unknown.event.type', {
        custom: 'data'
      });

      const body = JSON.stringify(event);
      const signature = generateVercelSignature(body, TEST_SECRET);

      const request = new MockNextRequest(body, {
        'x-vercel-signature': signature,
        'content-type': 'application/json'
      });

      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ received: true });
    });

    it('should reject malformed JSON', async () => {
      const body = 'invalid json{';
      const signature = generateVercelSignature(body, TEST_SECRET);

      const request = new MockNextRequest(body, {
        'x-vercel-signature': signature,
        'content-type': 'application/json'
      });

      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid JSON payload');
    });

    it('should handle missing webhook secret config', async () => {
      // Temporarily remove the secret
      const tempSecret = process.env.VERCEL_WEBHOOK_SECRET;
      delete process.env.VERCEL_WEBHOOK_SECRET;

      // Re-import to get fresh env
      const { POST: FreshPOST } = await import('../app/webhooks/vercel/route');

      const event = createTestEvent('deployment.created');
      const body = JSON.stringify(event);

      const request = new MockNextRequest(body, {
        'x-vercel-signature': 'any_signature',
        'content-type': 'application/json'
      });

      const response = await FreshPOST(request as any);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Webhook secret not configured');

      // Restore secret
      process.env.VERCEL_WEBHOOK_SECRET = tempSecret;
    });
  });
});