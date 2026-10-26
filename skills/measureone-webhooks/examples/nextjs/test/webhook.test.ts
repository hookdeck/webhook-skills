import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/measureone/route';
import { verifyMeasureOneRequest } from '../lib/verify-measureone';

const HEADER = 'X-Webhook-Secret';
const SECRET = 'Bearer test_measureone_secret_0123456789';

const EVENTS = [
  'datarequest.report_available', 'datarequest.report_complete', 'datarequest.report_update_available',
  'datarequest.report_error', 'datarequest.items_available', 'datarequest.items_processed',
  'datarequest.no_items', 'datarequest.updates_available', 'datarequest.acquisition_completed',
  'datarequest.refresh_failed', 'datasource.connected', 'transaction.processed',
  'unprocessable.entity', 'session.completed', 'session.rejected', 'session.terminated',
  'session.no_login', 'item.created', 'item.processed', 'item.unavailable', 'individual.purged',
];

beforeAll(() => {
  process.env.MEASUREONE_WEBHOOK_HEADER = HEADER;
  process.env.MEASUREONE_WEBHOOK_SECRET = SECRET;
});

function samplePayload(event = 'datarequest.items_available') {
  return {
    event,
    datarequest_id: 'dr_01',
    individual_id: 'ind_01',
    external_id: 'ext_01',
    metadata: {},
    is_refresh: false,
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/measureone', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/measureone', () => {
  describe('static header verification', () => {
    it('accepts the correct whole header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value: the Bearer prefix is not stripped', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('does not look at other headers', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('uses the Authorization header when no header name is configured', () => {
      const ok = new Headers({ authorization: 'abc' });
      expect(verifyMeasureOneRequest(ok, 'abc', 'Authorization')).toBe(true);
      expect(verifyMeasureOneRequest(ok, 'abd', 'Authorization')).toBe(false);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ [HEADER]: 'x' });
      expect(verifyMeasureOneRequest(headers, '', HEADER)).toBe(false);
      expect(verifyMeasureOneRequest(headers, undefined, HEADER)).toBe(false);
    });

    it('authenticates before parsing the body', async () => {
      const res = await POST(makeRequest({}, 'not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(event))));
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('accepts an unknown event', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('something.new'))));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, 'not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });
  });
});
