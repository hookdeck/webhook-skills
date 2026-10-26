import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/videoask/route';
import { verifyVideoAskRequest } from '../lib/verify-videoask';

const SECRET = 'Bearer test_videoask_secret_0123456789';

const EVENTS = [
  'form_response',
  'form_response_transcribed',
  'form_author_message',
  'form_contact_message',
  'form_contact_tagged',
  'form_contact_untagged',
];

beforeAll(() => {
  process.env.VIDEOASK_WEBHOOK_HEADER = 'secret';
  process.env.VIDEOASK_WEBHOOK_SECRET = SECRET;
});

function samplePayload(eventType = 'form_response') {
  return {
    event_id: '7df19833701662b6414ed1765dcc626c',
    event_type: eventType,
    interaction_id: '386bbc0b-bb60-4b62-82fa-d630d0d2b83b',
    contact: {
      contact_id: '7c6550ff-fe15-424a-918e-2c1936db8aed',
      name: 'John Doe',
      email: 'john.doe@example.com',
      answers: [],
    },
    form: { form_id: '5a1b8066-f92c-47bf-b8f2-3beb0a738122', title: 'Example form' },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/videoask', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/videoask', () => {
  describe('secret header verification', () => {
    it('accepts the correct value', async () => {
      const res = await POST(makeRequest({ secret: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ SECRET: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including a Bearer prefix', async () => {
      const res = await POST(makeRequest({ secret: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ secret: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ secret: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent under a different header name', async () => {
      const res = await POST(makeRequest({ 'x-other': SECRET }));
      expect(res.status).toBe(401);
    });

    it('supports a custom header name', () => {
      const headers = new Headers({ 'x-videoask-key': 'abc' });
      expect(verifyVideoAskRequest(headers, { headerName: 'X-VideoAsk-Key', secret: 'abc' })).toBe(true);
      expect(verifyVideoAskRequest(headers, { headerName: 'X-VideoAsk-Key', secret: 'abd' })).toBe(false);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ secret: SECRET });
      expect(verifyVideoAskRequest(headers, { secret: '' })).toBe(false);
      expect(verifyVideoAskRequest(headers, { secret: SECRET })).toBe(true);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/videoask', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', secret: SECRET },
        body: JSON.stringify(samplePayload()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ secret: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ secret: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (eventType) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ secret: SECRET }, JSON.stringify(samplePayload(eventType))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ secret: SECRET }, JSON.stringify(samplePayload('something_new'))));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
