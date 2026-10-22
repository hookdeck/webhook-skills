const request = require('supertest');

// Set test environment variables before importing the app
process.env.JFROG_WEBHOOK_SECRET = 'test_jfrog_secret_token_0123456789';

const app = require('../src/index');
const { verifyJfrogRequest } = require('../src/index');

const SECRET = process.env.JFROG_WEBHOOK_SECRET;

// Shapes taken from JFrog's webhook event types documentation
const PAYLOADS = {
  'artifact.deployed': {
    domain: 'artifact',
    event_type: 'deployed',
    data: { repo_key: 'sample_repo', path: 'sample_dir/sample.txt', name: 'sample.txt', sha256: 'abc', size: 0 }
  },
  'artifact.deleted': {
    domain: 'artifact',
    event_type: 'deleted',
    data: { repo_key: 'sample_repo', path: 'sample_dir/sample.txt', name: 'sample.txt', sha256: 'abc', size: 0 }
  },
  'artifact.moved': {
    domain: 'artifact',
    event_type: 'moved',
    data: { repo_key: 'sample_repo', path: 'a.txt', source_repo_path: 'sample_repo', target_repo_path: 'sample_target_repo' }
  },
  'docker.pushed': {
    domain: 'docker',
    event_type: 'pushed',
    data: { repo_key: 'docker-dev', image_name: 'sample-image', tag: '1.0.0', image_type: 'oci' }
  },
  'build.uploaded': {
    domain: 'build',
    event_type: 'uploaded',
    data: { build_name: 'sample_build_name', build_number: '1', build_repo: 'artifactory-build-info' }
  },
  'build.promoted': {
    domain: 'build',
    event_type: 'promoted',
    data: { build_name: 'sample_build_name', build_number: '1', build_repo: 'artifactory-build-info' }
  }
};

function post(body = JSON.stringify(PAYLOADS['artifact.deployed']), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/jfrog')
    .set('Content-Type', contentType)
    .send(body);
}

describe('JFrog webhook endpoint', () => {
  describe('X-JFrog-Event-Auth verification', () => {
    it('accepts the correct secret token', async () => {
      const res = await post().set('X-JFrog-Event-Auth', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('x-jfrog-event-auth', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await post().set('X-JFrog-Event-Auth', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await post().set('X-JFrog-Event-Auth', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent in another header', async () => {
      const res = await post().set('Authorization', `Bearer ${SECRET}`);
      expect(res.status).toBe(401);
    });

    it('authenticates before parsing the body', async () => {
      const res = await post('not json');
      expect(res.status).toBe(401);
    });
  });

  describe('content types', () => {
    it.each(['application/json', 'text/plain', 'application/vnd.api+json', 'application/octet-stream'])(
      'verifies and parses a %s body',
      async (contentType) => {
        const res = await post(JSON.stringify(PAYLOADS['docker.pushed']), contentType).set(
          'X-JFrog-Event-Auth',
          SECRET
        );
        expect(res.status).toBe(200);
      }
    );
  });

  describe('events', () => {
    let logSpy;
    beforeEach(() => {
      logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => logSpy.mockRestore());

    it.each(Object.keys(PAYLOADS))('handles %s', async (name) => {
      const res = await post(JSON.stringify(PAYLOADS[name])).set('X-JFrog-Event-Auth', SECRET);
      expect(res.status).toBe(200);
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled event'));
    });

    it('acknowledges unhandled events', async () => {
      const res = await post(JSON.stringify({ domain: 'user', event_type: 'locked', data: {} })).set(
        'X-JFrog-Event-Auth',
        SECRET
      );
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled event: user locked'));
    });
  });

  describe('body validation', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await post('not json').set('X-JFrog-Event-Auth', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object body', async () => {
      const res = await post('[1,2]').set('X-JFrog-Event-Auth', SECRET);
      expect(res.status).toBe(400);
    });
  });

  describe('verifyJfrogRequest', () => {
    it('returns false when no secret is configured', () => {
      expect(verifyJfrogRequest({ 'x-jfrog-event-auth': 'anything' }, '')).toBe(false);
    });

    it('returns true for a matching token', () => {
      expect(verifyJfrogRequest({ 'x-jfrog-event-auth': SECRET }, SECRET)).toBe(true);
    });
  });

  it('serves /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
