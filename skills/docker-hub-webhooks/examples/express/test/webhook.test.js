// Generated with: docker-hub-webhooks skill
// https://github.com/hookdeck/webhook-skills
const request = require('supertest');

// Docker Hub webhooks are UNSIGNED, so there are no signatures to generate here
// — the only credential is the token we put in the URL ourselves.
const TOKEN = 'a3f1c9d47e2b8065f1a94c3e7d20b85fa61c94d8e0372b5c18af6d29e4b703c15';
const WRONG_TOKEN = 'b3f1c9d47e2b8065f1a94c3e7d20b85fa61c94d8e0372b5c18af6d29e4b703c15';
const PATH = `/webhooks/docker-hub/${TOKEN}`;

process.env.DOCKER_HUB_WEBHOOK_TOKEN = TOKEN;

const { app, verifyUrlToken, parsePush, summarizeDhiMetadata } = require('../src/index');

/**
 * The documented example payload, verbatim from
 * https://docs.docker.com/docker-hub/repos/manage/webhooks/
 * (including the legacy `callback_url` field, which handlers must tolerate).
 */
function documentedPayload() {
  return {
    callback_url:
      'https://registry.hub.docker.com/u/svendowideit/testhook/hook/2141b5bi5i5b02bec211i4eeih0242eg11000a/',
    push_data: {
      pushed_at: 1417566161,
      pusher: 'trustedbuilder',
      tag: 'latest',
    },
    repository: {
      comment_count: 0,
      date_created: 1417494799,
      description: '',
      dockerfile: '#\n# BUILD ...',
      full_description: 'Docker Hub based automated build from a GitHub repo',
      is_official: false,
      is_private: true,
      is_trusted: true,
      name: 'testhook',
      namespace: 'svendowideit',
      owner: 'svendowideit',
      repo_name: 'svendowideit/testhook',
      repo_url: 'https://registry.hub.docker.com/u/svendowideit/testhook/',
      star_count: 0,
      status: 'Active',
    },
  };
}

/**
 * A mirrored Docker Hardened Image push: the standard payload plus a top-level
 * `dhi_metadata` MAP KEYED BY ARCHITECTURE-SPECIFIC MANIFEST DIGEST. Two
 * entries here, because a multi-platform push has one per platform.
 */
function dhiPayload() {
  const payload = documentedPayload();
  payload.repository.namespace = 'my-org';
  payload.repository.name = 'dhi-python';
  payload.repository.repo_name = 'my-org/dhi-python';
  payload.push_data.tag = '3-fips-dev';
  payload.dhi_metadata = {
    'sha256:04639747b6d72bcf1d0322f2a5b122ee76d963e31bb4a070891b25f15a5001c5': {
      schema_version: 1,
      change_categories: ['vulnerability_fix', 'version_upgrade'],
      previous_version: {
        tag: '2-compat-fips-dev',
        digest: 'sha256:1738aa35838f520431c898b85d7cd60da71d8f997965287db4f3be27c1df32a1',
      },
      changes: {
        vulnerabilities_fixed: [
          {
            cve_id: 'CVE-2019-9192',
            severity: 'low',
            package: 'glibc',
            fixed_in_version: '2.41-12+deb13u4+dhi0',
          },
          {
            cve_id: 'CVE-2018-20796',
            severity: 'low',
            package: 'glibc',
            fixed_in_version: '2.41-12+deb13u4+dhi0',
          },
        ],
        packages_updated: [
          {
            name: 'glibc',
            type: 'deb',
            old_version: '2.41-12+deb13u4',
            new_version: '2.41-12+deb13u4+dhi0',
          },
        ],
        packages_added: [],
        packages_removed: [],
        environment_variables_changed: [],
        labels_changed: [
          {
            change: 'changed',
            key: 'com.docker.dhi.chain-id',
            from_value: 'sha256:4567092c648d813b8c4c60c7d100fc34df817dd5cb4c7968e9a5c43bafb9e7a5',
            to_value: 'sha256:62d4e2090951e812a87fb599db362677f72dee095f85889ea56df63c0999b02a',
          },
        ],
        configuration_changed: [],
      },
    },
    'sha256:2982980b6bb3cdedafa9377bcc37405c20ed48702deef11faf13ec99d596057d': {
      schema_version: 1,
      change_categories: ['version_upgrade'],
      previous_version: {
        tag: '5-fips-dev',
        digest: 'sha256:81355a1301ecc5f78dd87b68a284642d7b6bfbd86f3a37f3932fad7ecf1141e6',
      },
      changes: {
        vulnerabilities_fixed: [],
        packages_updated: [
          {
            name: 'sqlite3',
            type: 'deb',
            old_version: '3.46.1-7+deb13u2+dhi0',
            new_version: '3.46.1-7+deb13u2+dhi1',
          },
        ],
        packages_added: [],
        packages_removed: [],
        environment_variables_changed: [],
        labels_changed: [],
        configuration_changed: [],
      },
    },
  };
  return payload;
}

describe('Docker Hub webhook handler', () => {
  let logSpy;
  let warnSpy;
  let errorSpy;
  let fetchSpy;

  beforeEach(() => {
    process.env.DOCKER_HUB_WEBHOOK_TOKEN = TOKEN;
    delete process.env.DOCKER_HUB_ALLOWED_REPOS;
    delete process.env.DOCKER_HUB_API_TOKEN;

    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Any outbound HTTP at all is a failure for the callback_url test, and the
    // Hub API re-check must stay off unless DOCKER_HUB_API_TOKEN is set.
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => {
      throw new Error('handler must not make outbound requests in these tests');
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('URL token (there is no signature to verify)', () => {
    it('accepts the documented payload with the correct token', async () => {
      const response = await request(app).post(PATH).send(documentedPayload());

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
      expect(logSpy).toHaveBeenCalledWith(
        'Docker Hub push: svendowideit/testhook:latest by trustedbuilder'
      );
    });

    it('rejects a wrong token with 401', async () => {
      const response = await request(app)
        .post(`/webhooks/docker-hub/${WRONG_TOKEN}`)
        .send(documentedPayload());

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid token' });
    });

    it('rejects a token of a different length with 401 (no timingSafeEqual throw)', async () => {
      const response = await request(app)
        .post('/webhooks/docker-hub/short')
        .send(documentedPayload());

      expect(response.status).toBe(401);
    });

    it('FAILS CLOSED with 500 when DOCKER_HUB_WEBHOOK_TOKEN is unset', async () => {
      delete process.env.DOCKER_HUB_WEBHOOK_TOKEN;

      const response = await request(app).post(PATH).send(documentedPayload());

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Webhook token not configured' });
      // Never silently accepted, and never processed.
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Docker Hub push:'));
    });

    it('verifyUrlToken returns null when unconfigured so callers must fail closed', () => {
      expect(verifyUrlToken(TOKEN, '')).toBeNull();
      expect(verifyUrlToken(TOKEN, undefined)).toBeNull();
      expect(verifyUrlToken(TOKEN, TOKEN)).toBe(true);
      expect(verifyUrlToken(WRONG_TOKEN, TOKEN)).toBe(false);
      expect(verifyUrlToken(undefined, TOKEN)).toBe(false);
    });
  });

  describe('payload validation', () => {
    it('rejects invalid JSON with 400', async () => {
      const response = await request(app)
        .post(PATH)
        .set('Content-Type', 'application/json')
        .send('{"push_data": ');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid JSON' });
    });

    it('rejects a payload missing push_data.tag with 400', async () => {
      const payload = documentedPayload();
      delete payload.push_data.tag;

      const response = await request(app).post(PATH).send(payload);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'missing or invalid push_data.tag' });
    });

    it('rejects a payload missing repository.repo_name with 400', async () => {
      const payload = documentedPayload();
      delete payload.repository.repo_name;

      const response = await request(app).post(PATH).send(payload);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'missing or invalid repository.repo_name' });
    });

    it('rejects a payload with no push_data at all with 400', async () => {
      const response = await request(app).post(PATH).send({ repository: { repo_name: 'a/b' } });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'missing push_data' });
    });

    it('accepts a payload that omits every optional field', async () => {
      const response = await request(app)
        .post(PATH)
        .send({ push_data: { tag: 'v1' }, repository: { repo_name: 'myorg/myapp' } });

      expect(response.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Docker Hub push: myorg/myapp:v1 by unknown');
    });

    it('parsePush reads pushed_at as UNIX seconds and tolerates unknown fields', () => {
      const payload = documentedPayload();
      payload.some_future_field = { nested: true };

      expect(parsePush(payload)).toEqual({
        ok: true,
        tag: 'latest',
        repoName: 'svendowideit/testhook',
        pusher: 'trustedbuilder',
        pushedAt: 1417566161,
      });
    });
  });

  describe('repository allowlist', () => {
    it('rejects a repo outside DOCKER_HUB_ALLOWED_REPOS with 403', async () => {
      process.env.DOCKER_HUB_ALLOWED_REPOS = 'myorg/myapp, myorg/dhi-python';

      const response = await request(app).post(PATH).send(documentedPayload());

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Repository not allowed' });
    });

    it('accepts a repo that is in DOCKER_HUB_ALLOWED_REPOS', async () => {
      process.env.DOCKER_HUB_ALLOWED_REPOS = 'myorg/myapp, svendowideit/testhook';

      const response = await request(app).post(PATH).send(documentedPayload());

      expect(response.status).toBe(200);
    });
  });

  describe('dhi_metadata (mirrored Docker Hardened Image repositories)', () => {
    it('summarizes every architecture entry of a two-arch payload', async () => {
      const response = await request(app).post(PATH).send(dhiPayload());

      expect(response.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Docker Hub push: my-org/dhi-python:3-fips-dev by trustedbuilder');

      // One log line per digest key — NOT a single entry.
      expect(logSpy).toHaveBeenCalledWith(
        '  DHI sha256:04639747b6d72bcf1d0322f2a5b122ee76d963e31bb4a070891b25f15a5001c5: ' +
          '[vulnerability_fix, version_upgrade] 2 CVE(s) fixed, 1 package(s) updated, ' +
          'previous tag 2-compat-fips-dev'
      );
      expect(logSpy).toHaveBeenCalledWith(
        '  DHI sha256:2982980b6bb3cdedafa9377bcc37405c20ed48702deef11faf13ec99d596057d: ' +
          '[version_upgrade] 0 CVE(s) fixed, 1 package(s) updated, previous tag 5-fips-dev'
      );
    });

    it('summarizeDhiMetadata returns one entry per digest key', () => {
      const summary = summarizeDhiMetadata(dhiPayload().dhi_metadata);

      expect(summary).toHaveLength(2);
      expect(summary[0]).toEqual({
        digest: 'sha256:04639747b6d72bcf1d0322f2a5b122ee76d963e31bb4a070891b25f15a5001c5',
        schemaVersion: 1,
        categories: ['vulnerability_fix', 'version_upgrade'],
        previousTag: '2-compat-fips-dev',
        vulnerabilitiesFixed: 2,
        packagesUpdated: 1,
      });
      expect(summary[1].vulnerabilitiesFixed).toBe(0);
    });

    it('handles an empty change_categories array (a build with no changes)', () => {
      const summary = summarizeDhiMetadata({
        'sha256:abc': {
          schema_version: 1,
          change_categories: [],
          previous_version: { tag: 'v1', digest: 'sha256:def' },
          changes: {
            vulnerabilities_fixed: [],
            packages_updated: [],
            packages_added: [],
            packages_removed: [],
            environment_variables_changed: [],
            labels_changed: [],
            configuration_changed: [],
          },
        },
      });

      expect(summary).toEqual([
        {
          digest: 'sha256:abc',
          schemaVersion: 1,
          categories: [],
          previousTag: 'v1',
          vulnerabilitiesFixed: 0,
          packagesUpdated: 0,
        },
      ]);
    });

    it('returns no entries for a standard (non-DHI) payload', async () => {
      const response = await request(app).post(PATH).send(documentedPayload());

      expect(response.status).toBe(200);
      expect(summarizeDhiMetadata(undefined)).toEqual([]);
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('DHI sha256:'));
    });
  });

  describe('legacy callback_url', () => {
    it('never calls callback_url — the field is legacy and unsupported', async () => {
      const response = await request(app).post(PATH).send(documentedPayload());

      expect(response.status).toBe(200);
      // No outbound request of any kind: not to callback_url, and not to the
      // Hub API (DOCKER_HUB_API_TOKEN is unset).
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('health check', () => {
    it('responds ok', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
