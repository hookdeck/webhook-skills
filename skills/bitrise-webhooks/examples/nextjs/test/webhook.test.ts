import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/bitrise/route';
import { verifyBitriseRequest } from '../lib/verify-bitrise';

const SECRET = 'Bearer test_bitrise_secret_0123456789';

const EVENTS = [
  'app_version_added', 'testflight_upload_started', 'testflight_upload_completed',
  'testflight_upload_failed', 'testflight_processing_completed', 'testflight_processing_failed',
  'testflight_app_review_approved', 'testflight_app_review_rejected',
  'google_play_upload_completed', 'google_play_upload_failed', 'app_store_review_approved',
  'app_store_review_rejected', 'app_store_release_completed', 'google_play_release_completed',
];

beforeAll(() => {
  process.env.BITRISE_WEBHOOK_SECRET = SECRET;
  delete process.env.BITRISE_WEBHOOK_HEADER; // default: Authorization
});

afterEach(() => {
  delete process.env.BITRISE_WEBHOOK_HEADER;
});

function releasePayload(event = 'testflight_upload_completed') {
  return {
    trigger_event: event,
    release_id: 'rel-123',
    app_id: 'app-123',
    triggered_by: 'Automation',
    webhook_event_unique_id: 'wh-1@1730000000000000000',
    file_name: 'MyApp.ipa',
    version: '1.4.0',
    version_code: '42',
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(releasePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/bitrise', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/bitrise', () => {
  describe('secret header verification', () => {
    it('accepts the correct whole header value, Bearer prefix included', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }));
      expect(res.status).toBe(200);
    });

    it('does not strip a Bearer prefix', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ Authorization: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ Authorization: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('reads the header name from BITRISE_WEBHOOK_HEADER', async () => {
      process.env.BITRISE_WEBHOOK_HEADER = 'X-Webhook-Secret';
      expect((await POST(makeRequest({ 'X-Webhook-Secret': SECRET }))).status).toBe(200);
      expect((await POST(makeRequest({ Authorization: SECRET }))).status).toBe(401);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ authorization: SECRET });
      expect(verifyBitriseRequest(headers, '')).toBe(false);
      expect(verifyBitriseRequest(headers, SECRET)).toBe(true);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/bitrise', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', authorization: SECRET },
        body: JSON.stringify(releasePayload()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ Authorization: SECRET }, JSON.stringify(releasePayload(event)))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown Release Management events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ Authorization: SECRET }, JSON.stringify(releasePayload('something_new')))
      );
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    it('acknowledges and logs payloads without trigger_event (undocumented CI build shape)', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify({ hello: 'world' })));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Payload without trigger_event'))).toBe(true);
      spy.mockRestore();
    });
  });
});
