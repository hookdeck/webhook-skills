const request = require('supertest');

// Set test environment variables before importing the app
process.env.GOVUK_NOTIFY_WEBHOOK_SECRET = 'test_notify_bearer_token_0123456789';

const app = require('../src/index');
const { verifyNotifyRequest, classifyCallback } = require('../src/index');

const SECRET = process.env.GOVUK_NOTIFY_WEBHOOK_SECRET;

// Built from the field tables in the GOV.UK Notify callback docs (not captured traffic).
const DELIVERY_RECEIPT = {
  id: '740e5834-3a29-46b4-9a6f-16142fde533a',
  reference: '12345678',
  to: 'hello@gov.uk',
  status: 'delivered',
  created_at: '2017-05-14T12:15:30.000000Z',
  completed_at: '2017-05-14T12:15:30.000000Z',
  sent_at: '2017-05-14T12:15:30.000000Z',
  notification_type: 'email',
  template_id: '1d8b2b3c-0f4c-4a3e-9b53-7c5f2a1e8d10',
  template_version: 1
};

const RECEIVED_TEXT = {
  id: '1e8b2b3c-0f4c-4a3e-9b53-7c5f2a1e8d11',
  source_number: '447700912345',
  destination_number: '07700987654',
  message: 'Hello Notify!',
  date_received: '2017-05-14T12:15:30.000000Z'
};

const RETURNED_LETTER = {
  notification_id: '2f8b2b3c-0f4c-4a3e-9b53-7c5f2a1e8d12',
  reference: '12345678',
  date_sent: '2017-05-14T12:15:30.000000Z',
  sent_by: 'hello@gov.uk',
  template_name: 'Template name',
  template_id: '1d8b2b3c-0f4c-4a3e-9b53-7c5f2a1e8d10',
  template_version: 1,
  spreadsheet_file_name: 'contact_list.csv',
  spreadsheet_row_number: 2,
  upload_letter_file_name: null
};

function post(body = JSON.stringify(DELIVERY_RECEIPT), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/govuk-notify')
    .set('Content-Type', contentType)
    .send(body);
}

describe('GOV.UK Notify webhook endpoint', () => {
  describe('Authorization bearer verification', () => {
    it('accepts the correct bearer token', async () => {
      const res = await post().set('Authorization', `Bearer ${SECRET}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the Bearer scheme case-insensitively', async () => {
      for (const scheme of ['bearer', 'BEARER', 'BeArEr']) {
        const res = await post().set('Authorization', `${scheme} ${SECRET}`);
        expect(res.status).toBe(200);
      }
    });

    it('keeps the token case-sensitive', async () => {
      const res = await post().set('Authorization', `Bearer ${SECRET.toUpperCase()}`);
      expect(res.status).toBe(401);
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await post().set('Authorization', `Bearer ${'x'.repeat(SECRET.length)}`);
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await post().set('Authorization', 'Bearer short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects the bare token without the Bearer scheme', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects another scheme', async () => {
      const res = await post().set('Authorization', `Basic ${SECRET}`);
      expect(res.status).toBe(401);
    });

    it('rejects an empty token', async () => {
      const res = await post().set('Authorization', 'Bearer ');
      expect(res.status).toBe(401);
    });

    it('does not trim the token', async () => {
      const res = await post().set('Authorization', `Bearer  ${SECRET}`);
      expect(res.status).toBe(401);
    });

    it('rejects before parsing the body', async () => {
      const res = await post('not json');
      expect(res.status).toBe(401);
    });
  });

  describe('configured secret', () => {
    it('strips a leading "Bearer " from the configured value, case-insensitively', () => {
      expect(verifyNotifyRequest({ authorization: `Bearer ${SECRET}` }, `Bearer ${SECRET}`)).toBe(true);
      expect(verifyNotifyRequest({ authorization: `Bearer ${SECRET}` }, `bearer ${SECRET}`)).toBe(true);
    });

    it('does not trim the configured secret', () => {
      expect(verifyNotifyRequest({ authorization: `Bearer ${SECRET}` }, ` ${SECRET}`)).toBe(false);
    });

    it('fails closed when unconfigured or empty', () => {
      expect(verifyNotifyRequest({ authorization: 'Bearer abc' }, '')).toBe(false);
      expect(verifyNotifyRequest({ authorization: 'Bearer abc' }, undefined)).toBe(false);
      expect(verifyNotifyRequest({ authorization: 'Bearer ' }, 'Bearer ')).toBe(false);
    });

    it('handles non-ASCII tokens', () => {
      expect(verifyNotifyRequest({ authorization: 'Bearer pässword' }, 'pässword')).toBe(true);
      expect(verifyNotifyRequest({ authorization: 'Bearer password' }, 'pässword')).toBe(false);
    });
  });

  describe('callback kinds', () => {
    it('classifies by shape', () => {
      expect(classifyCallback(DELIVERY_RECEIPT)).toBe('delivery_receipt');
      expect(classifyCallback(RECEIVED_TEXT)).toBe('received_text');
      expect(classifyCallback(RETURNED_LETTER)).toBe('returned_letter');
      expect(classifyCallback({ hello: 'world' })).toBe('unknown');
    });

    it.each([
      ['delivery receipt: delivered', DELIVERY_RECEIPT],
      ['delivery receipt: permanent-failure', { ...DELIVERY_RECEIPT, status: 'permanent-failure' }],
      ['delivery receipt: temporary-failure', { ...DELIVERY_RECEIPT, status: 'temporary-failure' }],
      ['delivery receipt: technical-failure', { ...DELIVERY_RECEIPT, status: 'technical-failure' }],
      ['received text message', RECEIVED_TEXT],
      ['returned letter', RETURNED_LETTER],
      ['unknown shape', { hello: 'world' }]
    ])('handles %s', async (_name, payload) => {
      const res = await post(JSON.stringify(payload)).set('Authorization', `Bearer ${SECRET}`);
      expect(res.status).toBe(200);
    });
  });

  describe('request body', () => {
    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(DELIVERY_RECEIPT), 'text/plain').set('Authorization', `Bearer ${SECRET}`);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await post('not json').set('Authorization', `Bearer ${SECRET}`);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object body', async () => {
      const res = await post('[1,2]').set('Authorization', `Bearer ${SECRET}`);
      expect(res.status).toBe(400);
    });
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
