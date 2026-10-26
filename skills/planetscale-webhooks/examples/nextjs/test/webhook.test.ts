import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyPlanetScaleWebhook } from '../lib/verify';
import { POST } from '../app/webhooks/planetscale/route';

const SECRET = 'test_planetscale_secret';

beforeAll(() => {
  process.env.PLANETSCALE_WEBHOOK_SECRET = SECRET;
});

/**
 * Generate a valid PlanetScale signature for testing: bare hex HMAC-SHA256 of the raw body
 */
function generatePlanetScaleSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// Shapes follow PlanetScale's documented example payloads (resources trimmed)
const envelope = (event: string, resource: unknown) => ({
  timestamp: 1698252879,
  event,
  organization: 'myorg',
  database: 'example_database',
  resource,
});

const branch = { id: 'ecrmjy2f4a5o', type: 'Branch', name: 'dev', state: 'ready', html_url: 'https://app.planetscale.com/demo-db/example_database/dev' };
const deployRequest = { id: '4xsz0ql82y4n', type: 'DeployRequest', number: 5, branch: 'dev', into_branch: 'main', state: 'open', deployment_state: 'pending' };

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/planetscale', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

function postSigned(body: string, secret = SECRET) {
  return POST(makeRequest(body, { 'x-planetscale-signature': generatePlanetScaleSignature(body, secret) }));
}

describe('verifyPlanetScaleWebhook', () => {
  const payload = '{"event":"webhook.test"}';
  const valid = generatePlanetScaleSignature(payload, SECRET);

  it('returns true for a valid signature', () => {
    expect(verifyPlanetScaleWebhook(payload, valid, SECRET)).toBe(true);
  });

  it('accepts uppercase hex and Buffer bodies', () => {
    expect(verifyPlanetScaleWebhook(payload, valid.toUpperCase(), SECRET)).toBe(true);
    expect(verifyPlanetScaleWebhook(Buffer.from(payload), valid, SECRET)).toBe(true);
  });

  it('rejects a missing or empty header or secret', () => {
    expect(verifyPlanetScaleWebhook(payload, null, SECRET)).toBe(false);
    expect(verifyPlanetScaleWebhook(payload, '', SECRET)).toBe(false);
    expect(verifyPlanetScaleWebhook(payload, valid, undefined)).toBe(false);
  });

  it('rejects a sha256= prefixed value', () => {
    expect(verifyPlanetScaleWebhook(payload, `sha256=${valid}`, SECRET)).toBe(false);
  });

  it('rejects wrong length and non-hex values', () => {
    expect(verifyPlanetScaleWebhook(payload, valid.slice(0, 62), SECRET)).toBe(false);
    expect(verifyPlanetScaleWebhook(payload, `${valid}00`, SECRET)).toBe(false);
    expect(verifyPlanetScaleWebhook(payload, `zz${valid.slice(2)}`, SECRET)).toBe(false);
    expect(verifyPlanetScaleWebhook(payload, `${valid}\n`, SECRET)).toBe(false);
  });

  it('rejects a different secret or body', () => {
    expect(verifyPlanetScaleWebhook(payload, generatePlanetScaleSignature(payload, 'other'), SECRET)).toBe(false);
    expect(verifyPlanetScaleWebhook('{"event":"x"}', valid, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/planetscale', () => {
  it('returns 401 for a missing signature', async () => {
    const response = await POST(makeRequest(JSON.stringify(envelope('branch.ready', branch))));
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const response = await POST(
      makeRequest(JSON.stringify(envelope('branch.ready', branch)), { 'x-planetscale-signature': 'a'.repeat(64) })
    );
    expect(response.status).toBe(401);
  });

  it('returns 401 for a malformed signature', async () => {
    const response = await POST(
      makeRequest(JSON.stringify(envelope('branch.ready', branch)), { 'x-planetscale-signature': 'not-hex' })
    );
    expect(response.status).toBe(401);
  });

  it('returns 401 when signed with the wrong secret', async () => {
    const response = await postSigned(JSON.stringify(envelope('branch.ready', branch)), 'wrong_secret');
    expect(response.status).toBe(401);
  });

  it('returns 401 when the body is tampered with after signing', async () => {
    const body = JSON.stringify(envelope('branch.ready', branch));
    const response = await POST(
      makeRequest(body.replace('dev', 'main'), { 'x-planetscale-signature': generatePlanetScaleSignature(body, SECRET) })
    );
    expect(response.status).toBe(401);
  });

  it('verifies the exact bytes, not a re-serialization', async () => {
    // Signed over the pretty-printed bytes: JSON.stringify(JSON.parse(body)) would differ
    const body = JSON.stringify(envelope('branch.ready', branch), null, 2);
    expect((await postSigned(body)).status).toBe(200);
  });

  it('verifies any content type', async () => {
    const body = JSON.stringify(envelope('branch.ready', branch));
    const response = await POST(
      makeRequest(body, { 'content-type': 'text/plain', 'x-planetscale-signature': generatePlanetScaleSignature(body, SECRET) })
    );
    expect(response.status).toBe(200);
  });

  it.each([
    ['webhook.test', { id: '34rbgzmvgb9m', type: 'Database', name: 'example_database' }],
    ['branch.ready', branch],
    ['branch.anomaly', branch],
    ['deploy_request.opened', deployRequest],
    ['deploy_request.queued', deployRequest],
    ['deploy_request.in_progress', deployRequest],
    ['backup.failed', { id: 'k2n8pqw4x1yz', type: 'Backup', name: '2026.08.27 15:04:05.123', state: 'failed' }],
    ['backup.succeeded', { id: 'b4ckup98wxyz', type: 'Backup', name: '2026.08.27 03:00:00.000', state: 'success' }],
    ['cluster.storage', { branch_name: 'main', storage_percentage: 44, storage: [{ storage_percentage: 44.1 }] }],
    ['database.access_request', { id: '23wl4nynt06x', type: 'PlanetScaleAdminAccessRequest', state: 'pending' }],
  ])('returns 200 for a signed %s event', async (event, resource) => {
    const response = await postSigned(JSON.stringify(envelope(event, resource)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('returns 200 for documented events it does not handle and unknown events', async () => {
    expect((await postSigned(JSON.stringify(envelope('deploy_request.closed', deployRequest)))).status).toBe(200);
    expect((await postSigned(JSON.stringify(envelope('something.new', {})))).status).toBe(200);
  });

  it('ignores wrong-typed fields instead of failing', async () => {
    expect((await postSigned(JSON.stringify({ event: 42, resource: 'nope', database: ['x'] }))).status).toBe(200);
    expect((await postSigned(JSON.stringify({ event: 'deploy_request.opened', resource: [1, 2] }))).status).toBe(200);
    expect((await postSigned(JSON.stringify({ event: 'cluster.storage', resource: { storage: 'x' } }))).status).toBe(200);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    expect((await postSigned('not json')).status).toBe(400);
  });

  it('returns 400 for a signed JSON body that is not an object', async () => {
    expect((await postSigned('[1,2]')).status).toBe(400);
    expect((await postSigned('null')).status).toBe(400);
    expect((await postSigned('"str"')).status).toBe(400);
  });
});
