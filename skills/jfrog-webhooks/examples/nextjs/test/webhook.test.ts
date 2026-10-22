import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/jfrog/route';
import { verifyJfrogRequest } from '../lib/verify-jfrog';

const SECRET = 'test_jfrog_secret_token_0123456789';

beforeAll(() => {
  process.env.JFROG_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Shapes taken from JFrog's webhook event types documentation
const PAYLOADS: Record<string, object> = {
  'artifact.deployed': {
    domain: 'artifact',
    event_type: 'deployed',
    data: { repo_key: 'sample_repo', path: 'sample_dir/sample.txt', name: 'sample.txt', sha256: 'abc', size: 0 },
  },
  'artifact.deleted': {
    domain: 'artifact',
    event_type: 'deleted',
    data: { repo_key: 'sample_repo', path: 'sample_dir/sample.txt', name: 'sample.txt', sha256: 'abc', size: 0 },
  },
  'artifact.moved': {
    domain: 'artifact',
    event_type: 'moved',
    data: { repo_key: 'sample_repo', path: 'a.txt', source_repo_path: 'sample_repo', target_repo_path: 'sample_target_repo' },
  },
  'docker.pushed': {
    domain: 'docker',
    event_type: 'pushed',
    data: { repo_key: 'docker-dev', image_name: 'sample-image', tag: '1.0.0', image_type: 'oci' },
  },
  'build.uploaded': {
    domain: 'build',
    event_type: 'uploaded',
    data: { build_name: 'sample_build_name', build_number: '1', build_repo: 'artifactory-build-info' },
  },
  'build.promoted': {
    domain: 'build',
    event_type: 'promoted',
    data: { build_name: 'sample_build_name', build_number: '1', build_repo: 'artifactory-build-info' },
  },
};

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(PAYLOADS['artifact.deployed']),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/jfrog', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('JFrog webhook route', () => {
  describe('X-JFrog-Event-Auth verification', () => {
    it('accepts the correct secret token', async () => {
      const res = await POST(makeRequest({ 'X-JFrog-Event-Auth': SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('rejects a missing header', async () => {
      expect((await POST(makeRequest())).status).toBe(401);
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await POST(makeRequest({ 'X-JFrog-Event-Auth': 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      expect((await POST(makeRequest({ 'X-JFrog-Event-Auth': 'short' }))).status).toBe(401);
    });

    it('rejects the secret sent in another header', async () => {
      expect((await POST(makeRequest({ Authorization: `Bearer ${SECRET}` }))).status).toBe(401);
    });

    it('authenticates before parsing the body', async () => {
      expect((await POST(makeRequest({}, 'not json'))).status).toBe(401);
    });
  });

  describe('content types', () => {
    it.each(['application/json', 'text/plain', 'application/vnd.api+json', 'application/octet-stream'])(
      'verifies and parses a %s body',
      async (contentType) => {
        const body = JSON.stringify(PAYLOADS['docker.pushed']);
        const res = await POST(makeRequest({ 'X-JFrog-Event-Auth': SECRET }, body, contentType));
        expect(res.status).toBe(200);
      }
    );
  });

  describe('events', () => {
    it.each(Object.keys(PAYLOADS))('handles %s', async (name) => {
      const res = await POST(makeRequest({ 'X-JFrog-Event-Auth': SECRET }, JSON.stringify(PAYLOADS[name])));
      expect(res.status).toBe(200);
    });

    it('acknowledges unhandled events', async () => {
      const body = JSON.stringify({ domain: 'user', event_type: 'locked', data: {} });
      const res = await POST(makeRequest({ 'X-JFrog-Event-Auth': SECRET }, body));
      expect(res.status).toBe(200);
    });
  });

  describe('body validation', () => {
    it('returns 400 for invalid JSON', async () => {
      expect((await POST(makeRequest({ 'X-JFrog-Event-Auth': SECRET }, 'not json'))).status).toBe(400);
    });

    it('returns 400 for a non-object body', async () => {
      expect((await POST(makeRequest({ 'X-JFrog-Event-Auth': SECRET }, '[1,2]'))).status).toBe(400);
    });
  });

  describe('verifyJfrogRequest', () => {
    it('returns false when no secret is configured', () => {
      expect(verifyJfrogRequest(new Headers({ 'x-jfrog-event-auth': 'anything' }), '')).toBe(false);
    });

    it('returns true for a matching token', () => {
      expect(verifyJfrogRequest(new Headers({ 'x-jfrog-event-auth': SECRET }), SECRET)).toBe(true);
    });
  });
});
