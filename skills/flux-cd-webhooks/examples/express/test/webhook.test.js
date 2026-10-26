const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.FLUX_CD_WEBHOOK_SECRET = 'test_flux_cd_token';

const { app, verifyFluxWebhook } = require('../src/index');

// Payload as shown in the Flux notification-controller docs (generic webhook)
const errorEvent = {
  involvedObject: {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    name: 'webapp',
    namespace: 'apps',
    uid: '7d0cdc51-ddcf-4743-b223-83ca5c699632',
  },
  metadata: { 'kustomize.toolkit.fluxcd.io/revision': 'main/731f7eaddfb6af01cb2173e18f0f75b0ba780ef1' },
  severity: 'error',
  reason: 'ValidationFailed',
  message: 'service/apps/webapp validation error: spec.type: Unsupported value: Ingress',
  reportingController: 'kustomize-controller',
  reportingInstance: 'kustomize-controller-7c7b47f5f-8bhrp',
  timestamp: '2022-10-28T07:26:19Z',
};
const infoEvent = { ...errorEvent, severity: 'info', reason: 'ReconciliationSucceeded', message: 'Reconciliation finished' };

// Flux's X-Signature is `sha256=` + hex HMAC-SHA256 of the raw body
function sign(payload, secret = process.env.FLUX_CD_WEBHOOK_SECRET) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function send(body, signature) {
  const req = request(app).post('/webhooks/flux-cd').set('Content-Type', 'application/json');
  if (signature !== null) {
    req.set('X-Signature', signature === undefined ? `sha256=${sign(body)}` : signature);
  }
  return req.send(body);
}

describe('Flux CD Webhook Endpoint', () => {
  const secret = process.env.FLUX_CD_WEBHOOK_SECRET;
  const payload = Buffer.from('{"severity":"info"}');

  describe('verifyFluxWebhook', () => {
    it('accepts a sha256= prefixed signature', () => {
      expect(verifyFluxWebhook(payload, `sha256=${sign(payload)}`, secret)).toBe(true);
    });

    it('accepts a bare hex signature', () => {
      expect(verifyFluxWebhook(payload, sign(payload), secret)).toBe(true);
    });

    it('accepts uppercase hex', () => {
      expect(verifyFluxWebhook(payload, `sha256=${sign(payload).toUpperCase()}`, secret)).toBe(true);
    });

    it('rejects missing, empty, malformed and wrong-length values', () => {
      expect(verifyFluxWebhook(payload, undefined, secret)).toBe(false);
      expect(verifyFluxWebhook(payload, '', secret)).toBe(false);
      expect(verifyFluxWebhook(payload, 'sha256=', secret)).toBe(false);
      expect(verifyFluxWebhook(payload, 'sha256=zz' + sign(payload).slice(2), secret)).toBe(false);
      expect(verifyFluxWebhook(payload, `sha256=${sign(payload).slice(2)}`, secret)).toBe(false);
    });

    it('rejects other hash functions', () => {
      const sha512 = crypto.createHmac('sha512', secret).update(payload).digest('hex');
      expect(verifyFluxWebhook(payload, `sha512=${sha512}`, secret)).toBe(false);
    });

    it('rejects a wrong secret, a tampered body, and no configured secret', () => {
      expect(verifyFluxWebhook(payload, `sha256=${sign(payload, 'wrong')}`, secret)).toBe(false);
      expect(verifyFluxWebhook(Buffer.from('{"severity":"error"}'), `sha256=${sign(payload)}`, secret)).toBe(false);
      expect(verifyFluxWebhook(payload, `sha256=${sign(payload)}`, '')).toBe(false);
    });
  });

  describe('POST /webhooks/flux-cd', () => {
    it('returns 401 for a missing signature', async () => {
      const response = await send(JSON.stringify(errorEvent), null);
      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('returns 401 for an empty signature', async () => {
      expect((await send(JSON.stringify(errorEvent), '')).status).toBe(401);
    });

    it('returns 401 for a malformed signature', async () => {
      expect((await send(JSON.stringify(errorEvent), 'sha256=deadbeef')).status).toBe(401);
    });

    it('returns 401 for a signature made with the wrong secret', async () => {
      const body = JSON.stringify(errorEvent);
      expect((await send(body, `sha256=${sign(body, 'wrong_secret')}`)).status).toBe(401);
    });

    it('returns 401 when the body is changed after signing', async () => {
      const signature = `sha256=${sign(JSON.stringify(errorEvent))}`;
      expect((await send(JSON.stringify(infoEvent), signature)).status).toBe(401);
    });

    it.each([
      ['error', errorEvent],
      ['info', infoEvent],
    ])('returns 200 for a valid %s event', async (_severity, event) => {
      const response = await send(JSON.stringify(event));
      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('verifies the exact bytes, including non-canonical JSON formatting', async () => {
      const body = JSON.stringify(errorEvent, null, 2);
      expect((await send(body)).status).toBe(200);
    });

    it('accepts a bare hex signature', async () => {
      const body = JSON.stringify(infoEvent);
      expect((await send(body, sign(body))).status).toBe(200);
    });

    it('returns 400 for a validly signed body that is not JSON', async () => {
      const response = await send('not json');
      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid payload');
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
