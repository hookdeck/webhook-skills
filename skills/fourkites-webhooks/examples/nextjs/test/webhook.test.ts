import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/fourkites/route';
import { verifyFourKitesRequest } from '../lib/verify-fourkites';

const USER = 'fk_user';
const PASS = 'p@ss:word/with:colons';

const EVENTS = [
  'LOAD_CREATION',
  'LOCATION_UPDATE',
  'TRACKING_UPDATE',
  'STOP_ETA_UPDATED',
  'STOP_ARRIVAL',
  'STOP_DEPARTURE',
  'STOP_AUTO_COMPLETED',
  'MANUALLY_DELIVERED',
  'MANUALLY_PICKED_UP',
  'STOP_APPOINTMENT_RESCHEDULED',
  'STOP_AMEND',
  'LOAD_DELETED',
];

beforeAll(() => {
  process.env.FOURKITES_WEBHOOK_USERNAME = USER;
  process.env.FOURKITES_WEBHOOK_PASSWORD = PASS;
});

const basic = (u: string, p: string, scheme = 'Basic') =>
  `${scheme} ${Buffer.from(`${u}:${p}`).toString('base64')}`;

function samplePayload(type = 'STOP_ARRIVAL') {
  return {
    MessageType: type,
    FourKitesLoadId: 1234,
    LoadNumber: 'BOL12345',
    StopName: 'ABC Stop',
    Timestamp: '2015-10-01T16:00:00-05:00',
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/fourkites', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/fourkites', () => {
  describe('Basic auth verification', () => {
    it('accepts the correct credentials', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS) }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts the scheme case-insensitively', async () => {
      const res = await POST(makeRequest({ authorization: basic(USER, PASS, 'basic') }));
      expect(res.status).toBe(200);
    });

    it('splits on the first colon only (password may contain colons)', async () => {
      expect(PASS).toContain(':');
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS) }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong password of the same length', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, 'x'.repeat(PASS.length)) }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await POST(makeRequest({ Authorization: basic('other', PASS) }));
      expect(res.status).toBe(401);
    });

    it('rejects credentials of a different length without throwing', async () => {
      const res = await POST(makeRequest({ Authorization: basic('u', 'p') }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects a non-Basic scheme', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer ${PASS}` }));
      expect(res.status).toBe(401);
    });

    it('rejects a Basic value with no colon', async () => {
      const res = await POST(
        makeRequest({ Authorization: `Basic ${Buffer.from('nocolon').toString('base64')}` })
      );
      expect(res.status).toBe(401);
    });

    it('fails closed when credentials are not configured', () => {
      const headers = new Headers({ authorization: basic(USER, PASS) });
      expect(verifyFourKitesRequest(headers, '', '')).toBe(false);
      expect(verifyFourKitesRequest(new Headers({ authorization: basic('', '') }), undefined, undefined)).toBe(false);
    });
  });

  describe('events', () => {
    it.each(EVENTS)('handles %s', async (type) => {
      const res = await POST(
        makeRequest({ Authorization: basic(USER, PASS) }, JSON.stringify(samplePayload(type)))
      );
      expect(res.status).toBe(200);
    });

    it('accepts an unknown MessageType', async () => {
      const res = await POST(
        makeRequest({ Authorization: basic(USER, PASS) }, JSON.stringify(samplePayload('SOMETHING_NEW')))
      );
      expect(res.status).toBe(200);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest({ Authorization: basic(USER, PASS) }, JSON.stringify(samplePayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('does not parse the body before authenticating', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, 'wrong') }, '{not json'));
      expect(res.status).toBe(401);
    });

    it('rejects invalid JSON with 400', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS) }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('rejects a non-object body with 400', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS) }, '[1,2]'));
      expect(res.status).toBe(400);
    });
  });
});
