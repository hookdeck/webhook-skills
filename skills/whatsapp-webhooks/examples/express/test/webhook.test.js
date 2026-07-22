const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing the app.
process.env.WHATSAPP_APP_SECRET = 'test_app_secret';
process.env.WHATSAPP_VERIFY_TOKEN = 'test_verify_token';

const { app, verifyWhatsAppSignature } = require('../src/index');

/**
 * Generate a valid WhatsApp X-Hub-Signature-256 header for testing.
 */
function generateSignature(payload, secret) {
  const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${digest}`;
}

const APP_SECRET = process.env.WHATSAPP_APP_SECRET;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

const messagePayload = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA_ID',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { phone_number_id: '123456' },
            messages: [
              { from: '15551234567', id: 'wamid.ABC', type: 'text', text: { body: 'Hello' } }
            ]
          }
        }
      ]
    }
  ]
});

const statusPayload = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA_ID',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { phone_number_id: '123456' },
            statuses: [
              { id: 'wamid.ABC', status: 'delivered', recipient_id: '15551234567' }
            ]
          }
        }
      ]
    }
  ]
});

describe('verifyWhatsAppSignature', () => {
  it('returns true for a valid signature', () => {
    const sig = generateSignature(messagePayload, APP_SECRET);
    expect(verifyWhatsAppSignature(Buffer.from(messagePayload), sig, APP_SECRET)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(verifyWhatsAppSignature(Buffer.from(messagePayload), 'sha256=deadbeef', APP_SECRET)).toBe(false);
  });

  it('returns false for a missing signature', () => {
    expect(verifyWhatsAppSignature(Buffer.from(messagePayload), null, APP_SECRET)).toBe(false);
  });

  it('returns false for a malformed header', () => {
    expect(verifyWhatsAppSignature(Buffer.from(messagePayload), 'not_a_valid_format', APP_SECRET)).toBe(false);
  });

  it('returns false for the wrong secret', () => {
    const sig = generateSignature(messagePayload, APP_SECRET);
    expect(verifyWhatsAppSignature(Buffer.from(messagePayload), sig, 'wrong_secret')).toBe(false);
  });

  it('returns false for a tampered payload', () => {
    const sig = generateSignature(messagePayload, APP_SECRET);
    const tampered = messagePayload.replace('Hello', 'Goodbye');
    expect(verifyWhatsAppSignature(Buffer.from(tampered), sig, APP_SECRET)).toBe(false);
  });
});

describe('GET /webhooks/whatsapp (verification handshake)', () => {
  it('echoes hub.challenge when the verify token matches', async () => {
    const response = await request(app).get('/webhooks/whatsapp').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': '1158201444'
    });
    expect(response.status).toBe(200);
    expect(response.text).toBe('1158201444');
  });

  it('returns 403 when the verify token does not match', async () => {
    const response = await request(app).get('/webhooks/whatsapp').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong_token',
      'hub.challenge': '1158201444'
    });
    expect(response.status).toBe(403);
  });

  it('returns 403 when the mode is not subscribe', async () => {
    const response = await request(app).get('/webhooks/whatsapp').query({
      'hub.mode': 'unsubscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': '1158201444'
    });
    expect(response.status).toBe(403);
  });
});

describe('POST /webhooks/whatsapp (event delivery)', () => {
  it('returns 401 for a missing signature', async () => {
    const response = await request(app)
      .post('/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .send(messagePayload);
    expect(response.status).toBe(401);
    expect(response.text).toBe('Invalid signature');
  });

  it('returns 401 for an invalid signature', async () => {
    const response = await request(app)
      .post('/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=deadbeef')
      .send(messagePayload);
    expect(response.status).toBe(401);
  });

  it('returns 200 for a valid inbound message', async () => {
    const sig = generateSignature(messagePayload, APP_SECRET);
    const response = await request(app)
      .post('/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sig)
      .send(messagePayload);
    expect(response.status).toBe(200);
    expect(response.text).toBe('EVENT_RECEIVED');
  });

  it('returns 200 for a valid status update', async () => {
    const sig = generateSignature(statusPayload, APP_SECRET);
    const response = await request(app)
      .post('/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sig)
      .send(statusPayload);
    expect(response.status).toBe(200);
    expect(response.text).toBe('EVENT_RECEIVED');
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
