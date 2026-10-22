import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/lokalise/route';
import { verifyLokaliseRequest } from '../lib/verify-lokalise';

const SECRET = 'test_lokalise_secret_7d32ea041f77c0b9';

beforeAll(() => {
  process.env.LOKALISE_WEBHOOK_SECRET = SECRET;
  process.env.LOKALISE_WEBHOOK_HEADER = 'X-Secret';
});

// Shapes follow https://developers.lokalise.com/docs/webhook-events
const project = { id: '138c1ffa0ad94848f01f980e7f2f2af19d1bd553', name: 'TheApp Project', branch: 'master' };
const user = { email: 'john@example.com', full_name: 'John Doe' };

const payloads: Record<string, Record<string, unknown>> = {
  'project.translation.updated': {
    event: 'project.translation.updated',
    translation: { id: 84835169, value: 'Hello, %s!', previous_value: 'Hi!', segment: 1 },
    language: { id: 640, iso: 'en', name: 'English' },
    key: { id: 16307701, name: 'test.title' },
    project,
    user,
  },
  'project.translations.updated': {
    event: 'project.translations.updated',
    action: 'bulk.tm',
    translations: [{ id: 84825168, value: 'Bonjour!', previous_value: '' }],
    project,
    user,
  },
  'project.key.added': {
    event: 'project.key.added',
    key: { id: 16307699, name: 'test.title', base_value: 'Hello, world!' },
    project,
    user,
  },
  'project.keys.added': {
    event: 'project.keys.added',
    action: 'lokalise',
    keys: [{ id: 28707699, name: 'test.title', base_value: 'Hello, world!' }],
    project,
    user,
  },
  'project.key.modified': { event: 'project.key.modified', key: { id: 16307699, name: 'test.title' }, project, user },
  'project.keys.modified': { event: 'project.keys.modified', keys: [{ id: 16307699, name: 'test.title' }], project, user },
  'project.keys.deleted': { event: 'project.keys.deleted', keys: [{ id: 16307699, name: 'test.title' }], project, user },
  'project.task.closed': {
    event: 'project.task.closed',
    task: { id: 5022, type: 'translation', title: 'Headings translation' },
    project,
    user,
  },
  'project.imported': { event: 'project.imported', project, user },
};

function makeRequest(
  headers: Record<string, string> = {},
  body: string | undefined = JSON.stringify(payloads['project.translation.updated'])
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/lokalise', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/lokalise', () => {
  describe('secret header verification', () => {
    it('accepts the correct X-Secret', async () => {
      const res = await POST(makeRequest({ 'X-Secret': SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'x-secret': SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await POST(makeRequest({ 'X-Secret': 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await POST(makeRequest({ 'X-Secret': 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing secret header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('does not accept the secret in an unconfigured header', async () => {
      const res = await POST(makeRequest({ 'X-Api-Key': SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when no secret is configured', () => {
      expect(verifyLokaliseRequest(new Headers({ 'x-secret': 'anything' }), {})).toBe(false);
    });

    it('supports X-Api-Key via LOKALISE_WEBHOOK_HEADER', () => {
      const config = { LOKALISE_WEBHOOK_SECRET: SECRET, LOKALISE_WEBHOOK_HEADER: 'X-Api-Key' };
      expect(verifyLokaliseRequest(new Headers({ 'x-api-key': SECRET }), config)).toBe(true);
      expect(verifyLokaliseRequest(new Headers({ 'x-secret': SECRET }), config)).toBe(false);
    });

    it('supports a custom header name', () => {
      const config = { LOKALISE_WEBHOOK_SECRET: SECRET, LOKALISE_WEBHOOK_HEADER: 'X-My-Lokalise' };
      expect(verifyLokaliseRequest(new Headers({ 'x-my-lokalise': SECRET }), config)).toBe(true);
    });
  });

  describe('event handling', () => {
    for (const event of Object.keys(payloads)) {
      it(`handles ${event}`, async () => {
        const res = await POST(makeRequest({ 'X-Secret': SECRET }, JSON.stringify(payloads[event])));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ received: true });
      });
    }

    it('acknowledges unknown events', async () => {
      const res = await POST(makeRequest({ 'X-Secret': SECRET }, JSON.stringify({ event: 'project.something.new' })));
      expect(res.status).toBe(200);
    });

    it('verifies any content type', async () => {
      const res = await POST(
        makeRequest({ 'X-Secret': SECRET, 'content-type': 'text/plain' }, JSON.stringify(payloads['project.keys.added']))
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });
  });

  describe('ping on setup', () => {
    it('returns 2xx for an authenticated empty ping', async () => {
      const res = await POST(makeRequest({ 'X-Secret': SECRET }, ''));
      expect(res.status).toBe(200);
    });

    it('returns 2xx for an authenticated non-JSON ping', async () => {
      const res = await POST(makeRequest({ 'X-Secret': SECRET }, 'ping'));
      expect(res.status).toBe(200);
      expect((await res.json()).ignored).toBe(true);
    });

    it('still rejects an unauthenticated ping', async () => {
      const res = await POST(makeRequest({}, ''));
      expect(res.status).toBe(401);
    });
  });
});
