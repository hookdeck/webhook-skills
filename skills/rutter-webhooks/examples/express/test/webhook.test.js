const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.RUTTER_CLIENT_SECRET = 'test_rutter_client_secret';
process.env.RUTTER_CLIENT_SECRET_PREVIOUS = '';

const { app, verifyRutterWebhook } = require('../src/index');

/**
 * Generate a valid Rutter signature: "sha256=" + base64(HMAC-SHA256(payload, secret))
 */
function generateRutterSignature(payload, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

const secret = process.env.RUTTER_CLIENT_SECRET;

function post(body, headers = {}) {
  return request(app)
    .post('/webhooks/rutter')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

describe('Rutter Webhook Endpoint', () => {
  describe('verifyRutterWebhook', () => {
    const payload = Buffer.from('{"type":"CONNECTION","code":"INITIAL_UPDATE"}');

    it('returns true for a valid signature', () => {
      const sig = generateRutterSignature(payload, secret);
      expect(verifyRutterWebhook(payload, sig, [secret])).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      expect(verifyRutterWebhook(payload, 'sha256=invalid', [secret])).toBe(false);
    });

    it('returns false for a missing header', () => {
      expect(verifyRutterWebhook(payload, undefined, [secret])).toBe(false);
    });

    it('returns false when signed with the wrong secret', () => {
      const sig = generateRutterSignature(payload, 'other_secret');
      expect(verifyRutterWebhook(payload, sig, [secret])).toBe(false);
    });

    it('returns false when the payload was modified', () => {
      const sig = generateRutterSignature(payload, secret);
      expect(verifyRutterWebhook(Buffer.from('{"tampered":true}'), sig, [secret])).toBe(false);
    });

    it('accepts any entry in a comma-separated list (secret rotation)', () => {
      const oldSecret = 'expiring_secret';
      const list = [
        generateRutterSignature(payload, 'new_secret'),
        generateRutterSignature(payload, oldSecret),
      ].join(', ');
      // Only the old secret is known: the second entry still matches
      expect(verifyRutterWebhook(payload, list, [oldSecret])).toBe(true);
      // Only the new secret is known: the first entry matches
      expect(verifyRutterWebhook(payload, list, ['new_secret'])).toBe(true);
      // Neither secret is known
      expect(verifyRutterWebhook(payload, list, ['unrelated'])).toBe(false);
    });

    it('does not require a space after the comma', () => {
      const list = [
        generateRutterSignature(payload, 'new_secret'),
        generateRutterSignature(payload, secret),
      ].join(',');
      expect(verifyRutterWebhook(payload, list, [secret])).toBe(true);
    });

    it('ignores empty secrets', () => {
      const sig = generateRutterSignature(payload, '');
      expect(verifyRutterWebhook(payload, sig, [''])).toBe(false);
    });
  });

  describe('POST /webhooks/rutter', () => {
    const connectionPayload = JSON.stringify({
      type: 'CONNECTION',
      code: 'INITIAL_UPDATE',
      connection_id: '3adc1519-0d6e-4222-83de-25b457cf42be',
      access_token: '313c3e00-2bbc-4b2e-a9dc-13abed546b65',
    });

    it('returns 400 for a missing signature', async () => {
      const res = await post(connectionPayload);
      expect(res.status).toBe(400);
    });

    it('returns 400 for an invalid signature', async () => {
      const res = await post(connectionPayload, {
        'X-Rutter-Signature': 'sha256=bad',
        'X-Rutter-Signatures': 'sha256=bad',
      });
      expect(res.status).toBe(400);
    });

    it('returns 200 for a valid X-Rutter-Signatures header', async () => {
      const sig = generateRutterSignature(connectionPayload, secret);
      const res = await post(connectionPayload, {
        'X-Rutter-Signature': sig,
        'X-Rutter-Signatures': sig,
      });
      expect(res.status).toBe(200);
    });

    it('falls back to X-Rutter-Signature when the list header is absent', async () => {
      const sig = generateRutterSignature(connectionPayload, secret);
      const res = await post(connectionPayload, { 'X-Rutter-Signature': sig });
      expect(res.status).toBe(200);
    });

    it('accepts a delivery signed with the new and expiring secrets', async () => {
      process.env.RUTTER_CLIENT_SECRET_PREVIOUS = 'expiring_secret';
      try {
        const list = [
          generateRutterSignature(connectionPayload, 'brand_new_secret'),
          generateRutterSignature(connectionPayload, 'expiring_secret'),
        ].join(', ');
        const res = await post(connectionPayload, {
          'X-Rutter-Signature': list.split(', ')[0],
          'X-Rutter-Signatures': list,
        });
        expect(res.status).toBe(200);
      } finally {
        process.env.RUTTER_CLIENT_SECRET_PREVIOUS = '';
      }
    });

    it.each([
      [{ type: 'CONNECTION', code: 'CONNECTION_NEEDS_UPDATE', update_url: 'https://link.rutterapi.com/connection/x' }],
      [{ type: 'CONNECTION', code: 'CONNECTION_DISABLED', disable_error: 'e', disable_message: 'm' }],
      [{ type: 'ORDER', code: 'ORDER_CREATED', order: { id: 'o1' } }],
      [{ type: 'ORDER', code: 'ORDER_UPDATED', order: { id: 'o1' } }],
      [{ type: 'ORDER', code: 'ORDER_DELETED', order: { id: 'o1' } }],
      [{ type: 'INVOICE', code: 'INVOICE_CREATED', invoice: { id: 'i1' } }],
      [{ type: 'INVOICE', code: 'INVOICE_UPDATED', invoice: { id: 'i1' } }],
      [{ type: 'VENDOR', code: 'VENDOR_CREATED', vendor: { id: 'v1' } }], // unhandled but acknowledged
    ])('acknowledges %j', async (event) => {
      const body = JSON.stringify({ ...event, connection_id: 'c1', access_token: 't1' });
      const sig = generateRutterSignature(body, secret);
      const res = await post(body, { 'X-Rutter-Signatures': sig });
      expect(res.status).toBe(200);
    });

    it('returns 400 for a validly signed non-JSON body', async () => {
      const body = 'not json';
      const sig = generateRutterSignature(body, secret);
      const res = await post(body, { 'X-Rutter-Signatures': sig });
      expect(res.status).toBe(400);
    });
  });
});
