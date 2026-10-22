const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'test_mautic_secret';
process.env.MAUTIC_WEBHOOK_SECRET = SECRET;

const { app, verifyMauticWebhook } = require('../src/index');

// Real Mautic algorithm: base64(HMAC-SHA256(rawBody, secret))
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

const newContact = JSON.stringify({
  'mautic.lead_post_save_new': [
    { contact: { id: 1 }, timestamp: '2026-01-01T12:00:00+00:00' },
  ],
});

describe('verifyMauticWebhook', () => {
  it('accepts a valid signature', () => {
    expect(verifyMauticWebhook(Buffer.from(newContact), sign(newContact), SECRET)).toBe(true);
  });

  it('rejects a signature made with another secret', () => {
    expect(verifyMauticWebhook(Buffer.from(newContact), sign(newContact, 'other'), SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyMauticWebhook(Buffer.from(newContact + ' '), sign(newContact), SECRET)).toBe(false);
  });

  it('rejects missing or wrong-length signatures without throwing', () => {
    expect(verifyMauticWebhook(Buffer.from(newContact), undefined, SECRET)).toBe(false);
    expect(verifyMauticWebhook(Buffer.from(newContact), 'short', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/mautic', () => {
  it('returns 200 for a valid contact event', async () => {
    const res = await request(app)
      .post('/webhooks/mautic')
      .set('Content-Type', 'application/json')
      .set('Webhook-Signature', sign(newContact))
      .send(newContact);
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const res = await request(app)
      .post('/webhooks/mautic')
      .set('Content-Type', 'text/plain')
      .set('Webhook-Signature', sign(newContact))
      .send(newContact);
    expect(res.status).toBe(200);
  });

  it('handles batched events of several types', async () => {
    const batch = JSON.stringify({
      'mautic.form_on_submit': [
        { submission: { id: 1 }, timestamp: '2026-01-01T12:00:00+00:00' },
        { submission: { id: 2 }, timestamp: '2026-01-01T12:00:01+00:00' },
      ],
      'mautic.email_on_open': [
        { email: { id: 3 }, contact: { id: 4 }, timestamp: '2026-01-01T12:00:02+00:00' },
      ],
      'mautic.unknown_event': [{ timestamp: '2026-01-01T12:00:03+00:00' }],
    });
    const res = await request(app)
      .post('/webhooks/mautic')
      .set('Content-Type', 'application/json')
      .set('Webhook-Signature', sign(batch))
      .send(batch);
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await request(app)
      .post('/webhooks/mautic')
      .set('Content-Type', 'application/json')
      .set('Webhook-Signature', sign(newContact, 'wrong'))
      .send(newContact);
    expect(res.status).toBe(400);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/mautic')
      .set('Content-Type', 'application/json')
      .send(newContact);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const res = await request(app)
      .post('/webhooks/mautic')
      .set('Content-Type', 'application/json')
      .set('Webhook-Signature', sign('not json'))
      .send('not json');
    expect(res.status).toBe(400);
  });
});
