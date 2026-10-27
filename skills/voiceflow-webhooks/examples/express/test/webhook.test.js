import crypto from 'node:crypto';
import request from 'supertest';
import { app } from '../src/index.js';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload, msgId, timestamp, secret = TEST_SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

function now() {
  return Math.floor(Date.now() / 1000).toString();
}

// prefix: 'svix' (Voiceflow) or 'webhook' (Standard Webhooks names for the same values)
function send(payload, { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'svix' } = {}) {
  return request(app)
    .post('/webhooks/voiceflow')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

const events = {
  'organization.project.created': { data: { organizationID: 'LVkmPy8AE2', projectID: '6a16f4549e4196323d8a49b9', projectMetadata: { name: 'My new project' }, workspaceID: '95kwAZ63nO', createdBy: { type: 'user', userEmail: 'user@voiceflow.com' } } },
  'organization.project.deleted': { data: { organizationID: 'LVkmPy8AE2', projectID: '6a16f4789e4196323d8a49c3', projectMetadata: { name: 'Legacy support agent' }, deletedBy: { type: 'user', userEmail: 'user@voiceflow.com' } } },
  'organization.project.environment.created': { data: { organizationID: 'LVkmPy8AE2', projectID: '69e8b60a99c9a35e1a5e8872', createdProjectEnvironmentID: '6a16f4dc9e4196323d8a49e5', createdProjectEnvironmentMetadata: { alias: 'optimizeglobalprompt', isLive: false, name: 'Optimize global prompt', trafficPercentage: 0 }, source: { environmentID: '69e8b60a99c9a35e1a5e8875', type: 'environment' } } },
  'organization.project.environment.published': { data: { organizationID: 'LVkmPy8AE2', projectID: '69e8b60a99c9a35e1a5e8872', publishedProjectEnvironmentID: '69e8b60a99c9a35e1a5e8875', publishedVersionIDBefore: '69e8e543ce546b913fc2c965', publishedVersionIDAfter: '6a16f4b29e4196323d8a49db' } },
  'organization.project.environment.merged': { data: { organizationID: 'LVkmPy8AE2', projectID: '69e8b60a99c9a35e1a5e8872', sourceProjectEnvironmentID: '6a16f4dc9e4196323d8a49e5', sourceProjectEnvironmentRemoved: true, targetProjectEnvironmentID: '69e8b60a99c9a35e1a5e8875' } },
  'organization.project.environment.deleted': { data: { organizationID: 'LVkmPy8AE2', projectID: '69e8b60a99c9a35e1a5e8872', deletedProjectEnvironmentID: '69e8b64d99c9a35e1a5e888b' } },
};

describe('Voiceflow webhook handler', () => {
  beforeEach(() => {
    process.env.VOICEFLOW_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (type, data) => {
    const res = await send(JSON.stringify({ type, resource: 'organization-LVkmPy8AE2', time: 1779889237608, ...data }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ type: 'organization.something.new' }));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('organization.something.new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify({ type: 'organization.project.created', data: { projectID: 'p1' } }), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify({ type: 'organization.project.created', data: { projectID: 'p1' } }), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: 'organization.project.created' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send('{"type":"organization.project.created"}', { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ type: 'organization.project.environment.published' });
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/voiceflow').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an unsigned delivery (the project-level session webhook)', async () => {
    const res = await request(app).post('/webhooks/voiceflow').set('Content-Type', 'application/json').send('{"type":"organization.project.created"}');
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const res = await send('{"type":"organization.project.environment.published"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"type":"organization.project.environment.published"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"type":"organization.project.deleted"}', msgId, timestamp);
    const res = await send('{"type":"organization.project.created"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"type":"organization.project.environment.published"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.VOICEFLOW_WEBHOOK_SECRET;
    const res = await send('{"type":"organization.project.environment.published"}');
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
