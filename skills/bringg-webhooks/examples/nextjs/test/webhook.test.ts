import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/bringg/route';
import { verifyBringgRequest } from '../lib/verify-bringg';

const SECRET = 'Bearer test_bringg_static_header_0123456789';

beforeEach(() => {
  process.env.BRINGG_WEBHOOK_SECRET = SECRET;
  process.env.BRINGG_WEBHOOK_HEADER = 'Authorization';
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

// Shape of a Bringg order webhook (abridged)
function samplePayload(type = 'task_created') {
  return { webhook_type: type, id: 8503585, title: '50 cases of Best Brand Soda', status: 0 };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/bringg', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/bringg', () => {
  it('accepts the exact header value, including the Bearer prefix', async () => {
    const res = await POST(makeRequest({ authorization: SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('does not strip a Bearer prefix: the bare token is rejected', async () => {
    const res = await POST(makeRequest({ authorization: SECRET.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it('rejects a wrong value of the same length', async () => {
    const res = await POST(makeRequest({ authorization: SECRET.slice(0, -1) + 'x' }));
    expect(res.status).toBe(401);
  });

  it('rejects a wrong value of a different length', async () => {
    const res = await POST(makeRequest({ authorization: SECRET + 'extra' }));
    expect(res.status).toBe(401);
  });

  it('rejects a missing header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects everything when no secret is configured', async () => {
    delete process.env.BRINGG_WEBHOOK_SECRET;
    expect((await POST(makeRequest({ authorization: 'undefined' }))).status).toBe(401);
  });

  it('reads a custom header name case-insensitively', async () => {
    process.env.BRINGG_WEBHOOK_HEADER = 'Application-Key';
    process.env.BRINGG_WEBHOOK_SECRET = 'abc123-static-key';
    expect((await POST(makeRequest({ 'application-key': 'abc123-static-key' }))).status).toBe(200);
    expect((await POST(makeRequest({ 'APPLICATION-KEY': 'abc123-static-key' }))).status).toBe(200);
    expect((await POST(makeRequest({ authorization: 'abc123-static-key' }))).status).toBe(401);
  });

  it('handles non-ASCII secrets without throwing', () => {
    // Headers values are byte strings, so use Latin-1 characters here
    const config = { BRINGG_WEBHOOK_SECRET: 'sécret-ñ' };
    expect(verifyBringgRequest(new Headers({ authorization: 'sécret-ñ' }), config)).toBe(true);
    expect(verifyBringgRequest(new Headers({ authorization: 'secret-n' }), config)).toBe(false);
  });

  it('accepts a JSON body sent with any content type', async () => {
    const res = await POST(makeRequest({ authorization: SECRET }, JSON.stringify(samplePayload()), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('authenticates before parsing: bad credentials with bad JSON is 401, not 400', async () => {
    expect((await POST(makeRequest({ authorization: 'nope' }, 'not json'))).status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest({ authorization: SECRET }, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a non-object body', async () => {
    expect((await POST(makeRequest({ authorization: SECRET }, '[1,2]'))).status).toBe(400);
  });

  describe('event dispatch', () => {
    const events = [
      'task_created',
      'task_done',
      'task_cancelled',
      'driver_assigned',
      'way_point_arrived',
      'note_created',
    ];

    it.each(events)('handles %s', async (type) => {
      const res = await POST(
        makeRequest({ authorization: SECRET }, JSON.stringify(samplePayload(type)))
      );
      expect(res.status).toBe(200);
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled event'));
    });

    it('logs unknown events and still returns 200', async () => {
      const res = await POST(
        makeRequest({ authorization: SECRET }, JSON.stringify(samplePayload('scan_created')))
      );
      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith('Unhandled event: scan_created');
    });
  });
});
