const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.PLANETSCALE_WEBHOOK_SECRET = 'test_planetscale_secret';

const { app, verifyPlanetScaleWebhook } = require('../src/index');

const SECRET = process.env.PLANETSCALE_WEBHOOK_SECRET;

/**
 * Generate a valid PlanetScale signature for testing: bare hex HMAC-SHA256 of the raw body
 */
function generatePlanetScaleSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// Shapes follow PlanetScale's documented example payloads (resources trimmed)
const envelope = (event, resource) => ({
  timestamp: 1698252879,
  event,
  organization: 'myorg',
  database: 'example_database',
  resource,
});

const branch = { id: 'ecrmjy2f4a5o', type: 'Branch', name: 'dev', state: 'ready', html_url: 'https://app.planetscale.com/demo-db/example_database/dev' };
const deployRequest = { id: '4xsz0ql82y4n', type: 'DeployRequest', number: 5, branch: 'dev', into_branch: 'main', state: 'open', deployment_state: 'pending' };

function post(body, headers = {}) {
  const req = request(app).post('/webhooks/planetscale').set('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(headers)) req.set(k, v);
  return req.send(body);
}

function postSigned(body, secret = SECRET) {
  return post(body, { 'X-PlanetScale-Signature': generatePlanetScaleSignature(body, secret) });
}

describe('PlanetScale Webhook Endpoint', () => {
  describe('verifyPlanetScaleWebhook', () => {
    const payload = Buffer.from('{"event":"webhook.test"}');
    const valid = generatePlanetScaleSignature(payload, SECRET);

    it('returns true for a valid signature', () => {
      expect(verifyPlanetScaleWebhook(payload, valid, SECRET)).toBe(true);
    });

    it('accepts uppercase hex', () => {
      expect(verifyPlanetScaleWebhook(payload, valid.toUpperCase(), SECRET)).toBe(true);
    });

    it('rejects a missing or empty header', () => {
      expect(verifyPlanetScaleWebhook(payload, undefined, SECRET)).toBe(false);
      expect(verifyPlanetScaleWebhook(payload, '', SECRET)).toBe(false);
    });

    it('rejects a missing secret', () => {
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
      expect(verifyPlanetScaleWebhook(Buffer.from('{"event":"x"}'), valid, SECRET)).toBe(false);
    });
  });

  describe('POST /webhooks/planetscale', () => {
    it('returns 401 for a missing signature', async () => {
      const response = await post(JSON.stringify(envelope('branch.ready', branch)));
      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('returns 401 for an invalid signature', async () => {
      const response = await post(JSON.stringify(envelope('branch.ready', branch)), {
        'X-PlanetScale-Signature': 'a'.repeat(64),
      });
      expect(response.status).toBe(401);
    });

    it('returns 401 for a malformed signature', async () => {
      const response = await post(JSON.stringify(envelope('branch.ready', branch)), {
        'X-PlanetScale-Signature': 'not-hex',
      });
      expect(response.status).toBe(401);
    });

    it('returns 401 when signed with the wrong secret', async () => {
      const response = await postSigned(JSON.stringify(envelope('branch.ready', branch)), 'wrong_secret');
      expect(response.status).toBe(401);
    });

    it('returns 401 when the body is tampered with after signing', async () => {
      const body = JSON.stringify(envelope('branch.ready', branch));
      const response = await post(body.replace('dev', 'main'), {
        'X-PlanetScale-Signature': generatePlanetScaleSignature(body, SECRET),
      });
      expect(response.status).toBe(401);
    });

    it('verifies the exact bytes, not a re-serialization', async () => {
      // Signed over the pretty-printed bytes: JSON.stringify(JSON.parse(body)) would differ
      const body = JSON.stringify(envelope('branch.ready', branch), null, 2);
      const response = await postSigned(body);
      expect(response.status).toBe(200);
    });

    it('verifies any content type', async () => {
      const body = JSON.stringify(envelope('branch.ready', branch));
      const response = await request(app)
        .post('/webhooks/planetscale')
        .set('Content-Type', 'text/plain')
        .set('X-PlanetScale-Signature', generatePlanetScaleSignature(body, SECRET))
        .send(body);
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
      expect(response.text).toBe('OK');
    });

    it('returns 200 for documented events it does not handle', async () => {
      const response = await postSigned(JSON.stringify(envelope('deploy_request.closed', deployRequest)));
      expect(response.status).toBe(200);
    });

    it('returns 200 for an unknown event', async () => {
      const response = await postSigned(JSON.stringify(envelope('something.new', {})));
      expect(response.status).toBe(200);
    });

    it('ignores wrong-typed fields instead of failing', async () => {
      const body = JSON.stringify({ event: 42, resource: 'nope', database: ['x'] });
      expect((await postSigned(body)).status).toBe(200);
      const body2 = JSON.stringify({ event: 'deploy_request.opened', resource: [1, 2] });
      expect((await postSigned(body2)).status).toBe(200);
      const body3 = JSON.stringify({ event: 'cluster.storage', resource: { storage: 'x' } });
      expect((await postSigned(body3)).status).toBe(200);
    });

    it('returns 400 for a signed body that is not JSON', async () => {
      const response = await postSigned('not json');
      expect(response.status).toBe(400);
    });

    it('returns 400 for a signed JSON body that is not an object', async () => {
      expect((await postSigned('[1,2]')).status).toBe(400);
      expect((await postSigned('null')).status).toBe(400);
      expect((await postSigned('"str"')).status).toBe(400);
    });
  });

  describe('GET /health', () => {
    it('returns health status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
