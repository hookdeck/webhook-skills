import { describe, test, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/crusoe/route';

// Svix-style secret: 'whsec_' + base64(key). base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Documented example body for resource.automated_remediation (node replacement)
const REMEDIATION_PAYLOAD = {
  status: 'started',
  org_name: 'Org ABC 123',
  org_id: 'org-abc123',
  project_name: 'ml-training',
  project_id: 'proj-def456',
  cluster_name: 'training-cluster-prod',
  cluster_id: 'cluster-abc123',
  resource_type: 'VM',
  resource_name: 'worker-node-42',
  resource_id: 'vm-xyz789',
  location: 'us-east1-a',
  workflow_type: 'Node Replacement',
  triggered_by: { error_name: 'XID 79: GPU has fallen off the bus' },
};

// Sign the way Svix does:
// base64(HMAC_SHA256(base64Decode(secret after whsec_), `${id}.${timestamp}.${body}`))
function sign(payload: string, timestamp: string, msgId: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto
    .createHmac('sha256', key)
    .update(`${msgId}.${timestamp}.${payload}`)
    .digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();
const newId = () => 'msg_' + crypto.randomBytes(12).toString('hex');

function signedHeaders(
  payload: string,
  opts: { timestamp?: string; msgId?: string; signature?: string } = {}
): Record<string, string> {
  const timestamp = opts.timestamp ?? now();
  const msgId = opts.msgId ?? newId();
  return {
    'svix-id': msgId,
    'svix-timestamp': timestamp,
    'svix-signature': opts.signature ?? sign(payload, timestamp, msgId),
  };
}

async function post(payload: string, headers: Record<string, string>) {
  const response = await POST(
    new NextRequest('http://localhost:3000/webhooks/crusoe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: payload,
    })
  );
  return { status: response.status, body: await response.json() };
}

describe('Crusoe Webhook Handler', () => {
  beforeAll(() => {
    process.env.CRUSOE_WEBHOOK_SECRET = TEST_SECRET;
  });

  test('accepts the documented resource.automated_remediation payload', async () => {
    const payload = JSON.stringify(REMEDIATION_PAYLOAD);
    const res = await post(payload, signedHeaders(payload));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, type: 'resource.automated_remediation' });
  });

  test('uses an explicit type field when present', async () => {
    const payload = JSON.stringify({ type: 'resource.automated_remediation', status: 'completed' });
    const res = await post(payload, signedHeaders(payload));

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('resource.automated_remediation');
  });

  test('accepts undocumented payload shapes without failing', async () => {
    const payload = JSON.stringify({ budget_name: 'monthly', threshold_percent: 80 });
    const res = await post(payload, signedHeaders(payload));

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('unknown');
  });

  test('accepts multiple signatures (secret rotation)', async () => {
    const payload = JSON.stringify(REMEDIATION_PAYLOAD);
    const timestamp = now();
    const msgId = newId();
    const valid = sign(payload, timestamp, msgId);
    const res = await post(
      payload,
      signedHeaders(payload, { timestamp, msgId, signature: `v1,aW52YWxpZA== ${valid}` })
    );

    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await post(JSON.stringify(REMEDIATION_PAYLOAD), {});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const payload = JSON.stringify(REMEDIATION_PAYLOAD);
    const res = await post(payload, signedHeaders(payload, { signature: 'v1,aW52YWxpZA==' }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = JSON.stringify(REMEDIATION_PAYLOAD);
    const timestamp = now();
    const msgId = newId();
    const signature = sign(payload, timestamp, msgId, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await post(payload, signedHeaders(payload, { timestamp, msgId, signature }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a tampered body', async () => {
    const payload = JSON.stringify(REMEDIATION_PAYLOAD);
    const headers = signedHeaders(payload);
    const tampered = JSON.stringify({ ...REMEDIATION_PAYLOAD, status: 'completed' });
    const res = await post(tampered, headers);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects an old timestamp', async () => {
    const payload = JSON.stringify(REMEDIATION_PAYLOAD);
    const old = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await post(payload, signedHeaders(payload, { timestamp: old }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid timestamp');
  });

  test('rejects a verified body that is not a JSON object', async () => {
    const payload = '[1,2,3]';
    const res = await post(payload, signedHeaders(payload));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  test('returns 500 when the secret is not configured', async () => {
    const saved = process.env.CRUSOE_WEBHOOK_SECRET;
    delete process.env.CRUSOE_WEBHOOK_SECRET;
    try {
      const payload = JSON.stringify(REMEDIATION_PAYLOAD);
      const res = await post(payload, signedHeaders(payload));
      expect(res.status).toBe(500);
    } finally {
      process.env.CRUSOE_WEBHOOK_SECRET = saved;
    }
  });
});
