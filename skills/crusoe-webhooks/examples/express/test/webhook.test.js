import request from 'supertest';
import crypto from 'node:crypto';
import { app, server } from '../src/index.js';

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
function sign(payload, timestamp, msgId, secret = TEST_SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto
    .createHmac('sha256', key)
    .update(`${msgId}.${timestamp}.${payload}`)
    .digest('base64');
  return `v1,${signature}`;
}

function now() {
  return Math.floor(Date.now() / 1000).toString();
}

function newId() {
  return 'msg_' + crypto.randomBytes(12).toString('hex');
}

function post(payload, headers) {
  return request(app)
    .post('/webhooks/crusoe')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(payload);
}

function signedHeaders(payload, { timestamp = now(), msgId = newId(), signature } = {}) {
  return {
    'svix-id': msgId,
    'svix-timestamp': timestamp,
    'svix-signature': signature || sign(payload, timestamp, msgId),
  };
}

describe('Crusoe Webhook Handler', () => {
  beforeAll(() => {
    process.env.CRUSOE_WEBHOOK_SECRET = TEST_SECRET;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('accepts the documented resource.automated_remediation payload', async () => {
    const payload = JSON.stringify(REMEDIATION_PAYLOAD);
    const response = await post(payload, signedHeaders(payload));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true, type: 'resource.automated_remediation' });
  });

  test('uses an explicit type field when present', async () => {
    const payload = JSON.stringify({ type: 'resource.automated_remediation', status: 'completed' });
    const response = await post(payload, signedHeaders(payload));

    expect(response.status).toBe(200);
    expect(response.body.type).toBe('resource.automated_remediation');
  });

  test('accepts undocumented payload shapes without failing', async () => {
    const payload = JSON.stringify({ budget_name: 'monthly', threshold_percent: 80 });
    const response = await post(payload, signedHeaders(payload));

    expect(response.status).toBe(200);
    expect(response.body.type).toBe('unknown');
  });

  test('accepts multiple signatures (secret rotation)', async () => {
    const payload = JSON.stringify(REMEDIATION_PAYLOAD);
    const timestamp = now();
    const msgId = newId();
    const valid = sign(payload, timestamp, msgId);
    const response = await post(
      payload,
      signedHeaders(payload, { timestamp, msgId, signature: `v1,aW52YWxpZA== ${valid}` })
    );

    expect(response.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const response = await post(JSON.stringify(REMEDIATION_PAYLOAD), {});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const payload = JSON.stringify(REMEDIATION_PAYLOAD);
    const response = await post(payload, signedHeaders(payload, { signature: 'v1,aW52YWxpZA==' }));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = JSON.stringify(REMEDIATION_PAYLOAD);
    const timestamp = now();
    const msgId = newId();
    const signature = sign(payload, timestamp, msgId, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const response = await post(payload, signedHeaders(payload, { timestamp, msgId, signature }));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid signature');
  });

  test('rejects a tampered body', async () => {
    const payload = JSON.stringify(REMEDIATION_PAYLOAD);
    const headers = signedHeaders(payload);
    const tampered = JSON.stringify({ ...REMEDIATION_PAYLOAD, status: 'completed' });
    const response = await post(tampered, headers);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid signature');
  });

  test('rejects an old timestamp', async () => {
    const payload = JSON.stringify(REMEDIATION_PAYLOAD);
    const old = (Math.floor(Date.now() / 1000) - 600).toString();
    const response = await post(payload, signedHeaders(payload, { timestamp: old }));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid timestamp');
  });

  test('rejects a verified body that is not a JSON object', async () => {
    const payload = '[1,2,3]';
    const response = await post(payload, signedHeaders(payload));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid JSON');
  });

  test('health check endpoint works', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
