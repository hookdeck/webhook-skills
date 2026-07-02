const request = require('supertest');

// A valid HEX HMAC key (as generated in the Adyen Customer Area) must be set
// before importing the app, because it hex-decodes the key.
process.env.ADYEN_HMAC_KEY =
  '44782DEF547AAA06C910C43932B1EB0C71FC68D9D0C057550C48EC2ACF6BA056';

const { app, validator } = require('../src/index');

const HMAC_KEY = process.env.ADYEN_HMAC_KEY;

/**
 * Build a signed notification body for a NotificationRequestItem.
 * Uses the Adyen SDK to produce a real hmacSignature.
 */
function signedBody(item) {
  const signature = validator.calculateHmac(item, HMAC_KEY);
  const withSig = {
    ...item,
    additionalData: { ...(item.additionalData || {}), hmacSignature: signature },
  };
  return { live: 'false', notificationItems: [{ NotificationRequestItem: withSig }] };
}

function baseItem(overrides = {}) {
  return {
    pspReference: '7914073381342284',
    originalReference: '',
    merchantAccountCode: 'TestMerchant',
    merchantReference: 'TestPayment-1407325143704',
    amount: { value: 1130, currency: 'EUR' },
    eventCode: 'AUTHORISATION',
    success: 'true',
    ...overrides,
  };
}

describe('Adyen Webhook Endpoint', () => {
  describe('HMAC verification (SDK)', () => {
    it('validates a signature it generated', () => {
      const item = baseItem();
      item.additionalData = { hmacSignature: validator.calculateHmac(item, HMAC_KEY) };
      expect(validator.validateHMAC(item, HMAC_KEY)).toBe(true);
    });

    it('rejects a tampered amount', () => {
      const item = baseItem();
      item.additionalData = { hmacSignature: validator.calculateHmac(item, HMAC_KEY) };
      item.amount.value = 9999;
      expect(validator.validateHMAC(item, HMAC_KEY)).toBe(false);
    });
  });

  describe('POST /webhooks/adyen', () => {
    it('returns 200 and [accepted] for a valid signature', async () => {
      const response = await request(app)
        .post('/webhooks/adyen')
        .set('Content-Type', 'application/json')
        .send(signedBody(baseItem()));

      expect(response.status).toBe(200);
      expect(response.text).toBe('[accepted]');
    });

    it('returns 401 for an invalid signature', async () => {
      const body = {
        live: 'false',
        notificationItems: [
          {
            NotificationRequestItem: {
              ...baseItem(),
              additionalData: { hmacSignature: 'invalid_signature' },
            },
          },
        ],
      };

      const response = await request(app)
        .post('/webhooks/adyen')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(response.status).toBe(401);
    });

    it('returns 401 for a missing signature', async () => {
      const body = {
        live: 'false',
        notificationItems: [{ NotificationRequestItem: baseItem() }],
      };

      const response = await request(app)
        .post('/webhooks/adyen')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(response.status).toBe(401);
    });

    it('returns 400 for a malformed body', async () => {
      const response = await request(app)
        .post('/webhooks/adyen')
        .set('Content-Type', 'application/json')
        .send({ foo: 'bar' });

      expect(response.status).toBe(400);
    });

    it('handles the common event codes', async () => {
      const eventCodes = [
        'AUTHORISATION',
        'CAPTURE',
        'CAPTURE_FAILED',
        'REFUND',
        'REFUND_FAILED',
        'CANCELLATION',
        'CANCEL_OR_REFUND',
        'CHARGEBACK',
        'NOTIFICATION_OF_CHARGEBACK',
        'REPORT_AVAILABLE',
      ];

      for (const eventCode of eventCodes) {
        const response = await request(app)
          .post('/webhooks/adyen')
          .set('Content-Type', 'application/json')
          .send(signedBody(baseItem({ eventCode })));

        expect(response.status).toBe(200);
        expect(response.text).toBe('[accepted]');
      }
    });

    it('verifies every item in a multi-item batch', async () => {
      const good = baseItem();
      good.additionalData = { hmacSignature: validator.calculateHmac(good, HMAC_KEY) };
      const bad = baseItem({ eventCode: 'CAPTURE' });
      bad.additionalData = { hmacSignature: 'invalid_signature' };

      const response = await request(app)
        .post('/webhooks/adyen')
        .set('Content-Type', 'application/json')
        .send({
          live: 'false',
          notificationItems: [
            { NotificationRequestItem: good },
            { NotificationRequestItem: bad },
          ],
        });

      expect(response.status).toBe(401);
    });
  });

  describe('Basic Auth', () => {
    const OLD = { ...process.env };
    afterEach(() => {
      process.env.ADYEN_WEBHOOK_USERNAME = OLD.ADYEN_WEBHOOK_USERNAME;
      process.env.ADYEN_WEBHOOK_PASSWORD = OLD.ADYEN_WEBHOOK_PASSWORD;
    });

    it('returns 401 when configured credentials are missing', async () => {
      process.env.ADYEN_WEBHOOK_USERNAME = 'user';
      process.env.ADYEN_WEBHOOK_PASSWORD = 'pass';

      const response = await request(app)
        .post('/webhooks/adyen')
        .set('Content-Type', 'application/json')
        .send(signedBody(baseItem()));

      expect(response.status).toBe(401);
    });

    it('accepts correct Basic Auth credentials', async () => {
      process.env.ADYEN_WEBHOOK_USERNAME = 'user';
      process.env.ADYEN_WEBHOOK_PASSWORD = 'pass';
      const creds = Buffer.from('user:pass').toString('base64');

      const response = await request(app)
        .post('/webhooks/adyen')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Basic ${creds}`)
        .send(signedBody(baseItem()));

      expect(response.status).toBe(200);
      expect(response.text).toBe('[accepted]');
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
