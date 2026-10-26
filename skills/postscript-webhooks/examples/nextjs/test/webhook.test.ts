import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/postscript/route';
import { verifyPostscriptRequest } from '../lib/verify-postscript';

const TOKEN = 'test_postscript_token_0123456789abcdef';

const EVENTS = [
  'shop.incoming_message',
  'shop.subscriber.opt_in',
  'shop.subscriber.opt_out',
  'shop.email_collected',
];

beforeAll(() => {
  process.env.POSTSCRIPT_WEBHOOK_TOKEN = TOKEN;
});

function samplePayload(event = 'shop.incoming_message') {
  return {
    webhook_id: '89066f0a-eb36-4ed8-b98c-606e6dcac715',
    resource_type: 'shop',
    resource_id: 'shop_1234567abcd',
    event_time: '2021-11-04T21:52:41.025455',
    event,
    event_data: {
      id: 'im_1b2a005a386281c9',
      subscriber_id: 's_1234567abcd',
      shop_id: 'shop_1234567abcd',
      from_number: '+15555555555',
      body: 'Hello, world',
    },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/postscript', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/postscript', () => {
  describe('Postscript-Signature verification', () => {
    it('accepts the correct token', async () => {
      const res = await POST(makeRequest({ 'Postscript-Signature': TOKEN }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'postscript-signature': TOKEN }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await POST(makeRequest({ 'Postscript-Signature': 'x'.repeat(TOKEN.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await POST(makeRequest({ 'Postscript-Signature': 'short' }));
      expect(res.status).toBe(401);
    });

    it('compares the whole value (no prefix or truncation)', async () => {
      expect((await POST(makeRequest({ 'Postscript-Signature': `v1=${TOKEN}` }))).status).toBe(401);
      expect((await POST(makeRequest({ 'Postscript-Signature': TOKEN.slice(0, -1) }))).status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects everything when no token is configured', () => {
      const headers = new Headers({ 'postscript-signature': TOKEN });
      expect(verifyPostscriptRequest(headers, '')).toBe(false);
      expect(verifyPostscriptRequest(headers, TOKEN)).toBe(true);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/postscript', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', 'postscript-signature': TOKEN },
        body: JSON.stringify(samplePayload()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ 'Postscript-Signature': TOKEN }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ 'Postscript-Signature': TOKEN }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a token', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ 'Postscript-Signature': TOKEN }, JSON.stringify(samplePayload(event)))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ 'Postscript-Signature': TOKEN }, JSON.stringify(samplePayload('shop.something_new')))
      );
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
