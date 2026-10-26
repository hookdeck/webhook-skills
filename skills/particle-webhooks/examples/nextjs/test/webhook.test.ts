import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/particle/route';
import { verifyParticleRequest } from '../lib/particle';

const SECRET = 'Bearer test_particle_secret_0123456789';
const URL_BASE = 'http://localhost:3000/webhooks/particle';
const FORM =
  'event=temperature&data=21.5&published_at=2017-02-01T21%3A08%3A05.763Z&coreid=3f002b000000000000000000';
const JSON_BODY = JSON.stringify({
  event: 'motion-detected',
  data: '1',
  published_at: '2017-02-01T21:08:05.763Z',
  coreid: '3f002b000000000000000000',
});

beforeAll(() => {
  process.env.PARTICLE_WEBHOOK_SECRET = SECRET;
  delete process.env.PARTICLE_WEBHOOK_HEADER;
});

afterEach(() => {
  delete process.env.PARTICLE_WEBHOOK_HEADER;
  process.env.PARTICLE_WEBHOOK_SECRET = SECRET;
});

function makeRequest(
  method: string,
  headers: Record<string, string> = {},
  body?: string,
  contentType = 'application/x-www-form-urlencoded',
  query = ''
): NextRequest {
  const hasBody = body !== undefined && method !== 'GET';
  return new NextRequest(`${URL_BASE}${query}`, {
    method,
    headers: { ...(hasBody ? { 'content-type': contentType } : {}), ...headers },
    body: hasBody ? body : undefined,
  });
}

const HANDLERS = { GET, POST, PUT, PATCH, DELETE } as const;
const METHODS = Object.keys(HANDLERS) as (keyof typeof HANDLERS)[];

describe('/webhooks/particle', () => {
  describe('header authentication', () => {
    it('accepts the correct header value (default Authorization header)', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }, FORM));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, event: 'temperature' });
    });

    it('compares the whole value: the bare token without "Bearer " is rejected', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET.replace('Bearer ', '') }, FORM));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest('POST', { Authorization: 'x'.repeat(SECRET.length) }, FORM));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest('POST', { Authorization: 'short' }, FORM));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest('POST', {}, FORM));
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is not configured', async () => {
      delete process.env.PARTICLE_WEBHOOK_SECRET;
      const res = await POST(makeRequest('POST', { Authorization: 'anything' }, FORM));
      expect(res.status).toBe(401);
    });

    it('reads a custom header name case-insensitively', async () => {
      process.env.PARTICLE_WEBHOOK_HEADER = 'X-Particle-Token';
      process.env.PARTICLE_WEBHOOK_SECRET = 'abc123-static-secret';
      const ok = await POST(makeRequest('POST', { 'x-particle-token': 'abc123-static-secret' }, FORM));
      expect(ok.status).toBe(200);
      const wrong = await POST(makeRequest('POST', { Authorization: 'abc123-static-secret' }, FORM));
      expect(wrong.status).toBe(401);
    });

    it('does not parse the body when authentication fails', async () => {
      const res = await POST(makeRequest('POST', {}, '{not json', 'application/json'));
      expect(res.status).toBe(401);
    });

    it('verifyParticleRequest compares exact bytes', () => {
      expect(verifyParticleRequest(new Headers({ authorization: 'Bearer a' }), 'Bearer a')).toBe(true);
      expect(verifyParticleRequest(new Headers({ authorization: 'Bearer a' }), 'a')).toBe(false);
    });
  });

  describe('methods', () => {
    it.each(METHODS)('accepts %s with a valid header', async (method) => {
      const res = await HANDLERS[method](makeRequest(method, { Authorization: SECRET }, undefined, undefined, '?event=temperature&data=20'));
      expect(res.status).toBe(200);
      expect((await res.json()).event).toBe('temperature');
    });

    it.each(METHODS)('checks the header first on %s', async (method) => {
      const res = await HANDLERS[method](makeRequest(method, {}, undefined, undefined, '?event=temperature'));
      expect(res.status).toBe(401);
    });
  });

  describe('body parsing', () => {
    it('parses the default form-encoded body', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }, FORM));
      expect((await res.json()).event).toBe('temperature');
    });

    it('parses a JSON body', async () => {
      const res = await PUT(makeRequest('PUT', { Authorization: SECRET }, JSON_BODY, 'application/json'));
      expect(res.status).toBe(200);
      expect((await res.json()).event).toBe('motion-detected');
    });

    it('parses query-string data on GET', async () => {
      const res = await GET(makeRequest('GET', { Authorization: SECRET }, undefined, undefined, '?event=motion-detected&coreid=abc'));
      expect((await res.json()).event).toBe('motion-detected');
    });

    it('accepts an empty body', async () => {
      const res = await DELETE(makeRequest('DELETE', { Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect((await res.json()).event).toBe('unhandled');
    });

    it('accepts a JSON body under an unusual content type', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }, JSON_BODY, 'text/plain'));
      expect((await res.json()).event).toBe('motion-detected');
    });

    it('returns 400 for malformed JSON after authentication', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }, '{not json', 'application/json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array body', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }, '[1,2]', 'application/json'));
      expect(res.status).toBe(400);
    });

    it('acknowledges unknown events', async () => {
      const res = await PATCH(makeRequest('PATCH', { Authorization: SECRET }, 'event=something-else&data=1'));
      expect(res.status).toBe(200);
      expect((await res.json()).event).toBe('unhandled');
    });
  });
});
