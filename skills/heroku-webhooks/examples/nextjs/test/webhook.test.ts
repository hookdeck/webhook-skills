import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/heroku/route';
import { verifyHerokuWebhook } from '../lib/verify';

const secret = 'test_heroku_secret';

beforeAll(() => {
  process.env.HEROKU_WEBHOOK_SECRET = secret;
  delete process.env.HEROKU_WEBHOOK_AUTHORIZATION;
});

/** base64(HMAC-SHA256(secret, raw body)) - Heroku's algorithm */
function sign(payload: string, key: string = secret): string {
  return crypto.createHmac('sha256', key).update(payload, 'utf8').digest('base64');
}

function makeEvent(resource: string, action: string, data: object = {}): string {
  return JSON.stringify({
    id: 'd472a8bb-1a3c-4f78-aad1-995e6d0022ec',
    action,
    resource,
    data,
    previous_data: {},
    created_at: '2016-10-26T22:50:14Z',
  });
}

function makeRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/heroku', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('verifyHerokuWebhook', () => {
  it('accepts a valid signature', () => {
    expect(verifyHerokuWebhook('{"id":"1"}', sign('{"id":"1"}'), secret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyHerokuWebhook('{}', 'invalid', secret)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyHerokuWebhook('{}', null, secret)).toBe(false);
  });

  it('rejects a signature made with another secret', () => {
    expect(verifyHerokuWebhook('{}', sign('{}', 'other'), secret)).toBe(false);
  });
});

describe('POST /webhooks/heroku', () => {
  it('returns 400 for missing signature', async () => {
    const res = await POST(makeRequest(makeEvent('release', 'create')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid signature', async () => {
    const res = await POST(
      makeRequest(makeEvent('release', 'create'), { 'heroku-webhook-hmac-sha256': 'invalid' })
    );
    expect(res.status).toBe(400);
  });

  it('returns 204 for a valid signature', async () => {
    const body = makeEvent('release', 'create', { version: 12, status: 'succeeded' });
    const res = await POST(makeRequest(body, { 'heroku-webhook-hmac-sha256': sign(body) }));
    expect(res.status).toBe(204);
  });

  it('handles each documented resource and action', async () => {
    const events: Array<[string, string]> = [
      ['api:release', 'create'],
      ['api:release', 'update'],
      ['api:build', 'create'],
      ['api:build', 'update'],
      ['api:app', 'update'],
      ['api:dyno', 'create'],
      ['api:formation', 'update'],
      ['api:formation', 'destroy'],
      ['api:addon-attachment', 'create'],
      ['api:addon-attachment', 'destroy'],
      ['api:domain', 'create'],
    ];
    for (const [resource, action] of events) {
      const body = makeEvent(resource, action);
      const res = await POST(makeRequest(body, { 'heroku-webhook-hmac-sha256': sign(body) }));
      expect(res.status).toBe(204);
    }
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'heroku-webhook-hmac-sha256': sign(body) }));
    expect(res.status).toBe(400);
  });

  describe('with HEROKU_WEBHOOK_AUTHORIZATION set', () => {
    beforeAll(() => { process.env.HEROKU_WEBHOOK_AUTHORIZATION = 'Bearer abc123'; });
    afterAll(() => { delete process.env.HEROKU_WEBHOOK_AUTHORIZATION; });

    it('returns 401 when the Authorization header does not match', async () => {
      const body = makeEvent('build', 'update');
      const res = await POST(
        makeRequest(body, { 'heroku-webhook-hmac-sha256': sign(body), authorization: 'Bearer wrong' })
      );
      expect(res.status).toBe(401);
    });

    it('returns 204 when it matches', async () => {
      const body = makeEvent('build', 'update');
      const res = await POST(
        makeRequest(body, { 'heroku-webhook-hmac-sha256': sign(body), authorization: 'Bearer abc123' })
      );
      expect(res.status).toBe(204);
    });
  });
});
