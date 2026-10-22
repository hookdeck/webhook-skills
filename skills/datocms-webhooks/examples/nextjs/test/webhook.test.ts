import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/datocms/route';
import { verifyDatoCmsRequest } from '../lib/verify-datocms';

const USER = 'datocms-user';
const PASS = 'p@ss:word:with:colons-0123456789';

const basic = (user: string, pass: string, scheme = 'Basic') =>
  `${scheme} ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
const GOOD = basic(USER, PASS);

const EVENTS: [string, string][] = [
  ['item', 'create'], ['item', 'update'], ['item', 'delete'], ['item', 'publish'],
  ['item', 'unpublish'], ['item_type', 'create'], ['item_type', 'update'],
  ['item_type', 'delete'], ['upload', 'create'], ['upload', 'update'], ['upload', 'delete'],
  ['build_trigger', 'deploy_started'], ['build_trigger', 'deploy_succeeded'],
  ['build_trigger', 'deploy_failed'], ['environment', 'deploy_started'],
  ['environment', 'deploy_succeeded'], ['environment', 'deploy_failed'],
  ['maintenance_mode', 'change'], ['sso_user', 'create'], ['cda_cache_tags', 'invalidate'],
];

beforeAll(() => {
  process.env.DATOCMS_WEBHOOK_USERNAME = USER;
  process.env.DATOCMS_WEBHOOK_PASSWORD = PASS;
});

function samplePayload(entityType = 'item', eventType = 'publish') {
  return {
    environment: 'main',
    entity_type: entityType,
    event_type: eventType,
    entity: { id: '39830648', type: entityType, attributes: { name: 'Mark Smith' } },
    related_entities: [],
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/datocms', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/datocms', () => {
  describe('HTTP Basic authentication', () => {
    it('accepts the correct credentials', async () => {
      const res = await POST(makeRequest({ Authorization: GOOD }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts a case-insensitive scheme', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS, 'basic') }));
      expect(res.status).toBe(200);
    });

    it('accepts a password containing colons (split on the first colon)', async () => {
      expect(PASS.includes(':')).toBe(true);
      const res = await POST(makeRequest({ Authorization: GOOD }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong username', async () => {
      const res = await POST(makeRequest({ Authorization: basic('someone-else', PASS) }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong password of the same length', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, 'x'.repeat(PASS.length)) }));
      expect(res.status).toBe(401);
    });

    it('rejects credentials of a different length without throwing', async () => {
      const res = await POST(makeRequest({ Authorization: basic('u', 'p') }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects a Bearer scheme', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer ${PASS}` }));
      expect(res.status).toBe(401);
    });

    it('rejects malformed base64', async () => {
      const res = await POST(makeRequest({ Authorization: 'Basic !!!not-base64!!!' }));
      expect(res.status).toBe(401);
    });

    it('rejects a payload with no colon', async () => {
      const res = await POST(
        makeRequest({ Authorization: `Basic ${Buffer.from('nocolon').toString('base64')}` })
      );
      expect(res.status).toBe(401);
    });

    it('handles non-ASCII credentials', () => {
      const h = (u: string, p: string) => new Headers({ authorization: basic(u, p) });
      expect(verifyDatoCmsRequest(h('üser', 'pässwörd-✓'), 'üser', 'pässwörd-✓')).toBe(true);
      expect(verifyDatoCmsRequest(h('üser', 'pässwörd-✗'), 'üser', 'pässwörd-✓')).toBe(false);
    });

    it('rejects everything when credentials are not configured', () => {
      expect(verifyDatoCmsRequest(new Headers({ authorization: GOOD }), '', '')).toBe(false);
      expect(verifyDatoCmsRequest(new Headers({ authorization: basic('', '') }), '', '')).toBe(false);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await POST(
        makeRequest({ Authorization: GOOD }, JSON.stringify(samplePayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ Authorization: GOOD }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ Authorization: GOOD }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without credentials', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s %s', async (entityType, eventType) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ Authorization: GOOD }, JSON.stringify(samplePayload(entityType, eventType)))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges custom payloads without entity_type or event_type', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ Authorization: GOOD }, JSON.stringify({ message: 'custom' }))
      );
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
