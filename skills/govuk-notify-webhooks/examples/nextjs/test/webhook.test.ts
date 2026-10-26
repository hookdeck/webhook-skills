import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/govuk-notify/route';
import { verifyNotifyRequest } from '../lib/verify-govuk-notify';

const SECRET = 'test_notify_bearer_token_0123456789';

beforeAll(() => {
  process.env.GOVUK_NOTIFY_WEBHOOK_SECRET = SECRET;
});

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
  template_version: 1,
};

const RECEIVED_TEXT = {
  id: '1e8b2b3c-0f4c-4a3e-9b53-7c5f2a1e8d11',
  source_number: '447700912345',
  destination_number: '07700987654',
  message: 'Hello Notify!',
  date_received: '2017-05-14T12:15:30.000000Z',
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
  upload_letter_file_name: null,
};

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(DELIVERY_RECEIPT),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/govuk-notify', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

const bearer = (token = SECRET, scheme = 'Bearer') => ({ Authorization: `${scheme} ${token}` });

describe('POST /webhooks/govuk-notify', () => {
  describe('Authorization bearer verification', () => {
    it('accepts the correct bearer token', async () => {
      const res = await POST(makeRequest(bearer()));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the Bearer scheme case-insensitively', async () => {
      for (const scheme of ['bearer', 'BEARER', 'BeArEr']) {
        const res = await POST(makeRequest(bearer(SECRET, scheme)));
        expect(res.status).toBe(200);
      }
    });

    it('keeps the token case-sensitive', async () => {
      const res = await POST(makeRequest(bearer(SECRET.toUpperCase())));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await POST(makeRequest(bearer('x'.repeat(SECRET.length))));
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await POST(makeRequest(bearer('short')));
      expect(res.status).toBe(401);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects the bare token without the Bearer scheme', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects another scheme', async () => {
      const res = await POST(makeRequest(bearer(SECRET, 'Basic')));
      expect(res.status).toBe(401);
    });

    it('rejects an empty token', async () => {
      const res = await POST(makeRequest({ Authorization: 'Bearer ' }));
      expect(res.status).toBe(401);
    });

    it('does not trim the token', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer  ${SECRET}` }));
      expect(res.status).toBe(401);
    });

    it('rejects before parsing the body', async () => {
      const res = await POST(makeRequest({}, 'not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('configured secret', () => {
    const h = (value: string) => new Headers({ authorization: value });

    it('strips a leading "Bearer " from the configured value, case-insensitively', () => {
      expect(verifyNotifyRequest(h(`Bearer ${SECRET}`), `Bearer ${SECRET}`)).toBe(true);
      expect(verifyNotifyRequest(h(`Bearer ${SECRET}`), `bearer ${SECRET}`)).toBe(true);
    });

    it('does not trim the configured secret', () => {
      expect(verifyNotifyRequest(h(`Bearer ${SECRET}`), ` ${SECRET}`)).toBe(false);
    });

    it('fails closed when unconfigured or empty', () => {
      expect(verifyNotifyRequest(h('Bearer abc'), '')).toBe(false);
      expect(verifyNotifyRequest(h('Bearer abc'), 'Bearer ')).toBe(false);
    });

    it('handles non-ASCII tokens', () => {
      const header = new Headers({ authorization: 'Bearer pässword' });
      expect(verifyNotifyRequest(header, 'pässword')).toBe(true);
      expect(verifyNotifyRequest(header, 'password')).toBe(false);
    });
  });

  describe('callback kinds', () => {
    it.each([
      ['delivery receipt: delivered', DELIVERY_RECEIPT],
      ['delivery receipt: permanent-failure', { ...DELIVERY_RECEIPT, status: 'permanent-failure' }],
      ['delivery receipt: temporary-failure', { ...DELIVERY_RECEIPT, status: 'temporary-failure' }],
      ['delivery receipt: technical-failure', { ...DELIVERY_RECEIPT, status: 'technical-failure' }],
      ['received text message', RECEIVED_TEXT],
      ['returned letter', RETURNED_LETTER],
      ['unknown shape', { hello: 'world' }],
    ])('handles %s', async (_name, payload) => {
      const res = await POST(makeRequest(bearer(), JSON.stringify(payload)));
      expect(res.status).toBe(200);
    });
  });

  describe('request body', () => {
    it('accepts any content type', async () => {
      const res = await POST(makeRequest(bearer(), JSON.stringify(DELIVERY_RECEIPT), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await POST(makeRequest(bearer(), 'not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object body', async () => {
      const res = await POST(makeRequest(bearer(), '[1,2]'));
      expect(res.status).toBe(400);
    });
  });
});
