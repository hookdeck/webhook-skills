import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// The shared secret is any string you choose on the Pulumi webhook; it is used as UTF-8 bytes as-is
const SECRET = 'test_pulumi_shared_secret_7c1d';

let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.PULUMI_WEBHOOK_SECRET = SECRET;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ POST } = await import('../app/webhooks/pulumi/route'));
});

afterEach(() => {
  logSpy.mockClear();
});

// Bare lowercase hex HMAC-SHA256 of the raw body, no prefix
function sign(body: string, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Content-Type is deliberately varied: verification must not depend on it
function post(
  body: string,
  { signature, kind = 'stack_update', contentType = 'application/json' }: { signature?: string; kind?: string | null; contentType?: string } = {},
) {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['pulumi-webhook-signature'] = signature;
  if (kind) headers['pulumi-webhook-kind'] = kind;
  return POST(new NextRequest('http://localhost:3000/webhooks/pulumi', { method: 'POST', headers, body }));
}

// Payloads follow the examples in Pulumi's webhook docs
const user = { name: 'Morty Smith', githubLogin: 'morty', avatarUrl: 'https://crazy-adventures.net/morty.png' };
const organization = { name: 'Crazy Adventures', githubLogin: 'crazy-adventures', avatarUrl: 'https://crazy-adventures.net/logo.png' };
const base = { user, organization, projectName: 'website', stackName: 'website-prod' };

const payloads: Record<string, any> = {
  stack: { ...base, action: 'created' },
  stack_update: {
    ...base,
    updateUrl: 'https://app.pulumi.com/crazy-adventures/website/website-prod/updates/42',
    kind: 'refresh',
    result: 'succeeded',
    resourceChanges: { update: 3, delete: 1, 'update-replace': 2 },
    isPreview: false,
  },
  stack_preview: {
    ...base,
    updateUrl: 'https://app.pulumi.com/crazy-adventures/website/website-prod/previews/11bf162b-d9d5-4715-8f88-20dcd0e0b167',
    kind: 'update',
    result: 'failed',
    resourceChanges: { update: 3, delete: 1, 'update-replace': 2 },
    isPreview: true,
  },
  deployment: {
    ...base,
    deploymentUrl: 'https://app.pulumi.com/crazy-adventures/website/website-prod/deployments/127',
    version: 127,
    operation: 'update',
    status: 'running',
  },
  drift_detection: {
    ...base,
    driftDetected: true,
    driftRunId: '11bf162b-d9d5-4715-8f88-20dcd0e0b167',
    status: 'succeeded',
    resourceChanges: { update: 3, delete: 1 },
    referenceUrl: 'https://app.pulumi.com/crazy-adventures/website/website-prod/deployments/127',
  },
  drift_remediation: {
    ...base,
    status: 'succeeded',
    resourceChanges: { update: 3, delete: 1 },
    referenceUrl: 'https://app.pulumi.com/crazy-adventures/website/website-prod/deployments/128',
  },
};

const body = JSON.stringify(payloads.stack_update);
const logged = () => logSpy.mock.calls.map((c) => c[0]).join('\n');

describe('Pulumi webhook signature verification', () => {
  it('accepts a valid Pulumi-Webhook-Signature', async () => {
    const res = await post(body, { signature: sign(body) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of Content-Type', async () => {
    expect((await post(body, { signature: sign(body), contentType: 'text/plain' })).status).toBe(200);
  });

  it('verifies the exact bytes, including whitespace', async () => {
    const pretty = JSON.stringify(payloads.stack_update, null, 2);
    expect((await post(pretty, { signature: sign(pretty) })).status).toBe(200);
    expect((await post(pretty, { signature: sign(body) })).status).toBe(401);
  });

  it('accepts uppercase hex (compared case-insensitively)', async () => {
    expect((await post(body, { signature: sign(body).toUpperCase() })).status).toBe(200);
  });

  it('rejects a missing signature header (an unsigned delivery)', async () => {
    expect((await post(body, {})).status).toBe(401);
  });

  it('rejects an empty signature header', async () => {
    expect((await post(body, { signature: '' })).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(body.replace('succeeded', 'failed'), { signature: sign(body) })).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    expect((await post(body, { signature: sign(body, 'other_secret') })).status).toBe(401);
  });

  it('rejects a malformed signature without throwing', async () => {
    expect((await post(body, { signature: 'abc' })).status).toBe(401);
    expect((await post(body, { signature: 'zz'.repeat(32) })).status).toBe(401);
    expect((await post(body, { signature: `sha256=${sign(body)}` })).status).toBe(401);
    expect((await post(body, { signature: `${sign(body)}${sign(body)}` })).status).toBe(401);
  });
});

describe('Pulumi events (dispatched on Pulumi-Webhook-Kind)', () => {
  it.each(Object.keys(payloads))('handles %s', async (kind) => {
    const b = JSON.stringify(payloads[kind]);
    const res = await post(b, { signature: sign(b), kind });
    expect(res.status).toBe(200);
    expect(logged()).not.toContain('Unhandled');
  });

  it('logs the stack action, update result and deployment status', async () => {
    for (const kind of ['stack', 'stack_update', 'deployment']) {
      const b = JSON.stringify(payloads[kind]);
      await post(b, { signature: sign(b), kind });
    }
    expect(logged()).toContain('Stack created: website/website-prod');
    expect(logged()).toContain('Stack update (refresh) succeeded');
    expect(logged()).toContain('Deployment 127 update running');
  });

  it('acknowledges policy_violation and a missing kind', async () => {
    const b = JSON.stringify({ ...base, policyPack: 'aws-guardrails' });
    expect((await post(b, { signature: sign(b), kind: 'policy_violation' })).status).toBe(200);
    expect((await post(b, { signature: sign(b), kind: null })).status).toBe(200);
    expect(logged()).toContain('Unhandled event kind: policy_violation');
    expect(logged()).toContain('Unhandled event kind: null');
  });

  it('rejects verified but invalid JSON', async () => {
    const b = '{not json';
    expect((await post(b, { signature: sign(b) })).status).toBe(400);
  });
});
