const request = require('supertest');
const crypto = require('crypto');
const zlib = require('zlib');

// Test env must be set before importing the app
process.env.PAYPAL_WEBHOOK_ID = 'WH-TEST-WEBHOOK-ID';

const { app, certCache } = require('../src/index');

// Generate one RSA key pair for the whole suite. PayPal would use an X.509
// certificate, but Node's crypto.createVerify().verify() accepts a bare public
// key PEM too, which is enough for end-to-end signature testing.
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// A plausible-looking sandbox cert URL — must end in .paypal.com to pass
// the host-allowlist check inside fetchCert.
const TEST_CERT_URL =
  'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-360caa42-fca2a594-test';

// Pre-populate the cache so fetchCert returns our test public key instead of
// making a real HTTPS call.
certCache.set(TEST_CERT_URL, publicKey);

function signPayPalRequest(rawBody, { webhookId = process.env.PAYPAL_WEBHOOK_ID } = {}) {
  const transmissionId = 'b9e98030-d9b3-11ea-8f4a-test';
  const transmissionTime = '2024-08-22T18:23:10Z';
  const crc = zlib.crc32(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody));
  const message = `${transmissionId}|${transmissionTime}|${webhookId}|${crc}`;
  const signer = crypto.createSign('SHA256');
  signer.update(message);
  signer.end();
  const transmissionSig = signer.sign(privateKey, 'base64');
  return {
    'paypal-transmission-id': transmissionId,
    'paypal-transmission-time': transmissionTime,
    'paypal-transmission-sig': transmissionSig,
    'paypal-cert-url': TEST_CERT_URL,
    'paypal-auth-algo': 'SHA256withRSA',
  };
}

describe('POST /webhooks/paypal', () => {
  it('returns 400 when paypal-* headers are missing', async () => {
    const res = await request(app)
      .post('/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .send('{"event_type":"PAYMENT.CAPTURE.COMPLETED"}');
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const payload = JSON.stringify({
      id: 'WH-evt-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'cap_1' },
    });
    const headers = signPayPalRequest(payload);
    headers['paypal-transmission-sig'] = Buffer.from('not-the-real-signature').toString('base64');

    const res = await request(app)
      .post('/webhooks/paypal')
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 400 when the cert URL is not on paypal.com', async () => {
    const payload = JSON.stringify({
      id: 'WH-evt-2',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'cap_2' },
    });
    const headers = signPayPalRequest(payload);
    headers['paypal-cert-url'] = 'https://attacker.example.com/v1/notifications/certs/fake';

    const res = await request(app)
      .post('/webhooks/paypal')
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('returns 400 if the body is tampered after signing', async () => {
    const original = JSON.stringify({
      id: 'WH-evt-3',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'cap_3', amount: { value: '10.00', currency_code: 'USD' } },
    });
    const headers = signPayPalRequest(original);
    const tampered = JSON.stringify({
      id: 'WH-evt-3',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'cap_3', amount: { value: '999.00', currency_code: 'USD' } },
    });

    const res = await request(app)
      .post('/webhooks/paypal')
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(tampered);

    expect(res.status).toBe(400);
  });

  it('returns 400 if the signature was made for a different webhook ID', async () => {
    const payload = JSON.stringify({
      id: 'WH-evt-4',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'cap_4' },
    });
    const headers = signPayPalRequest(payload, { webhookId: 'WH-DIFFERENT-ID' });

    const res = await request(app)
      .post('/webhooks/paypal')
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify({
      id: 'WH-evt-5',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'cap_5' },
    });
    const headers = signPayPalRequest(payload);

    const res = await request(app)
      .post('/webhooks/paypal')
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it.each([
    'PAYMENT.CAPTURE.COMPLETED',
    'PAYMENT.CAPTURE.REFUNDED',
    'PAYMENT.SALE.COMPLETED',
    'CHECKOUT.ORDER.APPROVED',
    'BILLING.SUBSCRIPTION.CREATED',
    'BILLING.SUBSCRIPTION.ACTIVATED',
    'BILLING.SUBSCRIPTION.CANCELLED',
    'CUSTOMER.DISPUTE.CREATED',
    'UNHANDLED.EVENT.TYPE',
  ])('handles event_type %s', async (eventType) => {
    const payload = JSON.stringify({
      id: `WH-evt-${eventType}`,
      event_type: eventType,
      resource: { id: 'res_x', dispute_id: 'dispute_x' },
    });
    const headers = signPayPalRequest(payload);

    const res = await request(app)
      .post('/webhooks/paypal')
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('responds 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
